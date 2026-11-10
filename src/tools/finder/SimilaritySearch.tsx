import { useEffect, useMemo, useRef, useState } from 'react'
import { cachedHash, extractPictures, hashDistance, imageHash } from './similarity'
import { createArchive } from './files'
import type { ImageEntry } from './model'

interface Query { id: string; file: File; url: string }
interface Hit { query: Query; options: { entry: ImageEntry; distance: number }[]; selected: string; error?: string }
function CandidatePreview({ entry }: { entry: ImageEntry }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true; let created = ''
    entry.read().then(file => { if (active) { created = URL.createObjectURL(file); setUrl(created) } }).catch(() => {})
    return () => { active = false; if (created) URL.revokeObjectURL(created) }
  }, [entry])
  return url ? <a href={url} target="_blank" rel="noreferrer" title={entry.path}><img src={url} alt={entry.name} /></a> : <span>预览不可用</span>
}
export function SimilaritySearch({ files, scope }: { files: ImageEntry[]; scope: string }) {
  const [queries, setQueries] = useState<Query[]>([])
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const cancel = useRef(false)
  const cacheScope = useMemo(() => {
    let hash = 2166136261
    for (let i = 0; i < scope.length; i++) hash = Math.imul(hash ^ scope.charCodeAt(i), 16777619)
    return (hash >>> 0).toString(16)
  }, [scope])
  const urls = useRef<string[]>([])
  useEffect(() => () => { cancel.current = true; urls.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  useEffect(() => { cancel.current = true; setHits([]) }, [files, scope])
  const add = async (list: File[]) => {
    setBusy(true); setHits([])
    try {
      const pictures = (await Promise.all(list.map(extractPictures))).flat()
      const next = pictures.map(file => { const url = URL.createObjectURL(file); urls.current.push(url); return { id: crypto.randomUUID(), file, url } })
      setQueries(current => [...current, ...next]); setStatus(next.length ? `已添加 ${next.length} 张参考图` : '表格中没有可提取的内嵌图片。')
    } catch { setStatus('读取失败，请选择图片或未加密的 .xlsx 表格。') }
    finally { setBusy(false) }
  }
  const search = async () => {
    setBusy(true); setHits([]); cancel.current = false
    const index: { entry: ImageEntry; hash: string }[] = []; let failed = 0
    try {
      for (let i = 0; i < files.length; i++) {
        if (cancel.current) { setStatus('已停止，本次结果未保存。'); return }
        setStatus(`建立图片索引 ${i + 1} / ${files.length}`)
        try { index.push({ entry: files[i], hash: await cachedHash(files[i], cacheScope) }) } catch { failed++ }
        if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0))
      }
      const output: Hit[] = []
      for (const query of queries) {
        if (cancel.current) { setStatus('已停止，本次结果未保存。'); return }
        try {
          const hash = await imageHash(query.file)
          const options = index.map(item => ({ entry: item.entry, distance: hashDistance(hash, item.hash) })).sort((a, b) => a.distance - b.distance).slice(0, 5)
          const confident = options[0] && options[0].distance <= 24 && (!options[1] || options[1].distance - options[0].distance >= 12)
          output.push({ query, options, selected: confident ? options[0].entry.id : '' })
        } catch { output.push({ query, options: [], selected: '', error: '参考图无法解码，请另存为 PNG 或 JPG。' }) }
      }
      setHits(output); setStatus(`检索完成 · ${index.length} 张图片已索引${failed ? `，${failed} 张读取失败（未参与匹配）` : ''}`)
    } catch { setStatus('检索失败，请检查文件夹权限后重试。') }
    finally { setBusy(false) }
  }
  const download = async () => {
    setBusy(true)
    try {
      const selected = new Map<string, ImageEntry>()
      hits.forEach(hit => { const entry = hit.options.find(option => option.entry.id === hit.selected)?.entry; if (entry) selected.set(entry.id, entry) })
      const blob = await createArchive([...selected.values()], (_, text) => setStatus(text))
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '检索打包图片-原图.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
      setStatus(`已打包 ${selected.size} 张原图，保留原格式。`)
    } catch (error) { setStatus(error instanceof Error ? error.message : '下载失败，请重试。') }
    finally { setBusy(false) }
  }
  return <section className="finder-card similarity-panel">
    <div className="finder-heading"><div><h2>参考图片 <small>{queries.length} 张</small></h2></div><button className="finder-button" disabled={busy} onClick={() => input.current?.click()}>添加图片 / Excel</button></div>
    <input ref={input} hidden type="file" multiple accept="image/*,.xlsx" aria-label="参考图片或表格" onChange={event => { void add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <div className="finder-reference-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void add(Array.from(event.dataTransfer.files)) }} onPaste={event => { if (!busy && event.clipboardData.files.length) { event.preventDefault(); void add(Array.from(event.clipboardData.files)) } }} tabIndex={0} aria-label="粘贴或拖入参考图片">
      {queries.length ? <div className="finder-query-grid">{queries.map(query => <div key={query.id}><img src={query.url} alt={query.file.name} /><button disabled={busy} aria-label={`移除参考图 ${query.file.name}`} onClick={() => { URL.revokeObjectURL(query.url); setQueries(current => current.filter(item => item.id !== query.id)); setHits([]) }}>移除</button></div>)}</div> : <><strong>拖入图片，或点击这里按 Ctrl+V 粘贴截图</strong><p>支持多张图片，也可直接添加含图片的 Excel 表格。</p></>}
    </div>
    <div className="finder-search-toolbar"><p>查找同一张或近似图片。截图、裁切图的候选请核对后选择。</p><button className="finder-button primary" disabled={busy || !queries.length || !files.length} onClick={() => void search()}>开始图片检索</button>{busy && <button className="finder-button" onClick={() => { cancel.current = true }}>停止检索</button>}</div>
    <p role="status" className="finder-help">{status}</p>
    {!!hits.length && <><div className="finder-similar-results">{hits.map((hit, index) => <article key={hit.query.id}><img src={hit.query.url} alt={hit.query.file.name} /><div><strong>{hit.query.file.name}</strong><p>{hit.error || (hit.selected ? '已选择匹配原图' : '待核对：请选择候选，或保持不下载')}</p><select aria-label={`匹配 ${hit.query.file.name}`} disabled={busy} value={hit.selected} onChange={event => setHits(current => current.map((item, i) => i === index ? { ...item, selected: event.target.value } : item))}><option value="">不下载 / 待核对</option>{hit.options.map(option => <option key={option.entry.id} value={option.entry.id}>距离 {option.distance}/256 · {option.entry.path}</option>)}</select><details><summary>展开候选图片，点击查看大图</summary><div className="finder-candidate-grid">{hit.options.map(option => <div key={option.entry.id}><CandidatePreview entry={option.entry} /><span>距离 {option.distance}</span><button className="finder-button" disabled={busy} onClick={() => setHits(current => current.map((item, i) => i === index ? { ...item, selected: option.entry.id } : item))}>选择此图</button></div>)}</div></details></div></article>)}</div><div className="finder-search-toolbar"><span>距离越小越接近；低置信度候选不会自动选中。</span><button className="finder-button primary" disabled={busy || !hits.some(hit => hit.selected)} onClick={() => void download()}>打包下载原图（{new Set(hits.filter(hit => hit.selected).map(hit => hit.selected)).size}）</button></div></>}
  </section>
}

