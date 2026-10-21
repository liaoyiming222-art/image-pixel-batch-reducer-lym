import { defaultTimeConfigs, emptyUsage, type TimeConfigs, type SavingTool } from '../../shared/time-savings'
import { beijingDay, type Database } from './db'
import { getSite } from './sites'
export async function readTimeSettings(db: Database, site: string) {
 const row = await db.prepare('SELECT configs,revision,updated_at FROM time_saving_settings WHERE site_id=?').bind(site).first<{configs:string;revision:number;updated_at:number}>()
 return { configs: { ...defaultTimeConfigs(), ...(row ? JSON.parse(row.configs) as TimeConfigs : {}) }, revision: row?.revision || 0, updatedAt: row?.updated_at || null }
}
export async function readTimeSavings(db: Database, site: string, start: string, end: string) {
 const [registry, settings, result] = await Promise.all([
  getSite(db,site), readTimeSettings(db,site),
  // Read the full history before applying display dates. Resolved outcomes cover the
  // same browser's detections across sessions/midnight; never invent extra service images.
  db.prepare(`WITH base AS (
   SELECT *,COALESCE(json_extract(props,'$.count'),0) AS units FROM events WHERE site_id=? AND name IN ('time_saving_completed','image_process_finished','inspection_finished','folder_create_finished')
  ), compression_tasks AS (
   SELECT MIN(day) AS day,user_id,session_id,task_id,
    SUM(CASE WHEN name='time_saving_completed' THEN units ELSE 0 END) AS tracked,
    SUM(CASE WHEN name='image_process_finished' THEN COALESCE(json_extract(props,'$.success'),0) ELSE 0 END) AS legacy,
    SUM(CASE WHEN name='image_process_finished' AND tool='compress' THEN units ELSE 0 END) AS handled,
    SUM(CASE WHEN name='image_process_finished' THEN 1 ELSE 0 END) AS outcomes,
    MIN(occurred_at) AS first_at,MAX(received_at) AS last_at
   FROM base WHERE name='image_process_finished' OR (name='time_saving_completed' AND tool='compress') GROUP BY user_id,session_id,task_id
  ), facts AS (
   SELECT day,user_id,session_id,'compress' AS tool,MAX(tracked,legacy) AS tracked,MAX(tracked,legacy) AS legacy,0 AS detected,
    handled+CASE WHEN outcomes=0 THEN tracked ELSE 0 END AS handled,0 AS uncertain,MAX(legacy-tracked,0) AS historical_added,first_at,last_at FROM compression_tasks
   UNION ALL
   SELECT day,user_id,session_id,tool,
    CASE WHEN name='time_saving_completed' THEN units ELSE 0 END,
    CASE WHEN name='inspection_finished' AND tool='inspect' THEN units WHEN name='folder_create_finished' THEN COALESCE(json_extract(props,'$.created'),0) ELSE 0 END,
    CASE WHEN name='inspection_finished' AND tool='compress' THEN units ELSE 0 END,0,
    CASE WHEN name='folder_create_finished' AND (COALESCE(json_extract(props,'$.failed'),0)>0 OR json_extract(props,'$.mode') IS NULL) THEN COALESCE(json_extract(props,'$.created'),0) ELSE 0 END,
    0,occurred_at,received_at
   FROM base WHERE name='inspection_finished' OR (name='time_saving_completed' AND tool!='compress') OR (name='folder_create_finished' AND COALESCE(json_extract(props,'$.mode'),'aigc')='aigc')
  ), daily AS (
   SELECT day,user_id,session_id,tool,SUM(tracked) AS tracked,SUM(legacy) AS legacy,SUM(detected) AS detected,SUM(handled) AS handled,SUM(uncertain) AS uncertain,SUM(historical_added) AS historical_added,MIN(first_at) AS first_at,MAX(last_at) AS last_at
   FROM facts GROUP BY day,user_id,session_id,tool
  ), stages AS (
   SELECT *,SUM(handled) OVER (PARTITION BY user_id,tool) AS all_handled,
    SUM(detected) OVER (PARTITION BY user_id,tool ORDER BY day,session_id ROWS UNBOUNDED PRECEDING) AS running_detected FROM daily
  ) SELECT day,tool,SUM(MAX(tracked,legacy)) AS count,
   SUM(CASE WHEN tool='compress' THEN detected ELSE 0 END) AS detected,
   SUM(CASE WHEN tool='compress' THEN MAX(running_detected-all_handled,0)-MAX(running_detected-detected-all_handled,0) ELSE 0 END) AS estimated,
   SUM(MAX(uncertain-MAX(tracked-(legacy-uncertain),0),0)) AS uncertain,
   SUM(historical_added+MAX(legacy-tracked,0)) AS historical_added,MIN(first_at) AS first_at,MAX(last_at) AS last_at
   FROM stages GROUP BY day,tool ORDER BY day`).bind(site).all<{day:string;tool:SavingTool;count:number;detected:number;estimated:number;uncertain:number;historical_added:number;first_at:number;last_at:number}>(),
 ])
 if (!registry) throw new Error('Unknown site')
 const lifetime=emptyUsage(), period=emptyUsage(), historical=emptyUsage(), months=new Map<string,ReturnType<typeof emptyUsage>>()
 let firstAt:number|null=null,lastAt:number|null=null
 for(const row of result.results){
  if(!row.count&&!row.detected)continue
  const m=row.day.slice(0,7),counts=months.get(m)||emptyUsage()
  for(const target of [lifetime,counts,...(row.day>=start&&row.day<=end?[period]:[])]){
   target[row.tool]+=row.count
   if(row.tool==='compress'){target.compression!.detected+=row.detected;target.compression!.estimated+=row.estimated}
   if(row.tool==='folders')target.estimatedFolders!+=row.uncertain
  }
  historical[row.tool]+=row.historical_added;months.set(m,counts)
  firstAt=firstAt===null?row.first_at:Math.min(firstAt,row.first_at);lastAt=Math.max(lastAt||0,row.last_at)
 }
 if(firstAt)for(let month=beijingDay(firstAt).slice(0,7);month<=beijingDay(Date.now()).slice(0,7);){if(!months.has(month))months.set(month,emptyUsage());const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7)}
 return { site:registry.id, ...settings, firstAt,lastAt,readAt:Date.now(),start,end,historical,usage:{lifetime,period,monthly:[...months].sort(([a],[b])=>b.localeCompare(a)).map(([month,counts])=>({month,counts}))} }
}
