import { useMemo, useState } from 'react'
import { ClipboardPaste, FolderOpen, FolderPlus, Play, Trash2 } from 'lucide-react'
import { useTransientNotice } from '../../useTransientNotice'
import { AigcFolderCreator } from './AigcFolderCreator'
import './folder.css'
import { createDirectories, type DirectoryHandle } from './createDirectories'
import { newTaskId, track } from '../../analytics'
import { safeFolderPart as safePart } from './naming'

interface NormalRow { id: string; name: string; folder: string; status: string }
function ModeSwitch({ mode, onChange }: { mode: 'aigc' | 'normal'; onChange: (mode: 'aigc' | 'normal') => void }) {
  return <div className="folder-mode-switch" role="tablist" aria-label="文件夹创建模式"><button className={mode === 'aigc' ? 'active' : ''} onClick={() => onChange('aigc')} role="tab" aria-selected={mode === 'aigc'}>AIGC 专用</button><button className={mode === 'normal' ? 'active' : ''} onClick={() => onChange('normal')} role="tab" aria-selected={mode === 'normal'}>普通文件夹工具</button></div>
}

function NormalFolderCreator({ onModeChange }: { onModeChange: (mode: 'aigc' | 'normal') => void }) {
  const [source, setSource] = useState(''); const [prefix, setPrefix] = useState(''); const [suffix, setSuffix] = useState(''); const [numbering, setNumbering] = useState(false); const [start, setStart] = useState(1); const [digits, setDigits] = useState(3); const [rows, setRows] = useState<NormalRow[]>([]); const [handle, setHandle] = useState<DirectoryHandle | null>(null); const [notice, setNotice] = useTransientNotice(); const [working, setWorking] = useState(false)
  const names = useMemo(() => source.split(/\r?\n/).map(value => value.trim()).filter(Boolean), [source])
  const makeName = (name: string, index: number) => safePart(`${prefix}${numbering ? `${String(start + index).padStart(Math.max(1, digits), '0')}-` : ''}${name}${suffix}`)
  const rebuild = (next: { prefix?: string; suffix?: string; numbering?: boolean; start?: number; digits?: number } = {}) => { const settings = { prefix, suffix, numbering, start, digits, ...next }; setRows(current => current.map((row, index) => ({ ...row, folder: safePart(`${settings.prefix}${settings.numbering ? `${String(settings.start + index).padStart(Math.max(1, settings.digits), '0')}-` : ''}${row.name}${settings.suffix}`), status: '待创建' }))) }
  const parse = () => setRows(names.map((name, index) => ({ id: crypto.randomUUID(), name, folder: makeName(name, index), status: '待创建' })))
  const updateRow = (id: string, patch: Partial<NormalRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
  const paste = async () => { try { setSource(await navigator.clipboard.readText()) } catch { setNotice('浏览器未允许读取剪贴板，请直接粘贴到输入框。') } }
  const chooseFolder = async () => { const picker = (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker; if (!picker) { setNotice('请使用最新版 Chrome 或 Edge 选择本地文件夹。'); return } try { setHandle(await picker({ mode: 'readwrite' })) } catch (error) { if ((error as DOMException).name !== 'AbortError') setNotice('选择文件夹失败。') } }
  const createFolders = async () => {
    if (!rows.length) { setNotice('请先输入并生成文件夹预览。'); return }
    if (!handle) { setNotice('请先选择保存位置。'); return }
    if (working) return
    setWorking(true)
    const id = newTaskId(), started = performance.now()
    track('folder_create_started', 'folders', { count: rows.length, mode: 'normal' }, id)
    try {
      const counts = await createDirectories(handle, rows, false, (rowId, status) => updateRow(rowId, { status }))
      track('folder_create_finished', 'folders', { ...counts, mode: 'normal', duration: Math.round(performance.now() - started) }, id)
      setNotice(`处理完成：创建 ${counts.created} 个主目录、${counts.children} 个子目录，补齐 ${counts.completedExisting} 个，跳过 ${counts.existing + counts.duplicate} 个，失败 ${counts.failed} 个。`)
    } finally { setWorking(false) }
  }
  return <div className="folder-page normal-folder-page"><section className="tool-intro"><div className="tool-intro-icon"><FolderPlus /></div><div><h1>文件夹批量创建</h1><p>批量创建文件夹，统一添加前缀、后缀和编号。</p></div></section><ModeSwitch mode="normal" onChange={onModeChange} /><section className="folder-card"><h2>输入文件夹名称</h2><div className="folder-toolbar"><button onClick={() => void paste()}><ClipboardPaste size={16} />从剪贴板粘贴</button><button className="primary" onClick={parse}><Play size={16} />生成预览</button><button onClick={() => { setSource(''); setRows([]) }}><Trash2 size={16} />清空</button><span>每行一个名称，支持从 Excel/WPS 粘贴</span></div><textarea value={source} onChange={event => setSource(event.target.value)} placeholder={'例如：客户资料\n产品图片\n合同文件\n项目素材'} /></section><section className="folder-card"><h2>设置命名规则</h2><div className="normal-rules"><label>统一前缀<input value={prefix} onChange={event => { setPrefix(event.target.value); rebuild({ prefix: event.target.value }) }} placeholder="例如：2026-" /></label><label>统一后缀<input value={suffix} onChange={event => { setSuffix(event.target.value); rebuild({ suffix: event.target.value }) }} placeholder="例如：-初稿" /></label><label className="number-toggle"><input type="checkbox" checked={numbering} onChange={event => { setNumbering(event.target.checked); rebuild({ numbering: event.target.checked }) }} /> 自动编号</label><label>起始编号<input type="number" min="0" value={start} disabled={!numbering} onChange={event => { const value = +event.target.value; setStart(value); rebuild({ start: value }) }} /></label><label>编号位数<input type="number" min="1" max="8" value={digits} disabled={!numbering} onChange={event => { const value = +event.target.value; setDigits(value); rebuild({ digits: value }) }} /></label></div><p className="folder-help">创建前会自动清理 Windows 文件夹名称中的非法字符，并检查重复名称。</p></section><section className="folder-card"><h2>预览并创建 <small>{rows.length ? `已生成 ${rows.length} 个` : '请先生成预览'}</small></h2><div className="folder-table normal-folder-table"><table><thead><tr><th>原名称</th><th>最终文件夹名称</th><th>状态</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td><input value={row.folder} onChange={event => updateRow(row.id, { folder: safePart(event.target.value), status: '待创建' })} /></td><td className={row.status.includes('成功') ? 'ok' : row.status.includes('失败') ? 'bad' : ''}>{row.status}</td></tr>)}</tbody></table></div><div className="folder-output"><div>{handle ? `已选择：${handle.name}` : '尚未选择目标文件夹'}</div><button onClick={() => void chooseFolder()}><FolderOpen size={16} />选择目标文件夹</button><button className="primary" disabled={working} onClick={() => void createFolders()}>{working ? '正在创建…' : '批量创建文件夹'}</button></div></section>{notice && <div className="folder-notice">{notice}</div>}</div>
}

export function FolderCreator() { const [mode, setMode] = useState<'aigc' | 'normal'>('aigc'); return <div className={`folder-page folder-page-shell folder-mode-${mode}`}><section className="tool-intro folder-tool-intro"><div className="folder-intro-copy"><div className="tool-intro-icon"><FolderPlus /></div><div><h1>文件夹批量处理</h1><p>选择模式，批量创建、命名和整理文件夹。</p></div></div><ModeSwitch mode={mode} onChange={setMode} /></section><div className="folder-mode-content">{mode === 'normal' ? <NormalFolderCreator onModeChange={setMode} /> : <AigcFolderCreator />}</div></div> }
