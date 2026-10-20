export const savingTools = ['compress', 'inspect', 'folders', 'finder'] as const
export type SavingTool = typeof savingTools[number]
export type TimeConfig = { manual: number; automated: number }
export type TimeConfigs = Record<SavingTool, TimeConfig>
export type UsageCounts = Record<SavingTool, number>
export const savingDefinitions = {
 compress: { name: '图片压缩', unit: '张', manual: 30, automated: 3, rule: '实际压缩或转换成功的图片；跳过和失败不计。分组下载中完成的压缩也计入。' },
 inspect: { name: '比例检测与分组', unit: '张', manual: 70, automated: 2, rule: '在比例工具中完成检测并生成分组的图片；同一列表内切换工具、改参数不重复计数。' },
 folders: { name: 'AI 需求文件夹', unit: '组', manual: 90, automated: 5, rule: '完整新建的一组需求目录（主目录及 AI、原图子目录）；已有、补齐、失败及普通目录不计。' },
 finder: { name: '图片搜索与匹配', unit: '张', manual: 120, automated: 3, rule: '成功匹配的图片；歧义需人工选定后计入。同一清单反复查找不重复计数，重新提取清单重新计数。' },
} as const
export const defaultTimeConfigs = (): TimeConfigs => Object.fromEntries(savingTools.map(tool => [tool, { manual: savingDefinitions[tool].manual, automated: savingDefinitions[tool].automated }])) as TimeConfigs
export const emptyUsage = (): UsageCounts => ({ compress: 0, inspect: 0, folders: 0, finder: 0 })
export function validTimeConfigs(value: unknown): value is TimeConfigs {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false
 const configs = value as Record<string, unknown>
 if (Object.keys(configs).length !== savingTools.length || Object.keys(configs).some(key => !savingTools.includes(key as SavingTool))) return false
 return savingTools.every(tool => {
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
  const manualTenths = count * Math.round(config.manual * 10), automatedTenths = count * Math.round(config.automated * 10)
  return { tool, count, manualSeconds: manualTenths / 10, automatedSeconds: automatedTenths / 10, savedSeconds: (manualTenths - automatedTenths) / 10 }
 })
 return { rows, manualSeconds: rows.reduce((n,r) => n + Math.round(r.manualSeconds * 10),0)/10, automatedSeconds: rows.reduce((n,r) => n + Math.round(r.automatedSeconds * 10),0)/10, savedSeconds: rows.reduce((n,r) => n + Math.round(r.savedSeconds * 10),0)/10 }
}
