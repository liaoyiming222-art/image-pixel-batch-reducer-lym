import { beijingDay, type Database } from './db'
import { listSites, DEFAULT_SITE } from './sites'
// A single scan supplies additive daily, monthly and lifetime counts. No external analytics requests.
export async function readLiveStats(db:Database,start:string,end:string,siteId=DEFAULT_SITE){
 const [registry,result]=await Promise.all([listSites(db),db.prepare(`SELECT day,
 SUM(CASE WHEN name='page_view' THEN 1 ELSE 0 END) AS pageviews,
 SUM(CASE WHEN name='image_process_finished' THEN COALESCE(json_extract(props,'$.success'),0) ELSE 0 END) AS processed,
 SUM(CASE WHEN name='inspection_finished' THEN COALESCE(json_extract(props,'$.count'),0) ELSE 0 END) AS inspected,
 MIN(occurred_at) AS first_at,MAX(received_at) AS last_at
 FROM events WHERE site_id=? GROUP BY day ORDER BY day`).bind(siteId).all<{day:string;pageviews:number;processed:number;inspected:number;first_at:number;last_at:number}>()])
 const site=registry.results.find(s=>s.id===siteId);if(!site)throw new Error('Unknown site')
 const empty=()=>({pageviews:0,processed:0,inspected:0})
 const lifetime=empty(),period=empty(),months=new Map<string,ReturnType<typeof empty>>()
 for(const row of result.results){const month=row.day.slice(0,7),m=months.get(month)||empty();for(const key of ['pageviews','processed','inspected'] as const){lifetime[key]+=row[key];m[key]+=row[key];if(row.day>=start&&row.day<=end)period[key]+=row[key]}months.set(month,m)}
 const firstAt=result.results.length?Math.min(...result.results.map(r=>r.first_at)):null
 const lastAt=result.results.length?Math.max(...result.results.map(r=>r.last_at)):null
 const today=beijingDay(Date.now()),firstDay=firstAt?beijingDay(firstAt):null
 if(firstDay)for(let m=firstDay.slice(0,7);m<=today.slice(0,7);){if(!months.has(m))months.set(m,empty());const d=new Date(m+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);m=d.toISOString().slice(0,7)}
 const byDay=new Map(result.results.map(r=>[r.day,r])),series=[]
 const from=firstDay&&firstDay>start?firstDay:start,to=end<today?end:today
 if(firstDay)for(let at=Date.parse(from+'T00:00:00Z');at<=Date.parse(to+'T00:00:00Z');at+=86400000){const day=new Date(at).toISOString().slice(0,10);series.push({day,...(byDay.get(day)||empty())})}
 return {site,sites:registry.results,lifetime,period,monthly:[...months].sort(([a],[b])=>b.localeCompare(a)).map(([month,counts])=>({month,...counts})),series,firstAt,lastAt,readAt:Date.now(),start,end,source:'events',timezone:'Asia/Shanghai'}
}
