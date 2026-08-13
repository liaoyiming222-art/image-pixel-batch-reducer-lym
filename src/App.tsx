import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, ArrowRight, BarChart3, CheckCircle2, Download, FolderOpen, FolderPlus, Home, ImageDown, ImagePlus, Lock, Play, RotateCcw, Settings2, ShieldCheck, Sparkles, Trash2, WandSparkles, XCircle, Zap } from 'lucide-react'
import { readImage, resizeToTarget } from './imageProcessor'
import type { ImageTask, TaskStatus } from './types'
import { acceptedTypes, aspectRatio, formatBytes, MB, outputName } from './utils'
import { ImageInspector } from './tools/inspector/ImageInspector'
import { FolderCreator } from './tools/folder/FolderCreator'
import './suite.css'

const labels: Record<TaskStatus, string> = {
  pending: '待处理', processing: '处理中', done: '处理完成', skipped: '无需处理', error: '处理失败',
}

interface DroppedEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
}

interface DroppedFileEntry extends DroppedEntry {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void
}

interface DroppedDirectoryEntry extends DroppedEntry {
  createReader: () => { readEntries: (success: (entries: DroppedEntry[]) => void, error?: (error: DOMException) => void) => void }
}

async function filesFromEntry(entry: DroppedEntry, parentPath = ''): Promise<File[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as DroppedFileEntry).file(resolve, reject))
    Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
    return [file]
  }
  if (!entry.isDirectory) return []
  const reader = (entry as DroppedDirectoryEntry).createReader()
  const children: DroppedEntry[] = []
  while (true) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    children.push(...batch)
  }
  return (await Promise.all(children.map(child => filesFromEntry(child, path)))).flat()
}

async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items)
  const entries = items.map(item => (item as DataTransferItem & { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry?.()).filter(Boolean) as DroppedEntry[]
  return entries.length ? (await Promise.all(entries.map(entry => filesFromEntry(entry)))).flat() : Array.from(dataTransfer.files)
}

function CompressionTool() {
  const [tasks, setTasks] = useState<ImageTask[]>([])
  const tasksRef = useRef(tasks)
  const [mode, setMode] = useState<'over' | 'all'>('over')
  const [limitMB, setLimitMB] = useState(10)
  const [targetMB, setTargetMB] = useState(5)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => () => tasksRef.current.forEach(task => { URL.revokeObjectURL(task.previewUrl); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl) }), [])

  const patchTask = (id: string, patch: Partial<ImageTask>) => setTasks(current => current.map(item => item.id === id ? { ...item, ...patch } : item))

  const addFiles = async (list: FileList | File[]) => {
    setMessage('')
    const files = Array.from(list)
    const invalid = files.filter(file => !acceptedTypes.includes(file.type))
    const existingKeys = new Set(tasksRef.current.map(task => `${task.relativePath || task.name}|${task.size}|${task.file.lastModified}`))
    const supported = files.filter(file => acceptedTypes.includes(file.type))
    const unique = supported.filter(file => {
      const key = `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`
      if (existingKeys.has(key)) return false
      existingKeys.add(key)
      return true
    })
    const duplicateCount = supported.length - unique.length
    const imported: ImageTask[] = []
    const errors: string[] = []
    for (const file of unique) {
      try {
        const decoded = await readImage(file)
        const task: ImageTask = {
          id: `${Date.now()}-${crypto.randomUUID()}`, file, name: file.name,
          relativePath: file.webkitRelativePath || undefined,
          format: file.type.split('/')[1].replace('jpeg', 'JPG').toUpperCase(), size: file.size,
          width: decoded.width, height: decoded.height, ratio: aspectRatio(decoded.width, decoded.height),
          previewUrl: URL.createObjectURL(file), status: 'pending', progress: 0,
        }
        decoded.close()
        imported.push(task)
      } catch { errors.push(file.name) }
    }
    if (imported.length) setTasks(current => [...current, ...imported])
    const notices = []
    if (invalid.length) notices.push(`已忽略 ${invalid.length} 个不支持的文件`)
    if (duplicateCount) notices.push(`已跳过 ${duplicateCount} 个重复文件`)
    if (errors.length) notices.push(`${errors.length} 个图片无法读取`)
    if (notices.length) setMessage(`${notices.join('；')}。`)
    if (inputRef.current) inputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  const handleDrop = async (dataTransfer: DataTransfer) => {
    try { await addFiles(await filesFromDrop(dataTransfer)) }
    catch { setMessage('无法读取拖入的文件夹，请改用“选择图片文件夹”。') }
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
        targetBytes: targetMB * MB,
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

  const downloadAll = async (includeOriginals = false) => {
    // When requested, keep skipped source files in the download too, so users
    // receive a complete ready-to-upload set instead of only resized files.
    const downloadable = tasks.flatMap(task => {
      if (task.status === 'done' && task.result) return [{ task, file: task.result, name: outputName(task.name, task.result.type) }]
      if (includeOriginals && mode === 'over' && task.status === 'skipped') return [{ task, file: task.file, name: task.name }]
      return []
    })
    if (!downloadable.length) return
    if (downloadable.length === 1) {
      const item = downloadable[0]
      const url = URL.createObjectURL(item.file)
      const link = document.createElement('a')
      link.href = url; link.download = item.name; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }
    const zip = new JSZip()
    downloadable.forEach(({ task, file, name }) => {
      const folder = task.relativePath?.split('/').slice(0, -1).join('/')
      zip.file(folder ? `${folder}/${name}` : name, file)
    })
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
  const downloadableCount = tasks.filter(task => task.status === 'done' || (mode === 'over' && task.status === 'skipped')).length
  const totalSize = tasks.reduce((sum, task) => sum + task.size, 0)
  const resultSize = tasks.reduce((sum, task) => sum + (task.result?.size ?? task.size), 0)
  const savedPercent = totalSize ? Math.max(0, (1 - resultSize / totalSize) * 100) : 0

  return <div className="app">
    <main className="compress-main">
      <section className="compress-intro">
        <div><span className="eyebrow"><WandSparkles size={14} /> 智能图片压缩</span><h1>让图片更轻，<em>清晰依旧</em></h1><p>批量压缩 JPG、PNG 与 WebP，自动保持原始比例和透明背景。</p></div>
        <div className="local-pill"><span><ShieldCheck size={18} /></span><div><b>完全本地处理</b><small>文件不会离开你的设备</small></div></div>
      </section>
      <section className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()}
        onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); void handleDrop(event.dataTransfer) }}>
        <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp" onChange={event => event.target.files && void addFiles(event.target.files)} />
        <input ref={folderInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={event => event.target.files && void addFiles(event.target.files)} />
        <div className="upload-visual"><div className="upload-orbit orbit-one" /><div className="upload-orbit orbit-two" /><div className="upload-icon"><ImagePlus size={30} /></div></div>
        <strong>{dragging ? '松开即可添加图片' : '拖放图片到这里'}</strong>
        <span>或从设备中选择，支持 JPG、PNG、WebP</span>
        <div className="upload-actions"><button className="upload-primary" type="button" onClick={event => { event.stopPropagation(); inputRef.current?.click() }}><ImagePlus size={16} />选择图片</button><button type="button" onClick={event => { event.stopPropagation(); folderInputRef.current?.click() }}><FolderOpen size={16} />选择文件夹</button></div>
        <div className="upload-note"><Lock size={12} /> 本地处理 · 无需上传 · 支持批量</div>
      </section>
      {message && <div className="alert"><XCircle size={17} />{message}</div>}
      <div className="workspace-grid">
      <section className="settings card">
        <div className="section-heading"><div className="section-title"><Settings2 size={18} /><div><h2>压缩设置</h2><p>设定需要处理的图片和输出目标</p></div></div><span className="step-tag">01</span></div>
        <div className="setting-grid">
          <div className="field mode-field"><label>处理范围</label><div className="segmented">
            <button className={mode === 'over' ? 'active' : ''} onClick={() => setMode('over')}>仅处理超限图片</button>
            <button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>处理全部图片</button>
          </div></div>
          <div className="field"><label htmlFor="limit">平台限制</label><div className="input-unit"><input id="limit" type="number" min="0.1" step="0.1" value={limitMB} onChange={e => setLimitMB(+e.target.value)} /><span>MB</span></div></div>
          <div className="field"><label htmlFor="target">目标大小</label><div className="input-unit"><input id="target" type="number" min="0.1" step="0.1" value={targetMB} onChange={e => setTargetMB(+e.target.value)} /><span>MB</span></div></div>
        </div>
        <p className="hint"><Sparkles size={13} /> 会优先降低像素尺寸并保持宽高比；PNG 将保留透明背景。</p>
      </section>
      <aside className="summary-card card">
        <div className="section-heading"><div className="section-title"><Zap size={18} /><div><h2>本次任务</h2><p>导入图片后实时统计</p></div></div><span className="step-tag">02</span></div>
        <div className="summary-stats"><div><span>图片数量</span><b>{tasks.length}<small> 张</small></b></div><div><span>原始大小</span><b>{formatBytes(totalSize)}</b></div></div>
        <div className="saving-meter"><div><span>已节省空间</span><b>{savedPercent.toFixed(0)}%</b></div><div className="meter-track"><i style={{ width: `${savedPercent}%` }} /></div></div>
      </aside>
      </div>
      <section className="tasks card">
        <div className="tasks-head"><div className="section-title"><ImagePlus size={18} /><div><h2>图片队列 <span className="count">{tasks.length}</span></h2><p>压缩状态和结果会在这里实时更新</p></div></div>{tasks.length > 0 && <button className="text-danger" disabled={busy} onClick={clear}><Trash2 size={15} />清空全部</button>}</div>
        {!tasks.length ? <div className="empty"><span className="empty-icon"><ImagePlus size={25} /></span><p>图片队列还是空的</p><span>把图片拖到上方，准备好后即可开始压缩</span></div> :
          <div className="task-list">{tasks.map((task, index) => <article className={`task task-${task.status}`} style={{ '--task-delay': `${Math.min(index, 8) * 45}ms` } as React.CSSProperties} key={task.id}>
            <div className="task-preview"><img src={task.previewUrl} alt="" /><span>{task.format}</span></div><div className="task-main"><div className="task-top"><div><h3 title={task.relativePath || task.name}>{task.name}</h3>{task.relativePath && <div className="folder-path"><FolderOpen size={12} />{task.relativePath.split('/').slice(0, -1).join(' / ')}</div>}<div className="meta"><span>{formatBytes(task.size)}</span><span>{task.width} × {task.height}</span><span>{task.ratio}</span></div></div><span className={`status ${task.status}`}>{labels[task.status]}</span></div>
            {task.status === 'processing' && <div className="progress"><div style={{ width: `${task.progress}%` }} /><span>{task.progress}%</span></div>}
            {task.status === 'done' && <div className="result"><CheckCircle2 size={16} /><span>新尺寸 {task.resultWidth} × {task.resultHeight}</span><span>新大小 {formatBytes(task.result!.size)}</span><b>减少 {Math.max(0, (1 - task.result!.size / task.size) * 100).toFixed(1)}%</b></div>}
            {task.status === 'skipped' && <div className="subtle">文件未超过 {limitMB} MB，无需处理</div>}
            {task.status === 'error' && <div className="error-text"><XCircle size={15} />{task.error}</div>}
            </div><div className="task-actions">{task.status === 'done' && <button title="下载" onClick={() => download(task)}><Download size={18} /></button>}<button title="删除" disabled={busy} onClick={() => remove(task)}><Trash2 size={18} /></button></div>
          </article>)}</div>}
      </section>
    </main>
    <footer><div><strong>{tasks.length || '尚未添加'}{tasks.length ? ' 张图片' : ''}</strong><span>{completedCount ? ` · ${completedCount} 张已完成` : ' · 所有处理均在本地完成'}</span></div><div className="footer-actions"><button className="secondary" disabled={!completedCount || busy} onClick={() => void downloadAll()}><Download size={17} />下载压缩图片</button><button className="secondary" disabled={!downloadableCount || busy} onClick={() => void downloadAll(true)}><Archive size={17} />下载全部图片</button><button className="primary" disabled={!tasks.length || busy} onClick={() => void processAll()}>{busy ? <RotateCcw className="spin" size={18} /> : <Play size={17} fill="currentColor" />}{busy ? '正在处理…' : `开始压缩${tasks.length ? ` · ${tasks.length}` : ''}`}</button></div></footer>
  </div>
}

type ToolKey = 'home' | 'compress' | 'inspect' | 'folders'

const tools = [
  { key: 'compress' as const, title: '图片大小压缩', description: '批量检查文件大小，将超限图片压缩到目标大小以内', icon: ImageDown, color: 'blue' },
  { key: 'inspect' as const, title: '图片尺寸提取', description: '批量读取像素、方向和比例，复制或导出 CSV 结果', icon: BarChart3, color: 'purple' },
  { key: 'folders' as const, title: '文件夹批量创建', description: '解析 Excel / WPS 需求，按统一规则批量创建文件夹', icon: FolderPlus, color: 'green' },
]

function SuiteHome({ onOpen }: { onOpen: (tool: ToolKey) => void }) {
  return <main className="suite-home"><section className="suite-hero"><div className="hero-copy"><span className="eyebrow"><Sparkles size={14} /> PixelFlow 本地工具箱</span><h1>让重复工作，<br/><em>轻一点。</em></h1><p>图片压缩、尺寸分析和文件夹整理，一个轻巧的本地工作台。文件不上传，打开就能用。</p><div className="hero-actions"><button className="hero-primary" onClick={() => onOpen('compress')}>开始压缩图片 <ArrowRight size={17} /></button><span><ShieldCheck size={15} /> 数据仅在你的设备中处理</span></div></div>
      <button className="hero-showcase" onClick={() => onOpen('compress')} aria-label="打开图片压缩工具"><div className="showcase-glow"/><div className="showcase-window"><div className="showcase-top"><span/><span/><span/><small>图片压缩</small></div><div className="showcase-drop"><ImageDown size={34}/><b>拖放图片到这里</b><span>PNG · JPG · WebP</span></div><div className="showcase-result"><span>12 张图片</span><i/><b>-42%</b></div></div></button></section>
    <section className="tools-heading"><div><span>为日常工作而生</span><h2>三个工具，一套流畅体验</h2></div><p>无需安装，无需登录，也无需等待上传。</p></section>
    <section className="suite-cards">{tools.map((tool, index) => <button key={tool.key} className={`suite-card ${tool.color} ${index === 0 ? 'featured' : ''}`} onClick={() => onOpen(tool.key)}><div className="suite-card-top"><div className="suite-card-icon"><tool.icon size={25} /></div>{index === 0 && <span>推荐</span>}</div><div><h2>{tool.title}</h2><p>{tool.description}</p><span className="card-link">打开工具 <ArrowRight size={14}/></span></div></button>)}</section>
    <section className="suite-privacy"><div className="privacy-icon"><Lock size={19} /></div><div><strong>你的文件，只属于你</strong><p>所有图片、表格内容与文件夹信息都在浏览器本地处理，不会上传到服务器。</p></div><span>Privacy first</span></section>
  </main>
}

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolKey>('home')
  return <div className="suite-shell"><nav className="suite-nav"><button className="suite-brand" onClick={() => setActiveTool('home')}><span><ImagePlus size={19} /></span><b>PixelFlow</b><small>本地效率工具</small></button><div className="suite-nav-links"><button className={activeTool === 'home' ? 'active' : ''} onClick={() => setActiveTool('home')}><Home size={15} />首页</button>{tools.map(tool => <button key={tool.key} className={activeTool === tool.key ? 'active' : ''} onClick={() => setActiveTool(tool.key)}><tool.icon size={15} />{tool.title}</button>)}</div><div className="nav-local"><span/>本地运行</div></nav>
    {activeTool === 'home' && <SuiteHome onOpen={setActiveTool} />}
    {activeTool === 'compress' && <CompressionTool />}
    {activeTool === 'inspect' && <ImageInspector />}
    {activeTool === 'folders' && <FolderCreator />}
  </div>
}
