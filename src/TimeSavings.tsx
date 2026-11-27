import {useEffect,useRef,useState} from 'react'
import {Clock3,Save,RotateCcw,ImageDown,Layers3,FolderPlus,Search} from 'lucide-react'
import {calculateSavings,defaultTimeConfigs,detectionConfig,detectionDefinition,savingDefinitions,savingTools,validTimeConfigs,type TimeConfigs,type UsageCounts} from '../shared/time-savings'
import './time-savings.css'
import ValueBars from './ValueBars'

interface SavingsData{site:string;configs:TimeConfigs;revision:number;updatedAt:number|null;firstAt:number|null;lastAt:number|null;readAt:number;historical?:UsageCounts;usage:{lifetime:UsageCounts;period:UsageCounts;monthly:{month:string;counts:UsageCounts}[]}}
type Draft=Record<string,{manual:string;automated:string}>
const parameterKeys=[...savingTools,'compressionDetection'] as const
const draftOf=(configs:TimeConfigs):Draft=>Object.fromEntries(parameterKeys.map(tool=>{const config=tool==='compressionDetection'?detectionConfig(configs):configs[tool];return [tool,{manual:config.manual.toFixed(1),automated:config.automated.toFixed(1)}]}))
export function formatSavedTime(seconds:number){const absolute=Math.abs(seconds);return absolute>=3600?`${(seconds/3600).toFixed(1)} 小时`:absolute>=60?`${(seconds/60).toFixed(1)} 分钟`:`${seconds.toFixed(1)} 秒`}
function parsedDraft(draft:Draft):TimeConfigs|null{
 if(parameterKeys.some(tool=>!draft[tool]?.manual.trim()||!draft[tool]?.automated.trim()))return null
 const configs=Object.fromEntries(parameterKeys.map(tool=>[tool,{manual:Number(draft[tool].manual),automated:Number(draft[tool].automated)}]))
 return validTimeConfigs(configs)?configs:null
}
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
 const canEdit=['127.0.0.1','localhost'].includes(location.hostname)
 const configs=parsedDraft(draft),changed=data&&configs?JSON.stringify(configs)!==JSON.stringify(data.configs):dirty.current
 const life=data&&configs?calculateSavings(data.usage.lifetime,configs):null,period=data&&configs?calculateSavings(data.usage.period,configs):null
 const inputs=(key:typeof parameterKeys[number],name:string,unit:string)=><div className="savings-inputs">{(['manual','automated'] as const).map(field=><label key={field}>{field==='manual'?'原流程时间':'工具流程时间'}<div><input aria-label={`${name}${field==='manual'?'原流程时间':'工具流程时间'}`} type="number" min="0" max="86400" step="0.1" value={draft[key][field]} disabled={saving} onChange={e=>{if(!dirty.current)editRevision.current=data!.revision;dirty.current=true;setNotice('');setDraft(current=>({...current,[key]:{...current[key],[field]:e.target.value}}))}} onBlur={()=>{const config=parsedDraft(draft);if(config)setDraft(draftOf(config))}}/><span>秒/{unit}</span></div></label>)}</div>
 function discard(){dirty.current=false;editRevision.current=null;if(data)setDraft(draftOf(data.configs));setNotice('');setReload(n=>n+1)}
 async function save(){
  if(!data||!configs||saving)return
  const savedConfigs=configs,expectedRevision=editRevision.current??data.revision;setSaving(true);setError('');setNotice('');sequence.current++
  try{const r=await fetch(`/api/admin/time-savings?site=${encodeURIComponent(site)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({configs:savedConfigs,revision:expectedRevision}),signal:AbortSignal.timeout(10000)}),j=await r.json();if(!mounted.current)return;if(!r.ok)throw new Error(j.error||'保存失败');dirty.current=false;editRevision.current=null;setDraft(draftOf(j.configs));setData(current=>current?{...current,...j}:current);setNotice('参数已保存，累计与月度估算已按当前参数重算。');setReload(n=>n+1)}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'保存失败，请重试')}finally{if(mounted.current){setSaving(false);setLoading(false)}}
 }
 if(!data)return <section className="dash-panel savings-loading"><Clock3 size={24}/><p>{error||'正在读取节时统计…'}</p>{error&&<button className="text-link" onClick={()=>setReload(n=>n+1)}>重新读取</button>}</section>

 const months=data.usage.monthly.map(month=>({...month,result:configs?calculateSavings(month.counts,configs):null}))
 return <div className="savings-page">
  <div className="core-metrics savings-metrics">{[{title:'累计预计节约',value:life?.savedSeconds,note:'自开始统计以来'},{title:'本期预计节约',value:period?.savedSeconds,note:start+' 至 '+end},{title:'本期预计提效',value:null,note:period?'原流程 '+formatSavedTime(period.manualSeconds)+' → 工具流程 '+formatSavedTime(period.automatedSeconds):'填写时间参数'}].map((card,index)=><article key={card.title} className="metric-card"><div className="metric-heading"><span>{card.title}</span></div><strong>{index===2?(period&&period.manualSeconds>0?(period.savedSeconds/period.manualSeconds*100).toFixed(1)+'%':'—'):card.value!=null?formatSavedTime(card.value):'—'}</strong><p>{card.note}</p></article>)}</div>
  {configs&&<div className="savings-chart-grid"><ValueBars title="月度节时趋势" rows={[...months].reverse().map(m=>({label:m.month,value:m.result!.savedSeconds}))} format={formatSavedTime}/><ValueBars title="本期工具节时贡献" rows={period!.rows.map(row=>({label:savingDefinitions[row.tool].name,value:row.savedSeconds}))} format={formatSavedTime}/></div>}
  <section className="dash-panel savings-monthly"><div className="panel-head"><h2>月度节时</h2><span>按当前流程参数计算</span></div><div className="dash-table-wrap"><table className="dash-table savings-months"><thead><tr><th>月份</th>{savingTools.map(tool=><th key={tool}>{savingDefinitions[tool].name}</th>)}<th>预计节约合计</th></tr></thead><tbody>{months.length?months.map(month=><tr key={month.month}><td>{month.month}</td>{savingTools.map(tool=><td key={tool}>{month.result?formatSavedTime(month.result.rows.find(r=>r.tool===tool)!.savedSeconds):'—'}</td>)}<td><b>{month.result?formatSavedTime(month.result.savedSeconds):'—'}</b></td></tr>):<tr><td colSpan={6}>暂无服务记录</td></tr>}</tbody></table></div></section>
  <section className="savings-editor"><div className="savings-editor-head"><div><h2>工具节时与参数</h2><p>{changed?'参数已修改，当前为预览':'单位：秒 / 张或组'}</p></div>{canEdit&&<div className="savings-actions"><button className="refresh-button" disabled={saving} onClick={discard}><RotateCcw size={15}/>放弃修改并重读</button><button className="savings-save" disabled={saving||loading||!configs||!changed} onClick={()=>void save()}><Save size={15}/>{saving?'保存中…':'保存参数'}</button></div>}</div>
  {error&&<p role="alert" className="dash-error">{error}</p>}{notice&&<p role="status" className="savings-success">{notice}</p>}{!configs&&<p role="alert" className="dash-error">请输入 0–86400 秒、最多一位小数的时间。</p>}
  <div className="savings-tools">{savingTools.map(tool=>{const definition=savingDefinitions[tool],Icon=icons[tool],row=period?.rows.find(r=>r.tool===tool),all=life?.rows.find(r=>r.tool===tool);return <section className="dash-panel savings-tool" key={tool}>
   <div className="savings-tool-head"><Icon size={19}/><h3>{definition.name}</h3></div>
   <div className="tool-saving-number"><strong>{row?formatSavedTime(row.savedSeconds):'—'}</strong><span>本期节时</span></div>
   <dl className="compact-tool-totals"><div><dt>{tool==='compress'?'本期服务':'本期完成'}</dt><dd>{tool==='compress'?(data.usage.period.compression?.detected??data.usage.period.compress):data.usage.period[tool]} {definition.unit}</dd></div><div><dt>累计节约</dt><dd>{all?formatSavedTime(all.savedSeconds):'—'}</dd></div></dl>
   {canEdit&&<details className="tool-parameters"><summary>调整时间参数</summary>{tool==='compress'&&<><h4>检测大小与判断</h4>{inputs('compressionDetection',detectionDefinition.name,'张')}<h4>实际压缩（额外步骤）</h4></>}{inputs(tool,definition.name,definition.unit)}<p className="unit-saving">每{definition.unit}{tool==='compress'?'压缩额外':'预计'}节约 <b>{configs?(configs[tool].manual-configs[tool].automated).toFixed(1)+' 秒':'—'}</b></p>
   {tool==='compress'&&<div className="savings-breakdown"><div><span>检测 · {(data.usage.period.compression?.detected??data.usage.period.compress)-(data.usage.period.compression?.estimated||0)} 张</span><b>{row?formatSavedTime(row.detectionSavedSeconds):'—'}</b></div><div><span>压缩 · {data.usage.period.compress} 次</span><b>{row?formatSavedTime(row.compressionSavedSeconds):'—'}</b></div><div><span>补估 · {data.usage.period.compression?.estimated||0} 张</span><b>{row?formatSavedTime(row.estimatedSavedSeconds):'—'}</b></div></div>}</details>}
  </section>})}</div></section>
 </div>
}
