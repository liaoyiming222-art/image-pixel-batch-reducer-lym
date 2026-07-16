import type { ProcessOptions } from './types'

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void }

export async function readImage(file: File): Promise<Decoded> {
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

const OUTPUT_QUALITY = 0.9
const MIN_SCALE = 0.02
const MAX_ATTEMPTS = 5

export async function resizeToTarget(file: File, options: ProcessOptions) {
  const decoded = await readImage(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: file.type === 'image/png' })
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
    context.clearRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)
    const blob = await canvasBlob(canvas, file.type, OUTPUT_QUALITY)
    return { blob, width, height, scale }
  }

  try {
    // File size generally follows pixel area. Start close to the expected scale,
    // then correct from the actual encoded size. This normally needs 1–3 encodes
    // instead of a fixed 11-pass binary search.
    let scale = Math.min(0.99, Math.max(MIN_SCALE, Math.sqrt(options.targetBytes / file.size) * 0.92))

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const result = await encode(scale)
      options.onProgress?.(10 + Math.round((attempt / MAX_ATTEMPTS) * 85))
      if (result.blob.size <= options.targetBytes) return result

      const correction = Math.sqrt(options.targetBytes / result.blob.size) * 0.9
      const nextScale = Math.max(MIN_SCALE, scale * Math.min(0.9, correction))
      if (nextScale === scale || scale === MIN_SCALE) break
      scale = nextScale
    }

    const smallest = await encode(MIN_SCALE)
    if (smallest.blob.size <= options.targetBytes) return smallest
    throw new Error('即使缩至最小尺寸仍无法达到目标大小，请提高目标大小')
  } finally {
    canvas.width = 1
    canvas.height = 1
    decoded.close()
  }
}
