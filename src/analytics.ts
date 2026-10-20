import type { SavingTool } from '../shared/time-savings'
type Tool = 'app' | SavingTool
type Props = Record<string, number | string | boolean>
interface Event { site?:string; id: string; user: string; session: string; task: string; name: string; tool: Tool; at: number; version: string; props: Props }
const USER_KEY = 'pixelflow.analytics.user.v1'
const SESSION_KEY = 'pixelflow.analytics.session.v1'
const QUEUE_KEY = 'pixelflow.analytics.queue.v1'
const siteId=()=>({'pixelflow-image-tools.pages.dev':'pixelflow-image-tools','pixelfloweverybody.pages.dev':'pixelfloweverybody'} as Record<string,string>)[location.hostname]
const enabled = () => { if(!import.meta.env.PROD || !siteId() || location.pathname.startsWith('/admin')) return false;try{return localStorage.getItem('pixelflow.analytics.disabled')!=='1'}catch{return true} }
let memoryUser = ''
let queue: Event[] = []
let loaded = false
let sending = false
let retry = 0
let timer: ReturnType<typeof setTimeout> | undefined
let initialized = false
let memorySession = { id: '', last: 0 }
export const newTaskId = () => crypto.randomUUID()
function persist() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-100))) } catch { /* storage may be unavailable */ } }
function identity() {
  let user = memoryUser || crypto.randomUUID()
  try { user = localStorage.getItem(USER_KEY) || user; localStorage.setItem(USER_KEY, user) } catch { /* use page-local identity */ }
  memoryUser = user
  let session = Date.now() - memorySession.last < 30 * 60 * 1000 && memorySession.id ? memorySession : { id: crypto.randomUUID(), last: 0 }
  try { const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); if (saved && Date.now() - saved.last < 30 * 60 * 1000 && Date.now() >= saved.last) session = saved } catch { /* fresh session */ }
  session.last = Date.now()
  memorySession = session
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* optional */ }
  return { user, session: session.id }
}
export function track(name: string, tool: Tool, props: Props = {}, task = '') {
  try {
    if (!enabled()) return
    if (!loaded) { loaded = true; try { const saved = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); if (Array.isArray(saved)) queue = saved.filter(e => Date.now() - e.at < 24 * 60 * 60 * 1000).slice(-100) } catch { /* empty queue */ } }
    queue=queue.filter(e=>(e.site||'pixelflow-image-tools')===siteId())
    queue.push({ site:siteId(),id: crypto.randomUUID(), ...identity(), task, name, tool, at: Date.now(), version: 'analytics-v1', props })
    queue = queue.slice(-100); persist(); retry = 0
    if (!timer) timer = setTimeout(() => { timer = undefined; void flush() }, 300)
  } catch { /* analytics must never interrupt local tools */ }
}
async function flush() {
  try { if (!enabled()) return } catch { return }
  if (sending || !queue.length) return
  sending = true
  const batch = queue.slice(0, 20)
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    let response: Response
    try { response = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }), keepalive: true, signal: controller.signal }) } finally { clearTimeout(timeout) }
    if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
      const ids = new Set(batch.map(e => e.id)); queue = queue.filter(e => !ids.has(e.id)); persist(); retry = 0
    } else retry++
  } catch { retry++ } finally { sending = false }
  if (queue.length && retry <= 3) timer = setTimeout(() => { timer = undefined; void flush() }, retry ? 3000 * 2 ** retry : 1500)
}
export function initializeAnalytics() {
  if (initialized || location.pathname.startsWith('/admin')) return
  initialized = true
  track('page_view', 'app')
  const touch = () => { try { if (enabled()) identity() } catch { /* optional */ } }
  window.addEventListener('pointerdown', touch, { passive: true })
  window.addEventListener('keydown', touch, { passive: true })
  window.addEventListener('online', () => { retry = 0; void flush() })
  window.addEventListener('pagehide', () => {
    if (!queue.length) return
    try { if (enabled()) navigator.sendBeacon('/api/events', new Blob([JSON.stringify({ events: queue.slice(0, 20) })], { type: 'application/json' })) } catch { /* persisted for later retry; server deduplicates */ }
  })
}
const inspected = new Set<string>()
export function trackInspection(ids: string[], tool: 'compress' | 'inspect' = 'inspect') {
  const fresh = ids.filter(id => !inspected.has(id))
  fresh.forEach(id => inspected.add(id))
  if (fresh.length) track('inspection_finished', tool, { count: fresh.length }, newTaskId())
}
export function trackTimeSaving(tool: SavingTool, count: number, task: string = newTaskId()) {
  if (Number.isSafeInteger(count) && count > 0) track('time_saving_completed', tool, { count }, task)
}
// These identifiers stay in browser memory; only an anonymous quantity is sent.
export function createTimeSavingCounter(tool: SavingTool) {
  const seen = new Set<string>()
  return { record(ids: string[]) { const fresh = [...new Set(ids)].filter(id => !seen.has(id));fresh.forEach(id => seen.add(id));trackTimeSaving(tool,fresh.length) }, reset() { seen.clear() } }
}
const inspectionValue = createTimeSavingCounter('inspect')
export const trackInspectionValue = (ids: string[]) => inspectionValue.record(ids)
