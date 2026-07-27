import { useMemo, useRef, useState } from 'react'
import { BarChart3, ClipboardCopy, Download, ImagePlus, Trash2 } from 'lucide-react'
import type { ImageRecord, SortDirection, SortKey } from './types'
import { createClipboardText, downloadCsv, fileSignature, formatError, formatFileSize, isSupportedImage, readRecord, STANDARD_RATIOS } from './utils'
import './inspector.css'

export function ImageInspector() {
  const [records, setRecords] = useState<ImageRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('order')
  const [direction, setDirection] = useState<SortDirection>('asc')
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const orderRef = useRef(0)
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2600) }

  const addFiles = async (files: File[]) => {
    const existing = new Set(records.map(item => item.signature)); const seen = new Set<string>(); const valid: File[] = []
    let invalid = 0, duplicate = 0
    files.forEach(file => { const signature = fileSignature(file); if (!isSupportedImage(file)) invalid += 1; else if (existing.has(signature) || seen.has(signature)) duplicate += 1; else { seen.add(signature); valid.push(file) } })
    if (!valid.length) { notify(invalid ? '未添加：仅支持非空的 JPG、PNG、WEBP、GIF、BMP 图片' : '未添加：所选图片均已存在'); return }
    setBusy(true)
    const settled = await Promise.allSettled(valid.map(file => readRecord(file, orderRef.current++)))
    const added = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    setRecords(current => [...current, ...added]); setBusy(false)
    notify(`已添加 ${added.length} 张图片${invalid || duplicate ? `；忽略 ${invalid + duplicate} 个文件` : ''}`)
  }
  const sorted = useMemo(() => [...records].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    const result = typeof av === 'string' ? av.localeCompare(String(bv), 'zh-CN', { numeric: true }) : av - Number(bv)
    return direction === 'asc' ? result : -result
  }), [records, sortKey, direction])
  const sort = (key: SortKey) => { if (key === sortKey) setDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setDirection('asc') } }
  const choose = () => inputRef.current?.click()
  const copy = async () => { try { await navigator.clipboard.writeText(createClipboardText(sorted)); notify('已复制全部结果') } catch { notify('复制失败，请检查剪贴板权限') } }
  const count = (orientation: string) => records.filter(item => item.orientation === orientation).length

  return <div className="inspector-page">
    <section className="tool-intro"><div className="tool-intro-icon"><BarChart3 /></div><div><h1>图片尺寸与画幅比例检测</h1><p>批量读取宽高、方向和文件大小，自动匹配最接近的标准画幅比例</p></div></section>
    {!records.length ? <section className="inspector-upload" role="button" tabIndex={0} onClick={choose} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && choose()}
      onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)) }}>
      <ImagePlus size={36} /><strong>{busy ? '正在读取图片…' : '拖拽图片到这里，或点击选择'}</strong><span>支持 JPG、JPEG、PNG、WEBP、GIF、BMP，可一次选择多张</span>
    </section> : <>
      <section className="inspector-stats"><div><span>图片总数</span><b>{records.length}</b></div><div><span>横图</span><b>{count('横图')}</b></div><div><span>竖图</span><b>{count('竖图')}</b></div><div><span>方图</span><b>{count('方图')}</b></div>
        <div className="ratio-list"><span>比例分布</span><p>{STANDARD_RATIOS.map(ratio => ({ label: ratio.label, count: records.filter(item => item.closestRatio === ratio.label).length })).filter(item => item.count).map(item => <em key={item.label}>{item.label} <b>{item.count}</b></em>)}</p></div></section>
      <section className="inspector-actions"><strong>检测结果 <i>{records.length}</i></strong><div><button className="button primary" onClick={choose}>＋ 继续添加</button><button className="button" onClick={() => void copy()}><ClipboardCopy size={15} />复制结果</button><button className="button" onClick={() => downloadCsv(sorted)}><Download size={15} />导出 CSV</button><button className="button danger" onClick={() => { setRecords([]); orderRef.current = 0 }}><Trash2 size={15} />清空</button></div></section>
      <div className="inspector-table"><table><thead><tr><th onClick={() => sort('order')}>序号</th><th onClick={() => sort('name')}>文件名</th><th>图片尺寸</th><th>方向</th><th>实际比例</th><th onClick={() => sort('closestRatio')}>最接近比例</th><th onClick={() => sort('errorPercent')}>误差</th><th>文件大小</th><th>操作</th></tr></thead>
        <tbody>{sorted.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td title={item.name}>{item.name}</td><td><b>{item.width}</b> × <b>{item.height}</b> px</td><td><span className={`orient ${item.orientation}`}>{item.orientation}</span></td><td>{item.actualRatioText}</td><td><mark>{item.closestRatio}</mark></td><td>{formatError(item.errorPercent)}</td><td>{formatFileSize(item.size)}</td><td><button className="row-delete" onClick={() => setRecords(current => current.filter(record => record.id !== item.id))}>删除</button></td></tr>)}</tbody></table></div>
    </>}
    <input ref={inputRef} type="file" multiple hidden accept=".jpg,.jpeg,.png,.webp,.gif,.bmp" onChange={event => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    {notice && <div className="suite-toast">{notice}</div>}
  </div>
}
