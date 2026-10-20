import {describe,expect,it} from 'vitest'
import {calculateSavings,defaultTimeConfigs,validTimeConfigs} from '../shared/time-savings'
describe('节时估算口径',()=>{
 it('四种单位分别计算，AI 一组不会按三个目录重复计算',()=>{
  const result=calculateSavings({compress:2,inspect:3,folders:1,finder:4},defaultTimeConfigs())
  expect(result.rows.map(r=>r.savedSeconds)).toEqual([54,204,85,468])
  expect(result.savedSeconds).toBe(811)
  expect(result.manualSeconds-result.automatedSeconds).toBe(811)
 })
 it('修改参数重算旧用量，小数不累积误差，新流程更慢时为负数',()=>{
  const configs=defaultTimeConfigs();configs.compress={manual:0.3,automated:0.1};configs.finder={manual:1,automated:2}
  const result=calculateSavings({compress:3,inspect:0,folders:0,finder:2},configs)
  expect(result.rows[0].savedSeconds).toBe(0.6);expect(result.savedSeconds).toBe(-1.4)
 })
 it('拒绝缺失工具、未知字段、负数、非有限值、超范围和多位小数',()=>{
  expect(validTimeConfigs(defaultTimeConfigs())).toBe(true)
  for(const value of [-1,Infinity,NaN,86400.1,3.01,'3.0',null]){const configs=defaultTimeConfigs();configs.compress.manual=value as number;expect(validTimeConfigs(configs)).toBe(false)}
  expect(validTimeConfigs({...defaultTimeConfigs(),unknown:{manual:1,automated:1}})).toBe(false)
  expect(validTimeConfigs({...defaultTimeConfigs(),finder:undefined})).toBe(false)
  expect(validTimeConfigs({...defaultTimeConfigs(),finder:{manual:1,automated:1,extra:1}})).toBe(false)
 })
})
