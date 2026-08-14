import { useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, BarChart3, ChevronDown, ClipboardCopy, Download, FolderOpen, ImagePlus, Settings2, Trash2 } from 'lucide-react'
import type { ImageRecord, SortDirection, SortKey } from './types'
import { createClipboardText, downloadCsv, fileSignature, formatError, formatFileSize, isSupportedImage, ratioArchiveName, readRecord, STANDARD_RATIOS, uniqueArchiveNames } from './utils'
import { useImageWorkspace } from '../../imageWorkspace'
import { resizeToTarget } from '../../imageProcessor'
import type { ImageTask } from '../../types'
import { aspectRatio, MB, outputName, ratioName } from '../../utils'
import { filesFromDrop } from '../../fileEntries'
import './inspector.css'

export function ImageInspector() {
  const { tasks, setTasks, tasksRef, inspectorMode, setInspectorMode, limitMB, setLimitMB, targetMB, setTargetMB } = useImageWorkspace()
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [activeDownload, setActiveDownload] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('order')
  const [direction, setDirection] = useState<SortDirection>('asc')
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const orderRef = useRef(tasks.length)
  const records = useMemo<ImageRecord[]>(() => tasks.map((task, index) => ({
    id: task.id, file: task.file, signature: fileSignature(task.file), order: index, name: task.name,
    width: task.width, height: task.height, size: task.size,
    orientation: task.width === task.height ? '方图' : task.width > task.height ? '横图' : '竖图',
    actualRatioText: `${task.width}:${task.height}（${(task.width / task.height).toFixed(4)}）`,
    closestRatio: task.closestRatio, errorPercent: task.ratioErrorPercent,
  })), [tasks])
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2600) }

  const addFiles = async (files: File[]) => {
    const existing = new Set(tasks.map(item => fileSignature(item.file))); const seen = new Set<string>(); const valid: File[] = []
    let invalid = 0, duplicate = 0
    files.forEach(file => { const signature = fileSignature(file); if (!isSupportedImage(file) || !['jpg', 'jpeg', 'png', 'webp'].includes(file.name.split('.').pop()?.toLowerCase() ?? '')) invalid += 1; else if (existing.has(signature) || seen.has(signature)) duplicate += 1; else { seen.add(signature); valid.push(file) } })
    if (!valid.length) { notify(invalid ? '未添加：仅支持非空的 JPG、PNG、WEBP 图片' : '未添加：所选图片均已存在'); return }
    setBusy(true)
    const settled = await Promise.allSettled(valid.map(async file => {
      const record = await readRecord(file, orderRef.current++)
      return {
        id: record.id, file, name: file.name, relativePath: file.webkitRelativePath || undefined,
        format: (file.type.split('/')[1] || file.name.split('.').pop() || '').replace('jpeg', 'JPG').toUpperCase(),
        size: file.size, width: record.width, height: record.height, ratio: aspectRatio(record.width, record.height),
        closestRatio: record.closestRatio, ratioErrorPercent: record.errorPercent,
        previewUrl: URL.createObjectURL(file), status: 'pending', progress: 0,
      } satisfies ImageTask
    }))
    const added = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    setTasks(current => [...current, ...added]); setBusy(false)
    notify(`已添加 ${added.length} 张图片${invalid || duplicate ? `；忽略 ${invalid + duplicate} 个文件` : ''}`)
  }
  const sorted = useMemo(() => [...records].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    const result = typeof av === 'string' ? av.localeCompare(String(bv), 'zh-CN', { numeric: true }) : av - Number(bv)
    return direction === 'asc' ? result : -result
  }), [records, sortKey, direction])
  const ratioGroups = useMemo(() => STANDARD_RATIOS.map(ratio => ({
    ratio: ratio.label,
    items: records.filter(item => item.closestRatio === ratio.label),
  })).filter(group => group.items.length), [records])
  const ratioDistribution = useMemo(() => ratioGroups.map(group => ({
    ratio: group.ratio,
    count: group.items.length,
    percent: records.length ? group.items.length / records.length * 100 : 0,
  })).sort((a, b) => b.count - a.count), [ratioGroups, records.length])
  const sort = (key: SortKey) => { if (key === sortKey) setDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setDirection('asc') } }
  const choose = () => {
    if (busy || !inputRef.current) return
    // 选择前先清空值，确保删除后重新选择同一张图片也能触发 change。
    inputRef.current.value = ''
    inputRef.current.click()
  }
  const chooseFolder = () => {
    if (busy || !folderInputRef.current) return
    folderInputRef.current.value = ''
    folderInputRef.current.click()
  }
  const handleDrop = async (dataTransfer: DataTransfer) => {
    try { await addFiles(await filesFromDrop(dataTransfer)) }
    catch { notify('无法读取拖入的文件夹，请改用“选择文件夹”') }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(createClipboardText(sorted)); notify('已复制全部结果') } catch { notify('复制失败，请检查剪贴板权限') } }
  const count = (orientation: string) => records.filter(item => item.orientation === orientation).length
  const patchTask = (id: string, patch: Partial<ImageTask>) => setTasks(current => current.map(task => task.id === id ? { ...task, ...patch } : task))
  const processTask = async (task: ImageTask) => {
    if (inspectorMode === 'none' || (inspectorMode === 'over' && task.size <= limitMB * MB)) {
      patchTask(task.id, { status: 'skipped', progress: 100, error: undefined })
      return task.file as File | Blob
    }
    if (task.status === 'done' && task.result) return task.result
    patchTask(task.id, { status: 'processing', progress: 4, error: undefined })
    try {
      const result = await resizeToTarget(task.file, { targetBytes: targetMB * MB, onProgress: progress => patchTask(task.id, { progress }) })
      if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
      patchTask(task.id, { status: 'done', progress: 100, result: result.blob, resultUrl: URL.createObjectURL(result.blob), resultWidth: result.width, resultHeight: result.height })
      return result.blob
    } catch (error) {
      patchTask(task.id, { status: 'error', progress: 0, error: error instanceof Error ? error.message : '处理失败' })
      throw error
    }
  }
  const createGroupArchive = async (ratio: string, items: ImageRecord[], onItem?: () => void) => {
    const zip = new JSZip()
    const files: Array<{ file: File | Blob, name: string }> = []
    for (const item of items) {
      const task = tasksRef.current.find(current => current.id === item.id)
      if (!task) continue
      const file = await processTask(task)
      files.push({ file, name: file === task.file ? ratioName(task.name, ratio) : outputName(task.name, file.type, ratio) })
      onItem?.()
    }
    const names = uniqueArchiveNames(files.map((item, index) => ({ ...items[index], name: item.name })))
    files.forEach((item, index) => zip.file(names[index], item.file))
    return { blob: await zip.generateAsync({ type: 'blob', compression: 'STORE' }), name: ratioArchiveName(ratio, items.length) }
  }
  const triggerArchive = ({ blob, name }: { blob: Blob, name: string }) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = name; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const downloadGroup = async (ratio: string, items: ImageRecord[]) => {
    if (busy) return
    setBusy(true)
    setActiveDownload(ratio)
    let completed = 0
    setProgressText(`正在处理 0/${items.length}`)
    try { triggerArchive(await createGroupArchive(ratio, items, () => { completed += 1; setProgressText(`正在处理 ${completed}/${items.length}`) })); notify(`已下载 ${ratio} 分组`) }
    catch { notify(`${ratio} 分组打包失败`) }
    finally { setBusy(false); setProgressText(''); setActiveDownload('') }
  }
  const downloadAllGroups = async () => {
    if (busy || !ratioGroups.length) return
    setBusy(true)
    setActiveDownload('all')
    const total = ratioGroups.reduce((sum, group) => sum + group.items.length, 0)
    let completed = 0
    try {
      const archives = []
      for (let index = 0; index < ratioGroups.length; index += 1) {
        const group = ratioGroups[index]
        setProgressText(`正在处理 ${completed}/${total} · 分组 ${index + 1}/${ratioGroups.length}`)
        archives.push(await createGroupArchive(group.ratio, group.items, () => { completed += 1; setProgressText(`正在处理 ${completed}/${total} · 分组 ${index + 1}/${ratioGroups.length}`) }))
      }
      archives.forEach(triggerArchive)
      notify(`已下载 ${archives.length} 个分组压缩包`)
    } catch { notify('分组压缩包生成失败，请重试') }
    finally { setBusy(false); setProgressText(''); setActiveDownload('') }
  }

  return <div className="inspector-page">
    <section className="tool-intro"><div className="tool-intro-icon"><BarChart3 /></div><div><h1>比例检测与分组</h1><p>一次完成尺寸比例检测、超限图片压缩、比例命名和分组下载</p></div></section>
    {!records.length ? <section className="inspector-upload" role="button" tabIndex={0} onClick={choose} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && choose()}
      onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void handleDrop(event.dataTransfer) }}>
      <ImagePlus size={36} /><strong>{busy ? '正在读取图片…' : '拖拽图片或文件夹到这里'}</strong><span>支持 JPG、JPEG、PNG、WEBP；图片在两个图片工具间共享</span>
      <div className="inspector-upload-actions"><button type="button" onClick={event => { event.stopPropagation(); choose() }}><ImagePlus size={15} />选择图片</button><button type="button" onClick={event => { event.stopPropagation(); chooseFolder() }}><FolderOpen size={15} />选择文件夹</button></div>
    </section> : <>
      <section className="inspector-stats"><div><span>图片总数</span><b>{records.length}</b></div><div><span>横图</span><b>{count('横图')}</b></div><div><span>竖图</span><b>{count('竖图')}</b></div><div><span>方图</span><b>{count('方图')}</b></div>
        <div className="ratio-list"><span>比例分布</span><div className="ratio-distribution">{ratioDistribution.map(item => <div className="ratio-distribution-item" key={item.ratio}><strong>{item.ratio}</strong><span>{item.count} 张 · {item.percent.toFixed(0)}%</span><i><b style={{ width: `${item.percent}%` }} /></i></div>)}</div></div></section>
      <section className={`inspector-process-settings ${settingsOpen ? 'expanded' : 'collapsed'}`}>
        <button type="button" className="process-summary" onClick={() => setSettingsOpen(value => !value)}><Settings2 size={18} /><span><strong>下载处理：{inspectorMode === 'none' ? '不压缩' : inspectorMode === 'over' ? '仅压缩超限图片' : '压缩全部图片'}</strong><small>下载分组时自动应用</small></span><em>{settingsOpen ? '收起' : '修改'}<ChevronDown size={14} /></em></button>
        {settingsOpen && <div className="process-details"><div className="inspector-process-mode"><button className={inspectorMode === 'none' ? 'active' : ''} onClick={() => setInspectorMode('none')}>不压缩</button><button className={inspectorMode === 'over' ? 'active' : ''} onClick={() => setInspectorMode('over')}>仅压缩超限</button><button className={inspectorMode === 'all' ? 'active' : ''} onClick={() => setInspectorMode('all')}>压缩全部</button></div>
          <label>平台限制<input type="number" min="0.1" step="0.1" value={limitMB} onChange={event => setLimitMB(+event.target.value)} /><span>MB</span></label>
          <label>目标大小<input type="number" min="0.1" step="0.1" value={targetMB} onChange={event => setTargetMB(+event.target.value)} /><span>MB</span></label></div>}
      </section>
      <section className="ratio-groups">
        <div className="ratio-groups-head"><div><h2>按比例自动分组</h2><p>图片按最接近的标准画幅归组，便于批量核对与整理</p></div><div className="ratio-groups-tools"><span>{ratioGroups.length} 个比例组</span><button type="button" disabled={busy} onClick={() => void downloadAllGroups()}><Archive size={14} />{activeDownload === 'all' && progressText ? progressText : '下载全部分组'}</button></div></div>
        <div className="ratio-group-grid">{ratioGroups.map(group => <article className="ratio-group" key={group.ratio}>
          <header><strong>{group.ratio}</strong><div><span>{group.items.length} 张</span><button type="button" disabled={busy} onClick={() => void downloadGroup(group.ratio, group.items)}><Download size={13} />{activeDownload === group.ratio && progressText ? progressText : '下载本组'}</button></div></header>
          <div>{group.items.map(item => <div className="ratio-group-item" key={item.id}><span title={item.name}>{item.name}</span><small>{item.width} × {item.height}</small><em>{formatError(item.errorPercent)}</em></div>)}</div>
        </article>)}</div>
      </section>
      <section className="inspector-actions"><strong>检测结果 <i>{records.length}</i></strong><div><button type="button" className="button primary" disabled={busy} onClick={choose}>＋ {busy ? '正在读取…' : '继续添加'}</button><button type="button" className="button" onClick={() => void copy()}><ClipboardCopy size={15} />复制结果</button><button type="button" className="button" onClick={() => downloadCsv(sorted)}><Download size={15} />导出 CSV</button><button type="button" className="button danger" onClick={() => { if (!window.confirm('将同时清空快速压缩和比例分组中的图片及处理结果，确认继续吗？')) return; tasks.forEach(task => { URL.revokeObjectURL(task.previewUrl); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl) }); setTasks([]); orderRef.current = 0 }}><Trash2 size={15} />清空</button></div></section>
      <div className="inspector-table"><table><thead><tr><th onClick={() => sort('order')}>序号</th><th onClick={() => sort('name')}>文件名</th><th>图片尺寸</th><th>方向</th><th>实际比例</th><th onClick={() => sort('closestRatio')}>最接近比例</th><th onClick={() => sort('errorPercent')}>误差</th><th>文件大小</th><th>操作</th></tr></thead>
        <tbody>{sorted.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td title={item.name}>{item.name}</td><td><b>{item.width}</b> × <b>{item.height}</b> px</td><td><span className={`orient ${item.orientation}`}>{item.orientation}</span></td><td>{item.actualRatioText}</td><td><mark>{item.closestRatio}</mark></td><td>{formatError(item.errorPercent)}</td><td>{formatFileSize(item.size)}</td><td><button className="row-delete" onClick={() => setTasks(current => current.filter(task => task.id !== item.id))}>删除</button></td></tr>)}</tbody></table></div>
      <section className="inspector-upload compact" role="button" tabIndex={0} aria-disabled={busy} onClick={choose}
        onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && choose()}
        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void handleDrop(event.dataTransfer) }}>
        <ImagePlus size={26} /><div><strong>{busy ? '正在读取图片…' : '继续添加图片或文件夹'}</strong><span>拖到这里，或使用右侧按钮选择</span></div><div className="compact-upload-actions"><button type="button" onClick={event => { event.stopPropagation(); choose() }}>选择图片</button><button type="button" onClick={event => { event.stopPropagation(); chooseFolder() }}>选择文件夹</button></div>
      </section>
    </>}
    <input ref={inputRef} type="file" multiple hidden accept=".jpg,.jpeg,.png,.webp" onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <input ref={folderInputRef} type="file" multiple hidden accept=".jpg,.jpeg,.png,.webp" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    {notice && <div className="suite-toast">{notice}</div>}
  </div>
}
