import { defaultTimeConfigs, emptyUsage, type TimeConfigs, type SavingTool } from '../../shared/time-savings'
import { beijingDay, type Database } from './db'
import { getSite } from './sites'
export async function readTimeSettings(db: Database, site: string) {
 const row = await db.prepare('SELECT configs,revision,updated_at FROM time_saving_settings WHERE site_id=?').bind(site).first<{configs:string;revision:number;updated_at:number}>()
 return { configs: row ? JSON.parse(row.configs) as TimeConfigs : defaultTimeConfigs(), revision: row?.revision || 0, updatedAt: row?.updated_at || null }
}
export async function readTimeSavings(db: Database, site: string, start: string, end: string) {
 const [registry, settings, result] = await Promise.all([
  getSite(db,site), readTimeSettings(db,site),
  // Existing business facts can support a conservative estimate. Within a session/day,
  // take the larger source count rather than adding overlapping old and new events.
  db.prepare(`WITH facts AS (
   SELECT day,session_id,occurred_at,received_at,
   CASE WHEN name='time_saving_completed' THEN tool WHEN name='image_process_finished' THEN 'compress' WHEN name='inspection_finished' THEN 'inspect' ELSE 'folders' END AS tool,
   CASE WHEN name='time_saving_completed' OR name='inspection_finished' THEN COALESCE(json_extract(props,'$.count'),0) WHEN name='image_process_finished' THEN COALESCE(json_extract(props,'$.success'),0) ELSE COALESCE(json_extract(props,'$.created'),0) END AS units,
   CASE WHEN name='time_saving_completed' THEN 1 ELSE 0 END AS explicit
   FROM events WHERE site_id=? AND (
    name='time_saving_completed' OR
    (name='image_process_finished' AND tool IN ('compress','inspect')) OR
    (name='inspection_finished' AND tool='inspect') OR
    (name='folder_create_finished' AND tool='folders' AND json_extract(props,'$.mode')='aigc' AND COALESCE(json_extract(props,'$.failed'),0)=0)
   )
  ), sessions AS (
   SELECT day,session_id,tool,SUM(CASE WHEN explicit=1 THEN units ELSE 0 END) AS tracked,SUM(CASE WHEN explicit=0 THEN units ELSE 0 END) AS legacy,MIN(occurred_at) AS first_at,MAX(received_at) AS last_at
   FROM facts WHERE units>0 GROUP BY day,session_id,tool
  ) SELECT day,tool,SUM(MAX(tracked,legacy)) AS count,SUM(MAX(legacy-tracked,0)) AS historical_added,MIN(first_at) AS first_at,MAX(last_at) AS last_at FROM sessions GROUP BY day,tool ORDER BY day`).bind(site).all<{day:string;tool:SavingTool;count:number;historical_added:number;first_at:number;last_at:number}>(),
 ])
 if (!registry) throw new Error('Unknown site')
 const lifetime=emptyUsage(), period=emptyUsage(), historical=emptyUsage(), months=new Map<string,ReturnType<typeof emptyUsage>>()
 let firstAt:number|null=null,lastAt:number|null=null
 for(const row of result.results){const m=row.day.slice(0,7),counts=months.get(m)||emptyUsage();lifetime[row.tool]+=row.count;historical[row.tool]+=row.historical_added;counts[row.tool]+=row.count;months.set(m,counts);if(row.day>=start&&row.day<=end)period[row.tool]+=row.count;firstAt=firstAt===null?row.first_at:Math.min(firstAt,row.first_at);lastAt=Math.max(lastAt||0,row.last_at)}
 if(firstAt)for(let month=beijingDay(firstAt).slice(0,7);month<=beijingDay(Date.now()).slice(0,7);){if(!months.has(month))months.set(month,emptyUsage());const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7)}
 return { site:registry.id, ...settings, firstAt,lastAt,readAt:Date.now(),start,end,historical,usage:{lifetime,period,monthly:[...months].sort(([a],[b])=>b.localeCompare(a)).map(([month,counts])=>({month,counts}))} }
}
