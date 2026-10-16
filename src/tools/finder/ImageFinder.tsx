import { useMemo, useRef, useState } from 'react'
import { Archive, CheckCircle2, ClipboardPaste, FileSpreadsheet, FolderOpen, ListChecks, Loader2, Search, Trash2, Info } from 'lucide-react'
import { useTransientNotice } from '../../useTransientNotice'
import { columnLabel, detectColumn, matchNames, prepareNames, readWorkbook, resolvedFile, selectedFiles, type ImageEntry, type MatchResult, type NameRow, type WorkbookSheet } from './model'
import { createArchive, entriesFromFiles, ImageReadFailure } from './files'
import './finder.css'

type ResultFilter = 'all' | 'found' | 'missing' | 'choose' | 'error'
export function ImageFinder() {
  const [mode, setMode] = useState<'excel' | 'text'>('excel')
  const [text, setText] = useState('')
  const [sheets, setSheets] = useState<WorkbookSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [column, setColumn] = useState(0)
  const [start, setStart] = useState(0)
  const [excelName, setExcelName] = useState('')
  const [rows, setRows] = useState<NameRow[]>([])
  const [duplicates, setDuplicates] = useState(0)
  const [files, setFiles] = useState<ImageEntry[]>([])
  const [folderName, setFolderName] = useState('')
  const [scanned, setScanned] = useState(0)
  const [results, setResults] = useState<MatchResult[] | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState(new Set<string>())
  const [readErrors, setReadErrors] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<ResultFilter>('all')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [packing, setPacking] = useState(false)
  const [progress, setProgress] = useState({ percent: 0, text: '' })
  const [notice, setNotice] = useTransientNotice()
  const excelInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const scanToken = useRef(0)
  const operation = useRef(false)
  const busy = loading || scanning || packing
  const sheet = sheets[sheetIndex]
  const columnCount = sheet ? sheet.rows.reduce((max, row) => Math.max(max, row.length), 1) : 1
  const resultById = useMemo(() => new Map((results ?? []).map(result => [result.row.id, result])), [results])
  const selected = useMemo(() => selectedFiles(results ?? [], choices, excluded), [results, choices, excluded])
  const counts = useMemo(() => {
    const value = { found: 0, missing: 0, choose: 0, error: 0 }
    for (const result of results ?? []) {
      const file = resolvedFile(result, choices[result.row.id])
      if (file) { value.found++; if (readErrors[file.id]) value.error++ }
      else if (result.matches.length > 1 || result.candidates.length) value.choose++
      else value.missing++
    }
    return value
  }, [results, choices, readErrors])

  const resetResults = () => { setResults(null); setChoices({}); setExcluded(new Set()); setReadErrors({}); setFilter('all') }
  const setNames = (names: string[]) => {
    const prepared = prepareNames(names)
    setRows(prepared.rows); setDuplicates(prepared.duplicates); resetResults()
    if (prepared.duplicates) setNotice(`已合并 ${prepared.duplicates} 个重复图名，保留 ${prepared.rows.length} 个。`)
    if (!prepared.rows.length) setNotice('没有提取到图名，请检查输入文字或所选列。')
  }
  const extractSheet = (value: WorkbookSheet, col: number, from: number) => setNames(value.rows.slice(from).map(row => row[col] ?? ''))
  const uploadExcel = async (file: File) => {
    if (operation.current) return
    if (!/\.xlsx$/i.test(file.name)) { setNotice('请上传 .xlsx 文件；旧版 .xls 请另存为 .xlsx，或复制图名后粘贴。'); return }
    operation.current = true; setLoading(true)
    try {
      const workbook = await readWorkbook(await file.arrayBuffer())
      if (!workbook.length) throw new Error('表格没有可读取的工作表。')
      const first = workbook.findIndex(item => detectColumn(item.rows).start > 0)
      const index = first < 0 ? 0 : first; const detected = detectColumn(workbook[index].rows)
      setSheets(workbook); setSheetIndex(index); setColumn(detected.column); setStart(detected.start); setExcelName(file.name)
      extractSheet(workbook[index], detected.column, detected.start)
    } catch (error) { setNotice(error instanceof Error ? error.message : '读取表格失败，请重试。') }
    finally { operation.current = false; setLoading(false) }
  }
  const paste = async () => {
    try { setText(await navigator.clipboard.readText()) }
    catch { setNotice('无法读取剪贴板，请在文字框中按 Ctrl+V 粘贴。') }
  }
  const chooseFolder = () => {
    if (operation.current) return
    folderInput.current?.click()
  }
  const useFolderFiles = async (list: FileList) => {
    if (operation.current) return
    const all = Array.from(list); const entries: ImageEntry[] = []
    operation.current = true; setScanning(true); setScanned(0)
    const token = ++scanToken.current
    try {
      for (let index = 0; index < all.length; index += 500) {
        await new Promise<void>(resolve => window.setTimeout(resolve, 0))
        if (token !== scanToken.current) return
        entries.push(...entriesFromFiles(all.slice(index, index + 500)))
        setScanned(Math.min(index + 500, all.length))
      }
      setFiles(entries); setFolderName(all[0]?.webkitRelativePath.split('/')[0] || '所选文件夹'); resetResults()
      if (!entries.length) setNotice('所选目录中没有找到支持的图片。')
    } catch { setNotice('无法建立图片清单，请重新选择目录。') }
    finally { operation.current = false; setScanning(false) }
  }
  const find = () => {
    if (!rows.length || !files.length || busy) return
    const prepared = prepareNames(rows.map(row => row.name))
    setRows(prepared.rows); setDuplicates(current => current + prepared.duplicates)
    setResults(matchNames(prepared.rows, files)); setChoices({}); setExcluded(new Set()); setReadErrors({}); setFilter('all')
    if (prepared.duplicates) setNotice(`已合并 ${prepared.duplicates} 个重复图名。`)
  }
  const download = async () => {
    if (operation.current || !selected.length) return
    operation.current = true; setPacking(true); setReadErrors({}); setProgress({ percent: 0, text: '准备读取图片' })
    try {
      const blob = await createArchive(selected, (percent, status) => setProgress({ percent, text: status }))
      const url = URL.createObjectURL(blob); const link = document.createElement('a')
      link.href = url; link.download = `按图名查找_${new Date().toLocaleDateString('sv-SE')}.zip`
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setNotice(`已生成压缩包，共 ${selected.length} 张原图片。`)
    } catch (error) {
      if (error instanceof ImageReadFailure) { setReadErrors(error.failures); setFilter('error') }
      setNotice(error instanceof Error ? error.message : '打包失败，请重试。')
    } finally { operation.current = false; setPacking(false) }
  }
  const visible = rows.filter(row => {
    if (!results || filter === 'all') return true
    const result = resultById.get(row.id)!
    const file = resolvedFile(result, choices[row.id])
    if (filter === 'error') return !!file && !!readErrors[file.id]
    if (filter === 'found') return !!file
    if (filter === 'choose') return !file && (result.matches.length > 1 || result.candidates.length > 0)
    return !file && result.matches.length === 0 && result.candidates.length === 0
  })

  return <main className="finder-page">
    <section className="tool-intro"><div className="tool-intro-icon"><Search /></div><div><h1>按名称查找图片</h1><p>从图名清单查找共享目录中的图片，核对后打包下载。</p></div></section>
    <section className="finder-card">
      <div className="finder-heading"><div><FileSpreadsheet size={19} /><h2>图名清单</h2></div><div className="finder-tabs" role="tablist" aria-label="图名输入方式">
        <button role="tab" aria-selected={mode === 'excel'} className={mode === 'excel' ? 'active' : ''} onClick={() => setMode('excel')}>上传 Excel</button>
        <button role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>粘贴文字</button></div></div>
      <input ref={excelInput} type="file" accept=".xlsx" hidden aria-label="上传 Excel 文件" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadExcel(file); event.target.value = '' }} />
      {mode === 'excel' ? <>
        <div className="finder-excel-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && event.dataTransfer.files[0]) void uploadExcel(event.dataTransfer.files[0]) }}>
          <div className="finder-file-icon"><FileSpreadsheet size={25} /></div><div><strong>{loading ? '正在读取表格…' : excelName || '选择或拖入 Excel 表格'}</strong><p>读取 .xlsx 中的图名文字，自动识别“图名称”列。</p></div>
          <button className="finder-button primary" disabled={busy} onClick={() => excelInput.current?.click()}>{loading ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />}{excelName ? '更换表格' : '选择表格'}</button>
        </div>
        {sheet && <div className="finder-columns"><label>工作表<select aria-label="工作表" value={sheetIndex} disabled={busy} onChange={event => { const index = +event.target.value; const detected = detectColumn(sheets[index].rows); setSheetIndex(index); setColumn(detected.column); setStart(detected.start); extractSheet(sheets[index], detected.column, detected.start) }}>{sheets.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select></label>
          <label>图名所在列<select aria-label="图名所在列" value={column} disabled={busy} onChange={event => { setColumn(+event.target.value); extractSheet(sheet, +event.target.value, start) }}>{Array.from({ length: columnCount }, (_, index) => <option key={index} value={index}>{columnLabel(index)} 列{sheet.rows[Math.max(0, start - 1)]?.[index] ? ` · ${sheet.rows[Math.max(0, start - 1)][index].slice(0, 28)}` : ''}</option>)}</select></label>
          <label>从第几行提取<input aria-label="从第几行提取" type="number" min="1" max={Math.max(1, sheet.rows.length)} value={start + 1} disabled={busy} onChange={event => { const value = Math.max(0, (+event.target.value || 1) - 1); setStart(value); extractSheet(sheet, column, value) }} /></label></div>}
      </> : <>
        <textarea aria-label="图名文字" value={text} disabled={busy} onChange={event => setText(event.target.value)} placeholder={'把截图识别结果或 Excel 图名列粘贴在这里，每行一个图名。\n\n例如：\n无题目录 03394-修\n产品主图.png'} />
        <div className="finder-input-actions"><button className="finder-button" disabled={busy} onClick={() => void paste()}><ClipboardPaste size={16} />从剪贴板粘贴</button><button className="finder-button primary" disabled={!text.trim() || busy} onClick={() => setNames(text.split(/\r?\n/))}><ListChecks size={16} />提取图名</button><span>提取后可在下方修改图名。</span></div>
      </>}
      {!!rows.length && <p className="finder-help">清单中有 <b>{rows.length}</b> 个图名{duplicates ? `，已合并 ${duplicates} 个重复项` : ''}。更换输入并提取后会替换当前清单。</p>}
    </section>
    <section className="finder-card">
      <div className="finder-heading"><div><FolderOpen size={19} /><h2>图片目录</h2></div><button className="finder-button" disabled={busy} onClick={() => void chooseFolder()}><FolderOpen size={16} />{folderName ? '更换图片文件夹' : '选择图片文件夹'}</button></div>
      <p className="finder-directory-note"><Info size={16} /><span><strong>系统提示“上传”仅表示允许本页面读取文件。</strong>图片内容不会上传到网站服务器，也不会修改或删除原文件。</span></p>
      <input ref={folderInput} type="file" multiple hidden aria-label="共享图片文件夹" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={event => { if (event.target.files?.length) void useFolderFiles(event.target.files); event.target.value = '' }} />
      <div className="finder-directory-guide"><p>复制文件夹路径后点击“选择图片文件夹”；若窗口已自动定位到目标目录，直接确认即可。</p></div>
      <div className={`finder-source ${folderName ? 'connected' : ''}`}><FolderOpen size={22} /><div><strong>{scanning ? '正在扫描文件名…' : folderName || '尚未选择图片文件夹'}</strong><span>{scanning ? `已扫描 ${scanned} 个文件` : folderName ? `找到 ${files.length} 张图片 · 仅建立名称索引，打包时才读取图片内容` : '选择后将在这里显示文件夹名称和图片数量。'}</span></div>{scanning ? <button className="finder-button" onClick={() => { scanToken.current++; setNotice('已请求停止扫描。') }}>停止扫描</button> : folderName ? <CheckCircle2 size={20} /> : null}</div>
    </section>
    <section className="finder-card finder-results">
      <div className="finder-heading"><div><ListChecks size={19} /><h2>匹配结果{rows.length ? <small>{rows.length} 个图名</small> : null}</h2></div><div className="finder-input-actions"><button className="finder-button" disabled={!rows.length || busy} onClick={() => { setRows([]); setDuplicates(0); resetResults() }}><Trash2 size={15} />清空清单</button><button className="finder-button primary" disabled={!rows.length || !files.length || busy} onClick={find}><Search size={16} />{results ? '重新查找' : '查找图片'}</button></div></div>
      {results && <div className="finder-filters" aria-label="筛选匹配结果">{([['all', '全部', rows.length], ['found', '已找到', counts.found], ['missing', '未找到', counts.missing], ['choose', '待选择', counts.choose], ['error', '读取失败', counts.error]] as const).filter(([key, , count]) => key !== 'error' || count > 0).map(([key, label, count]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}<b>{count}</b></button>)}</div>}
      {!rows.length ? <div className="finder-empty"><Search size={30} /><strong>从一份图名清单开始</strong><p>上传表格或粘贴文字，再选择图片目录。</p></div> : <>
        <p className="finder-help">{results ? '核对文件名和相对路径。相似名称仅供选择，不会自动加入下载。' : '图名可直接修改；准备好清单与目录后，点击“查找图片”。'}</p>
        <div className="finder-table"><table><thead><tr><th>下载</th><th>图名 · 可修改</th><th>匹配图片 / 相对路径</th><th>状态</th><th><span className="finder-sr-only">移除图名</span></th></tr></thead><tbody>{visible.map(row => {
          const result = resultById.get(row.id)
          const file = result && resolvedFile(result, choices[row.id])
          const options = result ? result.matches.length ? result.matches : result.candidates : []
          const error = file && readErrors[file.id]
          const status = !result ? '待查找' : error ? '读取失败' : file ? '已找到' : options.length ? '待选择' : '未找到'
          return <tr key={row.id}><td><input type="checkbox" aria-label={`下载 ${row.name}`} checked={!!file && !excluded.has(row.id)} disabled={!file || busy} onChange={event => setExcluded(current => { const next = new Set(current); if (event.target.checked) next.delete(row.id); else next.add(row.id); return next })} /></td>
            <td><input className="finder-name-input" aria-label={`修改图名 ${row.name}`} value={row.name} disabled={busy} onChange={event => { const name = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, name } : item)); resetResults() }} /></td>
            <td>{options.length > 1 || (result && !result.matches.length && options.length) ? <select aria-label={`为 ${row.name} 选择图片`} value={choices[row.id] ?? ''} disabled={busy} onChange={event => { setChoices(current => ({ ...current, [row.id]: event.target.value })); setExcluded(current => { const next = new Set(current); next.delete(row.id); return next }) }}><option value="">{result?.matches.length ? '多个同名文件，请选择' : '相似名称，请核对后选择'}</option>{options.map(option => <option key={option.id} value={option.id}>{option.path}</option>)}</select> : file ? <span className="finder-path">{file.path}</span> : <span className="finder-muted">{result ? '可修改图名后重新查找' : '等待查找'}</span>}{error && <small className="finder-error">{error}</small>}</td>
            <td><span className={`finder-status ${status === '已找到' ? 'found' : status === '读取失败' ? 'error' : status === '待选择' ? 'choose' : ''}`}>{status}</span></td>
            <td><button className="finder-remove" aria-label={`移除 ${row.name}`} disabled={busy} onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setResults(current => current?.filter(item => item.row.id !== row.id) ?? null) }}><Trash2 size={16} /></button></td></tr>
        })}</tbody></table>{!visible.length && <p className="finder-no-results">此分类没有图名。</p>}</div>
      </>}
    </section>
    <div className="finder-bottom">
      {notice && <div className="finder-notice" role="status"><Info size={16} /><span>{notice}</span></div>}
      <div className="finder-action-bar"><div><strong>{selected.length} 张图片已选中</strong><small>{packing ? progress.text : results ? '保留原格式和内容 · ZIP 保留相对目录' : '完成查找并核对结果后，即可下载'}</small></div><button className="finder-button primary" disabled={!selected.length || busy} onClick={() => void download()}>{packing ? <Loader2 size={17} className="spin" /> : <Archive size={17} />}{packing ? `打包中 · ${progress.percent}%` : counts.error ? '重试打包下载' : '打包下载'}</button>{packing && <div className="finder-pack-progress" style={{ width: `${progress.percent}%` }} />}</div>
    </div>
  </main>
}
