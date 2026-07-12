export const MB = 1024 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(2)} MB`
}

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

export function aspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height)
  const left = width / divisor
  const right = height / divisor
  return left <= 30 && right <= 30
    ? `${left}:${right}`
    : `${(width / height).toFixed(2)}:1`
}

export function outputName(name: string, mime: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'jpg'
  return `${base}_resized.${ext}`
}

export const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp']
