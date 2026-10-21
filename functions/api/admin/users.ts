import {authorized} from '../../lib/auth'
import {json,type Context} from '../../lib/db'
import {DEFAULT_SITE,getSite} from '../../lib/sites'
import {readVisitors} from '../../lib/visitors'
export async function onRequestGet({request,env}:Context){
 if(!await authorized(request,env))return json({error:'请登录统计后台。'},401)
 const url=new URL(request.url),site=url.searchParams.get('site')||DEFAULT_SITE,start=url.searchParams.get('start')||'2000-01-01',end=url.searchParams.get('end')||'2099-12-31',page=Number(url.searchParams.get('page')||1)
 const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
 if(!valid(start)||!valid(end)||start>end||!Number.isInteger(page)||page<1||page>100000)return json({error:'日期或页码不正确。'},400)
 try{if(!await getSite(env.DB,site))return json({error:'站点不存在。'},404);return json(await readVisitors(env.DB,site,start,end,page))}catch{return json({error:'匿名用户统计读取失败。'},503)}
}
