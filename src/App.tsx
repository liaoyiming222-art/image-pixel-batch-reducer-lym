import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, BarChart3, CheckCircle2, Download, FolderOpen, FolderPlus, Home, ImageDown, ImagePlus, Lock, Play, RotateCcw, Search, Settings2, Sparkles, Trash2, XCircle, Zap } from 'lucide-react'
import { createPreviewUrl, readImage, resizeToTarget } from './imageProcessor'
import type { ImageTask, TaskStatus } from './types'
import { aspectRatio, formatBytes, isAcceptedImage, MB, outputName, ratioName } from './utils'
import { ImageWorkspaceProvider, useImageWorkspace } from './imageWorkspace'
import { useTransientNotice } from './useTransientNotice'
import { findClosestRatio } from './tools/inspector/utils'
import { ImageInspector } from './tools/inspector/ImageInspector'
import { FolderCreator } from './tools/folder/FolderCreator'
import { ImageFinder } from './tools/finder/ImageFinder'
import './suite.css'
import { newTaskId, track, trackInspection } from './analytics'

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
  const { tasks, setTasks, importRegistry, compressionMode, setCompressionMode, limitMB, setLimitMB, edgeEnabled, edgeLimit, setEdgeLimit } = useImageWorkspace()
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useTransientNotice()
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const processTaskRef = useRef('')
  const patchTask = (id: string, patch: Partial<ImageTask>) => setTasks(current => current.map(item => item.id === id ? { ...item, ...patch } : item))

  const addFiles = async (list: FileList | File[]) => {
    setMessage('')
    const files = Array.from(list)
    const invalid = files.filter(file => !isAcceptedImage(file))
    const supported = files.filter(isAcceptedImage)
    let duplicateCount = 0
    const imported: ImageTask[] = []
    const errors: string[] = []
    for (const file of supported) {
      let decoded: Awaited<ReturnType<typeof readImage>> | undefined
      let previewUrl: string | undefined
      let claimed = false
      try {
        claimed = await importRegistry.claim(file)
        if (!claimed) { duplicateCount += 1; continue }
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
        if (claimed) importRegistry.release(file)
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        errors.push(`${file.name}：${error instanceof Error ? error.message : '无法读取'}`)
      } finally { decoded?.close() }
    }
    if (imported.length) { trackInspection(imported.map(task=>task.id), 'compress'); setTasks(current => [...current, ...imported]) }
    track('image_import_finished', 'compress', { added: imported.length, duplicate: duplicateCount, invalid: invalid.length, failed: errors.length }, newTaskId())
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
      return { success: 0, skipped: 1, failed: 0, qualified: 0 }
    }
    patchTask(task.id, { status: 'processing', progress: 4, error: undefined })
    try {
      const result = await resizeToTarget(task.file, {
        targetBytes: limitMB * MB, limitBytes: compressionMode === 'over' ? limitMB * MB : undefined, edgeLimit: edgeEnabled ? edgeLimit : undefined, edgeTarget: edgeLimit,
        conversionOnly: compressionMode === 'convert',
        onProgress: progress => patchTask(task.id, { progress }),
      })
      patchTask(task.id, {
        status: 'done', progress: 100, result: result.blob,
        resultUrl: URL.createObjectURL(result.blob), resultWidth: result.width, resultHeight: result.height,
      })
      return { success: 1, skipped: 0, failed: 0, qualified: compressionMode === 'convert' || (result.blob.size <= limitMB * MB && (!edgeEnabled || Math.max(result.width, result.height) <= edgeLimit)) ? 1 : 0 }
    } catch (error) {
      patchTask(task.id, { status: 'error', progress: 0, error: error instanceof Error ? error.message : '未知错误' })
      return { success: 0, skipped: 0, failed: 1, qualified: 0 }
    }
  }

  const processAll = async () => {
    const queue = tasks.filter(task => task.status === 'pending' || task.status === 'error')
    if (!queue.length || busy) return
    if (compressionMode !== 'convert' && (!Number.isFinite(limitMB) || limitMB <= 0)) {
      setMessage('大小限制必须为大于 0 的数值。')
      return
    }
    if (compressionMode !== 'convert' && edgeEnabled && (!Number.isInteger(edgeLimit) || edgeLimit <= 0)) { setMessage('尺寸限制必须为正整数'); return }
    setMessage('')
    setBusy(true)
    const taskId = newTaskId(); processTaskRef.current = taskId
    const started = performance.now()
    const counts = { success: 0, skipped: 0, failed: 0, qualified: 0 }
    track('image_process_started', 'compress', { count: queue.length, mode: compressionMode }, taskId)
    let cursor = 0
    const worker = async () => { while (cursor < queue.length) { const task = queue[cursor++]; const result = await processOne(task); counts.success += result.success; counts.skipped += result.skipped; counts.failed += result.failed; counts.qualified += result.qualified } }
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker))
    track('image_process_finished', 'compress', { ...counts, pending: 0, count: queue.length, duration: Math.round(performance.now() - started), mode: compressionMode }, taskId)
    setBusy(false)
  }

  const download = (task: ImageTask) => {
    if (!task.result || !task.resultUrl) return
    const link = document.createElement('a')
    link.href = task.resultUrl
    link.download = outputName(task.name, task.result.type, task.closestRatio)
    link.click()
    track('output_action', 'compress', { kind: 'single', count: 1, outputs: 1 }, processTaskRef.current)
  }

  const downloadAll = async () => {
    // When requested, keep skipped source files in the download too, so users
    // receive a complete ready-to-upload set instead of only resized files.
    if (tasks.some(task => task.status === 'error' || task.status === 'pending')) setMessage('本次下载仅包含已完成和无需处理的图片；未处理或失败的图片未包含，请查看队列。')
    const downloadable = tasks.flatMap(task => {
      if (task.status === 'done' && task.result) return [{ task, file: task.result, name: outputName(task.name, task.result.type, task.closestRatio) }]
      if (task.status === 'skipped') return [{ task, file: task.file, name: ratioName(task.name, task.closestRatio) }]
      return []
    })
    if (!downloadable.length) return
    if (downloadable.length === 1) {
      const item = downloadable[0]
      const url = URL.createObjectURL(item.file)
      const link = document.createElement('a')
      link.href = url; link.download = item.name; link.click()
      track('output_action', 'compress', { kind: 'single', count: 1, outputs: 1 }, processTaskRef.current)
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
    track('output_action', 'compress', { kind: 'zip', count: downloadable.length, outputs: 1 }, processTaskRef.current)
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
  const actionableCount = tasks.filter(task => task.status === 'pending' || task.status === 'error').length
  const totalSize = tasks.reduce((sum, task) => sum + task.size, 0)

  return <div className="app">
    <main className="compress-main">
      <section className="tool-intro compress-tool-intro"><div className="tool-intro-icon"><ImageDown /></div><div><h1>快速图片压缩</h1><p>转换 JPG，控制文件大小与最长边。</p></div></section>
      <section className={`dropzone ${tasks.length ? 'has-files' : ''} ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()}
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
      {message && <div className="alert image-toast compress-toast" role="status"><XCircle size={17} />{message}</div>}
      <div className="workspace-grid">
      <section className="settings card">
        <div className="section-heading"><div className="section-title"><Settings2 size={18} /><div><h2>压缩设置</h2><p>设定需要处理的图片和输出目标</p></div></div></div>
        <div className="setting-grid compact-settings">
          <div className="field mode-field"><label>处理范围</label><div className="segmented"><button disabled={busy} className={compressionMode === 'convert' ? 'active' : ''} onClick={() => setCompressionMode('convert')}>仅转格式</button>
            <button disabled={busy} className={compressionMode === 'over' ? 'active' : ''} onClick={() => setCompressionMode('over')}>处理超限</button>

          </div></div>
          <div className="field"><label htmlFor="limit">大小限制</label><div className="input-unit"><input disabled={busy || compressionMode === 'convert'} id="limit" type="number" min="0.1" step="0.1" value={limitMB} onChange={e => setLimitMB(+e.target.value)} /><span>MB</span></div></div>

        <div className="dimension-grid"><div className="field"><label htmlFor="edge-limit" title="按图片最长边判断">尺寸限制</label><div className="input-unit"><input id="edge-limit" aria-label="尺寸限制（最长边）" type="number" min="1" step="1" value={edgeLimit} disabled={busy || compressionMode === 'convert'} onChange={event => setEdgeLimit(+event.target.value)} /><span>px</span></div></div></div></div><p className="hint"><Sparkles size={13} />{compressionMode === 'convert' ? '统一转为 JPG，保持像素尺寸；透明区域填充白色。' : '超出限制时自动处理；尺寸按最长边计算，保持宽高比。'}</p>
        {tasks.length > 0 && <p className="hint">更改设置后需重新处理。</p>}
      </section>
      <aside className="summary-card card">
        <div className="section-heading"><div className="section-title"><Zap size={18} /><div><h2>本次任务</h2><p>导入图片后实时统计</p></div></div></div>
        <div className="summary-stats"><div><span>图片数量</span><b>{tasks.length}<small> 张</small></b></div><div><span>原始大小</span><b>{formatBytes(totalSize)}</b></div></div>
        <div className="saving-meter"><div><span>已完成</span><b>{tasks.length ? `${completedCount} / ${tasks.length}` : '—'}</b></div><div className="meter-track"><i style={{ width: `${tasks.length ? completedCount / tasks.length * 100 : 0}%` }} /></div></div>
      </aside>

      </div>
      {tasks.length > 0 && <section className={`tasks card${dragging ? ' queue-dragging' : ''}`}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; if (!busy) setDragging(true) }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
        onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) void handleDrop(event.dataTransfer) }}>
        <div className="tasks-head"><div className="section-title"><ImagePlus size={18} /><div><h2>图片队列 <span className="count">{tasks.length}</span></h2><p aria-live="polite">{busy ? '正在处理图片，请稍候' : dragging ? '松开即可添加图片或文件夹' : '拖入图片或文件夹可继续添加，也可使用右侧按钮。'}</p></div></div><div className="queue-actions"><button disabled={busy} onClick={() => inputRef.current?.click()}>添加图片</button><button disabled={busy} onClick={() => folderInputRef.current?.click()}>添加文件夹</button>{tasks.length > 0 && <button className="text-danger" disabled={busy} onClick={clear}><Trash2 size={15} />清空全部</button>}</div></div>
          <div className="task-list">{tasks.map((task, index) => <article className={`task task-${task.status}`} style={{ '--task-delay': `${Math.min(index, 8) * 45}ms` } as React.CSSProperties} key={task.id}>
            <div className="task-preview"><img src={task.previewUrl} alt="" /><span>{task.format}</span></div><div className="task-main"><div className="task-top"><div><h3 title={task.relativePath || task.name}>{task.name}</h3>{task.relativePath && <div className="folder-path"><FolderOpen size={12} />{task.relativePath.split('/').slice(0, -1).join(' / ')}</div>}<div className="meta"><span>{formatBytes(task.size)}</span><span>{task.width} × {task.height}</span><span>最近比例 {task.closestRatio}</span>{edgeEnabled && compressionMode !== 'convert' && Math.max(task.width, task.height) > edgeLimit && <span>最长边超限</span>}{compressionMode !== 'convert' && task.size > limitMB * MB && <span>文件大小超限</span>}</div></div><span className={`status ${task.status}`}>{labels[task.status]}</span></div>
            {task.status === 'processing' && <div className="progress"><div style={{ width: `${task.progress}%` }} /><span>{task.progress}%</span></div>}
            {task.status === 'done' && <div className="result"><CheckCircle2 size={16} />{task.result?.type === 'image/jpeg' && task.file.type !== 'image/jpeg' && !/\.jpe?g$/i.test(task.name) && <strong>已转为 JPG</strong>}{(task.resultWidth !== task.width || task.resultHeight !== task.height) && <strong>已调整尺寸</strong>}<span>新尺寸 {task.resultWidth} × {task.resultHeight}</span><span>新大小 {formatBytes(task.result!.size)}</span><b>减少 {Math.max(0, (1 - task.result!.size / task.size) * 100).toFixed(1)}%</b></div>}
            {task.status === 'skipped' && <div className="subtle">{compressionMode === 'convert' ? '已是 JPG，无需转换' : `文件大小${edgeEnabled ? '和最长边均' : ''}未超限，无需处理`}</div>}
            {task.status === 'error' && <div className="error-text"><XCircle size={15} />{task.error}</div>}
            </div><div className="task-actions">{task.status === 'done' && <button title="下载" onClick={() => download(task)}><Download size={18} /></button>}<button title="删除" disabled={busy} onClick={() => remove(task)}><Trash2 size={18} /></button></div>
          </article>)}</div>
      </section>}
    </main>
    <footer><div><strong>{tasks.length || '尚未添加'}{tasks.length ? ' 张图片' : ''}</strong><span>{completedCount ? ` · ${completedCount} 张已完成` : ' · 所有处理均在本地完成'}</span></div><div className="footer-actions"><button className="secondary" disabled={!downloadableCount || busy} onClick={() => void downloadAll()}><Archive size={17} />下载全部</button><button className="primary" disabled={!actionableCount || busy} onClick={() => void processAll()}>{busy ? <RotateCcw className="spin" size={18} /> : <Play size={17} fill="currentColor" />}{busy ? '正在处理…' : `开始处理${actionableCount ? ` · ${actionableCount}` : ''}`}</button></div></footer>
  </div>
}

type ToolKey = 'home' | 'compress' | 'inspect' | 'folders' | 'finder'

const tools = [
  { key: 'compress' as const, title: '快速图片压缩', description: '转换 JPG，控制文件大小与最长边。', icon: ImageDown, color: 'blue' },
  { key: 'inspect' as const, title: '比例检测与分组', description: '读取图片尺寸，按画幅比例整理下载。', icon: BarChart3, color: 'purple' },
  { key: 'folders' as const, title: '文件夹批量处理', description: '批量创建文件夹，统一处理名称与规则。', icon: FolderPlus, color: 'green' },
  { key: 'finder' as const, title: '按名称查找图片', description: '导入图名清单，查找共享目录并打包下载。', icon: Search, color: 'blue' },
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
        {tool.key === 'finder' && <div className="finder-art"><div><Search size={22}/><span>图名清单</span></div><div><CheckCircle2 size={17}/><span>找到图片</span><Archive size={20}/></div></div>}
      </div>
    </button>)}</section>
    <div className="home-privacy"><Lock size={14}/>文件内容仅在本地处理；收集匿名数量与状态统计以改善工具。</div>
  </main>
}

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolKey>('home')
  const openTool = (tool: ToolKey) => { if (tool !== activeTool && tool !== 'home' && tool !== 'finder') track('tool_open', tool); setActiveTool(tool) }
  return <ImageWorkspaceProvider><div className="suite-shell"><nav className="suite-nav"><button className="suite-brand" onClick={() => openTool('home')}><span><ImagePlus size={19} /></span><b>PixelFlow</b><small>本地效率工具</small></button><div className="suite-nav-links"><button className={activeTool === 'home' ? 'active' : ''} onClick={() => openTool('home')}><Home size={15} />首页</button>{tools.map(tool => <button key={tool.key} className={activeTool === tool.key ? 'active' : ''} onClick={() => openTool(tool.key)}><tool.icon size={15} />{tool.title}</button>)}</div><div className="nav-local"><span/>本地运行</div></nav>
    {activeTool === 'home' && <SuiteHome onOpen={openTool} />}
    {activeTool === 'compress' && <CompressionTool />}
    {activeTool === 'inspect' && <ImageInspector />}
    {activeTool === 'folders' && <FolderCreator />}
    <div hidden={activeTool !== 'finder'}><ImageFinder /></div>
  </div></ImageWorkspaceProvider>
}
