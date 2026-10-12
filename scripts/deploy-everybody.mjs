import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
process.chdir(path.resolve(import.meta.dirname,'..'))
const config=fs.readFileSync('wrangler.jsonc','utf8')
const secondary=JSON.parse(config)
secondary.name='pixelfloweverybody'
secondary.vars={ANALYTICS_HOST:'pixelfloweverybody.pages.dev'}
const pnpm=process.env.PIXELFLOW_PNPM||'C:/Users/122305/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd'
try{
  // Pages only accepts the standard configuration filename. Restore it after deployment.
  fs.writeFileSync('wrangler.jsonc',JSON.stringify(secondary,null,2))
  const result=spawnSync(pnpm,['dlx','wrangler','pages','deploy','dist','--project-name','pixelfloweverybody','--branch','main','--commit-dirty=true','--env-file','.env.local'],{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,WRANGLER_SEND_METRICS:'false'}})
  process.exitCode=result.status||0
}finally{fs.writeFileSync('wrangler.jsonc',config)}
