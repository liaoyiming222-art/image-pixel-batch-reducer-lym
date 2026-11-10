import { expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { resizeToTarget } from '../../imageProcessor'
import { createArchive, ImageReadFailure } from './files'
vi.mock('../../imageProcessor', () => ({ resizeToTarget: vi.fn() }))
const buffer = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = reject; r.readAsArrayBuffer(blob) })
it('compresses selected files before ZIP, retaining directories and avoiding extension collisions', async () => {
  vi.mocked(resizeToTarget).mockResolvedValue({ blob: new Blob([Uint8Array.of(255,216,255,217)]), width: 1, height: 1, scale: 1 })
  const source = { arrayBuffer: async () => Uint8Array.of(1).buffer } as File
  const zip = await JSZip.loadAsync(await buffer(await createArchive(['a/图.png','a/图.jpg'].map(path => ({ id:path,path,name:path,read:async()=>source })), vi.fn(), true)))
  expect(zip.file('a/图.jpg')).not.toBeNull()
  expect(zip.file('a/图 (2).jpg')).not.toBeNull()
  expect(Array.from(await zip.file('a/图.jpg')!.async('uint8array'))).toEqual([255,216,255,217])
  expect(resizeToTarget).toHaveBeenCalledWith(source, { targetBytes:2097152,edgeLimit:8000,edgeTarget:8000 })
})
it('blocks the archive if compression fails, retaining the source id for retry or exclusion', async () => {
  vi.mocked(resizeToTarget).mockRejectedValue(new Error('encoding failed'))
  const failure = await createArchive([{id:'source',name:'图.png',path:'目录/图.png',read:async()=>({arrayBuffer:async()=>Uint8Array.of(1).buffer} as File)}],vi.fn(),true).catch(e=>e)
  expect(failure).toBeInstanceOf(ImageReadFailure)
  expect(failure.failures.source).toContain('压缩失败')
})
