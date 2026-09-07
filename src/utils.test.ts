import { describe, expect, it } from 'vitest'
import { aspectRatio, formatBytes, isAcceptedImage, MB, outputName } from './utils'

describe('图片辅助函数', () => {
  it('格式化文件大小', () => expect(formatBytes(10 * MB)).toBe('10.00 MB'))
  it('保持可读的宽高比', () => expect(aspectRatio(1920, 1080)).toBe('16:9'))
  it('根据压缩结果生成 JPG 文件名', () => expect(outputName('照片.png', 'image/jpeg')).toBe('照片_resized.jpg'))
  it('支持 TIFF 扩展名和空 MIME 类型', () => {
    expect(isAcceptedImage(new File(['tiff'], '扫描图.tiff', { type: 'image/tiff' }))).toBe(true)
    expect(isAcceptedImage(new File(['tiff'], '扫描图.tif'))).toBe(true)
    expect(isAcceptedImage(new File(['text'], '说明.txt', { type: 'text/plain' }))).toBe(false)
  })
})
