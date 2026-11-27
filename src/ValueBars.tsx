interface Bar { label: string; value: number; color?: string }
export default function ValueBars({title,rows,format}:{title:string;rows:Bar[];format:(n:number)=>string}){
 const max=Math.max(1,...rows.map(row=>Math.abs(row.value)))
 return <section className="dash-panel value-bars"><div className="panel-head"><h2>{title}</h2></div>{rows.length?<ul aria-label={title}>{rows.map(row=><li key={row.label}><div><span>{row.label}</span><strong>{format(row.value)}</strong></div><div className="value-bar-track" aria-hidden="true"><span style={{width:`${Math.abs(row.value)/max*100}%`,background:row.value<0?'#b34c56':row.color||'var(--accent, #7365eb)'}}/></div></li>)}</ul>:<p className="chart-placeholder">暂无数据</p>}</section>
}
