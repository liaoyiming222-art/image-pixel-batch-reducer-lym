import { describe, expect, it, vi } from 'vitest'
import { createImageImportRegistry } from './imageImport'
import type { ImageTask } from './types'

vi.stubGlobal('crypto', { subtle: { digest: async (_algorithm: string, buffer: ArrayBuffer) => buffer } })

function image(name: string, content: string, path = '') {
  const file = new File([content], name, { type: 'image/jpeg', lastModified: 100 })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(content).buffer })
  return file
}

function task(file: File): ImageTask {
  return { id: file.name, file, name: file.name, format: 'JPG', size: file.size, width: 1, height: 1,
    ratio: '1:1', closestRatio: '1:1', ratioErrorPercent: 0, previewUrl: '', status: 'done', progress: 100 }
}

describe('共享图片导入去重', () => {
  it('同图重复选择和快速连续添加只登记一份', async () => {
    const tasksRef = { current: [] as ImageTask[] }
    const registry = createImageImportRegistry(tasksRef)
    const first = image('a.jpg', 'same')
    const second = image('a.jpg', 'same')
    const [a, b] = await Promise.all([registry.claim(first), registry.claim(second)])
    expect([a, b]).toEqual([true, false])
    tasksRef.current = [task(first)]
    registry.settle()
    expect(await registry.claim(second)).toBe(false)
  })

  it('不同路径和文件名的相同内容只保留一份，不同内容可加入', async () => {
    const tasksRef = { current: [] as ImageTask[] }
    const registry = createImageImportRegistry(tasksRef)
    const first = image('a.jpg', 'same', 'folder-a/a.jpg')
    const otherPath = image('b.jpg', 'same', 'folder-b/b.jpg')
    const different = image('c.jpg', 'else', 'folder-c/c.jpg')
    expect(await registry.claim(first)).toBe(true)
    tasksRef.current = [task(first)]
    registry.settle()
    expect(await registry.claim(otherPath)).toBe(false)
    expect(await registry.claim(different)).toBe(true)
    tasksRef.current = []
    expect(await registry.claim(otherPath)).toBe(true)
  })
})
