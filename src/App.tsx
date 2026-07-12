import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, CheckCircle2, Download, ImagePlus, Lock, Play, RotateCcw, Settings2, Trash2, XCircle } from 'lucide-react'
import { readImage, resizeToTarget } from './imageProcessor'
import type { ImageTask, TaskStatus } from './types'
import { acceptedTypes, aspectRatio, formatBytes, MB, outputName } from './utils'

const labels: Record<TaskStatus, string> = {
  pending: '待处理', processing: '处理中', done: '处理完成', skipped: '无需处理', error: '处理失败',
}

export default function App() {
  const [tasks, setTasks] = useState<ImageTask[]>([])
  const tasksRef = useRef(tasks)
  const [mode, setMode] = useState<'over' | 'all'>('over')
  const [limitMB, setLimitMB] = useState(10)
  const [targetMB, setTargetMB] = useState(8)
  const [quality, setQuality] = useState(0.9)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => () => tasksRef.current.forEach(task => { URL.revokeObjectURL(task.previewUrl); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl) }), [])

  const patchTask = (id: string, patch: Partial<ImageTask>) => setTasks(current => current.map(item => item.id === id ? { ...item, ...patch } : item))

  const addFiles = async (list: FileList | File[]) => {
    setMessage('')
    const files = Array.from(list)
    const invalid = files.filter(file => !acceptedTypes.includes(file.type))
    if (invalid.length) setMessage(`已忽略 ${invalid.length} 个不支持的文件，仅支持 JPG、PNG 和 WebP。`)
    for (const file of files.filter(file => acceptedTypes.includes(file.type))) {
      try {
        const decoded = await readImage(file)
        const task: ImageTask = {
          id: `${Date.now()}-${crypto.randomUUID()}`, file, name: file.name,
          format: file.type.split('/')[1].replace('jpeg', 'JPG').toUpperCase(), size: file.size,
          width: decoded.width, height: decoded.height, ratio: aspectRatio(decoded.width, decoded.height),
          previewUrl: URL.createObjectURL(file), status: 'pending', progress: 0,
        }
        decoded.close()
        setTasks(current => [...current, task])
      } catch { setMessage(`无法读取“${file.name}”，文件可能已损坏。`) }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const processOne = async (task: ImageTask) => {
    if (mode === 'over' && task.size <= limitMB * MB) {
      patchTask(task.id, { status: 'skipped', progress: 100, error: undefined })
      return
    }
    patchTask(task.id, { status: 'processing', progress: 4, error: undefined })
    try {
      if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
      const result = await resizeToTarget(task.file, {
        targetBytes: targetMB * MB, quality,
        onProgress: progress => patchTask(task.id, { progress }),
      })
      patchTask(task.id, {
        status: 'done', progress: 100, result: result.blob,
        resultUrl: URL.createObjectURL(result.blob), resultWidth: result.width, resultHeight: result.height,
      })
    } catch (error) {
      patchTask(task.id, { status: 'error', progress: 0, error: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const processAll = async () => {
    if (!tasks.length || busy) return
    if (targetMB <= 0 || limitMB <= 0 || targetMB >= limitMB) {
      setMessage('目标大小必须大于 0，并且小于限制大小。')
      return
    }
    setMessage('')
    setBusy(true)
    const queue = [...tasks]
    let cursor = 0
    const worker = async () => { while (cursor < queue.length) { const task = queue[cursor++]; await processOne(task) } }
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker))
    setBusy(false)
  }

  const download = (task: ImageTask) => {
    if (!task.result || !task.resultUrl) return
    const link = document.createElement('a')
    link.href = task.resultUrl
    link.download = outputName(task.name, task.result.type)
    link.click()
  }

  const downloadAll = async () => {
    const completed = tasks.filter(task => task.status === 'done' && task.result)
    if (!completed.length) return
    if (completed.length === 1) { download(completed[0]); return }
    const zip = new JSZip()
    completed.forEach(task => zip.file(outputName(task.name, task.result!.type), task.result!))
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `已处理图片_${new Date().toISOString().slice(0, 10)}.zip`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const remove = (task: ImageTask) => {
    URL.revokeObjectURL(task.previewUrl); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
    setTasks(current => current.filter(item => item.id !== task.id))
  }
  const clear = () => { tasks.forEach(task => { URL.revokeObjectURL(task.previewUrl); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl) }); setTasks([]) }
  const completedCount = tasks.filter(task => task.status === 'done').length

  return <div className="app">
    <header>
      <div className="brand"><div className="logo"><ImagePlus size={25} /></div><div><h1>图片像素批量降低工具</h1><p>上传 AI 平台之前，快速检查并批量缩小图片</p></div></div>
      <div className="privacy"><Lock size={15} /> 图片仅在浏览器本地处理，不会上传</div>
    </header>
    <main>
      <section className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()}
        onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files) }}>
        <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp" onChange={event => event.target.files && void addFiles(event.target.files)} />
        <div className="upload-icon"><ImagePlus size={31} /></div><strong>点击选择或拖拽图片到这里</strong>
        <span>支持 JPG、JPEG、PNG、WebP，可同时导入多张</span>
      </section>
      {message && <div className="alert"><XCircle size={17} />{message}</div>}
      <section className="settings card">
        <div className="section-title"><Settings2 size={19} /><h2>处理设置</h2></div>
        <div className="setting-grid">
          <div className="field mode-field"><label>处理范围</label><div className="segmented">
            <button className={mode === 'over' ? 'active' : ''} onClick={() => setMode('over')}>仅处理超限图片</button>
            <button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>处理全部图片</button>
          </div></div>
          <div className="field"><label htmlFor="limit">平台限制</label><div className="input-unit"><input id="limit" type="number" min="0.1" step="0.1" value={limitMB} onChange={e => setLimitMB(+e.target.value)} /><span>MB</span></div></div>
          <div className="field"><label htmlFor="target">目标大小</label><div className="input-unit"><input id="target" type="number" min="0.1" step="0.1" value={targetMB} onChange={e => setTargetMB(+e.target.value)} /><span>MB</span></div></div>
          <div className="field quality"><label htmlFor="quality">输出质量 <b>{quality.toFixed(2)}</b></label><input id="quality" type="range" min="0.5" max="1" step="0.01" value={quality} onChange={e => setQuality(+e.target.value)} /></div>
        </div>
        <p className="hint">优先降低像素尺寸并保持原始宽高比。PNG 将保留 PNG 格式及透明背景。</p>
      </section>
      <section className="tasks card">
        <div className="tasks-head"><div className="section-title"><ImagePlus size={19} /><h2>图片任务</h2><span className="count">{tasks.length}</span></div>{tasks.length > 0 && <button className="text-danger" disabled={busy} onClick={clear}><Trash2 size={16} />清空全部</button>}</div>
        {!tasks.length ? <div className="empty"><ImagePlus size={36} /><p>还没有添加图片</p><span>导入后将在这里显示图片信息和处理进度</span></div> :
          <div className="task-list">{tasks.map(task => <article className="task" key={task.id}>
            <img src={task.previewUrl} alt="" /><div className="task-main"><div className="task-top"><div><h3 title={task.name}>{task.name}</h3><div className="meta"><span>{task.format}</span><span>{formatBytes(task.size)}</span><span>{task.width} × {task.height}</span><span>{task.ratio}</span></div></div><span className={`status ${task.status}`}>{labels[task.status]}</span></div>
            {task.status === 'processing' && <div className="progress"><div style={{ width: `${task.progress}%` }} /><span>{task.progress}%</span></div>}
            {task.status === 'done' && <div className="result"><CheckCircle2 size={16} /><span>新尺寸 {task.resultWidth} × {task.resultHeight}</span><span>新大小 {formatBytes(task.result!.size)}</span><b>减少 {Math.max(0, (1 - task.result!.size / task.size) * 100).toFixed(1)}%</b></div>}
            {task.status === 'skipped' && <div className="subtle">文件未超过 {limitMB} MB，无需处理</div>}
            {task.status === 'error' && <div className="error-text"><XCircle size={15} />{task.error}</div>}
            </div><div className="task-actions">{task.status === 'done' && <button title="下载" onClick={() => download(task)}><Download size={18} /></button>}<button title="删除" disabled={busy} onClick={() => remove(task)}><Trash2 size={18} /></button></div>
          </article>)}</div>}
      </section>
    </main>
    <footer><div><strong>{tasks.length} 张图片</strong><span>{completedCount ? ` · ${completedCount} 张已完成` : ' · 等待处理'}</span></div><div className="footer-actions"><button className="secondary" disabled={!completedCount || busy} onClick={() => void downloadAll()}><Archive size={18} />全部下载</button><button className="primary" disabled={!tasks.length || busy} onClick={() => void processAll()}>{busy ? <RotateCcw className="spin" size={18} /> : <Play size={18} />}{busy ? '正在处理…' : '开始处理'}</button></div></footer>
  </div>
}
