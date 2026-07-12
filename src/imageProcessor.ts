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
    const blob = await canvasBlob(canvas, file.type, options.quality)
    return { blob, width, height, scale }
  }

  try {
    // Estimate a useful starting point from pixel-area ratio, then binary-search
    // for the largest dimensions that remain below the requested byte target.
    let low = 0.02
    let high = Math.min(0.99, Math.sqrt(options.targetBytes / file.size) * 1.08)
    high = Math.max(high, low)
    let best: Awaited<ReturnType<typeof encode>> | undefined
    let attempt = 0

    const smallest = await encode(low)
    if (smallest.blob.size > options.targetBytes) {
      throw new Error('即使缩至最小尺寸仍无法达到目标大小，请提高目标大小')
    }
    best = smallest

    for (let i = 0; i < 10; i += 1) {
      attempt += 1
      const scale = (low + high) / 2
      const result = await encode(scale)
      options.onProgress?.(10 + Math.round((attempt / 10) * 85))
      if (result.blob.size <= options.targetBytes) {
        best = result
        low = scale
      } else {
        high = scale
      }
    }
    return best
  } finally {
    canvas.width = 1
    canvas.height = 1
    decoded.close()
  }
}
