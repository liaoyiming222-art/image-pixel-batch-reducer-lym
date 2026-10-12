import { authorized } from '../../lib/auth'
import { json, type Context } from '../../lib/db'
import { DEFAULT_SITE,getSite } from '../../lib/sites'
import { readStats } from '../../lib/summary'
export async function onRequestGet({request,env}:Context) {
  if (!await authorized(request,env)) return json({error:'请登录统计后台。'},401)
  const url=new URL(request.url); const start=url.searchParams.get('start')||'2000-01-01'; const end=url.searchParams.get('end')||'2099-12-31'
  const siteId=url.searchParams.get('site')||DEFAULT_SITE
  if(!await getSite(env.DB,siteId))return json({error:'站点不存在。'},404)
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s
  if (!valid(start)||!valid(end)||start>end) return json({error:'日期范围不正确。'},400)
  try { return json(await readStats(env.DB,start,end,siteId)) } catch { return json({error:'统计读取失败，请检查数据库配置。'},503) }
}
