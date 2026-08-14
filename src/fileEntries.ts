interface DroppedEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
}

interface DroppedFileEntry extends DroppedEntry {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void
}

interface DroppedDirectoryEntry extends DroppedEntry {
  createReader: () => { readEntries: (success: (entries: DroppedEntry[]) => void, error?: (error: DOMException) => void) => void }
}

async function filesFromEntry(entry: DroppedEntry, parentPath = ''): Promise<File[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as DroppedFileEntry).file(resolve, reject))
    Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
    return [file]
  }
  if (!entry.isDirectory) return []
  const reader = (entry as DroppedDirectoryEntry).createReader()
  const children: DroppedEntry[] = []
  while (true) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    children.push(...batch)
  }
  return (await Promise.all(children.map(child => filesFromEntry(child, path)))).flat()
}

export async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items)
  const entries = items.map(item => (item as DataTransferItem & { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry?.()).filter(Boolean) as DroppedEntry[]
  return entries.length ? (await Promise.all(entries.map(entry => filesFromEntry(entry)))).flat() : Array.from(dataTransfer.files)
}
