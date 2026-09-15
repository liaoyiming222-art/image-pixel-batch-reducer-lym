import { afterEach, describe, expect, it, vi } from 'vitest'
import { resizeToTarget } from './imageProcessor'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function mockImage(fullSize: number) {
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(), drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
    callback(new Blob([new Uint8Array(Math.max(600, Math.round(fullSize * this.width * this.height / 12000000)))], { type }))
  })
  return close
}

describe('目标大小压缩', () => {
  it('仅转格式忽略大小目标，保持原像素尺寸', async () => {
    mockImage(2000000)
    const result = await resizeToTarget(new File(['png'], 'image.png', { type: 'image/png' }), { targetBytes: 1, conversionOnly: true })
    expect([result.width, result.height]).toEqual([4000, 3000])
    expect(result.blob.type).toBe('image/jpeg')
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
  })
  it('处理全部时即使原图小于目标也必须缩小文件', async () => {
    mockImage(2000000)
    const file = new File([new Uint8Array(1000000)], 'image.jpg', { type: 'image/jpeg' })
    const result = await resizeToTarget(file, { targetBytes: 5000000, forceSmaller: true })
    expect(result.blob.size).toBeLessThan(file.size)
    expect(result.width).toBeLessThan(4000)
  })
  it('原尺寸 JPG 已达标时保留全部像素，不按源文件体积预先缩小', async () => {
    const close = mockImage(1000000)
    const result = await resizeToTarget(new File([new Uint8Array(20000000)], 'image.png', { type: 'image/png' }), { targetBytes: 5000000 })
    expect([result.width, result.height]).toEqual([4000, 3000])
    expect(result.blob.type).toBe('image/jpeg')
    expect(close).toHaveBeenCalled()
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
  })
  it('根据实际 JPG 大小缩放，首次达标立即停止', async () => {
    mockImage(20000000)
    const result = await resizeToTarget(new File(['source'], 'image.jpg', { type: 'image/jpeg' }), { targetBytes: 5000000 })
    expect(result.blob.size).toBeLessThanOrEqual(5000000)
    expect(result.blob.size).toBeGreaterThanOrEqual(4500000)
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(2)
  })
  it('拒绝无效目标', async () => {
    await expect(resizeToTarget(new File(['x'], 'x.jpg'), { targetBytes: NaN })).rejects.toThrow('目标大小')
  })
})
