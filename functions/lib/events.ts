const numeric = ['count', 'added', 'duplicate', 'invalid', 'failed', 'success', 'skipped', 'qualified', 'duration', 'created', 'children', 'completedExisting', 'existing', 'outputs', 'pending']
const allowed: Record<string, string[]> = {
  page_view: [], tool_open: [], image_import_finished: ['added', 'duplicate', 'invalid', 'failed'],
  image_process_started: ['count', 'mode'], image_process_finished: ['count', 'success', 'skipped', 'failed', 'qualified', 'pending', 'duration', 'mode'],
  inspection_finished: ['count'], output_action: ['kind', 'count', 'outputs'],
  folder_create_started: ['count', 'mode'], folder_create_finished: ['count', 'created', 'children', 'completedExisting', 'existing', 'duplicate', 'failed', 'duration', 'mode'],
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export interface Event { site?:string; id: string; user: string; session: string; task: string; name: string; tool: string; at: number; version: string; props: Record<string, number | string> }
export function validateEvent(input: unknown, now = Date.now()): Event | null {
  if (!input || typeof input !== 'object') return null
  const e = input as Event
  if (['id','user','session','task','name','tool','version'].some(key => typeof (e as unknown as Record<string,unknown>)[key] !== 'string')) return null
  if (!uuid.test(e.id) || !uuid.test(e.user) || !uuid.test(e.session) || (e.task !== '' && !uuid.test(e.task))) return null
  if (!Object.hasOwn(allowed, e.name) || !['app', 'compress', 'inspect', 'folders'].includes(e.tool) || e.version !== 'analytics-v1') return null
  if(e.site!==undefined&&(typeof e.site!=='string'||!/^[a-z0-9-]{1,64}$/.test(e.site)))return null
  if (Object.keys(e).some(key => !['site','id','user','session','task','name','tool','at','version','props'].includes(key))) return null
  if (e.name === 'tool_open' && e.tool === 'app') return null
  if (e.name === 'output_action' && !['compress','inspect'].includes(e.tool)) return null
  if (!Number.isInteger(e.at) || e.at > now + 5 * 60000 || e.at < now - 48 * 3600000) return null
  if ((e.name === 'page_view' && e.tool !== 'app') || (e.name.startsWith('folder_') && e.tool !== 'folders') || (e.name === 'inspection_finished' && e.tool !== 'inspect') || (e.name.startsWith('image_') && !['compress', 'inspect'].includes(e.tool))) return null
  if (!e.props || typeof e.props !== 'object' || Array.isArray(e.props)) return null
  for (const [key, value] of Object.entries(e.props)) {
    if (!allowed[e.name].includes(key)) return null
    if (numeric.includes(key) && (!Number.isInteger(value) || Number(value) < 0 || Number(value) > (key === 'duration' ? 86400000 : 1000000))) return null
    if (key === 'mode' && !['over', 'convert', 'none', 'normal', 'aigc'].includes(String(value))) return null
    if (key === 'kind' && !['copy', 'csv', 'single', 'zip', 'group', 'groups'].includes(String(value))) return null
  }
  const required = allowed[e.name].filter(key => key !== 'mode')
  if (required.some(key => !Object.hasOwn(e.props, key))) return null
  if (['image_process_started','folder_create_started','inspection_finished','output_action'].includes(e.name) && Number(e.props.count) <= 0) return null
  if (e.name === 'output_action' && Number(e.props.outputs) <= 0) return null
  if (e.name.endsWith('_started') || e.name === 'image_process_finished' || e.name === 'folder_create_finished') { if (!uuid.test(e.task)) return null }
  if (e.name === 'image_process_finished' && Number(e.props.success) + Number(e.props.skipped) + Number(e.props.failed) + Number(e.props.pending) !== e.props.count) return null
  if (e.name === 'image_process_finished' && Number(e.props.qualified) > Number(e.props.success)) return null
  return e
}
export function effective(e: Event) {
  return (e.name === 'inspection_finished' && Number(e.props.count) > 0) || (e.name === 'output_action' && e.tool === 'compress' && Number(e.props.count) > 0) || (e.name === 'folder_create_finished' && Number(e.props.created) + Number(e.props.children) > 0) ? 1 : 0
}
export function metrics(e: Pick<Event, 'name' | 'props'>): Record<string, number> {
  const p = e.props; const n = (key: string) => Number(p[key] || 0)
  switch (e.name) {
    case 'page_view': return { pageviews: 1 }
    case 'image_import_finished': return { imported: n('added'), import_failed: n('failed'), duplicates: n('duplicate'), unsupported: n('invalid') }
    case 'image_process_started': return { process_tasks: 1 }
    case 'image_process_finished': return { completed_tasks: n('pending') === 0 ? 1 : 0, interrupted_tasks: n('pending') > 0 ? 1 : 0, pending: n('pending'), processed: n('success'), skipped: n('skipped'), process_failed: n('failed'), qualified: n('qualified') }
    case 'inspection_finished': return { inspected: n('count') }
    case 'output_action': return { exports: 1, [`export_${p.kind}`]: 1, output_files: n('count') }
    case 'folder_create_started': return { folder_tasks: 1 }
    case 'folder_create_finished': return { completed_folder_tasks: 1, folders: n('created'), subfolders: n('children'), completed_existing: n('completedExisting'), folder_failed: n('failed'), folder_existing: n('existing'), folder_duplicates: n('duplicate') }
    default: return {}
  }
}
