import type { ImageRecord, Orientation } from './types'

export const STANDARD_RATIOS = [
  { label: '1:1', value: 1 }, { label: '4:5', value: 4 / 5 }, { label: '5:4', value: 5 / 4 },
  { label: '3:4', value: 3 / 4 }, { label: '4:3', value: 4 / 3 }, { label: '2:3', value: 2 / 3 },
  { label: '3:2', value: 3 / 2 }, { label: '9:16', value: 9 / 16 }, { label: '16:9', value: 16 / 9 },
  { label: '9:10', value: 9 / 10 }, { label: '10:9', value: 10 / 9 }, { label: '21:9', value: 21 / 9 },
] as const

const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
const extensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'])

export const getOrientation = (width: number, height: number): Orientation => width === height ? '方图' : width > height ? '横图' : '竖图'
export const simplifyRatio = (width: number, height: number) => {
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}（${(width / height).toFixed(4)}）`
}
export const findClosestRatio = (width: number, height: number) => {
  const actual = width / height
  return STANDARD_RATIOS.reduce((best, item) => {
    const errorPercent = Math.abs(actual - item.value) / item.value * 100
    return errorPercent < best.errorPercent ? { label: item.label as string, errorPercent } : best
  }, { label: STANDARD_RATIOS[0].label as string, errorPercent: Number.POSITIVE_INFINITY })
}
export const formatError = (value: number) => `${(value < 0.01 ? 0 : value).toFixed(2)}%`
export const formatFileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`
export const fileSignature = (file: File) => `${file.name}\u0000${file.size}\u0000${file.lastModified}`
export const isSupportedImage = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.size > 0 && extensions.has(extension) && (file.type === '' || file.type.startsWith('image/'))
}

export function readRecord(file: File, order: number): Promise<ImageRecord> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => URL.revokeObjectURL(url)
    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image
      cleanup()
      if (!width || !height) return reject(new Error('无法读取有效尺寸'))
      const closest = findClosestRatio(width, height)
      resolve({ id: crypto.randomUUID(), signature: fileSignature(file), order, name: file.name, width, height, size: file.size,
        orientation: getOrientation(width, height), actualRatioText: simplifyRatio(width, height),
        closestRatio: closest.label, errorPercent: closest.errorPercent })
    }
    image.onerror = () => { cleanup(); reject(new Error('图片损坏或格式无法解析')) }
    image.src = url
  })
}

const headers = ['文件名', '宽度', '高度', '尺寸', '方向', '实际比例', '最接近比例', '误差', '文件大小']
const row = (item: ImageRecord) => [item.name, item.width, item.height, `${item.width} × ${item.height}`, item.orientation, item.actualRatioText, item.closestRatio, formatError(item.errorPercent), formatFileSize(item.size)]
export const createClipboardText = (records: ImageRecord[]) => [headers, ...records.map(row)].map(values => values.join('\t')).join('\n')
export const createCsv = (records: ImageRecord[]) => `\uFEFF${[headers, ...records.map(row)].map(values => values.map(value => `"${String(value).split('"').join('""')}"`).join(',')).join('\r\n')}`
export function downloadCsv(records: ImageRecord[]) {
  const url = URL.createObjectURL(new Blob([createCsv(records)], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `图片尺寸检测结果_${new Date().toISOString().slice(0, 10)}.csv`; anchor.click()
  URL.revokeObjectURL(url)
}
