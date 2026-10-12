import { authorized } from '../../lib/auth'
import { json, sameOrigin, type Context } from '../../lib/db'
import { DEFAULT_SITE,getSite } from '../../lib/sites'
import { runArchive } from '../../../workers/archive'
export async function onRequestPost({request,env}:Context){
  if(!sameOrigin(request)||!await authorized(request,env))return json({error:'请登录统计后台。'},401)
  const siteId=new URL(request.url).searchParams.get('site')||DEFAULT_SITE
  if(!await getSite(env.DB,siteId))return json({error:'站点不存在。'},404)
  const value=new URL(request.url).searchParams.get('days')||'3';const days=Number(value)
  const offset=Number(new URL(request.url).searchParams.get('offset')||'0')
  if(!Number.isInteger(days)||days<1||days>31)return json({error:'每次归档范围为 1–31 天。'},400)
  if(!Number.isInteger(offset)||offset<0||offset>180)return json({error:'历史偏移范围为 0–180 天。'},400)
  try{await runArchive(env,days,offset,siteId);return json({ok:true})}catch{return json({error:'归档未完成，请查看归档状态。'},503)}
}
