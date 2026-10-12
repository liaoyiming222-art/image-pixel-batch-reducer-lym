import { beijingDay, type Database } from './db'
import { DEFAULT_SITE,getSite,listSites } from './sites'
import { buildDashboard,type DailyRow,type IdentityRow,type TrafficRow } from './dashboard'
export function metricColumns() {
  const columns: Record<string, string> = {
    pageviews: "CASE WHEN name='page_view' THEN 1 ELSE 0 END",
    process_tasks: "CASE WHEN name='image_process_started' THEN 1 ELSE 0 END",
    completed_tasks: "CASE WHEN name='image_process_finished' AND COALESCE(json_extract(props,'$.pending'),0)=0 THEN 1 ELSE 0 END",
    interrupted_tasks: "CASE WHEN name='image_process_finished' AND COALESCE(json_extract(props,'$.pending'),0)>0 THEN 1 ELSE 0 END",
    pending: "CASE WHEN name='image_process_finished' THEN COALESCE(json_extract(props,'$.pending'),0) ELSE 0 END",
    inspected: "CASE WHEN name='inspection_finished' THEN json_extract(props,'$.count') ELSE 0 END",
    exports: "CASE WHEN name='output_action' THEN 1 ELSE 0 END",
    folder_tasks: "CASE WHEN name='folder_create_started' THEN 1 ELSE 0 END",
    completed_folder_tasks: "CASE WHEN name='folder_create_finished' THEN 1 ELSE 0 END",
  }
  for (const kind of ['copy','csv','single','zip','group','groups']) columns[`export_${kind}`] = `CASE WHEN name='output_action' AND json_extract(props,'$.kind')='${kind}' THEN 1 ELSE 0 END`
  for (const [name, mappings] of Object.entries({ image_import_finished: { imported:'added',import_failed:'failed',duplicates:'duplicate',unsupported:'invalid' }, image_process_finished: { processed:'success',skipped:'skipped',process_failed:'failed',qualified:'qualified' }, folder_create_finished: { folders:'created',subfolders:'children',completed_existing:'completedExisting',folder_failed:'failed',folder_existing:'existing',folder_duplicates:'duplicate' }, output_action: { output_files:'count' } })) {
    for (const [metric, prop] of Object.entries(mappings)) columns[metric] = `CASE WHEN name='${name}' THEN COALESCE(json_extract(props,'$.${prop}'),0) ELSE 0 END`
  }
  return columns
}
export async function summarizeDay(db: Database, day: string,siteId=DEFAULT_SITE) {
  const columns = metricColumns()
  const selection = Object.entries(columns).map(([metric, expression]) => `SUM(${expression}) AS ${metric}`).join(',')
  const rows = await db.prepare(`SELECT tool,${selection} FROM events WHERE day=? AND site_id=? GROUP BY tool`).bind(day,siteId).all<Record<string, string | number>>()
  const now = Date.now()
  const statements = [db.prepare('DELETE FROM site_daily_metrics WHERE day=? AND site_id=?').bind(day,siteId)]
  for (const row of rows.results) for (const metric of Object.keys(columns)) statements.push(db.prepare('INSERT INTO site_daily_metrics(site_id,day,tool,metric,value,updated_at) VALUES(?,?,?,?,?,?)').bind(siteId,day,row.tool,metric,Number(row[metric] || 0),now))
  await db.batch(statements)
}
export async function summarizeRecent(db: Database,siteId=DEFAULT_SITE) {
  for (let days = 0; days < 3; days++) await summarizeDay(db, beijingDay(Date.now() - days * 86400000),siteId)
  await db.prepare('DELETE FROM rate_limits WHERE window<?').bind(Math.floor(Date.now()/60000)-60).run()
}
export async function readStats(db: Database, start: string, end: string,siteId=DEFAULT_SITE) {
  const site=await getSite(db,siteId);if(!site)throw new Error('Unknown site')
  // Aggregate inside D1 instead of transferring every raw event to the Worker.
  const columns = metricColumns()
  const selection = Object.entries(columns).map(([metric, expression]) => `SUM(${expression}) AS ${metric}`).join(',')
  const rows = await db.prepare(`SELECT day,tool,${selection} FROM events WHERE site_id=? AND day>=? AND day<=? GROUP BY day,tool ORDER BY day`).bind(siteId,start,end).all<Record<string,string|number>>()
  const totals: Record<string,number> = {}, tools: Record<string,Record<string,number>> = {}, trend: Record<string,Record<string,number>> = {}
  for (const row of rows.results) {
    const tool=String(row.tool),day=String(row.day)
    tools[tool] ||= {}; trend[day] ||= {}
    for (const key of Object.keys(columns)) { const value=Number(row[key]||0);totals[key]=(totals[key]||0)+value;tools[tool][key]=(tools[tool][key]||0)+value;trend[day][key]=(trend[day][key]||0)+value }
  }
  const identities=await db.prepare('SELECT COUNT(DISTINCT user_id) AS users,COUNT(DISTINCT session_id) AS sessions,COUNT(DISTINCT CASE WHEN effective=1 THEN user_id END) AS effective_users FROM events WHERE site_id=? AND day>=? AND day<=?').bind(siteId,start,end).first<Record<string,number>>()
  Object.assign(totals,identities)
  const first = await db.prepare('SELECT MIN(occurred_at) AS first_at,MAX(received_at) AS last_at FROM events WHERE site_id=?').bind(siteId).first<{first_at:number|null;last_at:number|null}>()
  const archive = await db.prepare('SELECT day,source,metric,value,fetched_at FROM site_cloudflare_daily WHERE site_id=? AND day>=? AND day<=? ORDER BY day DESC').bind(siteId,start,end).all()
  const run = await db.prepare('SELECT started_at,finished_at,status,message FROM site_archive_runs WHERE site_id=? ORDER BY id DESC LIMIT 1').bind(siteId).first()
  const allRows=await db.prepare(`SELECT day,tool,${selection} FROM events WHERE site_id=? GROUP BY day,tool ORDER BY day`).bind(siteId).all<DailyRow>()
  const allArchive=await db.prepare('SELECT day,metric,value,fetched_at FROM site_cloudflare_daily WHERE site_id=? AND source=? ORDER BY day').bind(siteId,'cloudflare_web_analytics').all<TrafficRow>()
  const lifetime=await db.prepare('SELECT COUNT(DISTINCT user_id) AS users,COUNT(DISTINCT session_id) AS sessions,COUNT(DISTINCT CASE WHEN effective=1 THEN user_id END) AS effective_users FROM events WHERE site_id=?').bind(siteId).first<Record<string,number>>()
  const monthly=await db.prepare("SELECT substr(day,1,7) AS bucket,COUNT(DISTINCT user_id) AS users,COUNT(DISTINCT session_id) AS sessions,COUNT(DISTINCT CASE WHEN effective=1 THEN user_id END) AS effective_users FROM events WHERE site_id=? GROUP BY substr(day,1,7)").bind(siteId).all<IdentityRow>()
  const daily=await db.prepare('SELECT day AS bucket,COUNT(DISTINCT user_id) AS users,COUNT(DISTINCT session_id) AS sessions,COUNT(DISTINCT CASE WHEN effective=1 THEN user_id END) AS effective_users FROM events WHERE site_id=? AND day>=? AND day<=? GROUP BY day').bind(siteId,start,end).all<IdentityRow>()
  if(site.traffic_source==='events'&&first?.first_at){
    const starts=await db.prepare('SELECT day,COUNT(*) AS visits FROM (SELECT session_id,MIN(day) AS day FROM events WHERE site_id=? GROUP BY session_id) GROUP BY day').bind(siteId).all<{day:string;visits:number}>()
    const visits=new Map(starts.results.map(row=>[row.day,row.visits]))
    const views=new Map(allRows.results.filter(row=>row.tool==='app').map(row=>[row.day,Number(row.pageviews||0)]))
    for(let at=Date.parse(beijingDay(first.first_at)+'T00:00:00Z');at<=Date.parse(beijingDay(Date.now())+'T00:00:00Z');at+=86400000){const day=new Date(at).toISOString().slice(0,10);allArchive.results.push({day,metric:'pageviews',value:views.get(day)||0,fetched_at:first.last_at||0},{day,metric:'visits',value:visits.get(day)||0,fetched_at:first.last_at||0})}
  }
  const dashboard=buildDashboard(allRows.results,allArchive.results,{lifetime:lifetime||{},period:identities||{},monthly:monthly.results,daily:daily.results},first?.first_at||null,start,end,Date.now(),site.launch_day)
  const latestArchive=allArchive.results.reduce((latest,row)=>Math.max(latest,row.fetched_at||0),0)||null
  return {totals,tools,trend:Object.entries(trend).map(([day,values])=>({day,...values})),firstAt:first?.first_at,lastAt:first?.last_at,archive:archive.results,archiveRun:run,timezone:'Asia/Shanghai',start,end,dashboard,latestArchive,site,sites:(await listSites(db)).results}
}
