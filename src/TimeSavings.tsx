import {useEffect,useRef,useState} from 'react'
import {Clock3,Save,RotateCcw,ImageDown,Layers3,FolderPlus,Search} from 'lucide-react'
import {calculateSavings,defaultTimeConfigs,savingDefinitions,savingTools,validTimeConfigs,type TimeConfigs,type UsageCounts} from '../shared/time-savings'
import './time-savings.css'

interface SavingsData{site:string;configs:TimeConfigs;revision:number;updatedAt:number|null;firstAt:number|null;lastAt:number|null;readAt:number;usage:{lifetime:UsageCounts;period:UsageCounts;monthly:{month:string;counts:UsageCounts}[]}}
type Draft=Record<string,{manual:string;automated:string}>
const draftOf=(configs:TimeConfigs):Draft=>Object.fromEntries(savingTools.map(tool=>[tool,{manual:configs[tool].manual.toFixed(1),automated:configs[tool].automated.toFixed(1)}]))
export function formatSavedTime(seconds:number){const absolute=Math.abs(seconds);return absolute>=3600?`${(seconds/3600).toFixed(1)} 小时`:absolute>=60?`${(seconds/60).toFixed(1)} 分钟`:`${seconds.toFixed(1)} 秒`}
function parsedDraft(draft:Draft):TimeConfigs|null{
 if(savingTools.some(tool=>!draft[tool]?.manual.trim()||!draft[tool]?.automated.trim()))return null
 const configs=Object.fromEntries(savingTools.map(tool=>[tool,{manual:Number(draft[tool].manual),automated:Number(draft[tool].automated)}]))
 return validTimeConfigs(configs)?configs:null
}
const stamp=(at:number|null)=>at?new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未记录'
const icons={compress:ImageDown,inspect:Layers3,folders:FolderPlus,finder:Search}
export default function TimeSavings({site,start,end,refreshAt}:{site:string;start:string;end:string;refreshAt:number}){
 const [data,setData]=useState<SavingsData|null>(null),[draft,setDraft]=useState<Draft>(()=>draftOf(defaultTimeConfigs())),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0)
 const dirty=useRef(false),editRevision=useRef<number|null>(null),sequence=useRef(0),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++}},[])
 useEffect(()=>{
  const id=++sequence.current;setLoading(true)
  void(async()=>{try{const r=await fetch(`/api/admin/time-savings?site=${encodeURIComponent(site)}&start=${start}&end=${end}`,{cache:'no-store',signal:AbortSignal.timeout(8000)}),j=await r.json();if(id!==sequence.current||!mounted.current)return;if(!r.ok)throw new Error(j.error||'节时统计读取失败');setData(j);if(!dirty.current)setDraft(draftOf(j.configs));setError('')}catch(e){if(id===sequence.current&&mounted.current)setError(e instanceof Error?e.message:'读取失败，请重试')}finally{if(id===sequence.current&&mounted.current)setLoading(false)}})()
  return()=>{sequence.current++}
 },[site,start,end,refreshAt,reload])
 const configs=parsedDraft(draft),changed=data&&configs?JSON.stringify(configs)!==JSON.stringify(data.configs):dirty.current
 const life=data&&configs?calculateSavings(data.usage.lifetime,configs):null,period=data&&configs?calculateSavings(data.usage.period,configs):null
 function discard(){dirty.current=false;editRevision.current=null;if(data)setDraft(draftOf(data.configs));setNotice('');setReload(n=>n+1)}
 async function save(){
  if(!data||!configs||saving)return
  const savedConfigs=configs,expectedRevision=editRevision.current??data.revision;setSaving(true);setError('');setNotice('');sequence.current++
  try{const r=await fetch(`/api/admin/time-savings?site=${encodeURIComponent(site)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({configs:savedConfigs,revision:expectedRevision}),signal:AbortSignal.timeout(10000)}),j=await r.json();if(!mounted.current)return;if(!r.ok)throw new Error(j.error||'保存失败');dirty.current=false;editRevision.current=null;setDraft(draftOf(j.configs));setData(current=>current?{...current,...j}:current);setNotice('参数已保存，累计与月度估算已按当前参数重算。');setReload(n=>n+1)}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'保存失败，请重试')}finally{if(mounted.current){setSaving(false);setLoading(false)}}
 }
 if(!data)return <section className="dash-panel savings-loading"><Clock3 size={24}/><p>{error||'正在读取节时统计…'}</p>{error&&<button className="text-link" onClick={()=>setReload(n=>n+1)}>重新读取</button>}</section>
 return <div className="savings-page">
  <div className="savings-disclosure"><Clock3 size={18}/><div><strong>基于完成数量的节时估算</strong><p>原流程初值来自你的测试，工具流程初值是待校准估值，含批量操作分摊。修改参数实时预览，保存后跨设备生效；所有历史估算按当前参数重算。不是实测操作时长。</p></div></div>
  <div className="core-metrics savings-metrics">{[{title:'累计预计节约',value:life?.savedSeconds,note:data.firstAt?`节时埋点自 ${stamp(data.firstAt)}`:'等待新的工具完成记录'},{title:'本期预计节约',value:period?.savedSeconds,note:`${start} 至 ${end}`},{title:'本期预计提效',value:null,note:period?`原流程 ${formatSavedTime(period.manualSeconds)} → 工具流程 ${formatSavedTime(period.automatedSeconds)}`:'参数待完善'}].map((card,index)=><article key={card.title} className={`metric-card${index===0?' metric-primary':''}`}><div className="metric-heading"><span>{card.title}</span><Clock3 size={17}/></div><strong>{index===2?(period&&period.manualSeconds>0?`${(period.savedSeconds/period.manualSeconds*100).toFixed(1)}%`:'—'):configs&&data.firstAt&&card.value!=null?formatSavedTime(card.value):'—'}</strong><p>{card.note}</p></article>)}</div>
  <section className="savings-editor">
   <div className="savings-editor-head"><div><h2>流程时间参数</h2><p>单位：秒 / 张或组，保留一位小数。{changed?'当前是未保存预览。':`参数${data.updatedAt?'保存于 '+stamp(data.updatedAt):'使用默认初值'}。`}</p></div><div className="savings-actions"><button className="refresh-button" disabled={saving} onClick={discard}><RotateCcw size={15}/>放弃修改并重读</button><button className="savings-save" disabled={saving||loading||!configs||!changed} onClick={()=>void save()}><Save size={15}/>{saving?'保存中…':'保存参数'}</button></div></div>
   {error&&<p role="alert" className="dash-error">{error}</p>}{notice&&<p role="status" className="savings-success">{notice}</p>}{!configs&&<p role="alert" className="dash-error">请输入 0–86400 秒、最多一位小数的时间，填写完整后才能计算和保存。</p>}
   <div className="savings-tools">{savingTools.map(tool=>{const definition=savingDefinitions[tool],Icon=icons[tool],row=period?.rows.find(r=>r.tool===tool),all=life?.rows.find(r=>r.tool===tool);return <section className="dash-panel savings-tool" key={tool}><div className="savings-tool-head"><span className="savings-tool-icon"><Icon size={20}/></span><div><h3>{definition.name}</h3><small>每 {definition.unit==='组'?'一组需求目录':'一张图片'}</small></div><span className="savings-estimate">估算</span></div><p className="savings-rule">{definition.rule}</p><div className="savings-inputs">{(['manual','automated'] as const).map(field=><label key={field}>{field==='manual'?'原流程时间':'工具流程时间'}<div><input aria-label={`${definition.name}${field==='manual'?'原流程时间':'工具流程时间'}`} type="number" min="0" max="86400" step="0.1" value={draft[tool][field]} disabled={saving} onChange={e=>{if(!dirty.current)editRevision.current=data.revision;dirty.current=true;setNotice('');setDraft(current=>({...current,[tool]:{...current[tool],[field]:e.target.value}}))}} onBlur={()=>{const config=parsedDraft(draft);if(config)setDraft(draftOf(config))}}/><span>秒/{definition.unit}</span></div></label>)}</div><div className="savings-unit">每{definition.unit}预计节约 <b>{configs?`${(Math.round(configs[tool].manual*10)/10-Math.round(configs[tool].automated*10)/10).toFixed(1)} 秒`:'—'}</b></div><dl className="savings-tool-totals"><div><dt>本期完成</dt><dd>{data.usage.period[tool].toLocaleString('zh-CN')} <small>{definition.unit}</small></dd></div><div><dt>本期节约</dt><dd>{row?formatSavedTime(row.savedSeconds):'—'}</dd></div><div><dt>累计节约</dt><dd>{all?formatSavedTime(all.savedSeconds):'—'}</dd></div></dl></section>})}</div>
  </section>
  <section className="dash-panel"><div className="panel-head"><div><h2>月度节时估算</h2><p>四类功能步骤分别估算后相加，可能存在流程重叠，不能直接视为真实人力工时。</p></div></div><div className="dash-table-wrap"><table className="dash-table savings-months"><thead><tr><th>月份</th>{savingTools.map(tool=><th key={tool}>{savingDefinitions[tool].name}</th>)}<th>预计节约合计</th></tr></thead><tbody>{data.usage.monthly.length?data.usage.monthly.map(month=>{const result=configs?calculateSavings(month.counts,configs):null;return <tr key={month.month}><td>{month.month}</td>{savingTools.map(tool=><td key={tool}>{result?formatSavedTime(result.rows.find(r=>r.tool===tool)!.savedSeconds):'—'}<small className="month-note">{month.counts[tool]} {savingDefinitions[tool].unit}</small></td>)}<td><b>{result?formatSavedTime(result.savedSeconds):'—'}</b></td></tr>}):<tr><td colSpan={6}>节时埋点尚无完成记录；旧的访问量或服务图片量不会倒推为节时用量。</td></tr>}</tbody></table></div></section>
  <div className="savings-foot"><span>最后收到节时事件：{stamp(data.lastAt)}</span><span>读取：{stamp(data.readAt)}{loading?' · 更新中':''}</span><p>新流程时间高于原流程时显示负值。失败、待选择、普通目录和不完整 AI 目录均不产生节时用量。切换站点使用各自的参数与数据；保持每 10 分钟自动读取，也可点击页面顶部立即刷新。</p></div>
 </div>
}
