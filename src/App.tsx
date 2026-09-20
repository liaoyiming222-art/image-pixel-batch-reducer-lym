import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, BarChart3, CheckCircle2, Download, FolderOpen, FolderPlus, Home, ImageDown, ImagePlus, Lock, Play, RotateCcw, Settings2, Sparkles, Trash2, XCircle, Zap } from 'lucide-react'
import { createPreviewUrl, readImage, resizeToTarget } from './imageProcessor'
import type { ImageTask, TaskStatus } from './types'
import { aspectRatio, formatBytes, isAcceptedImage, MB, outputName, ratioName } from './utils'
import { ImageWorkspaceProvider, useImageWorkspace } from './imageWorkspace'
import { findClosestRatio } from './tools/inspector/utils'
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
  const { tasks, setTasks, tasksRef, compressionMode, setCompressionMode, limitMB, setLimitMB, targetMB, setTargetMB, edgeEnabled, edgeLimit, setEdgeLimit, edgeTarget, setEdgeTarget } = useImageWorkspace()
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const patchTask = (id: string, patch: Partial<ImageTask>) => setTasks(current => current.map(item => item.id === id ? { ...item, ...patch } : item))

  const addFiles = async (list: FileList | File[]) => {
    setMessage('')
    const files = Array.from(list)
    const invalid = files.filter(file => !isAcceptedImage(file))
    const existingKeys = new Set(tasksRef.current.map(task => `${task.relativePath || task.name}|${task.size}|${task.file.lastModified}`))
    const supported = files.filter(isAcceptedImage)
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
      let decoded: Awaited<ReturnType<typeof readImage>> | undefined
      let previewUrl: string | undefined
      try {
        decoded = await readImage(file)
        const closest = findClosestRatio(decoded.width, decoded.height)
        previewUrl = await createPreviewUrl(file, decoded)
        const task: ImageTask = {
          id: `${Date.now()}-${crypto.randomUUID()}`, file, name: file.name,
          relativePath: file.webkitRelativePath || undefined,
          format: (file.type.split('/')[1] || file.name.split('.').pop() || '').replace('jpeg', 'JPG').replace('x-tiff', 'TIFF').toUpperCase(), size: file.size,
          width: decoded.width, height: decoded.height, ratio: aspectRatio(decoded.width, decoded.height),
          closestRatio: closest.label, ratioErrorPercent: closest.errorPercent,
          previewUrl, status: 'pending', progress: 0,
        }
        imported.push(task)
      } catch (error) {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        errors.push(`${file.name}：${error instanceof Error ? error.message : '无法读取'}`)
      } finally { decoded?.close() }
    }
    if (imported.length) setTasks(current => [...current, ...imported])
    const notices = []
    if (invalid.length) notices.push(`已忽略 ${invalid.length} 个不支持的文件`)
    if (duplicateCount) notices.push(`已跳过 ${duplicateCount} 个重复文件`)
    if (errors.length) notices.push(`${errors.length} 个图片无法读取（${errors[0]}）`)
    if (notices.length) setMessage(`${notices.join('；')}。`)
    if (inputRef.current) inputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  const handleDrop = async (dataTransfer: DataTransfer) => {
    try { await addFiles(await filesFromDrop(dataTransfer)) }
    catch { setMessage('无法读取拖入的文件夹，请改用“选择图片文件夹”。') }
  }

  const processOne = async (task: ImageTask) => {
    const isJpg = task.file.type === 'image/jpeg' || /\.jpe?g$/i.test(task.name)
    if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
    patchTask(task.id, { result: undefined, resultUrl: undefined, resultWidth: undefined, resultHeight: undefined })
    if (isJpg && (compressionMode === 'convert' || (compressionMode === 'over' && task.size <= limitMB * MB && (!edgeEnabled || Math.max(task.width, task.height) <= edgeLimit)))) {
      patchTask(task.id, { status: 'skipped', progress: 100, error: undefined })
      return
    }
    patchTask(task.id, { status: 'processing', progress: 4, error: undefined })
    try {
      const result = await resizeToTarget(task.file, {
        targetBytes: targetMB * MB, limitBytes: compressionMode === 'over' ? limitMB * MB : undefined, edgeLimit: edgeEnabled ? edgeLimit : undefined, edgeTarget,
        conversionOnly: compressionMode === 'convert',
        forceSmaller: compressionMode === 'all',
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
    if (compressionMode !== 'convert' && (!Number.isFinite(targetMB) || !Number.isFinite(limitMB) || targetMB <= 0 || limitMB <= 0 || targetMB >= limitMB)) {
      setMessage('目标大小必须大于 0，并且小于限制大小。')
      return
    }
    if (compressionMode !== 'convert' && edgeEnabled && (!Number.isInteger(edgeLimit) || !Number.isInteger(edgeTarget) || edgeTarget <= 0 || edgeTarget >= edgeLimit)) { setMessage('目标最长边必须为正整数，且小于最长边限制'); return }
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
    link.download = outputName(task.name, task.result.type, task.closestRatio)
    link.click()
  }

  const downloadAll = async (includeOriginals = false) => {
    // When requested, keep skipped source files in the download too, so users
    // receive a complete ready-to-upload set instead of only resized files.
    const downloadable = tasks.flatMap(task => {
      if (task.status === 'done' && task.result) return [{ task, file: task.result, name: outputName(task.name, task.result.type, task.closestRatio) }]
      if (includeOriginals && task.status === 'skipped') return [{ task, file: task.file, name: ratioName(task.name, task.closestRatio) }]
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
  const clear = () => {
    if (!window.confirm('将同时清空快速压缩和比例分组中的图片及处理结果，确认继续吗？')) return
    tasks.forEach(task => { URL.revokeObjectURL(task.previewUrl); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl) })
    setTasks([])
  }
  const completedCount = tasks.filter(task => task.status === 'done').length
  const downloadableCount = tasks.filter(task => task.status === 'done' || task.status === 'skipped').length
  const totalSize = tasks.reduce((sum, task) => sum + task.size, 0)
  const resultSize = tasks.reduce((sum, task) => sum + (task.result?.size ?? task.size), 0)
  const savedPercent = totalSize ? Math.max(0, (1 - resultSize / totalSize) * 100) : 0

  return <div className="app">
    <main className="compress-main">
      <section className="tool-intro compress-tool-intro"><div className="tool-intro-icon"><ImageDown /></div><div><h1>快速图片压缩</h1><p>转换 JPG，控制文件大小与最长边。</p></div></section>
      <section className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()}
        onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); void handleDrop(event.dataTransfer) }}>
        <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.tif,.tiff" onChange={event => event.target.files && void addFiles(event.target.files)} />
        <input ref={folderInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.tif,.tiff" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={event => event.target.files && void addFiles(event.target.files)} />
        <div className="upload-visual"><div className="upload-orbit orbit-one" /><div className="upload-orbit orbit-two" /><div className="upload-icon"><ImagePlus size={30} /></div></div>
        <strong>{dragging ? '松开即可添加图片' : '拖放图片到这里'}</strong>
        <span>或从设备中选择，支持 JPG、PNG、WebP、TIFF</span>
        <div className="upload-actions"><button className="upload-primary" type="button" onClick={event => { event.stopPropagation(); inputRef.current?.click() }}><ImagePlus size={16} />选择图片</button><button type="button" onClick={event => { event.stopPropagation(); folderInputRef.current?.click() }}><FolderOpen size={16} />选择文件夹</button></div>
        <div className="upload-note"><Lock size={12} /> 本地处理 · 无需上传 · 支持批量</div>
      </section>
      {message && <div className="alert"><XCircle size={17} />{message}</div>}
      <div className="workspace-grid">
      <section className="settings card">
        <div className="section-heading"><div className="section-title"><Settings2 size={18} /><div><h2>压缩设置</h2><p>设定需要处理的图片和输出目标</p></div></div></div>
        <div className="setting-grid compact-settings">
          <div className="field mode-field"><label>处理范围</label><div className="segmented"><button disabled={busy} className={compressionMode === 'convert' ? 'active' : ''} onClick={() => setCompressionMode('convert')}>仅转格式</button>
            <button disabled={busy} className={compressionMode === 'over' ? 'active' : ''} onClick={() => setCompressionMode('over')}>仅处理超限图片</button>
            <button disabled={busy} className={compressionMode === 'all' ? 'active' : ''} onClick={() => setCompressionMode('all')}>处理全部图片</button>
          </div></div>
          <div className="field"><label htmlFor="limit">大小限制</label><div className="input-unit"><input disabled={busy || compressionMode === 'convert'} id="limit" type="number" min="0.1" step="0.1" value={limitMB} onChange={e => setLimitMB(+e.target.value)} /><span>MB</span></div></div>
          <div className="field"><label htmlFor="target">目标大小</label><div className="input-unit"><input disabled={busy || compressionMode === 'convert'} id="target" type="number" min="0.1" step="0.1" value={targetMB} onChange={e => setTargetMB(+e.target.value)} /><span>MB</span></div></div>
        <div className="dimension-grid"><div className="field"><label htmlFor="edge-limit" title="按图片最长边判断">尺寸限制</label><div className="input-unit"><input id="edge-limit" aria-label="尺寸限制（最长边）" type="number" min="2" step="1" value={edgeLimit} disabled={busy || compressionMode === 'convert'} onChange={event => setEdgeLimit(+event.target.value)} /><span>px</span></div></div><div className="field"><label htmlFor="edge-target" title="等比例缩小后的最长边">目标尺寸</label><div className="input-unit"><input id="edge-target" aria-label="目标尺寸（最长边）" type="number" min="1" step="1" value={edgeTarget} disabled={busy || compressionMode === 'convert'} onChange={event => setEdgeTarget(+event.target.value)} /><span>px</span></div></div></div></div><p className="hint"><Sparkles size={13} />保持宽高比，透明区域填充白色。</p>
      </section>
      <aside className="summary-card card">
        <div className="section-heading"><div className="section-title"><Zap size={18} /><div><h2>本次任务</h2><p>导入图片后实时统计</p></div></div></div>
        <div className="summary-stats"><div><span>图片数量</span><b>{tasks.length}<small> 张</small></b></div><div><span>原始大小</span><b>{formatBytes(totalSize)}</b></div></div>
        <div className="saving-meter"><div><span>已节省空间</span><b>{completedCount ? `${savedPercent.toFixed(0)}%` : '—'}</b></div><div className="meter-track"><i style={{ width: `${savedPercent}%` }} /></div></div>
      </aside>
      </div>
      <section className="tasks card">
        <div className="tasks-head"><div className="section-title"><ImagePlus size={18} /><div><h2>图片队列 <span className="count">{tasks.length}</span></h2><p>压缩状态和结果会在这里实时更新</p></div></div>{tasks.length > 0 && <button className="text-danger" disabled={busy} onClick={clear}><Trash2 size={15} />清空全部</button>}</div>
        {!tasks.length ? <div className="empty"><span className="empty-icon"><ImagePlus size={25} /></span><p>图片队列还是空的</p><span>把图片拖到上方，准备好后即可开始压缩</span></div> :
          <div className="task-list">{tasks.map((task, index) => <article className={`task task-${task.status}`} style={{ '--task-delay': `${Math.min(index, 8) * 45}ms` } as React.CSSProperties} key={task.id}>
            <div className="task-preview"><img src={task.previewUrl} alt="" /><span>{task.format}</span></div><div className="task-main"><div className="task-top"><div><h3 title={task.relativePath || task.name}>{task.name}</h3>{task.relativePath && <div className="folder-path"><FolderOpen size={12} />{task.relativePath.split('/').slice(0, -1).join(' / ')}</div>}<div className="meta"><span>{formatBytes(task.size)}</span><span>{task.width} × {task.height}</span><span>最近比例 {task.closestRatio}</span>{edgeEnabled && compressionMode !== 'convert' && Math.max(task.width, task.height) > edgeLimit && <span>最长边超限</span>}{compressionMode !== 'convert' && task.size > limitMB * MB && <span>文件大小超限</span>}</div></div><span className={`status ${task.status}`}>{labels[task.status]}</span></div>
            {task.status === 'processing' && <div className="progress"><div style={{ width: `${task.progress}%` }} /><span>{task.progress}%</span></div>}
            {task.status === 'done' && <div className="result"><CheckCircle2 size={16} />{task.result?.type === 'image/jpeg' && task.file.type !== 'image/jpeg' && !/\.jpe?g$/i.test(task.name) && <strong>已转为 JPG</strong>}{(task.resultWidth !== task.width || task.resultHeight !== task.height) && <strong>已调整尺寸</strong>}<span>新尺寸 {task.resultWidth} × {task.resultHeight}</span><span>新大小 {formatBytes(task.result!.size)}</span><b>减少 {Math.max(0, (1 - task.result!.size / task.size) * 100).toFixed(1)}%</b></div>}
            {task.status === 'skipped' && <div className="subtle">{compressionMode === 'convert' ? '已是 JPG，无需转换' : `文件大小${edgeEnabled ? '和最长边均' : ''}未超限，无需处理`}</div>}
            {task.status === 'error' && <div className="error-text"><XCircle size={15} />{task.error}</div>}
            </div><div className="task-actions">{task.status === 'done' && <button title="下载" onClick={() => download(task)}><Download size={18} /></button>}<button title="删除" disabled={busy} onClick={() => remove(task)}><Trash2 size={18} /></button></div>
          </article>)}</div>}
      </section>
    </main>
    <footer><div><strong>{tasks.length || '尚未添加'}{tasks.length ? ' 张图片' : ''}</strong><span>{completedCount ? ` · ${completedCount} 张已完成` : ' · 所有处理均在本地完成'}</span></div><div className="footer-actions"><button className="secondary" disabled={!completedCount || busy} onClick={() => void downloadAll()}><Download size={17} />{compressionMode === 'convert' ? '下载转换图片' : '下载压缩图片'}</button><button className="secondary" disabled={!downloadableCount || busy} onClick={() => void downloadAll(true)}><Archive size={17} />下载全部图片</button><button className="primary" disabled={!tasks.length || busy} onClick={() => void processAll()}>{busy ? <RotateCcw className="spin" size={18} /> : <Play size={17} fill="currentColor" />}{busy ? '正在处理…' : `${compressionMode === 'convert' ? '开始转换' : '开始压缩'}${tasks.length ? ` · ${tasks.length}` : ''}`}</button></div></footer>
  </div>
}

type ToolKey = 'home' | 'compress' | 'inspect' | 'folders'

const tools = [
  { key: 'compress' as const, title: '快速图片压缩', description: '转换 JPG，控制文件大小与最长边。', icon: ImageDown, color: 'blue' },
  { key: 'inspect' as const, title: '比例检测与分组', description: '读取图片尺寸，按画幅比例整理下载。', icon: BarChart3, color: 'purple' },
  { key: 'folders' as const, title: '文件夹批量创建', description: '粘贴需求表，批量生成规范文件夹。', icon: FolderPlus, color: 'green' },
]

function SuiteHome({ onOpen }: { onOpen: (tool: ToolKey) => void }) {
  return <main className="suite-home home-redesign">
    <header className="home-heading"><h1>让重复工作，<em>轻一点。</em></h1></header>
    <section className="suite-cards">{tools.map(tool => <button key={tool.key} className={`suite-card ${tool.color}`} onClick={() => onOpen(tool.key)}>
      <div className="suite-card-icon"><tool.icon size={25} /></div><h2>{tool.title}</h2><p>{tool.description}</p>
      <div className={`tool-art art-${tool.key}`} aria-hidden="true">
        {tool.key === 'compress' && <><div className="picture-sheet back"><ImagePlus size={38}/></div><div className="picture-sheet front"><ImageDown size={36}/><span>JPG</span></div><div className="art-line"/></>}
        {tool.key === 'inspect' && <><div className="ratio-shape portrait">2:3</div><div className="ratio-shape square">1:1</div><div className="ratio-shape landscape">3:2</div></>}
        {tool.key === 'folders' && <div className="folder-tree"><div><FolderOpen size={22}/><span>项目素材</span></div><div className="tree-child"><FolderPlus size={18}/><span>AI</span></div><div className="tree-child"><FolderPlus size={18}/><span>原图</span></div></div>}
      </div>
    </button>)}</section>
    <div className="home-privacy"><Lock size={14}/>文件仅在本地处理，不上传服务器。</div>
  </main>
}

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolKey>('home')
  return <ImageWorkspaceProvider><div className="suite-shell"><nav className="suite-nav"><button className="suite-brand" onClick={() => setActiveTool('home')}><span><ImagePlus size={19} /></span><b>PixelFlow</b><small>本地效率工具</small></button><div className="suite-nav-links"><button className={activeTool === 'home' ? 'active' : ''} onClick={() => setActiveTool('home')}><Home size={15} />首页</button>{tools.map(tool => <button key={tool.key} className={activeTool === tool.key ? 'active' : ''} onClick={() => setActiveTool(tool.key)}><tool.icon size={15} />{tool.title}</button>)}</div><div className="nav-local"><span/>本地运行</div></nav>
    {activeTool === 'home' && <SuiteHome onOpen={setActiveTool} />}
    {activeTool === 'compress' && <CompressionTool />}
    {activeTool === 'inspect' && <ImageInspector />}
    {activeTool === 'folders' && <FolderCreator />}
  </div></ImageWorkspaceProvider>
}
