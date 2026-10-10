import { beijingDay, type Database } from './db'
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
export async function summarizeDay(db: Database, day: string) {
  const columns = metricColumns()
  const selection = Object.entries(columns).map(([metric, expression]) => `SUM(${expression}) AS ${metric}`).join(',')
  const rows = await db.prepare(`SELECT tool,${selection} FROM events WHERE day=? GROUP BY tool`).bind(day).all<Record<string, string | number>>()
  const now = Date.now()
  const statements = [db.prepare('DELETE FROM daily_metrics WHERE day=?').bind(day)]
  for (const row of rows.results) for (const metric of Object.keys(columns)) statements.push(db.prepare('INSERT INTO daily_metrics(day,tool,metric,value,updated_at) VALUES(?,?,?,?,?)').bind(day,row.tool,metric,Number(row[metric] || 0),now))
  await db.batch(statements)
}
export async function summarizeRecent(db: Database) {
  for (let days = 0; days < 3; days++) await summarizeDay(db, beijingDay(Date.now() - days * 86400000))
  await db.prepare('DELETE FROM rate_limits WHERE window<?').bind(Math.floor(Date.now()/60000)-60).run()
}
export async function readStats(db: Database, start: string, end: string) {
  // Aggregate inside D1 instead of transferring every raw event to the Worker.
  const columns = metricColumns()
  const selection = Object.entries(columns).map(([metric, expression]) => `SUM(${expression}) AS ${metric}`).join(',')
  const rows = await db.prepare(`SELECT day,tool,${selection} FROM events WHERE day>=? AND day<=? GROUP BY day,tool ORDER BY day`).bind(start,end).all<Record<string,string|number>>()
  const totals: Record<string,number> = {}, tools: Record<string,Record<string,number>> = {}, trend: Record<string,Record<string,number>> = {}
  for (const row of rows.results) {
    const tool=String(row.tool),day=String(row.day)
    tools[tool] ||= {}; trend[day] ||= {}
    for (const key of Object.keys(columns)) { const value=Number(row[key]||0);totals[key]=(totals[key]||0)+value;tools[tool][key]=(tools[tool][key]||0)+value;trend[day][key]=(trend[day][key]||0)+value }
  }
  const identities=await db.prepare('SELECT COUNT(DISTINCT user_id) AS users,COUNT(DISTINCT session_id) AS sessions,COUNT(DISTINCT CASE WHEN effective=1 THEN user_id END) AS effective_users FROM events WHERE day>=? AND day<=?').bind(start,end).first<Record<string,number>>()
  Object.assign(totals,identities)
  const first = await db.prepare('SELECT MIN(occurred_at) AS first_at,MAX(received_at) AS last_at FROM events').first<{first_at:number|null;last_at:number|null}>()
  const archive = await db.prepare('SELECT day,source,metric,value,fetched_at FROM cloudflare_daily WHERE day>=? AND day<=? ORDER BY day DESC').bind(start,end).all()
  const run = await db.prepare('SELECT started_at,finished_at,status,message FROM archive_runs ORDER BY id DESC LIMIT 1').first()
  return {totals,tools,trend:Object.entries(trend).map(([day,values])=>({day,...values})),firstAt:first?.first_at,lastAt:first?.last_at,archive:archive.results,archiveRun:run,timezone:'Asia/Shanghai',start,end}
}
