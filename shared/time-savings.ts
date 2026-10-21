export const savingTools = ['compress', 'inspect', 'folders', 'finder'] as const
export type SavingTool = typeof savingTools[number]
export type TimeConfig = { manual: number; automated: number }
export type TimeConfigs = Record<SavingTool, TimeConfig> & { compressionDetection?: TimeConfig }
export const detectionDefinition = { name: '压缩前检测', manual: 3, automated: 0.3 }
export const detectionConfig = (configs: TimeConfigs): TimeConfig => configs.compressionDetection || { manual: 3, automated: 0.3 }
export type UsageCounts = Record<SavingTool, number> & { compression?: { detected: number; estimated: number }; estimatedFolders?: number }
export const savingDefinitions = {
 compress: { name: '图片压缩', unit: '张', manual: 30, automated: 3, rule: '全部服务图片计算检测节时；实际压缩成功另计压缩节时。历史处理结果缺失时按最长方案补估，明确跳过或失败仅计检测。分组下载的实际压缩也保留。' },
 inspect: { name: '比例检测与分组', unit: '张', manual: 70, automated: 2, rule: '在比例工具中完成检测并生成分组的图片；同一列表内切换工具、改参数不重复计数。' },
 folders: { name: 'AI 需求文件夹', unit: '组', manual: 90, automated: 5, rule: '一组新建 AI 需求目录；历史已创建但完整性无法确认时按完整组补估。普通目录、已有及仅补齐的目录不套用此参数。' },
 finder: { name: '图片搜索与匹配', unit: '张', manual: 120, automated: 3, rule: '成功匹配的图片；歧义需人工选定后计入。同一清单反复查找不重复计数，重新提取清单重新计数。' },
} as const
export const defaultTimeConfigs = (): TimeConfigs => ({ ...Object.fromEntries(savingTools.map(tool => [tool, { manual: savingDefinitions[tool].manual, automated: savingDefinitions[tool].automated }])), compressionDetection: { manual: 3, automated: 0.3 } }) as TimeConfigs
export const emptyUsage = (): UsageCounts => ({ compress: 0, inspect: 0, folders: 0, finder: 0, compression: { detected: 0, estimated: 0 }, estimatedFolders: 0 })
export function validTimeConfigs(value: unknown): value is TimeConfigs {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false
 const configs = value as Record<string, unknown>
 const keys: string[] = [...savingTools, 'compressionDetection']
 if (Object.keys(configs).some(key => !keys.includes(key)) || savingTools.some(tool => !Object.keys(configs).includes(tool))) return false
 return keys.filter(key => Object.keys(configs).includes(key)).every(tool => {
  const row = configs[tool] as TimeConfig | null
  return row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).length === 2 && ['manual','automated'].every(key => {
   const n = row[key as keyof TimeConfig]
   return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 86400 && Math.abs(n * 10 - Math.round(n * 10)) < 1e-7
  })
 })
}
export function calculateSavings(counts: UsageCounts, configs: TimeConfigs) {
 const rows = savingTools.map(tool => {
  const count = counts[tool] || 0, config = configs[tool]
  let manualTenths = count * Math.round(config.manual * 10), automatedTenths = count * Math.round(config.automated * 10)
  let detectionSavedSeconds = 0, estimatedSavedSeconds = 0
  const compressionSavedSeconds = (manualTenths - automatedTenths) / 10
  if (tool === 'compress') {
   const detection = detectionConfig(configs), detected = counts.compression?.detected ?? count, estimated = counts.compression?.estimated || 0
   const detectionManual = detected * Math.round(detection.manual * 10), detectionAutomated = detected * Math.round(detection.automated * 10)
   // Pick the longer-saving path for unknown outcomes, even when edited compression is slower.
   const extra = Math.max(0, Math.round(config.manual * 10) - Math.round(config.automated * 10))
   manualTenths += detectionManual + (extra > 0 ? estimated * Math.round(config.manual * 10) : 0)
   automatedTenths += detectionAutomated + (extra > 0 ? estimated * Math.round(config.automated * 10) : 0)
   detectionSavedSeconds = (detected - estimated) * (Math.round(detection.manual * 10) - Math.round(detection.automated * 10)) / 10
   estimatedSavedSeconds = estimated * (Math.round(detection.manual * 10) - Math.round(detection.automated * 10) + extra) / 10
  }
  return { tool, count, manualSeconds: manualTenths / 10, automatedSeconds: automatedTenths / 10, savedSeconds: (manualTenths - automatedTenths) / 10, detectionSavedSeconds, compressionSavedSeconds, estimatedSavedSeconds }
 })
 return { rows, manualSeconds: rows.reduce((n,r) => n + Math.round(r.manualSeconds * 10),0)/10, automatedSeconds: rows.reduce((n,r) => n + Math.round(r.automatedSeconds * 10),0)/10, savedSeconds: rows.reduce((n,r) => n + Math.round(r.savedSeconds * 10),0)/10 }
}
