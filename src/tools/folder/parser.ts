export function splitTable(text: string) {
  const value = text.replace(/^\ufeff/, '').replace(/[\r\n]+$/g, '')
  if (!value) return []
  const pair = value.match(/需求名称\s*[：:]\s*(.+?)(?:\s*[、，,;；]\s*)具体需求\s*[：:]\s*(.+)/s)
  if (pair && !value.includes('\t')) return [[pair[1].trim(), pair[2].trim()]]
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false
  const finishField = () => { row.push(field.trim()); field = '' }
  const finishRow = () => { finishField(); if (row.some(cell => cell.length)) rows.push(row); row = [] }
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (quoted) { if (char === '"') { if (value[i + 1] === '"') { field += '"'; i += 1 } else quoted = false } else field += char }
    else if (char === '"' && !field) quoted = true
    else if (char === '\t') finishField()
    else if (char === '\r' || char === '\n') { if (char === '\r' && value[i + 1] === '\n') i += 1; finishRow() }
    else field += char
  }
  finishRow(); return rows
}
