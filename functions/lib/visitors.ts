import type {Database} from './db'
export async function visitorCounts(db:Database,site:string,start:string,end:string){
 const [totals,monthly]=await Promise.all([
  db.prepare('SELECT COUNT(DISTINCT user_id) AS lifetime,COUNT(DISTINCT CASE WHEN day>=? AND day<=? THEN user_id END) AS period FROM events WHERE site_id=?').bind(start,end,site).first<{lifetime:number;period:number}>(),
  db.prepare('SELECT substr(day,1,7) AS month,COUNT(DISTINCT user_id) AS users FROM events WHERE site_id=? GROUP BY substr(day,1,7) ORDER BY month').bind(site).all<{month:string;users:number}>(),
 ])
 return {lifetime:totals?.lifetime||0,period:totals?.period||0,monthly:monthly.results}
}
export async function readVisitors(db:Database,site:string,start:string,end:string,page:number){
 const size=20
 const [total,rows]=await Promise.all([
  db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE site_id=? AND day>=? AND day<=?').bind(site,start,end).first<{n:number}>(),
  db.prepare(`SELECT user_id,MIN(occurred_at) AS first_at,MAX(occurred_at) AS last_at,COUNT(DISTINCT session_id) AS sessions,
   SUM(CASE WHEN name='page_view' THEN 1 ELSE 0 END) AS pageviews,
   SUM(CASE WHEN name='inspection_finished' THEN COALESCE(json_extract(props,'$.count'),0) ELSE 0 END) AS inspected,
   SUM(CASE WHEN name='image_process_finished' THEN COALESCE(json_extract(props,'$.success'),0) ELSE 0 END) AS processed,
   SUM(CASE WHEN name='folder_create_finished' THEN COALESCE(json_extract(props,'$.created'),0)+COALESCE(json_extract(props,'$.children'),0) ELSE 0 END) AS folders,
   SUM(CASE WHEN name='time_saving_completed' AND tool='finder' THEN COALESCE(json_extract(props,'$.count'),0) ELSE 0 END) AS matched
   FROM events WHERE site_id=? AND day>=? AND day<=? GROUP BY user_id ORDER BY last_at DESC,user_id LIMIT ? OFFSET ?`).bind(site,start,end,size,(page-1)*size).all<{user_id:string;first_at:number;last_at:number;sessions:number;pageviews:number;inspected:number;processed:number;folders:number;matched:number}>(),
 ])
 const users=await Promise.all(rows.results.map(async row=>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${site}:${row.user_id}`))
  const id=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('').slice(0,16)
  const {user_id:_,...counts}=row
  return {id,label:`访客 ${id.slice(0,8).toUpperCase()}`,...counts}
 }))
 return {site,start,end,page,pageSize:size,total:total?.n||0,users}
}
