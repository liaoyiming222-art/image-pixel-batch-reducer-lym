import { authorized } from '../../lib/auth'
import { json, sameOrigin, type Context } from '../../lib/db'
export async function onRequestPost({request,env}:Context){
 if(!sameOrigin(request)||!await authorized(request,env))return json({error:'请登录统计后台。'},401)
 return json({error:'已改为直接统计产品埋点，请刷新页面使用实时看板。'},410)
}
