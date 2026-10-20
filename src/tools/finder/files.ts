import JSZip from 'jszip'
import { archivePath, isImageName, type ImageEntry } from './model'

export interface ReadFileHandle { kind: 'file'; name: string; getFile: () => Promise<File> }
export interface ReadDirectoryHandle {
  kind: 'directory'; name: string
  values: () => AsyncIterable<ReadFileHandle | ReadDirectoryHandle>
}
export class ScanCancelled extends Error {}
export async function scanDirectory(handle: ReadDirectoryHandle, onProgress: (count: number) => void, cancelled: () => boolean) {
  const files: ImageEntry[] = []; const issues: string[] = []; let count = 0
  async function walk(directory: ReadDirectoryHandle, parent: string) {
    try {
      for await (const entry of directory.values()) {
        if (cancelled()) throw new ScanCancelled()
        const path = parent ? `${parent}/${entry.name}` : entry.name
        if (entry.kind === 'directory') await walk(entry, path)
        else {
          count++
          if (isImageName(entry.name)) files.push({ id: path, name: entry.name, path, read: () => entry.getFile() })
          if (count % 100 === 0) { onProgress(count); await new Promise<void>(resolve => setTimeout(resolve, 0)) }
        }
      }
    } catch (error) {
      if (error instanceof ScanCancelled) throw error
      issues.push(`${parent || directory.name}：无法读取目录，请检查共享连接和权限。`)
    }
  }
  await walk(handle, ''); onProgress(count)
  return { files, issues }
}
export function entriesFromFiles(files: File[], source?: { id: string; label: string }) {
  return files.filter(file => isImageName(file.name)).map(file => {
    const path = file.webkitRelativePath?.split('/').slice(1).join('/') || file.name
    return { id: source ? JSON.stringify([source.id, path]) : path, name: file.name, path: source ? `${source.label}/${path}` : path, read: async () => file }
  })
}
export class ImageReadFailure extends Error {
  constructor(public failures: Record<string, string>) { super(`${Object.keys(failures).length} 张图片无法读取，未生成压缩包。`) }
}
export async function createArchive(files: ImageEntry[], onProgress: (percent: number, text: string) => void) {
  const zip = new JSZip(); const used = new Set<string>(); const failures: Record<string, string> = {}
  for (let i = 0; i < files.length; i++) {
    const entry = files[i]
    onProgress(Math.round(i / files.length * 70), `正在读取图片 ${i + 1} / ${files.length}`)
    try {
      const file = await entry.read()
      const bytes = await file.arrayBuffer()
      if (!bytes.byteLength) throw new Error('文件为空')
      zip.file(archivePath(entry.path, used), bytes)
    } catch { failures[entry.id] = '无法读取图片，请检查共享连接或权限后重试，也可取消勾选。' }
  }
  // Never silently download an incomplete collection.
  if (Object.keys(failures).length) throw new ImageReadFailure(failures)
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }, progress =>
    onProgress(Math.round(70 + progress.percent * .3), '正在生成压缩包'))
}
