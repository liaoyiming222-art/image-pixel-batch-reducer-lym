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
