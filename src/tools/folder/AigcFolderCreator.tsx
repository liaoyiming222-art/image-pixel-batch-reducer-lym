import { useMemo, useRef, useState } from 'react'
import { ClipboardPaste, Play, Trash2 } from 'lucide-react'
import { useTransientNotice } from '../../useTransientNotice'
import { newTaskId, track } from '../../analytics'
import { createDirectories, type DirectoryHandle } from './createDirectories'
import { aigcFolderName, creationDate } from './naming'
import { splitTable } from './parser'

interface PreviewRow { id: string; name: string; type: string; folder: string; status: string }
const pendingStatus = (name: string, type: string) => !name.trim() ? '缺少需求名称' : !type.trim() ? '缺少需求类型' : '待创建'

export function AigcFolderCreator() {
  const [source, setSource] = useState('')
  const [nameColumn, setNameColumn] = useState(0)
  const [typeColumn, setTypeColumn] = useState(11)
  const [date, setDate] = useState(() => creationDate())
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [handle, setHandle] = useState<DirectoryHandle | null>(null)
  const [notice, setNotice] = useTransientNotice()
  const [working, setWorking] = useState(false)
  const creationLock = useRef(false)
  const parsed = useMemo(() => splitTable(source), [source])
  const maxColumns = parsed.reduce((max, row) => Math.max(max, row.length), 0)
  const validColumns = nameColumn < maxColumns && typeColumn < maxColumns
  const labels = Array.from({ length: maxColumns }, (_, index) => `第 ${index + 1} 列${parsed[0]?.[index] ? `（${parsed[0][index].replace(/\s+/g, ' ').slice(0, 12)}）` : ''}`)
  const invalidCount = rows.filter(row => !row.name.trim() || !row.type.trim()).length
  const updateRow = (id: string, patch: Partial<PreviewRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
  const editRow = (id: string, field: 'name' | 'type', value: string) => setRows(current => current.map(row => {
    if (row.id !== id) return row
    const next = { ...row, [field]: value }
    return { ...next, folder: aigcFolderName(next.name, next.type, date), status: pendingStatus(next.name, next.type) }
  }))
  const changeSource = (value: string) => { setSource(value); setRows([]) }
  const parse = () => {
    if (!validColumns) { setNotice('请选择需求名称和需求类型所在的实际列。'); return }
    const firstName = parsed[0]?.[nameColumn]?.replace(/\s/g, '') ?? ''
    const firstType = parsed[0]?.[typeColumn]?.replace(/\s/g, '') ?? ''
    const hasHeader = ['需求名称', '需求名', '产品名称', '产品名'].includes(firstName) && ['需求类型', '类型', '任务类型'].includes(firstType)
    const data = hasHeader ? parsed.slice(1) : parsed
    const currentDate = creationDate()
    const next = data.map(row => {
      const name = (row[nameColumn] ?? '').trim(); const type = (row[typeColumn] ?? '').trim()
      return { id: crypto.randomUUID(), name, type, folder: aigcFolderName(name, type, currentDate), status: pendingStatus(name, type) }
    })
    setDate(currentDate); setRows(next)
    if (!next.length) setNotice('没有解析到需求，请粘贴一行或多行表格内容。')
    else if (next.some(row => !row.name || !row.type)) setNotice('部分需求缺少名称或类型，请检查所选列，或在预览中补全后创建。')
  }
  const paste = async () => {
    try { changeSource(await navigator.clipboard.readText()) }
    catch { setNotice('浏览器未允许读取剪贴板，请在输入框中按 Ctrl+V。') }
  }
  const chooseFolder = async () => {
    const picker = (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker
    if (!picker) { setNotice('请使用最新版 Chrome 或 Edge，才能直接选择位置并创建文件夹。'); return }
    try { setHandle(await picker.call(window, { mode: 'readwrite' })); setNotice('目标位置选择成功，同名文件夹会自动跳过。') }
    catch (error) { if ((error as DOMException).name !== 'AbortError') setNotice('选择文件夹失败。') }
  }
  const createFolders = async () => {
    if (creationLock.current) return
    if (!rows.length) { setNotice('请先解析表格并生成预览。'); return }
    if (invalidCount) { setNotice('请先补全需求名称和需求类型。'); return }
    if (!handle) { setNotice('请先选择保存位置。'); return }
    creationLock.current = true; setWorking(true)
    // Generate the date at creation time as well, so a preview left open overnight stays correct.
    const currentDate = creationDate()
    const jobs = rows.map(row => ({ ...row, folder: aigcFolderName(row.name, row.type, currentDate), status: '待创建' }))
    setDate(currentDate); setRows(jobs)
    const id = newTaskId(); const started = performance.now()
    track('folder_create_started', 'folders', { count: jobs.length, mode: 'aigc' }, id)
    try {
      const counts = await createDirectories(handle, jobs, true, (rowId, status) => updateRow(rowId, { status }))
      track('folder_create_finished', 'folders', { ...counts, mode: 'aigc', duration: Math.round(performance.now() - started) }, id)
      setNotice(`处理完成：创建 ${counts.created} 个主目录、${counts.children} 个子目录，补齐 ${counts.completedExisting} 个，跳过 ${counts.existing + counts.duplicate} 个，失败 ${counts.failed} 个。`)
    } finally { creationLock.current = false; setWorking(false) }
  }

  return <div className="folder-page aigc-folder-page">
    <section className="folder-card">
      <h2>粘贴表格内容</h2>
      <div className="folder-toolbar"><button disabled={working} onClick={() => void paste()}><ClipboardPaste size={16} />从剪贴板粘贴</button><button className="primary" disabled={working || !source.trim() || !validColumns} onClick={parse}><Play size={16} />解析内容</button><button disabled={working} onClick={() => changeSource('')}><Trash2 size={16} />清空</button><span>支持单行、多行表格和单元格内换行</span></div>
      <textarea aria-label="需求表格内容" value={source} disabled={working} onChange={event => changeSource(event.target.value)} placeholder="粘贴一行或多行表格内容，再选择需求名称和需求类型所在列。" />
      <div className="folder-mapping">
        <label>需求名称列：<select aria-label="需求名称列" value={nameColumn < maxColumns ? nameColumn : -1} disabled={working || !maxColumns} onChange={event => { setNameColumn(+event.target.value); setRows([]) }}><option value={-1} disabled>{maxColumns ? '请选择对应列' : '请先粘贴表格'}</option>{labels.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label>
        <label>需求类型列：<select aria-label="需求类型列" value={typeColumn < maxColumns ? typeColumn : -1} disabled={working || !maxColumns} onChange={event => { setTypeColumn(+event.target.value); setRows([]) }}><option value={-1} disabled>{maxColumns ? '请选择对应列' : '请先粘贴表格'}</option>{labels.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label>
      </div>
      <p className="folder-help">{maxColumns ? `当前表格已识别 ${maxColumns} 列，可随时切换对应列。` : '粘贴后将按实际列数提供选项，默认使用第1列和第12列。'}</p>
      <p className="aigc-naming-rule">命名规则：<code>【AI】{date}-需求名称-需求类型</code>，创建时使用当天日期。</p>
    </section>
    <section className="folder-card">
      <h2>预览并检查 <small>{rows.length ? `已解析 ${rows.length} 条` : '请先解析内容'}</small></h2>
      {!!rows.length && <p className="folder-help">可修改需求名称和需求类型，文件夹名称会同步更新；Windows 不允许的名称字符会自动替换。</p>}
      <div className="folder-table aigc-preview-table"><table><thead><tr><th>需求名称</th><th>需求类型</th><th>文件夹名称</th><th>状态</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}>
        <td><input aria-label={`第 ${index + 1} 条需求名称`} title={row.name} value={row.name} disabled={working} onChange={event => editRow(row.id, 'name', event.target.value)} /></td>
        <td><input aria-label={`第 ${index + 1} 条需求类型`} value={row.type} disabled={working} onChange={event => editRow(row.id, 'type', event.target.value)} /></td>
        <td><span className="aigc-generated-name">{row.folder || '请补全名称和类型'}</span></td>
        <td className={row.status.includes('成功') ? 'ok' : row.status.includes('失败') || row.status.includes('缺少') ? 'bad' : ''}>{row.status}</td>
      </tr>)}</tbody></table></div>
    </section>
    <section className="folder-card">
      <h2>选择保存位置并创建</h2>
      <div className="folder-output"><div>{handle ? `已选择：${handle.name}` : '尚未选择目标文件夹'}</div><button disabled={working} onClick={() => void chooseFolder()}>选择目标文件夹</button><button className="primary" disabled={working || !rows.length || !!invalidCount} onClick={() => void createFolders()}>{working ? '正在创建…' : '批量创建文件夹'}</button></div>
      <p>每个需求文件夹内会自动创建“AI”和“原图”两个子文件夹；已有文件不会被覆盖。</p>
    </section>
    {notice && <div className="folder-notice" role="status">{notice}</div>}
  </div>
}
