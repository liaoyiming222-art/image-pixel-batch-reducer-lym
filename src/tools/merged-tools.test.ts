import { describe, expect, it } from 'vitest'
import { splitTable } from './folder/parser'
import { findClosestRatio, getOrientation, simplifyRatio } from './inspector/utils'

describe('图片尺寸提取', () => {
  it('识别方向和标准比例', () => {
    expect(getOrientation(1920, 1080)).toBe('横图')
    expect(findClosestRatio(1920, 1080).label).toBe('16:9')
    expect(simplifyRatio(1920, 1080)).toContain('16:9')
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
