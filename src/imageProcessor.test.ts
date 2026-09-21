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
  it('只有上限时，超长图片缩到上限且保留比例', async () => {
    mockImage(1000000)
    const result = await resizeToTarget(new File(['x'], 'x.png'), { targetBytes: 2000000, limitBytes: 2000000, edgeLimit: 3000, edgeTarget: 3000 })
    expect([result.width, result.height]).toEqual([3000, 2250])
    expect(result.blob.size).toBeLessThanOrEqual(2000000)
  })
  it('体积与最长边恰好等于上限时只编码一次，不继续缩小', async () => {
    mockImage(1000000)
    const result = await resizeToTarget(new File(['x'], 'x.png'), { targetBytes: 1000000, limitBytes: 1000000, edgeLimit: 4000, edgeTarget: 4000 })
    expect([result.width, result.height]).toEqual([4000, 3000])
    expect(result.blob.size).toBe(1000000)
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
  })
  it('尺寸超限但体积合规时，仅等比缩至目标最长边', async () => {
    mockImage(2000000)
    const result = await resizeToTarget(new File(['x'], 'x.jpg'), { targetBytes: 500000, limitBytes: 3000000, edgeLimit: 3500, edgeTarget: 3000 })
    expect([result.width, result.height]).toEqual([3000, 2250])
    expect(result.blob.size).toBeGreaterThan(500000)
  })
  it('最长边恰好等于限制时不缩小', async () => {
    mockImage(1000000)
    const result = await resizeToTarget(new File(['x'], 'x.jpg'), { targetBytes: 500000, limitBytes: 2000000, edgeLimit: 4000, edgeTarget: 3000 })
    expect([result.width, result.height]).toEqual([4000, 3000])
  })
  it('大小与尺寸都超限时继续缩小以满足体积目标', async () => {
    mockImage(20000000)
    const result = await resizeToTarget(new File(['x'], 'x.jpg'), { targetBytes: 1000000, limitBytes: 2000000, edgeLimit: 3500, edgeTarget: 3000 })
    expect(result.width).toBeLessThanOrEqual(3000)
    expect(result.blob.size).toBeLessThanOrEqual(1000000)
  })
  it('仅转格式忽略尺寸限制，无效尺寸参数在压缩时拒绝', async () => {
    mockImage(1000000)
    const file = new File(['x'], 'x.png')
    const result = await resizeToTarget(file, { targetBytes: 1, conversionOnly: true, edgeLimit: 3500, edgeTarget: 3000 })
    expect(result.width).toBe(4000)
    await expect(resizeToTarget(file, { targetBytes: 1000000, edgeLimit: 3000, edgeTarget: 4000 })).rejects.toThrow('目标最长边')
  })
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
