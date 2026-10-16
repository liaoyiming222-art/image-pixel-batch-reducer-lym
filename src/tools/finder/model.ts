export interface NameRow { id: string; name: string }
export interface ImageEntry { id: string; name: string; path: string; read: () => Promise<File> }
export interface WorkbookSheet { name: string; rows: string[][] }
export interface MatchResult { row: NameRow; matches: ImageEntry[]; candidates: ImageEntry[] }
const extension = /\.(?:jpe?g|png|webp|tiff?|bmp|gif|heic|heif|avif)$/i
export const isImageName = (name: string) => extension.test(name)
export const nameKey = (name: string) => name.normalize('NFC').trim().toLowerCase()
const stem = (name: string) => nameKey(name).replace(extension, '')

export function prepareNames(names: string[]) {
  const seen = new Set<string>(); const rows: NameRow[] = []; let duplicates = 0
  for (const source of names) {
    const name = source.trim(); const key = nameKey(name)
    if (!key) continue
    if (seen.has(key)) { duplicates++; continue }
    seen.add(key); rows.push({ id: crypto.randomUUID(), name })
  }
  return { rows, duplicates }
}

export function matchNames(rows: NameRow[], files: ImageEntry[]): MatchResult[] {
  const full = new Map<string, ImageEntry[]>(); const base = new Map<string, ImageEntry[]>()
  for (const file of files) {
    for (const [index, key] of [[full, nameKey(file.name)], [base, stem(file.name)]] as const) {
      const group = index.get(key); if (group) group.push(file); else index.set(key, [file])
    }
  }
  return rows.map(row => {
    const matches = (isImageName(row.name) ? full.get(nameKey(row.name)) : base.get(stem(row.name))) ?? []
    const key = stem(row.name)
    // A similar name is never selected automatically.
    const candidates = matches.length || key.length < 3 ? [] : files.filter(file => {
      const other = stem(file.name)
      return other.length >= 3 && (other.includes(key) || key.includes(other))
    }).slice(0, 20)
    return { row, matches, candidates }
  })
}

export function resolvedFile(result: MatchResult, choice?: string) {
  return choice ? [...result.matches, ...result.candidates].find(file => file.id === choice)
    : result.matches.length === 1 ? result.matches[0] : undefined
}
export function selectedFiles(results: MatchResult[], choices: Record<string, string>, excluded: Set<string>) {
  const selected = new Map<string, ImageEntry>()
  for (const result of results) {
    const file = resolvedFile(result, choices[result.row.id])
    if (file && !excluded.has(result.row.id)) selected.set(file.id, file)
  }
  return [...selected.values()]
}
export function archivePath(path: string, used: Set<string>) {
  const clean = path.replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..')
    .map(part => part.replace(/[<>:"|?*\u0000-\u001f]/g, '_')).join('/') || '图片'
  let value = clean; let n = 2
  while (used.has(value.toLowerCase())) {
    const dot = clean.lastIndexOf('.'); const slash = clean.lastIndexOf('/')
    value = dot > slash ? `${clean.slice(0, dot)} (${n++})${clean.slice(dot)}` : `${clean} (${n++})`
  }
  used.add(value.toLowerCase()); return value
}
export function columnLabel(index: number) {
  let label = ''; let n = index + 1
  while (n) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26) }
  return label
}
export function detectColumn(rows: string[][]) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const column = rows[r].findIndex(value => /^(图名称|图片名称|图名|图片名|文件名称|文件名)$/.test(value?.replace(/\s/g, '') ?? ''))
    if (column >= 0) return { column, start: r + 1 }
  }
  return { column: 0, start: 0 }
}
export async function readWorkbook(data: ArrayBuffer): Promise<WorkbookSheet[]> {
  const { default: readExcelFile } = await import('read-excel-file/browser')
  try {
    const sheets = await readExcelFile(data, { parseNumber: value => value, trim: false })
    return sheets.map(sheet => ({ name: sheet.sheet, rows: sheet.data.map(row => row.map(value =>
      value == null ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : String(value))) }))
  } catch { throw new Error('无法读取表格。请使用未加密的 .xlsx 文件，或复制图名后粘贴。') }
}
