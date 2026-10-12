// @vitest-environment node
import { describe,expect,it } from 'vitest'
import { buildDashboard,type DailyRow,type TrafficRow } from '../functions/lib/dashboard'
const now=Date.parse('2026-10-12T04:00:00Z'),first=Date.parse('2026-10-11T13:24:35Z')
const rows:DailyRow[]=[{day:'2026-10-11',tool:'app',pageviews:5},{day:'2026-10-12',tool:'app',pageviews:5},{day:'2026-10-12',tool:'inspect',inspected:8,exports:0}]
const archive:TrafficRow[]=[{day:'2026-08-01',metric:'pageviews',value:0},{day:'2026-08-01',metric:'visits',value:0},{day:'2026-09-30',metric:'pageviews',value:20},{day:'2026-09-30',metric:'visits',value:15},{day:'2026-10-11',metric:'pageviews',value:10},{day:'2026-10-11',metric:'visits',value:8}]
const identities={lifetime:{users:1,sessions:2,effective_users:1},period:{users:1,sessions:1,effective_users:1},monthly:[{bucket:'2026-10',users:1,sessions:2,effective_users:1}],daily:[{bucket:'2026-10-11',users:1,sessions:1,effective_users:0},{bucket:'2026-10-12',users:1,sessions:1,effective_users:1}]}
describe('累计与月度口径',()=>{
 it('历史流量与自建流量不相加，筛选不改变累计',()=>{
  const d=buildDashboard(rows,archive,identities,first,'2026-10-12','2026-10-12',now)
  expect(d.lifetime.traffic.pageviews).toBe(30);expect(d.lifetime.business.pageviews).toBe(10)
  expect(d.period.traffic.pageviews).toBeNull();expect(d.period.business.inspected).toBe(8)
  expect(d.lifetime.users).toBe(1)
 })
 it('逐月流量之和等于已有历史累计，采集前业务显示 null',()=>{
  const d=buildDashboard(rows,archive,identities,first,'2026-07-31','2026-10-12',now)
  expect(d.monthly.map(m=>m.month)).toEqual(['2026-10','2026-09','2026-08','2026-07'])
  expect(d.monthly.reduce((n,m)=>n+(m.traffic.pageviews||0),0)).toBe(d.lifetime.traffic.pageviews)
  expect(d.monthly.find(m=>m.month==='2026-09')?.business).toBeNull()
  expect(d.monthly[0]).toMatchObject({partial:true,businessPartial:true,users:1,business:{inspected:8}})
 })
 it('归档的零值与缺失日期不同，图表保留所有日期',()=>{
  const d=buildDashboard(rows,archive,identities,first,'2026-08-01','2026-08-03',now)
  expect(d.series.map(p=>p.pageviews)).toEqual([0,null,null])
  expect(d.series.every(p=>p.inspected===null)).toBe(true)
  expect(d.period.traffic).toMatchObject({coveredDays:1,expectedDays:3,missingDays:2,pageviews:0})
 })
 it('采集后的无操作日为 0，之前为 null',()=>{
  const d=buildDashboard(rows,archive,identities,first,'2026-10-10','2026-10-12',now)
  expect(d.series.map(p=>p.inspected)).toEqual([null,0,8])
 })
 it('北京时间月边界及跨年月份正确',()=>{
  const d=buildDashboard([],[],{lifetime:{},period:{},monthly:[],daily:[]},Date.parse('2026-12-31T16:01:00Z'),'2026-12-31','2027-01-01',Date.parse('2026-12-31T16:02:00Z'))
  expect(d.today).toBe('2027-01-01');expect(d.businessStart).toBe('2027-01-01')
  expect(d.monthly[0].month).toBe('2027-01');expect(d.monthly[1].business).toBeNull()
 })
})
