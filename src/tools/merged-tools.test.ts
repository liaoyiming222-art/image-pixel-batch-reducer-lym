import { describe, expect, it } from 'vitest'
import { splitTable } from './folder/parser'
import { findClosestRatio, getOrientation, ratioArchiveName, simplifyRatio, uniqueArchiveNames } from './inspector/utils'
import { outputName, ratioName } from '../utils'

describe('图片尺寸提取', () => {
  it('识别方向和标准比例', () => {
    expect(getOrientation(1920, 1080)).toBe('横图')
    expect(findClosestRatio(1920, 1080).label).toBe('16:9')
    expect(simplifyRatio(1920, 1080)).toContain('16:9')
    expect(findClosestRatio(900, 2100).label).toBe('9:16')
    expect(findClosestRatio(900, 1200).label).toBe('3:4')
    expect(findClosestRatio(1500, 1000).label).toBe('3:2')
    expect(findClosestRatio(900, 1000).label).not.toBe('9:10')
  })

  it.each([
    [1000, 3970, '1:4'], [3970, 1000, '4:1'],
    [1000, 7900, '1:8'], [7900, 1000, '8:1'],
  ])('将 %i × %i 的长图匹配到 %s，并用于压缩导出命名', (width, height, expected) => {
    const closest = findClosestRatio(width, height)
    expect(closest.label).toBe(expected)
    expect(closest.errorPercent).toBeLessThan(2)
    expect(outputName('长图.png', 'image/jpeg', closest.label)).toBe(`长图_${expected.replace(':', '比')}_resized.jpg`)
  })

  it('生成 Windows 可用的比例压缩包名并避免组内同名文件覆盖', () => {
    expect(ratioArchiveName('4:5', 3)).toBe('图片比例_4比5_3张.zip')
    const file = new File(['image'], '产品图.jpg', { type: 'image/jpeg' })
    const base = { id: '1', file, signature: '1', order: 0, name: '产品图.jpg', width: 4, height: 5, size: file.size, orientation: '竖图' as const, actualRatioText: '4:5', closestRatio: '4:5', errorPercent: 0 }
    expect(uniqueArchiveNames([base, { ...base, id: '2', signature: '2' }])).toEqual(['产品图.jpg', '产品图_2.jpg'])
  })

  it('所有导出名称都包含标准比例，压缩结果额外标记 resized', () => {
    expect(ratioName('产品图.jpg', '4:5')).toBe('产品图_4比5.jpg')
    expect(outputName('产品图.jpg', 'image/jpeg', '4:5')).toBe('产品图_4比5_resized.jpg')
  })
})

describe('文件夹需求解析', () => {
  it('解析 Excel TSV 多行内容', () => {
    expect(splitTable('Y8353\t其他\t其他\t其他\t改为1.2米尺寸')).toEqual([
      ['Y8353', '其他', '其他', '其他', '改为1.2米尺寸'],
    ])
  })

  it('保留引号单元格中的换行', () => {
    const result = splitTable('名称\t"第一行\n第二行"')
    expect(result[0][1]).toBe('第一行\n第二行')
  })

})
