// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
describe('旧数据迁移',()=>{
 it('保留原始事件与历史归档，只归属到原站点',()=>{
  const db=new DatabaseSync(':memory:')
  try{db.exec(readFileSync('migrations/0001_analytics.sql','utf8'))
    db.exec("INSERT INTO events VALUES('old-event','old-user','old-session','','page_view','app',1,1,'2026-10-01','analytics-v1','{}',0);INSERT INTO cloudflare_daily VALUES('2026-09-30','cloudflare_web_analytics','pageviews',20,1);")
    db.exec(readFileSync('migrations/0002_multisite.sql','utf8'))
    expect(db.prepare('SELECT id,site_id FROM events').get()).toMatchObject({id:'old-event',site_id:'pixelflow-image-tools'})
    expect(db.prepare('SELECT site_id,value FROM site_cloudflare_daily').get()).toMatchObject({site_id:'pixelflow-image-tools',value:20})
    expect(db.prepare('SELECT COUNT(*) AS n FROM cloudflare_daily').get().n).toBe(1)
    expect(db.prepare("SELECT COUNT(*) AS n FROM site_cloudflare_daily WHERE site_id='pixelfloweverybody'").get().n).toBe(0)
  }finally{db.close()}
 })
})
