export interface DirectoryHandle { name: string; getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle> }
interface Row { id: string; folder: string }
export async function createDirectories(handle: DirectoryHandle, rows: Row[], aigc: boolean, update: (id: string, status: string) => void) {
  const counts = { count: rows.length, created: 0, children: 0, completedExisting: 0, existing: 0, duplicate: 0, failed: 0 }
  const seen = new Set<string>()
  for (const row of rows) {
    const key = row.folder.toLocaleLowerCase()
    if (!key || seen.has(key)) { counts.duplicate++; update(row.id, '名称重复，已跳过'); continue }
    seen.add(key)
    try {
      let parent: DirectoryHandle; let created = false; let addedChildren = 0
      try { parent = await handle.getDirectoryHandle(row.folder) }
      catch (error) { if ((error as DOMException).name !== 'NotFoundError') throw error; parent = await handle.getDirectoryHandle(row.folder, { create: true }); created = true; counts.created++ }
      if (aigc) for (const name of ['AI', '原图']) {
        try { await parent.getDirectoryHandle(name) }
        catch (error) { if ((error as DOMException).name !== 'NotFoundError') throw error; await parent.getDirectoryHandle(name, { create: true }); addedChildren++; counts.children++ }
      }
      if (created) update(row.id, '创建成功')
      else if (addedChildren) { counts.completedExisting++; update(row.id, '已存在，子文件夹已补齐') }
      else { counts.existing++; update(row.id, '已存在，已跳过') }
    } catch { counts.failed++; update(row.id, '创建失败') }
  }
  return counts
}
