import { describe,expect,it } from 'vitest'
import { chartBuckets } from './AnalyticsAdmin'
describe('趋势图数据',()=>{
 it('按月聚合可相加的流量，保留未采集月份',()=>{
  const base={users:null,effectiveUsers:null,processed:null,inspected:null,exports:null,folders:null,visits:null}
  const series=[{...base,day:'2026-08-01',pageviews:null},{...base,day:'2026-09-30',pageviews:2},{...base,day:'2026-10-01',pageviews:3},{...base,day:'2026-10-02',pageviews:4}]
  expect(chartBuckets(series,'pageviews','month')).toEqual([{label:'2026-08',value:null},{label:'2026-09',value:2},{label:'2026-10',value:7}])
 })
})
