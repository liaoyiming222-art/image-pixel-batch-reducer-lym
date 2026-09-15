import type { ProcessOptions } from './types'
import UTIF from 'utif'

export type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void }
const MAX_TIFF_PIXELS = 50_000_000
const TIFF_PREVIEW_MAX_EDGE = 800

function isTiff(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return file.type === 'image/tiff' || file.type === 'image/x-tiff' || extension === 'tif' || extension === 'tiff'
}

async function readTiff(file: File): Promise<Decoded> {
  const buffer = await file.arrayBuffer()
  const pages = UTIF.decode(buffer)
  const page = pages[0]
  if (!page) throw new Error('TIFF 文件中没有可读取的图片')
  const width = Number(page.width ?? page.t256?.[0])
  const height = Number(page.height ?? page.t257?.[0])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('无法读取 TIFF 图片尺寸')
  if (width * height > MAX_TIFF_PIXELS) throw new Error('TIFF 图片像素过大，请先缩小至 5000 万像素以内')
  UTIF.decodeImage(buffer, page)
  const rgba = UTIF.toRGBA8(page)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建 TIFF 图片画布')
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  return { source: canvas, width, height, close: () => { canvas.width = 1; canvas.height = 1 } }
}

export async function readImage(file: File): Promise<Decoded> {
  if (isTiff(file)) return readTiff(file)
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('无法读取图片内容'))
      image.src = url
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('浏览器无法生成此格式的图片')), type, quality)
  })
}

export async function createPreviewUrl(file: File, decoded: Decoded): Promise<string> {
  if (!isTiff(file)) return URL.createObjectURL(file)
  const scale = Math.min(1, TIFF_PREVIEW_MAX_EDGE / Math.max(decoded.width, decoded.height))
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('浏览器无法生成 TIFF 预览')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(decoded.source, 0, 0, width, height)
  try { return URL.createObjectURL(await canvasBlob(canvas, 'image/jpeg', 0.82)) }
  finally { canvas.width = 1; canvas.height = 1 }
}

const OUTPUT_QUALITY = 0.9
const OUTPUT_TYPE = 'image/jpeg'
const OUTPUT_BACKGROUND = '#ffffff'
const MAX_ATTEMPTS = 5

export async function resizeToTarget(file: File, options: ProcessOptions) {
  if (!options.conversionOnly && (!Number.isFinite(options.targetBytes) || options.targetBytes <= 0)) throw new Error('目标大小必须大于 0')
  const targetBytes = options.forceSmaller ? Math.min(options.targetBytes, file.size - 1) : options.targetBytes
  const decoded = await readImage(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    decoded.close()
    throw new Error('浏览器无法创建图片画布')
  }

  const encode = async (scale: number) => {
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    canvas.width = width
    canvas.height = height
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.fillStyle = OUTPUT_BACKGROUND
    context.fillRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)
    const blob = await canvasBlob(canvas, OUTPUT_TYPE, OUTPUT_QUALITY)
    return { blob, width, height, scale }
  }

  try {
    // Measure the actual JPEG first: source formats have different compression ratios.
    const original = await encode(1)
    options.onProgress?.(10)
    if (options.conversionOnly || original.blob.size <= targetBytes) return original
    const minScale = 1 / Math.max(decoded.width, decoded.height)
    let previous = original
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      // Estimate from the last actual JPEG, leaving a small margin to avoid extra encodes.
      const correction = Math.min(0.95, Math.sqrt(Math.max(0, targetBytes) / previous.blob.size) * 0.95)
      const scale = Math.max(minScale, previous.scale * correction)
      const result = await encode(scale)
      options.onProgress?.(10 + Math.round((attempt / MAX_ATTEMPTS) * 85))
      if (result.blob.size <= targetBytes) return result
      if (scale === minScale) throw new Error('目标大小过小，无法生成有效 JPG，请提高目标大小')
      previous = result
    }
    throw new Error('快速压缩未能达到目标大小，请提高目标大小后重试')
  } finally {
    canvas.width = 1
    canvas.height = 1
    decoded.close()
  }
}
