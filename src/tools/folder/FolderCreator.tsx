import { useMemo, useState } from 'react'
import { ClipboardPaste, FolderOpen, FolderPlus, Play, Trash2 } from 'lucide-react'
import { useTransientNotice } from '../../useTransientNotice'
import { splitTable } from './parser'
import './folder.css'
import { createDirectories, type DirectoryHandle } from './createDirectories'
import { newTaskId, track } from '../../analytics'

interface PreviewRow { id: string; name: string; detail: string; tag: string; folder: string; status: string }
interface NormalRow { id: string; name: string; folder: string; status: string }
const rules: [string, string[]][] = [
  ['卖点图', ['4大卖点图', '四大卖点图', '卖点图', '卖点']], ['尺寸图', ['规格尺寸图', '尺寸图']],
  ['改尺寸', ['尺寸', '改大', '改小', '加大', '缩小', '长度', '宽度', '高度', '直径', '厚度']], ['改颜色', ['颜色', '改色', '色号', '配色', '换色']], ['改材质', ['材质', '面料', '皮质', '布料', '木纹', '纹理']],
  ['改结构', ['结构', '斜腿', '直腿', '桌腿', '扶手', '靠背', '抽屉', '柜门']], ['改款式', ['款式', '造型', '外观', '样式', '替换', '更换']],
  ['做场景图', ['场景图', '场景', '情景图']], ['做白底图', ['白底图', '白底']], ['做详情图', ['详情图', '细节图', '详情页']],
]
const invalidWindows = /[<>:"/\\|?*\u0000-\u001f]/g
const reservedWindows = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const safePart = (value: string) => { let clean = value.trim().replace(invalidWindows, '_').replace(/\s+/g, ' ').replace(/[. ]+$/g, ''); if (reservedWindows.test(clean)) clean += '_'; return clean }
const folderName = (name: string, tag: string) => { const n = safePart(name), t = safePart(tag); return n ? `【AI】${n}${t ? `-${t}` : ''}` : '' }
function extractSuffix(detail: string) {
  const text = detail.trim().toLowerCase()
  const direct = ['去字幕', '删除字幕', '移除字幕', '加字幕', '添加字幕', '改字幕', '去水印', '删除水印', '移除水印', '加水印', '添加水印', '去背景', '换背景', '抠图', '剪辑', '修图', '精修', '建模', '渲染', '排版']
  for (const action of direct) if (text.includes(action)) return ({ 删除字幕: '去字幕', 移除字幕: '去字幕', 删除水印: '去水印', 移除水印: '去水印', 添加字幕: '加字幕', 添加水印: '加水印' } as Record<string, string>)[action] || action
  for (const [suffix, words] of rules) if (words.some(word => text.includes(word))) return suffix
  const concise = detail.split(/[，,。；;\r\n]/)[0].replace(/^(?:请|需要|进行|视频|图片|图像|产品)\s*/, '').trim()
  return concise.length >= 2 && concise.length <= 12 ? concise : '待填写'
}
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
  return <div className="folder-page normal-folder-page"><section className="tool-intro"><div className="tool-intro-icon"><FolderPlus /></div><div><h1>文件夹批量创建</h1><p>批量创建文件夹，统一添加前缀、后缀和编号。</p></div></section><ModeSwitch mode="normal" onChange={onModeChange} /><section className="folder-card"><h2>1. 输入文件夹名称</h2><div className="folder-toolbar"><button onClick={() => void paste()}><ClipboardPaste size={16} />从剪贴板粘贴</button><button className="primary" onClick={parse}><Play size={16} />生成预览</button><button onClick={() => { setSource(''); setRows([]) }}><Trash2 size={16} />清空</button><span>每行一个名称，支持从 Excel/WPS 粘贴</span></div><textarea value={source} onChange={event => setSource(event.target.value)} placeholder={'例如：客户资料\n产品图片\n合同文件\n项目素材'} /></section><section className="folder-card"><h2>2. 设置命名规则</h2><div className="normal-rules"><label>统一前缀<input value={prefix} onChange={event => { setPrefix(event.target.value); rebuild({ prefix: event.target.value }) }} placeholder="例如：2026-" /></label><label>统一后缀<input value={suffix} onChange={event => { setSuffix(event.target.value); rebuild({ suffix: event.target.value }) }} placeholder="例如：-初稿" /></label><label className="number-toggle"><input type="checkbox" checked={numbering} onChange={event => { setNumbering(event.target.checked); rebuild({ numbering: event.target.checked }) }} /> 自动编号</label><label>起始编号<input type="number" min="0" value={start} disabled={!numbering} onChange={event => { const value = +event.target.value; setStart(value); rebuild({ start: value }) }} /></label><label>编号位数<input type="number" min="1" max="8" value={digits} disabled={!numbering} onChange={event => { const value = +event.target.value; setDigits(value); rebuild({ digits: value }) }} /></label></div><p className="folder-help">创建前会自动清理 Windows 文件夹名称中的非法字符，并检查重复名称。</p></section><section className="folder-card"><h2>3. 预览并创建 <small>{rows.length ? `已生成 ${rows.length} 个` : '请先生成预览'}</small></h2><div className="folder-table normal-folder-table"><table><thead><tr><th>原名称</th><th>最终文件夹名称</th><th>状态</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td><input value={row.folder} onChange={event => updateRow(row.id, { folder: safePart(event.target.value), status: '待创建' })} /></td><td className={row.status.includes('成功') ? 'ok' : row.status.includes('失败') ? 'bad' : ''}>{row.status}</td></tr>)}</tbody></table></div><div className="folder-output"><div>{handle ? `已选择：${handle.name}` : '尚未选择目标文件夹'}</div><button onClick={() => void chooseFolder()}><FolderOpen size={16} />选择目标文件夹</button><button className="primary" disabled={working} onClick={() => void createFolders()}>{working ? '正在创建…' : '批量创建文件夹'}</button></div></section>{notice && <div className="folder-notice">{notice}</div>}</div>
}

export function FolderCreator() { const [mode, setMode] = useState<'aigc' | 'normal'>('aigc'); return <div className={`folder-page folder-page-shell folder-mode-${mode}`}><section className="tool-intro folder-tool-intro"><div className="folder-intro-copy"><div className="tool-intro-icon"><FolderPlus /></div><div><h1>文件夹批量处理</h1><p>选择模式，批量创建、命名和整理文件夹。</p></div></div><ModeSwitch mode={mode} onChange={setMode} /></section><div className="folder-mode-content">{mode === 'normal' ? <NormalFolderCreator onModeChange={setMode} /> : <AigcFolderCreator />}</div></div> }

function AigcFolderCreator() {
  const [source, setSource] = useState(''); const [hasHeader, setHasHeader] = useState(false); const [nameColumn, setNameColumn] = useState(0); const [detailColumn, setDetailColumn] = useState(4); const [rows, setRows] = useState<PreviewRow[]>([]); const [handle, setHandle] = useState<DirectoryHandle | null>(null); const [notice, setNotice] = useTransientNotice(); const [working, setWorking] = useState(false)
  const [savedSuffixes, setSavedSuffixes] = useState<string[]>(() => { try { const values = JSON.parse(localStorage.getItem('ai-folder-saved-suffixes') || '[]'); return Array.isArray(values) ? values : [] } catch { return [] } })
  const parsed = useMemo(() => splitTable(source), [source]); const maxColumns = Math.max(1, ...parsed.map(row => row.length)); const labels = Array.from({ length: maxColumns }, (_, index) => `第 ${index + 1} 列${parsed[0]?.[index] ? `（${parsed[0][index].slice(0, 12)}）` : ''}`); const suffixOptions = [...new Set([...rules.map(rule => rule[0]), ...savedSuffixes])]
  const updateRow = (id: string, patch: Partial<PreviewRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
  const rememberSuffix = (value: string) => { const suffix = safePart(value); if (!suffix || suffix === '待填写' || savedSuffixes.includes(suffix)) return; const next = [suffix, ...savedSuffixes].slice(0, 50); setSavedSuffixes(next); try { localStorage.setItem('ai-folder-saved-suffixes', JSON.stringify(next)) } catch { /* ignore */ } }
  const parse = () => { const data = hasHeader ? parsed.slice(1) : parsed; const detailIndex = Math.min(detailColumn, maxColumns - 1), nameIndex = Math.min(nameColumn, maxColumns - 1); setRows(data.map(row => { const name = (row[nameIndex] || '').trim(), detail = (row[detailIndex] || '').trim(), tag = extractSuffix(detail); return { id: crypto.randomUUID(), name, detail, tag, folder: folderName(name, tag), status: '待创建' } }).filter(row => row.name)) }
  const paste = async () => { try { setSource(await navigator.clipboard.readText()) } catch { setNotice('浏览器未允许读取剪贴板，请在输入框中按 Ctrl+V。') } }
  const chooseFolder = async () => { const picker = (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker; if (!picker) { setNotice('请使用最新版 Chrome 或 Edge，才能直接选择位置并创建文件夹。'); return } try { setHandle(await picker({ mode: 'readwrite' })); setNotice('目标位置选择成功，同名文件夹会自动跳过。') } catch (error) { if ((error as DOMException).name !== 'AbortError') setNotice('选择文件夹失败。') } }
  const createFolders = async () => {
    if (!rows.length) { setNotice('请先输入并生成文件夹预览。'); return }
    if (!handle) { setNotice('请先选择保存位置。'); return }
    if (working) return
    setWorking(true)
    const id = newTaskId(), started = performance.now()
    track('folder_create_started', 'folders', { count: rows.length, mode: 'aigc' }, id)
    try {
      const counts = await createDirectories(handle, rows, true, (rowId, status) => updateRow(rowId, { status }))
      track('folder_create_finished', 'folders', { ...counts, mode: 'aigc', duration: Math.round(performance.now() - started) }, id)
      setNotice(`处理完成：创建 ${counts.created} 个主目录、${counts.children} 个子目录，补齐 ${counts.completedExisting} 个，跳过 ${counts.existing + counts.duplicate} 个，失败 ${counts.failed} 个。`)
    } finally { setWorking(false) }
  }
  return <div className="folder-page"><section className="tool-intro"><div className="tool-intro-icon"><FolderPlus /></div><div><h1>文件夹批量创建</h1><p>粘贴需求表，批量生成规范文件夹。</p></div></section><section className="folder-card"><h2>1. 粘贴表格内容</h2><div className="folder-toolbar"><button onClick={() => void paste()}><ClipboardPaste size={16} />从剪贴板粘贴</button><button className="primary" onClick={parse}><Play size={16} />解析内容</button><button onClick={() => { setSource(''); setRows([]) }}><Trash2 size={16} />清空</button><span>支持 Excel/WPS 多行和单元格内换行</span></div><textarea value={source} onChange={event => setSource(event.target.value)} placeholder="在这里粘贴 Excel / WPS 中复制的内容。无表头时默认读取第1列和第5列。" /><div className="folder-mapping"><label><input type="checkbox" checked={hasHeader} onChange={event => setHasHeader(event.target.checked)} /> 第一行是表头</label><label>需求名称列：<select value={nameColumn} onChange={event => setNameColumn(+event.target.value)}>{labels.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label><label>需求说明列：<select value={Math.min(detailColumn, maxColumns - 1)} onChange={event => setDetailColumn(+event.target.value)}>{labels.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label></div></section><section className="folder-card"><h2>2. 预览并检查 <small>{rows.length ? `已解析 ${rows.length} 条` : '请先解析内容'}</small></h2><div className="folder-table"><table><thead><tr><th>序号</th><th>需求名称</th><th>需求说明</th><th>命名后缀</th><th>将创建的文件夹名称</th><th>状态</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.name}</td><td>{row.detail}</td><td><div className="suffix-editor"><select aria-label={`第 ${index + 1} 条需求的后缀分类`} value={suffixOptions.includes(row.tag) ? row.tag : '__custom__'} onChange={event => { if (event.target.value === '__custom__') return; const tag = event.target.value; updateRow(row.id, { tag, folder: folderName(row.name, tag), status: '待创建' }); rememberSuffix(tag) }}><option value="__custom__">自定义后缀</option>{suffixOptions.map(value => <option key={value} value={value}>{value}</option>)}</select><input aria-label={`第 ${index + 1} 条需求的自定义后缀`} value={row.tag} onBlur={event => rememberSuffix(event.target.value)} onChange={event => { const tag = event.target.value; updateRow(row.id, { tag, folder: folderName(row.name, tag), status: '待创建' }) }} /></div></td><td><input value={row.folder} onChange={event => updateRow(row.id, { folder: safePart(event.target.value), status: '待创建' })} /></td><td className={row.status.includes('成功') ? 'ok' : row.status.includes('失败') ? 'bad' : ''}>{row.status}</td></tr>)}</tbody></table></div></section><section className="folder-card"><h2>3. 选择保存位置并创建</h2><div className="folder-output"><div>{handle ? `已选择：${handle.name}` : '尚未选择目标文件夹'}</div><button onClick={() => void chooseFolder()}>选择目标文件夹</button><button className="primary" disabled={working} onClick={() => void createFolders()}>{working ? '正在创建…' : '批量创建文件夹'}</button></div><p>每个需求文件夹内会自动创建“AI”和“原图”两个子文件夹；已有文件不会被覆盖。</p></section>{notice && <div className="folder-notice">{notice}</div>}</div>
}
