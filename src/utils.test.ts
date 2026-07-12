import { describe, expect, it } from 'vitest'
import { aspectRatio, formatBytes, MB, outputName } from './utils'

describe('图片辅助函数', () => {
  it('格式化文件大小', () => expect(formatBytes(10 * MB)).toBe('10.00 MB'))
  it('保持可读的宽高比', () => expect(aspectRatio(1920, 1080)).toBe('16:9'))
  it('生成 resized 文件名并保持格式', () => expect(outputName('照片.png', 'image/png')).toBe('照片_resized.png'))
})
