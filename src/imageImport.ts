import type { MutableRefObject } from 'react'
import type { ImageTask } from './types'

export const imageFileKey = (file: File) => `${file.webkitRelativePath || file.name}\u0000${file.size}\u0000${file.lastModified}`

export function createImageImportRegistry(tasksRef: MutableRefObject<ImageTask[]>) {
  const pending = new Map<File, { key: string }>()
  const digests = new WeakMap<File, Promise<string>>()
  const digest = (file: File) => {
    let value = digests.get(file)
    if (!value) {
      value = file.arrayBuffer().then(buffer => crypto.subtle.digest('SHA-256', buffer)).then(hash =>
        Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''))
      digests.set(file, value)
    }
    return value
  }
  return {
    async claim(file: File) {
      const key = imageFileKey(file)
      const existing = tasksRef.current.map(task => task.file)
      const others = [...pending.entries()].filter(([other]) => other !== file)
      if (pending.has(file) || existing.some(other => imageFileKey(other) === key) || others.some(([, entry]) => entry.key === key)) return false
      pending.set(file, { key })
      try {
        const sameSize = existing.filter(other => other.size === file.size)
        const pendingSameSize = others.filter(([other]) => other.size === file.size)
        if (sameSize.length || pendingSameSize.length) {
          const [hash, ...otherHashes] = await Promise.all([digest(file), ...sameSize.map(digest), ...pendingSameSize.map(([other]) => digest(other))])
          if (otherHashes.includes(hash)) { pending.delete(file); return false }
        }
        return true
      } catch (error) { pending.delete(file); throw error }
    },
    release(file: File) { pending.delete(file) },
    settle() {
      for (const file of pending.keys()) if (tasksRef.current.some(task => task.file === file)) pending.delete(file)
    },
  }
}
