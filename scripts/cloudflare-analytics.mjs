import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
const account = '4a8a917a1d515000fae113807a66c877'
const project = 'pixelflow-image-tools'
const root = path.resolve(import.meta.dirname, '..')
process.chdir(root)
const mode = process.argv[2] || 'check'
const envFile = fs.readFileSync('.env.local', 'utf8')
const token = envFile.match(/^CLOUDFLARE_API_TOKEN=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, '')
if (!token) throw new Error('请在 .env.local 配置 CLOUDFLARE_API_TOKEN；不要在聊天中粘贴密钥。')
async function api(route,method='GET',body) {
  const r=await fetch(`https://api.cloudflare.com/client/v4${route}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)})
  const j=await r.json()
  if(!r.ok||!j.success)throw new Error(`Cloudflare ${method} ${route} 失败：${(j.errors||[]).map(e=>e.code).join(',')}。请检查对应账户的 API 权限。`)
  return j.result
}
const pnpm = process.env.PIXELFLOW_PNPM || 'C:/Users/122305/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd'
function wrangler(args) {
  // cmd shim is invoked with fixed arguments, never interpolated secret values.
  const result=spawnSync(pnpm,['dlx','wrangler',...args],{cwd:root,env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,WRANGLER_SEND_METRICS:'false'},stdio:'inherit',shell:process.platform==='win32'})
  if(result.status!==0)throw new Error('Cloudflare 部署命令未完成。')
}
try {
  const metadata=await api(`/accounts/${account}/pages/projects/${project}`)
  const databases=await api(`/accounts/${account}/d1/database`)
  console.log(`已验证项目 ${metadata.name} 与 D1 访问权限。`)
  if(mode==='check')process.exit(0)
  if(!['setup','deploy'].includes(mode))throw new Error('使用 check、setup 或 deploy。')
  let database=databases.find(db=>db.name==='pixelflow-analytics')
  if(!database)database=await api(`/accounts/${account}/d1/database`,'POST',{name:'pixelflow-analytics',primary_location_hint:'apac'})
  const siteTag=metadata.build_config?.web_analytics_tag
  const config={name:project,pages_build_output_dir:'dist',compatibility_date:'2026-10-10',d1_databases:[{binding:'DB',database_name:'pixelflow-analytics',database_id:database.uuid,migrations_dir:'migrations'}],vars:{ANALYTICS_HOST:`${project}.pages.dev`,CF_ACCOUNT_ID:account,...(siteTag?{CF_SITE_TAG:siteTag}:{})}}
  fs.writeFileSync('wrangler.jsonc',JSON.stringify(config,null,2)+'\n')
  fs.writeFileSync('workers/wrangler.jsonc',JSON.stringify({name:'pixelflow-analytics-archive',main:'archive.ts',compatibility_date:'2026-10-10',triggers:{crons:['15 19 * * *']},d1_databases:[{binding:'DB',database_name:'pixelflow-analytics',database_id:database.uuid}],vars:{ANALYTICS_HOST:`${project}.pages.dev`,CF_ACCOUNT_ID:account,...(siteTag?{CF_SITE_TAG:siteTag}:{})}},null,2)+'\n')
  const schema=fs.readFileSync('migrations/0001_analytics.sql','utf8')
  const result=await api(`/accounts/${account}/d1/database/${database.uuid}/query`,'POST',{sql:schema})
  if(result.some(row=>!row.success))throw new Error('数据库表初始化未完成。')
  let secrets
  if(fs.existsSync('analytics-cloudflare.local.json'))secrets=JSON.parse(fs.readFileSync('analytics-cloudflare.local.json','utf8'))
  else{secrets={ADMIN_PASSWORD:crypto.randomBytes(24).toString('base64url'),AUTH_SECRET:crypto.randomBytes(48).toString('base64url')};fs.writeFileSync('analytics-cloudflare.local.json',JSON.stringify(secrets,null,2));fs.writeFileSync('analytics-admin.local.txt',`PixelFlow 统计后台\n地址：https://${project}.pages.dev/admin\n密码：${secrets.ADMIN_PASSWORD}\n请妥善保管，不要提交到 Git。\n`)}
  const vars={...(metadata.deployment_configs.production.env_vars||{}),ADMIN_PASSWORD:{type:'secret_text',value:secrets.ADMIN_PASSWORD},AUTH_SECRET:{type:'secret_text',value:secrets.AUTH_SECRET},CLOUDFLARE_API_TOKEN:{type:'secret_text',value:token},CF_ACCOUNT_ID:{type:'plain_text',value:account},ANALYTICS_HOST:{type:'plain_text',value:`${project}.pages.dev`}}
  if(siteTag)vars.CF_SITE_TAG={type:'plain_text',value:siteTag}
  await api(`/accounts/${account}/pages/projects/${project}`,'PATCH',{deployment_configs:{production:{env_vars:vars,d1_databases:{...(metadata.deployment_configs.production.d1_databases||{}),DB:{id:database.uuid}}}}})
  console.log('数据库、表和生产绑定已配置；后台密码保存在 analytics-admin.local.txt，不输出到日志。')
  if(mode==='deploy'){
    let built=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-b'],{stdio:'inherit'});if(built.status!==0)throw new Error('类型检查失败。')
    built=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit'});if(built.status!==0)throw new Error('构建失败。')
    wrangler(['pages','deploy','dist','--project-name',project,'--branch',metadata.production_branch,'--commit-dirty=true'])
    wrangler(['deploy','--config','workers/wrangler.jsonc'])
    fs.writeFileSync('archive-secrets.local.json',JSON.stringify({CLOUDFLARE_API_TOKEN:token}))
    try{wrangler(['secret','bulk','archive-secrets.local.json','--config','workers/wrangler.jsonc'])}finally{fs.unlinkSync('archive-secrets.local.json')}
    console.log(`部署完成。后台地址：https://${project}.pages.dev/admin`)
  }
} catch(error) {console.error(error.message);process.exitCode=1}
