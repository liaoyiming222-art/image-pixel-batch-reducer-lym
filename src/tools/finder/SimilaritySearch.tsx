import { FileSpreadsheet, ListChecks } from 'lucide-react'
import { readReferences } from './references'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cachedHash, hashDistance, imageHash } from './similarity'
import { createArchive } from './files'
import type { ImageEntry } from './model'
import { createTimeSavingCounter } from '../../analytics'

interface Query { id: string; file: File; url: string; name: string; origin: string; warning: string }
interface Hit { query: Query; options: { entry: ImageEntry; distance: number }[]; selected: string; method?: string; error?: string }
function CandidatePreview({ entry }: { entry: ImageEntry }) {
 const [url,setUrl]=useState('');const holder=useRef<HTMLSpanElement>(null)
 useEffect(()=>{let active=true;let created='';let loading=false;const details=holder.current?.closest('details');const load=()=>{if(!details?.open||loading)return;loading=true;entry.read().then(file=>{if(active){created=URL.createObjectURL(file);setUrl(created)}}).catch(()=>{})};details?.addEventListener('toggle',load);load();return()=>{active=false;details?.removeEventListener('toggle',load);if(created)URL.revokeObjectURL(created)}},[entry])
 return <span ref={holder}>{url?<a href={url} target="_blank" rel="noreferrer"><img src={url} alt={entry.name}/></a>:'展开后读取预览'}</span>
}
export function SimilaritySearch({ files, scope, inputSlot }: { files: ImageEntry[]; scope: string; inputSlot: HTMLDivElement | null }) {
  const [queries, setQueries] = useState<Query[]>([])
  const [hits, setHits] = useState<Hit[]>([])
  const matchedCounter = useRef<ReturnType<typeof createTimeSavingCounter> | null>(null)
  if (!matchedCounter.current) matchedCounter.current = createTimeSavingCounter('finder')
  useEffect(() => {
    // Count confirmed source pictures, not candidates or repeated query rows.
    matchedCounter.current!.record(hits.flatMap(hit => hit.options.some(option => option.entry.id === hit.selected) ? [hit.selected] : []))
  }, [hits])
  const [compress, setCompress] = useState(false)
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const excelInput = useRef<HTMLInputElement>(null)
  const [imports, setImports] = useState<string[]>([])
  const [columnOverride,setColumnOverride]=useState('')
  const sourceFiles=useRef<File[]>([])
  const cancel = useRef(false)
  const cacheScope = useMemo(() => {
    let hash = 2166136261
    for (let i = 0; i < scope.length; i++) hash = Math.imul(hash ^ scope.charCodeAt(i), 16777619)
    return (hash >>> 0).toString(16)
  }, [scope])
  const urls = useRef<string[]>([])
  useEffect(() => () => { cancel.current = true; urls.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  useEffect(() => { cancel.current = true; setHits(current=>current.filter(hit=>hit.selected&&files.some(file=>file.id===hit.selected))) }, [files, scope])
  const add = async (list: File[]) => {
    setBusy(true); setHits([])
    sourceFiles.current.push(...list)
    try {
      const pictures = (await Promise.all(list.map(file=>readReferences(file,columnOverride)))).flat()
      const next = pictures.map(reference => { const url = URL.createObjectURL(reference.file); urls.current.push(url); return { ...reference, id: crypto.randomUUID(), url } })
      setQueries(current => [...current, ...next]); setImports(current => [...current, ...list.map(file => file.name)]); setStatus(next.length ? `已添加 ${next.length} 张参考图` : '表格中没有可提取的内嵌图片。')
    } catch { setStatus('读取失败，请选择图片或未加密的 .xlsx 表格。') }
    finally { setBusy(false) }
  }
  const search = async (retry=false) => {
    const confirmed=retry?hits.filter(hit=>hit.selected):[]
    setBusy(true); cancel.current = false
    let failed = 0
    try {
      const hashes = new Map<string, string>()
      const hashEntry = async (entry: ImageEntry) => { if(hashes.has(entry.id)) return hashes.get(entry.id)!; const hash = await cachedHash(entry,cacheScope); hashes.set(entry.id,hash);return hash }
      const output: Hit[] = [...confirmed]
      for (let qi=0; qi<queries.length; qi++) {
        const query=queries[qi]
        if(confirmed.some(hit=>hit.query.id===query.id))continue
        if (cancel.current) { setStatus('已停止，本次结果未保存。'); return }
        setStatus(`正在检索 ${qi+1} / ${queries.length}`)
        const key=(value:string)=>value.trim().normalize('NFC').toLowerCase()
        const named=query.name?files.filter(file => key(file.name)===key(query.name) || (!/\.[a-z0-9]+$/i.test(query.name)&&key(file.name.replace(/\.[^.]+$/,''))===key(query.name))):[]
        if(named.length===1){output.push({query,options:[{entry:named[0],distance:0}],selected:named[0].id,method:'名称匹配'});continue}
        try {
          const hash=await imageHash(query.file)
          const candidates=named.length?named:files;const ranked:{entry:ImageEntry;distance:number}[]=[]
          for(let i=0;i<candidates.length;i++) {
            if(cancel.current){setStatus('已停止，本次结果未保存。');return}
            try{ranked.push({entry:candidates[i],distance:hashDistance(hash,await hashEntry(candidates[i]))})}catch{failed++}
            if(i%20===0){setStatus(`正在检索 ${qi+1}/${queries.length} · 比对 ${i+1}/${candidates.length}`);await new Promise(resolve=>setTimeout(resolve,0))}
          }
          const options=ranked.sort((a,b)=>a.distance-b.distance).slice(0,5).filter(option=>option.distance<=80)
          const confident=options[0]&&options[0].distance<=24&&(!options[1]||options[1].distance-options[0].distance>=12)
          output.push({query,options,selected:confident?options[0].entry.id:'',method:named.length?'同名图片比对':query.name?'名称未找到，按图片检索':'图片匹配',error:!ranked.length&&candidates.length?'目录图片读取失败，请检查连接后重试':undefined})
        }catch{output.push({query,options:[],selected:'',error:'参考图片读取失败，请另存为 PNG 或 JPG'})}
      }
      setHits(output.sort((a,b)=>queries.indexOf(a.query)-queries.indexOf(b.query))); setStatus(`检索完成 · ${hashes.size} 张图片已比对${failed ? `，${failed} 张读取失败（未参与匹配）` : ''}`)
    } catch { setStatus('检索失败，请检查文件夹权限后重试。') }
    finally { setBusy(false) }
  }
  const download = async () => {
    setBusy(true)
    try {
      const selected = new Map<string, ImageEntry>()
      hits.forEach(hit => { const entry = hit.options.find(option => option.entry.id === hit.selected)?.entry; if (entry) selected.set(entry.id, entry) })
      const blob = await createArchive([...selected.values()], (_, text) => setStatus(text), compress, ['来源,图片名,匹配文件,检索方式,状态',...hits.map(hit=>[hit.query.origin,hit.query.name,hit.options.find(o=>o.entry.id===hit.selected)?.entry.path??'',hit.method??'',hit.error??(hit.selected?'已匹配':hit.options.length?'待核对':'未找到')].map(value=>'"'+value.replace(/"/g,'""')+'"').join(','))].join('\r\n'))
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = compress ? '检索打包图片-压缩.zip' : '检索打包图片-原图.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
      setStatus(`已打包 ${selected.size} 张图片，按所选输出方式完成。`)
    } catch (error) { setStatus(error instanceof Error ? error.message : '下载失败，请重试。') }
    finally { setBusy(false) }
  }
  const importView = <>
    <input ref={excelInput} hidden type="file" multiple accept=".xlsx" aria-label="参考图片 Excel 表格" onChange={event => { void add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <input ref={input} hidden type="file" multiple accept="image/*,.xlsx" aria-label="参考图片或表格" onChange={event => { void add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <div className="finder-excel-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void add(Array.from(event.dataTransfer.files)) }}>
      <div className="finder-file-icon"><FileSpreadsheet size={25}/></div><div><strong>{imports.length ? imports[imports.length - 1] : '选择或拖入 Excel 表格'}</strong><p>{queries.length ? '可继续添加表格，参考图片会合并到当前清单。' : '支持 .xlsx，自动提取表格中的内嵌图片。'}</p></div><button className="finder-button primary" disabled={busy} onClick={() => excelInput.current?.click()}>{imports.length ? '添加表格' : '选择表格'}</button>
    </div>
    <div className="finder-reference-tools" tabIndex={0} aria-label="粘贴或拖入参考图片" onPaste={event => { if (!busy && event.clipboardData.files.length) { event.preventDefault(); void add(Array.from(event.clipboardData.files)) } }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if(!busy) void add(Array.from(event.dataTransfer.files)) }}><span>也可在此按 Ctrl+V 粘贴截图</span><button className="finder-button" disabled={busy} onClick={() => input.current?.click()}>直接添加图片</button></div>
    {!!imports.length && <details className="finder-path-options"><summary>调整表格识别</summary><label>名称所在列（如 B，留空自动识别）<input aria-label="名称所在列" value={columnOverride} onChange={event=>setColumnOverride(event.target.value.replace(/[^a-z]/ig,'').toUpperCase())} /></label><button className="finder-button" disabled={busy} onClick={()=>{const originals=[...sourceFiles.current];matchedCounter.current!.reset();sourceFiles.current=[];setQueries([]);setImports([]);void add(originals)}}>重新读取表格</button><p className="finder-help">只关联图片所在行的名称；多图同一行时，请在清单中手动确认名称。</p></details>}
    {!!queries.length && <div className="finder-reference-preview"><div className="finder-heading"><div><strong>参考图片</strong><small>{queries.length} 张 · {queries.filter(query=>query.name).length} 张有名称</small></div><button className="finder-button" disabled={busy} onClick={() => { urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; matchedCounter.current!.reset(); setQueries([]); setHits([]); setImports([]); sourceFiles.current=[]; setStatus('') }}>清空参考图</button></div><div className="finder-query-grid">{queries.map(query => <div key={query.id}><img src={query.url} alt={query.origin} /><small>{query.origin}</small><input aria-label={`图片名 ${query.origin}`} placeholder="图片名（可为空）" value={query.name} disabled={busy} onChange={event=>{setQueries(current=>current.map(item=>item.id===query.id?{...item,name:event.target.value}:item));setHits([])}} />{query.warning&&<small>{query.warning}</small>}<button disabled={busy} aria-label={`移除参考图 ${query.file.name}`} onClick={() => { URL.revokeObjectURL(query.url); setQueries(current => current.filter(item => item.id !== query.id)); setHits([]) }}>移除</button></div>)}</div></div>}
    {!hits.length && status && <p className="finder-help" role="status">{status}</p>}
  </>
  return <>
    {inputSlot && createPortal(importView, inputSlot)}
    <section className="finder-card similarity-panel">
    <div className="finder-heading"><div><ListChecks size={20}/><h2>匹配结果</h2></div><span className="finder-help">{queries.length} 张参考图 · {files.length} 张目录图片</span></div>
    <div className="finder-search-toolbar"><p>{!queries.length ? '先在上方导入 Excel 表格或参考图片。' : !files.length ? '请选择包含原图的图片目录。' : '准备就绪，开始检索后核对匹配结果。'}</p><button className="finder-button primary" disabled={busy || !queries.length || !files.length} onClick={() => void search()}>开始检索</button>{!!hits.length && <button className="finder-button" disabled={busy} onClick={()=>void search(true)}>重试未完成项</button>}{busy && <button className="finder-button" onClick={() => { cancel.current = true }}>停止检索</button>}</div>
    <p role="status" className="finder-help">{status}</p>
    {!!hits.length && <><select aria-label="筛选图片结果" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">全部结果</option><option value="selected">已选择</option><option value="pending">待核对</option><option value="missing">未找到</option><option value="error">读取失败</option></select><div className="finder-similar-results">{hits.map((hit, index) => ({ hit, index })).filter(({hit}) => filter === 'all' || (filter === 'selected' ? !!hit.selected : filter === 'error' ? !!hit.error : filter === 'missing' ? !hit.options.length && !hit.error : !hit.selected && !!hit.options.length)).map(({hit, index}) => <article key={hit.query.id}><img src={hit.query.url} alt={hit.query.file.name} /><div><strong>{hit.query.origin}</strong><small>{hit.query.name || '无图片名'} · {hit.method}</small><p>{hit.error || (hit.selected ? '已选择匹配原图' : hit.options.length ? '待核对：请选择候选，或保持不下载' : '未找到可靠候选')}</p><select aria-label={`匹配 ${hit.query.file.name}`} disabled={busy} value={hit.selected} onChange={event => setHits(current => current.map((item, i) => i === index ? { ...item, selected: event.target.value } : item))}><option value="">不下载 / 待核对</option>{hit.options.map(option => <option key={option.entry.id} value={option.entry.id}>{hit.method === '名称匹配' ? '名称匹配' : '图片候选'} · {option.entry.path}</option>)}</select><details onToggle={event => { if(event.currentTarget.open) event.currentTarget.dataset.open = 'true' }}><summary>展开候选图片，点击查看大图</summary><div className="finder-candidate-grid">{hit.options.map(option => <div key={option.entry.id}><CandidatePreview entry={option.entry} /><span>{hit.method === '名称匹配' ? '名称匹配' : '候选图片'}</span><button className="finder-button" disabled={busy} onClick={() => setHits(current => current.map((item, i) => i === index ? { ...item, selected: option.entry.id } : item))}>选择此图</button></div>)}</div></details></div></article>)}</div><div className="finder-search-toolbar"><span>仅打包已确认的图片；同一源文件自动去重。</span><label className="finder-output">打包方式<select aria-label="图片检索打包方式" disabled={busy} value={compress ? 'compressed' : 'original'} onChange={event => setCompress(event.target.value === 'compressed')}><option value="original">保留原图</option><option value="compressed">压缩 JPG · 2 MB / 8000 px</option></select></label><button className="finder-button primary" disabled={busy || !hits.some(hit => hit.selected)} onClick={() => void download()}>打包下载（{new Set(hits.filter(hit => hit.selected).map(hit => hit.selected)).size}）</button></div></>}
  </section></>
}
