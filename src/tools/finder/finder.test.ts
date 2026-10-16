import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { archivePath, detectColumn, matchNames, prepareNames, selectedFiles, type ImageEntry } from './model'
import { createArchive, ImageReadFailure, scanDirectory, ScanCancelled, type ReadDirectoryHandle } from './files'

const entry = (path: string, bytes = [1, 2, 3]): ImageEntry => ({
  id: path, path, name: path.split('/').pop()!, read: vi.fn(async () => ({ arrayBuffer: async () => Uint8Array.from(bytes).buffer } as File)),
})
const names = (...values: string[]) => prepareNames(values).rows
describe('picture name matching', () => {
  it('keeps explicit extensions separate and merges only repeated requests', () => {
    const prepared = prepareNames(['图片.png', '图片.jpg', ' 图片.PNG ', '', '图片'])
    expect(prepared.rows.map(row => row.name)).toEqual(['图片.png', '图片.jpg', '图片'])
    expect(prepared.duplicates).toBe(1)
    const matches = matchNames(prepared.rows, [entry('图片.png'), entry('图片.jpg')])
    expect(matches[0].matches.map(file => file.name)).toEqual(['图片.png'])
    expect(matches[2].matches).toHaveLength(2)
  })
  it('preserves internal spaces, punctuation and suffixes, and never auto-selects candidates', () => {
    const matches = matchNames(names('小书桌 0.8米&1.1', '产品图', '图  名'), [entry('小书桌 0.8米&1.1.jpg'), entry('产品图-修.png'), entry('图 名.jpg')])
    expect(matches[0].matches).toHaveLength(1)
    expect(matches[1].matches).toHaveLength(0)
    expect(matches[1].candidates).toHaveLength(1)
    expect(matches[2].matches).toHaveLength(0)
    expect(selectedFiles(matches, {}, new Set()).map(file => file.name)).toEqual(['小书桌 0.8米&1.1.jpg'])
  })
  it('requires a choice for same-named files in different directories and deduplicates chosen files', () => {
    const rows = names('产品图', '产品图.jpg')
    const files = [entry('甲/产品图.jpg'), entry('乙/产品图.jpg')]
    const matches = matchNames(rows, files)
    expect(selectedFiles(matches, {}, new Set())).toHaveLength(0)
    const choices = { [rows[0].id]: files[0].id, [rows[1].id]: files[0].id }
    expect(selectedFiles(matches, choices, new Set())).toEqual([files[0]])
    expect(selectedFiles(matches, choices, new Set(rows.map(row => row.id)))).toHaveLength(0)
  })
  it('detects a name header below introductory rows and preserves separate Excel records', () => {
    expect(detectColumn([['说明'], [], ['编号', '图名称', '需求'], ['1', '图\n名称', '其他']])).toEqual({ column: 1, start: 3 })
    expect(detectColumn([['产品图'], ['另一张图']])).toEqual({ column: 0, start: 0 })
  })
})

describe('shared-directory reading and archive', () => {
  it('recursively indexes names without fetching image bytes and reports inaccessible subdirectories', async () => {
    const getFile = vi.fn()
    const denied: ReadDirectoryHandle = { kind: 'directory', name: '无权限', async *values() { throw new Error('denied') } }
    const directory: ReadDirectoryHandle = { kind: 'directory', name: '共享', async *values() {
      yield { kind: 'file', name: '说明.txt', getFile }
      yield { kind: 'directory', name: '产品', async *values() { yield { kind: 'file', name: '图片.png', getFile } } }
      yield denied
    } }
    const scan = await scanDirectory(directory, vi.fn(), () => false)
    expect(scan.files.map(file => file.path)).toEqual(['产品/图片.png'])
    expect(getFile).not.toHaveBeenCalled()
    expect(scan.issues[0]).toContain('无权限')
  })
  it('supports cancelling a directory scan', async () => {
    const directory: ReadDirectoryHandle = { kind: 'directory', name: '共享', async *values() { yield { kind: 'file', name: '图片.png', getFile: vi.fn() } } }
    await expect(scanDirectory(directory, vi.fn(), () => true)).rejects.toBeInstanceOf(ScanCancelled)
  })
  it('preserves relative directories and original image bytes in ZIP', async () => {
    const blob = await createArchive([entry('甲/图片.png', [4, 5]), entry('乙/图片.png', [6, 7])], vi.fn())
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob) })
    const zip = await JSZip.loadAsync(buffer)
    expect(Array.from(await zip.file('甲/图片.png')!.async('uint8array'))).toEqual([4, 5])
    expect(Array.from(await zip.file('乙/图片.png')!.async('uint8array'))).toEqual([6, 7])
  })
  it('blocks incomplete archives, reports the failing image, and succeeds after it is excluded', async () => {
    const good = entry('好图.png'); const bad = entry('失败.png')
    bad.read = async () => { throw new Error('offline share') }
    const failure = await createArchive([good, bad], vi.fn()).catch(error => error)
    expect(failure).toBeInstanceOf(ImageReadFailure)
    expect(failure.failures).toHaveProperty('失败.png')
    await expect(createArchive([good], vi.fn())).resolves.toBeInstanceOf(Blob)
  })
  it('avoids ZIP name collisions without changing ordinary Chinese names', () => {
    const used = new Set<string>()
    expect(archivePath('产品/小书桌 0.8米&1.1.png', used)).toBe('产品/小书桌 0.8米&1.1.png')
    expect(archivePath('产品/小书桌 0.8米&1.1.png', used)).toBe('产品/小书桌 0.8米&1.1 (2).png')
  })
})
