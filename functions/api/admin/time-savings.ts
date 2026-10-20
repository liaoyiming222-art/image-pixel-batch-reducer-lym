import { authorized } from '../../lib/auth'
import { json, sameOrigin, type Context } from '../../lib/db'
import { DEFAULT_SITE, getSite } from '../../lib/sites'
import { readTimeSavings, readTimeSettings } from '../../lib/time-savings'
import { validTimeConfigs } from '../../../shared/time-savings'
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s
export async function onRequestGet({request,env}:Context){
 if(!await authorized(request,env))return json({error:'请登录统计后台。'},401)
 const url=new URL(request.url),site=url.searchParams.get('site')||DEFAULT_SITE,start=url.searchParams.get('start')||'2000-01-01',end=url.searchParams.get('end')||'2099-12-31'
 if(!validDate(start)||!validDate(end)||start>end)return json({error:'日期范围不正确。'},400)
 try{return json(await readTimeSavings(env.DB,site,start,end))}catch(e){return json({error:e instanceof Error&&e.message==='Unknown site'?'站点不存在。':'节时统计读取失败，请检查数据库配置。'},e instanceof Error&&e.message==='Unknown site'?404:503)}
}
export async function onRequestPut({request,env}:Context){
 if(!sameOrigin(request))return json({error:'请求来源不正确。'},403)
 if(!await authorized(request,env))return json({error:'请登录统计后台。'},401)
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'请发送 JSON 参数。'},415)
 try{
  // Limit a streamed body before parsing.
  const reader=request.body?.getReader();if(!reader)return json({error:'参数为空。'},400)
  const chunks:Uint8Array[]=[];let size=0
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();return json({error:'参数过大。'},413)}chunks.push(part.value)}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  let body:{configs?:unknown;revision?:unknown};try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return json({error:'参数格式不正确。'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['configs','revision'].includes(k))||!validTimeConfigs(body.configs)||!Number.isSafeInteger(body.revision)||Number(body.revision)<0)return json({error:'请输入 0–86400 秒、最多一位小数的流程时间。'},400)
  const site=new URL(request.url).searchParams.get('site')||DEFAULT_SITE
  if(!await getSite(env.DB,site))return json({error:'站点不存在。'},404)
  const now=Date.now(),revision=Number(body.revision)
  // A stale editor must not overwrite another window's settings.
  const result=revision===0
   ? await env.DB.prepare('INSERT OR IGNORE INTO time_saving_settings(site_id,configs,revision,updated_at) VALUES(?,?,1,?)').bind(site,JSON.stringify(body.configs),now).run()
   : await env.DB.prepare('UPDATE time_saving_settings SET configs=?,revision=revision+1,updated_at=? WHERE site_id=? AND revision=?').bind(JSON.stringify(body.configs),now,site,revision).run()
  if(result.meta?.changes!==1)return json({error:'参数已被其他窗口修改，请放弃修改并重新读取。'},409)
  return json(await readTimeSettings(env.DB,site))
 }catch{return json({error:'参数保存失败，请稍后重试。'},503)}
}
