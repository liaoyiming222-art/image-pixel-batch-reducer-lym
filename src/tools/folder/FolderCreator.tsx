import { useMemo, useState } from 'react'
import { ClipboardPaste, FolderPlus, Play, Trash2 } from 'lucide-react'
import { splitTable } from './parser'
import './folder.css'

interface DirectoryHandle {
  name: string
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandle>
}
interface PreviewRow { id: string; name: string; detail: string; tag: string; folder: string; status: string }

const rules: [string, string[]][] = [
  ['卖点图', ['4大卖点图', '四大卖点图', '卖点图', '卖点']], ['尺寸图', ['规格尺寸图', '尺寸图']],
  ['改尺寸', ['尺寸', '改大', '改小', '加大', '缩小', '长度', '宽度', '高度', '直径', '厚度']],
  ['改颜色', ['颜色', '改色', '色号', '配色', '换色']], ['改材质', ['材质', '面料', '皮质', '布料', '木纹', '纹理']],
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
export function FolderCreator() {
  const [source, setSource] = useState('')
  const [hasHeader, setHasHeader] = useState(false)
  const [nameColumn, setNameColumn] = useState(0)
  const [detailColumn, setDetailColumn] = useState(4)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [handle, setHandle] = useState<DirectoryHandle | null>(null)
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)
  const [savedSuffixes, setSavedSuffixes] = useState<string[]>(() => {
    try { const values = JSON.parse(localStorage.getItem('ai-folder-saved-suffixes') || '[]'); return Array.isArray(values) ? values : [] } catch { return [] }
  })
  const parsed = useMemo(() => splitTable(source), [source])
  const maxColumns = Math.max(1, ...parsed.map(row => row.length))
  const labels = Array.from({ length: maxColumns }, (_, index) => `第 ${index + 1} 列${parsed[hasHeader ? 0 : 0]?.[index] ? `（${parsed[hasHeader ? 0 : 0][index].slice(0, 12)}）` : ''}`)
  const updateRow = (id: string, patch: Partial<PreviewRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
  const rememberSuffix = (value: string) => {
    const suffix = safePart(value)
    if (!suffix || suffix === '待填写' || savedSuffixes.includes(suffix)) return
    const next = [suffix, ...savedSuffixes].slice(0, 50)
    setSavedSuffixes(next)
    try { localStorage.setItem('ai-folder-saved-suffixes', JSON.stringify(next)) } catch { /* 本地存储不可用时不影响创建 */ }
  }
  const parse = () => {
    const data = hasHeader ? parsed.slice(1) : parsed
    const detailIndex = Math.min(detailColumn, maxColumns - 1), nameIndex = Math.min(nameColumn, maxColumns - 1)
    setRows(data.map(row => { const name = (row[nameIndex] || '').trim(), detail = (row[detailIndex] || '').trim(), tag = extractSuffix(detail); return { id: crypto.randomUUID(), name, detail, tag, folder: folderName(name, tag), status: '待创建' } }).filter(row => row.name))
  }
  const paste = async () => { try { const text = await navigator.clipboard.readText(); setSource(text) } catch { setNotice('浏览器未允许读取剪贴板，请在输入框中按 Ctrl+V。') } }
  const chooseFolder = async () => {
    const picker = (window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker
    if (!picker) { setNotice('请使用最新版 Chrome 或 Edge，才能直接选择位置并创建文件夹。'); return }
    try { setHandle(await picker({ mode: 'readwrite' })); setNotice('目标位置选择成功，同名文件夹会自动跳过。') } catch (error) { if ((error as DOMException).name !== 'AbortError') setNotice('选择文件夹失败。') }
  }
  const createFolders = async () => {
    if (!rows.length) { setNotice('请先粘贴并解析需求数据。'); return }
    if (!handle) { setNotice('请先选择目标文件夹。'); return }
    setWorking(true); let created = 0, skipped = 0, failed = 0; const seen = new Set<string>()
    for (const row of rows) {
      const key = row.folder.toLocaleLowerCase()
      if (!row.folder || seen.has(key)) { updateRow(row.id, { status: '名称重复，已跳过' }); skipped += 1; continue }
      seen.add(key)
      try {
        try { await handle.getDirectoryHandle(row.folder); updateRow(row.id, { status: '已存在，已跳过' }); skipped += 1 }
        catch (error) { if ((error as DOMException).name !== 'NotFoundError') throw error; await handle.getDirectoryHandle(row.folder, { create: true }); updateRow(row.id, { status: '创建成功' }); created += 1 }
      } catch { updateRow(row.id, { status: '创建失败' }); failed += 1 }
    }
    setWorking(false); setNotice(`处理完成：创建 ${created} 个，跳过 ${skipped} 个，失败 ${failed} 个。`)
  }
  return <div className="folder-page">
    <section className="tool-intro"><div className="tool-intro-icon"><FolderPlus /></div><div><h1>AI 需求文件夹批量创建</h1><p>从 Excel / WPS 复制数据，检查命名后直接在指定位置批量创建文件夹</p></div></section>
    <section className="folder-card"><h2>1. 粘贴表格内容</h2><div className="folder-toolbar"><button onClick={() => void paste()}><ClipboardPaste size={16} />从剪贴板粘贴</button><button className="primary" onClick={parse}><Play size={16} />解析内容</button><button onClick={() => { setSource(''); setRows([]) }}><Trash2 size={16} />清空</button><span>支持 Excel/WPS 多行和单元格内换行</span></div>
      <textarea value={source} onChange={event => setSource(event.target.value)} placeholder="在这里粘贴 Excel / WPS 中复制的内容。无表头时默认读取第1列和第5列。" />
      <div className="folder-mapping"><label><input type="checkbox" checked={hasHeader} onChange={event => setHasHeader(event.target.checked)} /> 第一行是表头</label><label>需求名称列：<select value={nameColumn} onChange={event => setNameColumn(+event.target.value)}>{labels.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label><label>需求说明列：<select value={Math.min(detailColumn, maxColumns - 1)} onChange={event => setDetailColumn(+event.target.value)}>{labels.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label></div>
    </section>
    <section className="folder-card"><h2>2. 预览并检查 <small>{rows.length ? `已解析 ${rows.length} 条` : '请先解析内容'}</small></h2><datalist id="folder-suffix-options">{[...new Set([...savedSuffixes, ...rules.map(rule => rule[0])])].map(value => <option key={value} value={value} />)}</datalist><div className="folder-table"><table><thead><tr><th>序号</th><th>需求名称</th><th>需求说明</th><th>命名后缀</th><th>将创建的文件夹名称</th><th>状态</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.name}</td><td>{row.detail}</td><td><input list="folder-suffix-options" value={row.tag} onBlur={event => rememberSuffix(event.target.value)} onChange={event => { const tag = event.target.value; updateRow(row.id, { tag, folder: folderName(row.name, tag), status: '待创建' }) }} /></td><td><input value={row.folder} onChange={event => updateRow(row.id, { folder: safePart(event.target.value), status: '待创建' })} /></td><td className={row.status.includes('成功') ? 'ok' : row.status.includes('失败') ? 'bad' : ''}>{row.status}</td></tr>)}</tbody></table></div></section>
    <section className="folder-card"><h2>3. 选择保存位置并创建</h2><div className="folder-output"><div>{handle ? `已选择：${handle.name}` : '尚未选择目标文件夹'}</div><button onClick={() => void chooseFolder()}>选择目标文件夹</button><button className="primary" disabled={working} onClick={() => void createFolders()}>{working ? '正在创建…' : '批量创建文件夹'}</button></div><p>已存在的同名文件夹会跳过，不会覆盖其中的文件。</p></section>
    {notice && <div className="folder-notice">{notice}</div>}
  </div>
}
