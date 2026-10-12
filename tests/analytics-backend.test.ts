// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost as ingest } from '../functions/api/events'
import { onRequestPost as login } from '../functions/api/admin/login'
import { onRequestGet as stats } from '../functions/api/admin/stats'
import { readStats, summarizeDay } from '../functions/lib/summary'
import { archiveDay, runArchive } from '../workers/archive'
import type { Database, Env } from '../functions/lib/db'
import { validateEvent } from '../functions/lib/events'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
let sqlite:InstanceType<typeof DatabaseSync>,db:Database,env:Env
const host='https://pixelflow-image-tools.pages.dev'
const now=Date.parse('2026-10-10T08:00:00Z')
const user=()=>crypto.randomUUID()
const event=(name='page_view',tool='app',props={},overrides={})=>({id:user(),user:user(),session:user(),task:'',name,tool,at:now,version:'analytics-v1',props,...overrides})
const request=(path:string,body:unknown,cookie='')=>new Request(host+path,{method:'POST',headers:{Origin:host,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)})
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(now)
  sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0001_analytics.sql','utf8'));sqlite.exec(readFileSync('migrations/0002_multisite.sql','utf8'))
  db={prepare(sql:string){let args:unknown[]=[];const statement={bind(...next:unknown[]){args=next;return statement},async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}},async all(){return {results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)||null}};return statement},async batch(items){sqlite.exec('BEGIN');try{const values=[];for(const item of items)values.push(await item.run());sqlite.exec('COMMIT');return values}catch(e){sqlite.exec('ROLLBACK');throw e}}} as Database
  env={DB:db,ADMIN_PASSWORD:'a-test-password-only',AUTH_SECRET:'test-signing-key-longer-than-32-characters'}
})
afterEach(()=>{sqlite.close();vi.useRealTimers();vi.restoreAllMocks()})
describe('数据接收与累计',()=>{
  it('同一事件编号在两个站点分别去重，用户和累计不混算',async()=>{
    const e=event(),secondary={...e,site:'pixelfloweverybody'}
    await ingest({request:request('/api/events',{events:[e]}),env})
    const secondaryRequest=()=>new Request('https://pixelfloweverybody.pages.dev/api/events',{method:'POST',headers:{Origin:'https://pixelfloweverybody.pages.dev','Content-Type':'application/json'},body:JSON.stringify({events:[secondary]})})
    expect((await ingest({request:secondaryRequest(),env})).status).toBe(200)
    await ingest({request:secondaryRequest(),env})
    const a=await readStats(db,'2026-10-01','2026-10-31'),b=await readStats(db,'2026-10-01','2026-10-31','pixelfloweverybody')
    expect(a.totals).toMatchObject({pageviews:1,users:1,sessions:1})
    expect(b.totals).toMatchObject({pageviews:1,users:1,sessions:1})
    expect(b.dashboard.siteLaunch).toBe('2026-10-10')
    expect(b.dashboard.lifetime.traffic).toMatchObject({pageviews:1,visits:1})
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM events').get().n).toBe(2)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(2)
  })
  it('拒绝站点伪装和第二站点缺少标识，旧主站点请求仍兼容',async()=>{
    const origin='https://pixelfloweverybody.pages.dev'
    const req=(e:unknown)=>new Request(origin+'/api/events',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({events:[e]})})
    expect((await ingest({request:req(event()),env})).status).toBe(403)
    expect((await ingest({request:request('/api/events',{events:[{...event(),site:'pixelfloweverybody'}]}),env})).status).toBe(403)
    expect((await ingest({request:request('/api/events',{events:[event()]}),env})).status).toBe(200)
  })
  it('每个站点的历史、月度、首条事件和每日汇总独立',async()=>{
    const a=event('inspection_finished','inspect',{count:3},{task:user()})
    await ingest({request:request('/api/events',{events:[a]}),env})
    const b={...event('inspection_finished','inspect',{count:7},{task:user()}),site:'pixelfloweverybody'}
    const origin='https://pixelfloweverybody.pages.dev'
    await ingest({request:new Request(origin+'/api/events',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({events:[b]})}),env})
    await summarizeDay(db,'2026-10-10');await summarizeDay(db,'2026-10-10','pixelfloweverybody')
    expect(sqlite.prepare("SELECT value FROM site_daily_metrics WHERE site_id='pixelflow-image-tools' AND metric='inspected'").get().value).toBe(3)
    expect(sqlite.prepare("SELECT value FROM site_daily_metrics WHERE site_id='pixelfloweverybody' AND metric='inspected'").get().value).toBe(7)
    expect((await readStats(db,'2026-10-01','2026-10-31')).dashboard.monthly[0].business?.inspected).toBe(3)
    expect((await readStats(db,'2026-10-01','2026-10-31','pixelfloweverybody')).dashboard.monthly[0].business?.inspected).toBe(7)
  })
  it('空站点没有继承其他站点历史，未知站点不可查询',async()=>{
    await ingest({request:request('/api/events',{events:[event()]}),env})
    const b=await readStats(db,'2026-10-01','2026-10-31','pixelfloweverybody')
    expect(b.firstAt).toBeNull();expect(b.dashboard.lifetime.users).toBe(0);expect(b.dashboard.lifetime.traffic.pageviews).toBeNull()
    await expect(readStats(db,'2026-10-01','2026-10-31','unknown')).rejects.toThrow('Unknown site')
  })
  it('同一个用户跨月出现，累计去重一次，月度各算一次',async()=>{
    const uid=user()
    for(const at of [Date.parse('2026-09-30T15:59:00Z'),Date.parse('2026-09-30T16:01:00Z')]){
      const day=new Date(at+8*3600000).toISOString().slice(0,10)
      sqlite.prepare('INSERT INTO events(id,user_id,session_id,task_id,name,tool,occurred_at,received_at,day,version,props,effective) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(user(),uid,user(),'','page_view','app',at,at,day,'analytics-v1','{}',0)
    }
    const all=await readStats(db,'2026-07-31','2026-10-10'),filtered=await readStats(db,'2026-10-01','2026-10-10')
    expect(all.dashboard.lifetime.users).toBe(1)
    expect(all.dashboard.monthly.filter(m=>['2026-09','2026-10'].includes(m.month)).map(m=>m.users)).toEqual([1,1])
    expect(filtered.dashboard.lifetime.users).toBe(1);expect(filtered.totals.users).toBe(1)
  })
  it('重试相同事件不重复计数，跨日期用户仍去重',async()=>{
    const e=event();const first=await ingest({request:request('/api/events',{events:[e]}),env});expect(first.status).toBe(200)
    expect((await ingest({request:request('/api/events',{events:[e]}),env})).status).toBe(200)
    const second=event('page_view','app',{}, {user:e.user,session:user(),at:now-86400000})
    await ingest({request:request('/api/events',{events:[second]}),env})
    const s=await readStats(db,'2026-10-01','2026-10-31')
    expect(s.totals).toMatchObject({pageviews:2,users:1,sessions:2,effective_users:0})
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(1)
  })
  it('拒绝文件名等非白名单属性、错误来源、预览域名和错误计数',async()=>{
    expect((await ingest({request:request('/api/events',{events:[event('page_view','app',{filename:'private.jpg'})]}),env})).status).toBe(400)
    const wrong=new Request('https://preview.pixelflow-image-tools.pages.dev/api/events',{method:'POST',headers:{Origin:'https://preview.pixelflow-image-tools.pages.dev','Content-Type':'application/json'},body:JSON.stringify({events:[event()]})})
    expect((await ingest({request:wrong,env})).status).toBe(403)
    expect(validateEvent(event('image_process_finished','compress',{count:2,success:1,failed:0,skipped:0,qualified:1,pending:0,duration:1},{task:user()}),now)).toBeNull()
    expect(validateEvent({...event(),filename:'private.jpg'},now)).toBeNull()
  })
  it('不保存过大请求，超限返回 413',async()=>{
    expect((await ingest({request:request('/api/events',{padding:'x'.repeat(33000)}),env})).status).toBe(413)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM events').get().n).toBe(0)
  })
  it('处理、检测、输出、目录及有效用户口径一致',async()=>{
    const uid=user(),session=user(),task=user()
    const events=[event('image_process_started','compress',{count:3,mode:'over'},{user:uid,session,task}),event('image_process_finished','compress',{count:3,success:1,skipped:1,failed:1,qualified:1,pending:0,duration:120,mode:'over'},{user:uid,session,task}),event('output_action','compress',{kind:'zip',count:2,outputs:1},{user:uid,session,task}),event('inspection_finished','inspect',{count:3},{user:uid,session}),event('folder_create_finished','folders',{count:2,created:1,children:3,completedExisting:1,existing:0,duplicate:0,failed:0,duration:100,mode:'aigc'},{user:uid,session,task})]
    expect((await ingest({request:request('/api/events',{events}),env})).status).toBe(200)
    const s=await readStats(db,'2026-10-10','2026-10-10')
    expect(s.totals).toMatchObject({process_tasks:1,processed:1,skipped:1,process_failed:1,qualified:1,inspected:3,exports:1,folders:1,subfolders:3,completed_existing:1,users:1,effective_users:1})
    await summarizeDay(db,'2026-10-10');await summarizeDay(db,'2026-10-10')
    expect(sqlite.prepare("SELECT SUM(value) AS n FROM site_daily_metrics WHERE metric='processed'").get().n).toBe(1)
  })
  it('中断的分组任务不伪装为完整完成',async()=>{
    const e=event('image_process_finished','inspect',{count:5,success:1,skipped:1,failed:1,pending:2,qualified:1,duration:100},{task:user()})
    await ingest({request:request('/api/events',{events:[e]}),env});await summarizeDay(db,'2026-10-10')
    const s=await readStats(db,'2026-10-10','2026-10-10');expect(s.totals).toMatchObject({completed_tasks:0,interrupted_tasks:1,pending:2})
    expect(sqlite.prepare("SELECT value FROM site_daily_metrics WHERE metric='interrupted_tasks'").get().value).toBe(1)
  })
})
describe('后台权限',()=>{
  it('未登录不可读取，正确密码签发 HttpOnly 会话',async()=>{
    expect((await stats({request:new Request(host+'/api/admin/stats'),env})).status).toBe(401)
    expect((await login({request:request('/api/admin/login',{password:'wrong'}),env})).status).toBe(401)
    const response=await login({request:request('/api/admin/login',{password:env.ADMIN_PASSWORD}),env})
    expect(response.status).toBe(200);const cookie=response.headers.get('Set-Cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure')
    expect((await stats({request:new Request(host+'/api/admin/stats',{headers:{Cookie:cookie.split(';')[0]}}),env})).status).toBe(200)
    vi.setSystemTime(now+9*3600000)
    expect((await stats({request:new Request(host+'/api/admin/stats',{headers:{Cookie:cookie.split(';')[0]}}),env})).status).toBe(401)
  })
  it('没有登录配置时拒绝开放查询',async()=>{
    env.AUTH_SECRET=undefined
    expect((await login({request:request('/api/admin/login',{password:'any'}),env})).status).toBe(503)
    expect((await stats({request:new Request(host+'/api/admin/stats'),env})).status).toBe(401)
  })
})
describe('Cloudflare 归档',()=>{
  it('按北京时间自然日归档，重复执行覆盖更新而非累加',async()=>{
    env.CLOUDFLARE_API_TOKEN='test-token';env.CF_ACCOUNT_ID='4a8a917a1d515000fae113807a66c877'
    const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{expect(JSON.parse(String(init.body)).query).toContain('2026-10-08T16:00:00.000Z');return new Response(JSON.stringify({data:{viewer:{accounts:[{rumPageloadEventsAdaptiveGroups:[{count:12,sum:{visits:5}}]}]}}}))})
    await archiveDay(env,'2026-10-09',fetcher as typeof fetch);await archiveDay(env,'2026-10-09',fetcher as typeof fetch)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM site_cloudflare_daily').get().n).toBe(2)
    expect(sqlite.prepare("SELECT value FROM site_cloudflare_daily WHERE metric='pageviews'").get().value).toBe(12)
  })
  it('查询错误不能覆盖已有归档为零，失败会记录',async()=>{
    env.CLOUDFLARE_API_TOKEN='test-token';env.CF_ACCOUNT_ID='4a8a917a1d515000fae113807a66c877'
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({errors:[{message:'not authorized'}]}))))
    await expect(runArchive(env,1)).rejects.toThrow('Cloudflare 查询失败')
    expect(sqlite.prepare('SELECT status FROM site_archive_runs').get().status).toBe('failed')
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM site_cloudflare_daily').get().n).toBe(0)
    vi.unstubAllGlobals()
  })
})
