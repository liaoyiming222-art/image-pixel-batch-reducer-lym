import JSZip from 'jszip'
import type { ImageEntry } from './model'

export function hashPixels(pixels: Uint8ClampedArray, width = 17, height = 16) {
  const gray = (i: number) => pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114
  return Array.from({ length: height * (width - 1) }, (_, i) => {
    const offset = (Math.floor(i / (width - 1)) * width + i % (width - 1)) * 4
    return gray(offset) > gray(offset + 4) ? '1' : '0'
  }).join('')
}
export function hashDistance(a: string, b: string) {
  if (a.length !== b.length) throw new Error('图片索引版本不同，请重建索引。')
  let distance = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) distance++
  return distance
}
export async function imageHash(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas'); canvas.width = 17; canvas.height = 16
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('浏览器不支持图片读取。')
    context.fillStyle = '#fff'; context.fillRect(0, 0, 17, 16)
    context.drawImage(bitmap, 0, 0, 17, 16)
    return hashPixels(context.getImageData(0, 0, 17, 16).data)
  } finally { bitmap.close() }
}
// IndexedDB keeps only small hashes and metadata; source images stay on the user's disk.
async function hashDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('picture-finder-hashes-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('hashes')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function cachedHash(entry: ImageEntry, scope: string) {
  const file = await entry.read()
  const key = JSON.stringify([scope, entry.path, file.size, file.lastModified])
  let db: IDBDatabase | undefined
  try {
    db = await hashDatabase()
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = db!.transaction('hashes').objectStore('hashes').get(key)
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    if (typeof stored === 'string' && stored.length === 256) return stored
    const hash = await imageHash(file)
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction('hashes', 'readwrite'); tx.objectStore('hashes').put(hash, key)
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
    })
    return hash
  } catch { return imageHash(file) }
  finally { db?.close() }
}
export async function extractPictures(file: File): Promise<File[]> {
  if (!/\.xlsx$/i.test(file.name)) return [file]
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(zip.files).filter(entry => !entry.dir && /^xl\/media\/.+\.(png|jpe?g|webp|bmp|gif)$/i.test(entry.name))
  return Promise.all(entries.map(async entry => new File([await entry.async('arraybuffer')], `${file.name} · ${entry.name.split('/').pop()}`)))
}
