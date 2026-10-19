const invalidWindows = /[<>:"/\\|?*\u0000-\u001f]/g
const reservedWindows = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function safeFolderPart(value: string) {
  let clean = value.trim().replace(invalidWindows, '_').replace(/\s+/g, ' ').replace(/[. ]+$/g, '')
  if (reservedWindows.test(clean)) clean += '_'
  return clean
}

export function creationDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}

export function aigcFolderName(name: string, type: string, date: string) {
  const safeName = safeFolderPart(name); const safeType = safeFolderPart(type)
  return safeName && safeType ? `【AI】${date}-${safeName}-${safeType}` : ''
}
