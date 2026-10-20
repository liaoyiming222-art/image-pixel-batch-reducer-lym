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
  db.prepare("SELECT day,tool,SUM(json_extract(props,'$.count')) AS count,MIN(occurred_at) AS first_at,MAX(received_at) AS last_at FROM events WHERE site_id=? AND name='time_saving_completed' GROUP BY day,tool ORDER BY day").bind(site).all<{day:string;tool:SavingTool;count:number;first_at:number;last_at:number}>(),
 ])
 if (!registry) throw new Error('Unknown site')
 const lifetime=emptyUsage(), period=emptyUsage(), months=new Map<string,ReturnType<typeof emptyUsage>>()
 let firstAt:number|null=null,lastAt:number|null=null
 for(const row of result.results){const m=row.day.slice(0,7),counts=months.get(m)||emptyUsage();lifetime[row.tool]+=row.count;counts[row.tool]+=row.count;months.set(m,counts);if(row.day>=start&&row.day<=end)period[row.tool]+=row.count;firstAt=firstAt===null?row.first_at:Math.min(firstAt,row.first_at);lastAt=Math.max(lastAt||0,row.last_at)}
 if(firstAt)for(let month=beijingDay(firstAt).slice(0,7);month<=beijingDay(Date.now()).slice(0,7);){if(!months.has(month))months.set(month,emptyUsage());const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7)}
 return { site:registry.id, ...settings, firstAt,lastAt,readAt:Date.now(),start,end,usage:{lifetime,period,monthly:[...months].sort(([a],[b])=>b.localeCompare(a)).map(([month,counts])=>({month,counts}))} }
}
