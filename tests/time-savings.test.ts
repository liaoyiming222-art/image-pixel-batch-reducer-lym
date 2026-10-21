import {describe,expect,it} from 'vitest'
import {calculateSavings,defaultTimeConfigs,validTimeConfigs} from '../shared/time-savings'
describe('节时估算口径',()=>{
 it('四种单位分别计算，AI 一组不会按三个目录重复计算',()=>{
  const result=calculateSavings({compress:2,inspect:3,folders:1,finder:4},defaultTimeConfigs())
  expect(result.rows.map(r=>r.savedSeconds)).toEqual([59.4,204,85,468])
  expect(result.savedSeconds).toBe(816.4)
  expect(result.manualSeconds-result.automatedSeconds).toBeCloseTo(816.4)
 })
 it('修改参数重算旧用量，小数不累积误差，新流程更慢时为负数',()=>{
  const configs=defaultTimeConfigs();configs.compress={manual:0.3,automated:0.1};configs.finder={manual:1,automated:2}
  const result=calculateSavings({compress:3,inspect:0,folders:0,finder:2,compression:{detected:0,estimated:0}},configs)
  expect(result.rows[0].savedSeconds).toBe(0.6);expect(result.savedSeconds).toBe(-1.4)
 })
 it('100 张服务、60 张压缩，已知检测与压缩分开计算；未知结果按最长路径补估',()=>{
  const counts={compress:60,inspect:0,folders:0,finder:0,compression:{detected:100,estimated:0}}
  expect(calculateSavings(counts,defaultTimeConfigs()).savedSeconds).toBe(1890)
  const result=calculateSavings({...counts,compression:{detected:100,estimated:40}},defaultTimeConfigs())
  expect(result.savedSeconds).toBe(2970)
  const row=result.rows[0]
  expect(row.detectionSavedSeconds+row.compressionSavedSeconds+row.estimatedSavedSeconds).toBe(result.savedSeconds)
  expect(row.estimatedSavedSeconds).toBe(1188)
 })
 it('参数可修改，未知路径始终选节时最大方案，明确压缩更慢仍保留负值',()=>{
  const configs=defaultTimeConfigs();configs.compress={manual:1,automated:2};configs.compressionDetection={manual:3,automated:0.5}
  const result=calculateSavings({compress:2,inspect:0,folders:0,finder:0,compression:{detected:10,estimated:8}},configs)
  expect(result.savedSeconds).toBe(23)
  expect(result.rows[0].estimatedSavedSeconds).toBe(20)
 })
 it('拒绝缺失工具、未知字段、负数、非有限值、超范围和多位小数',()=>{
  expect(validTimeConfigs(defaultTimeConfigs())).toBe(true)
  for(const value of [-1,Infinity,NaN,86400.1,3.01,'3.0',null]){const configs=defaultTimeConfigs();configs.compress.manual=value as number;expect(validTimeConfigs(configs)).toBe(false)}
  expect(validTimeConfigs({...defaultTimeConfigs(),unknown:{manual:1,automated:1}})).toBe(false)
  expect(validTimeConfigs({...defaultTimeConfigs(),finder:undefined})).toBe(false)
  expect(validTimeConfigs({...defaultTimeConfigs(),finder:{manual:1,automated:1,extra:1}})).toBe(false)
  expect(validTimeConfigs({...defaultTimeConfigs(),compressionDetection:{manual:3,automated:0.33}})).toBe(false)
 })
})
