export function splitTable(text: string) {
  const value = text.replace(/^\ufeff/, '').replace(/[\r\n]+$/g, '')
  if (!value) return []
  if (!value.includes('\t') && value.trimStart().startsWith('|')) {
    return value.split(/\r?\n/).filter(line => line.trim()).map(line => {
      const content = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
      const cells: string[] = []; let field = ''
      for (let i = 0; i < content.length; i++) {
        if (content[i] === '\\' && content[i + 1] === '|') { field += '|'; i++ }
        else if (content[i] === '|') { cells.push(field.trim()); field = '' }
        else field += content[i]
      }
      cells.push(field.trim())
      return cells.map(cell => cell.replace(/<br\s*\/?\s*>/gi, '\n'))
    }).filter(row => row.some(cell => cell.length) && !row.every(cell => /^:?-+:?$/.test(cell)))
  }
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
