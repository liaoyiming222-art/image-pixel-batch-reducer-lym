import { useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, BarChart3, ClipboardCopy, Download, FolderOpen, ImagePlus, Settings2, Trash2 } from 'lucide-react'
import type { ImageRecord, SortDirection, SortKey } from './types'
import { createClipboardText, downloadCsv, fileSignature, formatError, formatFileSize, isSupportedImage, ratioArchiveName, readRecord, STANDARD_RATIOS, uniqueArchiveNames } from './utils'
import { useImageWorkspace } from '../../imageWorkspace'
import { useTransientNotice } from '../../useTransientNotice'
import { resizeToTarget } from '../../imageProcessor'
import type { ImageTask } from '../../types'
import { aspectRatio, MB, outputName, ratioName } from '../../utils'
import { filesFromDrop } from '../../fileEntries'
import './inspector.css'

export function ImageInspector() {
  const { tasks, setTasks, tasksRef, importRegistry, inspectorMode, setInspectorMode, limitMB, setLimitMB, edgeEnabled, edgeLimit, setEdgeLimit } = useImageWorkspace()
  const [busy, setBusy] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [activeDownload, setActiveDownload] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('order')
  const [direction, setDirection] = useState<SortDirection>('asc')
  const [notice, setNotice] = useTransientNotice()
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
  const notify = (text: string) => { setNotice(text) }

  const addFiles = async (files: File[]) => {
    setNotice('')
    const valid = files.filter(isSupportedImage)
    const invalid = files.length - valid.length
    let duplicate = 0
    if (!valid.length) { notify(invalid ? '未添加：仅支持非空的 JPG、PNG、WEBP、TIFF 图片' : '未添加：所选图片均已存在'); return }
    setBusy(true)
    const settled = await Promise.allSettled(valid.map(async file => {
      if (!await importRegistry.claim(file)) { duplicate += 1; return null }
      try {
      const record = await readRecord(file, orderRef.current++)
      return {
        id: record.id, file, name: file.name, relativePath: file.webkitRelativePath || undefined,
        format: (file.type.split('/')[1] || file.name.split('.').pop() || '').replace('jpeg', 'JPG').replace('x-tiff', 'TIFF').toUpperCase(),
        size: file.size, width: record.width, height: record.height, ratio: aspectRatio(record.width, record.height),
        closestRatio: record.closestRatio, ratioErrorPercent: record.errorPercent,
        previewUrl: record.previewUrl, status: 'pending', progress: 0,
      } satisfies ImageTask
      } catch (error) { importRegistry.release(file); throw error }
    }))
    const added = settled.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
    const failed = settled.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    setTasks(current => [...current, ...added]); setBusy(false)
    if (invalid || duplicate || failed.length) notify(`${invalid + duplicate ? `${invalid + duplicate} 个文件已忽略` : ''}${failed.length ? `${invalid || duplicate ? '；' : ''}${failed.length} 个无法读取：${failed[0] instanceof Error ? failed[0].message : '格式解析失败'}` : ''}`)
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
  const patchTask = (id: string, patch: Partial<ImageTask>) => setTasks(current => current.map(task => task.id === id ? { ...task, ...patch } : task))
  const processTask = async (task: ImageTask) => {
    if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
    patchTask(task.id, { result: undefined, resultUrl: undefined, resultWidth: undefined, resultHeight: undefined })
    if (inspectorMode === 'none' || (inspectorMode === 'over' && (task.file.type === 'image/jpeg' || /\.jpe?g$/i.test(task.name)) && task.size <= limitMB * MB && (!edgeEnabled || Math.max(task.width, task.height) <= edgeLimit))) {
      patchTask(task.id, { status: 'skipped', progress: 100, error: undefined })
      return task.file as File | Blob
    }
    patchTask(task.id, { status: 'processing', progress: 4, error: undefined })
    try {
      const result = await resizeToTarget(task.file, { targetBytes: limitMB * MB, limitBytes: inspectorMode === 'over' ? limitMB * MB : undefined, edgeLimit: edgeEnabled ? edgeLimit : undefined, edgeTarget: edgeLimit, onProgress: progress => patchTask(task.id, { progress }) })
      if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
      patchTask(task.id, { status: 'done', progress: 100, result: result.blob, resultUrl: URL.createObjectURL(result.blob), resultWidth: result.width, resultHeight: result.height })
      return result.blob
    } catch (error) {
      patchTask(task.id, { status: 'error', progress: 0, error: error instanceof Error ? error.message : '处理失败' })
      throw new Error(`${task.name}：${error instanceof Error ? error.message : '处理失败'}`)
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
  const validSettings = () => {
    if (inspectorMode === 'none') return true
    if (!Number.isFinite(limitMB) || limitMB <= 0) { notify('大小限制必须为大于 0 的数值'); return false }
    if (edgeEnabled && (!Number.isInteger(edgeLimit) || edgeLimit <= 0)) { notify('尺寸限制必须为正整数'); return false }
    return true
  }
  const downloadGroup = async (ratio: string, items: ImageRecord[]) => {
    if (busy || !validSettings()) return
    setBusy(true)
    setActiveDownload(ratio)
    let completed = 0
    setProgressText(`正在处理 0/${items.length}`)
    try { triggerArchive(await createGroupArchive(ratio, items, () => { completed += 1; setProgressText(`正在处理 ${completed}/${items.length}`) })); notify(`已下载 ${ratio} 分组`) }
    catch (error) { notify(error instanceof Error ? error.message : `${ratio} 分组打包失败`) }
    finally { setBusy(false); setProgressText(''); setActiveDownload('') }
  }
  const downloadAllGroups = async () => {
    if (busy || !ratioGroups.length || !validSettings()) return
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
    } catch (error) { notify(error instanceof Error ? error.message : '分组压缩包生成失败，请重试') }
    finally { setBusy(false); setProgressText(''); setActiveDownload('') }
  }

  return <div className="inspector-page">{notice && <div className={`alert image-toast inspector-toast ${records.length ? 'with-add-bar' : ''}`} role="status">{notice}</div>}
    <section className="tool-intro"><div className="tool-intro-icon"><BarChart3 /></div><div><h1>比例检测与分组</h1><p>读取图片尺寸，按画幅比例整理下载。</p></div></section>
    {!records.length ? <section className="inspector-upload" role="button" tabIndex={0} onClick={choose} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && choose()}
      onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void handleDrop(event.dataTransfer) }}>
      <ImagePlus size={36} /><strong>{busy ? '正在读取图片…' : '拖拽图片或文件夹到这里'}</strong><span>支持 JPG、JPEG、PNG、WEBP、TIFF；图片在两个图片工具间共享</span>
      <div className="inspector-upload-actions"><button type="button" onClick={event => { event.stopPropagation(); choose() }}><ImagePlus size={15} />选择图片</button><button type="button" onClick={event => { event.stopPropagation(); chooseFolder() }}><FolderOpen size={15} />选择文件夹</button></div>
    </section> : <>
      <section className="inspector-settings-v2"><div className="process-heading"><Settings2 size={18}/><span><strong>下载处理</strong><small>下载分组时自动应用</small></span></div><div className="inspector-settings-row"><div className="field"><label>处理模式</label><div className="inspector-process-mode"><button disabled={busy} className={inspectorMode === 'none' ? 'active' : ''} onClick={() => setInspectorMode('none')}>保留原图</button><button disabled={busy} className={inspectorMode === 'over' ? 'active' : ''} onClick={() => setInspectorMode('over')}>处理超限</button></div></div><div className="field"><label htmlFor="inspect-limitMB" >大小限制</label><div className="input-unit"><input id="inspect-limitMB" type="number" min="0.1" step="0.1" value={limitMB} disabled={busy || inspectorMode === 'none'} onChange={event => setLimitMB(+event.target.value)} /><span>MB</span></div></div><div className="field"><label htmlFor="inspect-edgeLimit" title="按图片最长边判断">尺寸限制</label><div className="input-unit"><input id="inspect-edgeLimit" type="number" min="1" step="1" value={edgeLimit} disabled={busy || inspectorMode === 'none'} onChange={event => setEdgeLimit(+event.target.value)} /><span>px</span></div></div></div><p className="hint">{inspectorMode === 'none' ? '保留原文件，只按比例分组和命名。' : '下载时统一输出 JPG；超出大小或最长边限制时自动处理。'}</p></section>
      <section className="ratio-groups">
        <div className="ratio-groups-head"><div><h2>按比例自动分组</h2><p>图片按最接近的标准画幅归组，便于批量核对与整理</p></div><div className="ratio-groups-tools"><span>{ratioGroups.length} 个比例组</span><button type="button" disabled={busy} onClick={() => void downloadAllGroups()}><Archive size={14} />{activeDownload === 'all' && progressText ? progressText : '下载全部分组'}</button></div></div>
        <div className="ratio-group-grid">{ratioGroups.map(group => <article className="ratio-group" key={group.ratio}>
          <header><strong>{group.ratio}</strong><div><span>{group.items.length} 张</span><button type="button" disabled={busy} onClick={() => void downloadGroup(group.ratio, group.items)}><Download size={13} />{activeDownload === group.ratio && progressText ? progressText : '下载本组'}</button></div></header>
          <div>{group.items.map(item => <div className="ratio-group-item" key={item.id}><span title={item.name}>{item.name}</span><small>{item.width} × {item.height}</small><em>{formatError(item.errorPercent)}</em></div>)}</div>
        </article>)}</div>
      </section>
      <div className="inspector-add-bar" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void handleDrop(event.dataTransfer) }}><div className="add-bar-heading"><ImagePlus size={24}/><div><strong>继续添加图片或文件夹</strong><small>{busy ? '正在处理…' : '支持拖放添加'}</small></div></div><div className="footer-actions"><button type="button" className="primary" disabled={busy} onClick={choose}><ImagePlus size={16}/>选择图片</button><button type="button" className="secondary" disabled={busy} onClick={chooseFolder}><FolderOpen size={16}/>选择文件夹</button></div></div>
      <div className="detection-details"><section className="inspector-actions"><strong>检测结果 <i>{records.length}</i></strong><div><button type="button" className="button" onClick={() => void copy()}><ClipboardCopy size={15} />复制结果</button><button type="button" className="button" onClick={() => downloadCsv(sorted)}><Download size={15} />导出 CSV</button><button type="button" className="button danger" onClick={() => { if (!window.confirm('将同时清空快速压缩和比例分组中的图片及处理结果，确认继续吗？')) return; tasks.forEach(task => { URL.revokeObjectURL(task.previewUrl); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl) }); setTasks([]); orderRef.current = 0 }}><Trash2 size={15} />清空</button></div></section>
      <div className="inspector-table"><table><thead><tr><th onClick={() => sort('order')}>序号</th><th onClick={() => sort('name')}>文件名</th><th>图片尺寸</th><th>方向</th><th>实际比例</th><th onClick={() => sort('closestRatio')}>最接近比例</th><th onClick={() => sort('errorPercent')}>误差</th><th>文件大小</th><th>操作</th></tr></thead>
        <tbody>{sorted.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td title={item.name}>{item.name}</td><td><b>{item.width}</b> × <b>{item.height}</b> px</td><td><span className={`orient ${item.orientation}`}>{item.orientation}</span></td><td>{item.actualRatioText}</td><td><mark>{item.closestRatio}</mark></td><td>{formatError(item.errorPercent)}</td><td>{formatFileSize(item.size)}</td><td><button className="row-delete" onClick={() => setTasks(current => current.filter(task => task.id !== item.id))}>删除</button></td></tr>)}</tbody></table></div></div>
    </>}
    <input ref={inputRef} type="file" multiple hidden accept=".jpg,.jpeg,.png,.webp,.tif,.tiff" onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <input ref={folderInputRef} type="file" multiple hidden accept=".jpg,.jpeg,.png,.webp,.tif,.tiff" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
  </div>
}
