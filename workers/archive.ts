import { beijingDay, type Env, json } from '../functions/lib/db'
import { summarizeRecent, summarizeDay } from '../functions/lib/summary'
interface ScheduledEvent { scheduledTime: number }
interface ExecutionContext { waitUntil(promise:Promise<unknown>):void }
export async function archiveDay(env:Env,day:string,fetcher:typeof fetch=fetch) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CF_ACCOUNT_ID) throw new Error('请配置归档密钥和账户编号。')
  if (!/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT_ID)) throw new Error('账户编号格式不正确。')
  const host=env.ANALYTICS_HOST||'pixelflow-image-tools.pages.dev'
  if (!/^[a-z0-9.-]+$/.test(host)) throw new Error('正式域名格式不正确。')
  const start=new Date(`${day}T00:00:00+08:00`),end=new Date(start.getTime()+86400000)
  if (Number.isNaN(start.getTime())) throw new Error('日期格式不正确。')
  const site=env.CF_SITE_TAG ? `,siteTag:${JSON.stringify(env.CF_SITE_TAG)}` : ''
  const query=`{viewer{accounts(filter:{accountTag:${JSON.stringify(env.CF_ACCOUNT_ID)}}){rumPageloadEventsAdaptiveGroups(limit:1,filter:{datetime_geq:${JSON.stringify(start.toISOString())},datetime_lt:${JSON.stringify(end.toISOString())},requestHost:${JSON.stringify(host)}${site}}){count sum{visits}}}}}`
  const response=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(20000)})
  const body=await response.json() as {errors?:unknown[];data?:{viewer?:{accounts?:Array<{rumPageloadEventsAdaptiveGroups?:Array<{count:number;sum:{visits:number}}>}>}}}
  if (!response.ok || body.errors?.length) throw new Error('Cloudflare 查询失败，请检查 Analytics 读取权限、数据集和保留期。')
  const groups=body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups
  if (!Array.isArray(groups)) throw new Error('Cloudflare 未返回预期数据集。')
  const pageviews=groups.reduce((sum,row)=>sum+Number(row.count),0),visits=groups.reduce((sum,row)=>sum+Number(row.sum.visits),0)
  if (!Number.isFinite(pageviews)||!Number.isFinite(visits)||pageviews<0||visits<0) throw new Error('Cloudflare 返回了无效指标。')
  await env.DB.batch([['pageviews',pageviews],['visits',visits]].map(([metric,value])=>env.DB.prepare('INSERT INTO cloudflare_daily(day,source,metric,value,fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(day,source,metric) DO UPDATE SET value=excluded.value,fetched_at=excluded.fetched_at').bind(day,'cloudflare_web_analytics',metric,value,Date.now())))
}
export async function runArchive(env:Env,days=3,offset=0) {
  const now=Date.now()
  await env.DB.prepare("INSERT INTO archive_runs(started_at,status,message) VALUES(?,'running','正在汇总和归档')").bind(now).run()
  try {
    await summarizeRecent(env.DB)
    for(let index=1;index<=days;index++){const day=beijingDay(now-(offset+index)*86400000);await summarizeDay(env.DB,day);await archiveDay(env,day)}
    const first=beijingDay(now-(offset+days)*86400000),last=beijingDay(now-(offset+1)*86400000)
    await env.DB.prepare("UPDATE archive_runs SET finished_at=?,status='success',message=? WHERE started_at=?").bind(Date.now(),`已覆盖更新 ${first} 至 ${last}，共 ${days} 天。`,now).run()
  } catch(error) {
    await env.DB.prepare("UPDATE archive_runs SET finished_at=?,status='failed',message=? WHERE started_at=?").bind(Date.now(),error instanceof Error?error.message:'归档失败',now).run()
    throw error
  }
}
export default {
  scheduled(_event:ScheduledEvent,env:Env,ctx:ExecutionContext){ctx.waitUntil(runArchive(env))},
  fetch(){return json({error:'此服务只执行定时归档，不提供公开接口。'},404)},
}
