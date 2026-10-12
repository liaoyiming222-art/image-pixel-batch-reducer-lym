import { authorized } from '../../lib/auth'
import { json, type Context } from '../../lib/db'
import { DEFAULT_SITE } from '../../lib/sites'
import { readLiveStats } from '../../lib/live'
export async function onRequestGet({request,env}:Context) {
  if (!await authorized(request,env)) return json({error:'请登录统计后台。'},401)
  const url=new URL(request.url); const start=url.searchParams.get('start')||'2000-01-01'; const end=url.searchParams.get('end')||'2099-12-31'
  const siteId=url.searchParams.get('site')||DEFAULT_SITE
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s
  if (!valid(start)||!valid(end)||start>end) return json({error:'日期范围不正确。'},400)
  try { return json(await readLiveStats(env.DB,start,end,siteId)) } catch(error) { return error instanceof Error&&error.message==='Unknown site'?json({error:'站点不存在。'},404):json({error:'统计读取失败，请检查数据库配置。'},503) }
}
