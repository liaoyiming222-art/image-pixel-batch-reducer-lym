import { beijingDay, json, sameOrigin, type Context } from '../lib/db'
import { effective, validateEvent } from '../lib/events'
import { DEFAULT_SITE,scopedId,type Site } from '../lib/sites'
export async function onRequestPost({ request, env }: Context) {
  const host = new URL(request.url).hostname
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403)
  if (!env.DB) return json({ error: 'not_configured' }, 503)
  let site:Site|null
  try{site=await env.DB.prepare('SELECT * FROM sites WHERE host=? AND enabled=1').bind(host).first<Site>()}catch{return json({error:'not_configured'},503)}
  if(!site)return json({error:'site_origin'},403)
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'content_type' }, 415)
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > 32768) return json({ error: 'too_large' }, 413)
  // Bound the body before parsing, including chunked requests.
  const reader = request.body?.getReader(); if (!reader) return json({ error: 'body' }, 400)
  const chunks: Uint8Array[] = []; let length = 0
  while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 32768) { await reader.cancel(); return json({ error: 'too_large' }, 413) } chunks.push(part.value) }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let body: { events?: unknown[] }
  try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return json({ error: 'json' }, 400) }
  if (!Array.isArray(body?.events) || !body.events.length || body.events.length > 20) return json({ error: 'batch' }, 400)
  const now = Date.now(); const events = body.events.map(e => validateEvent(e, now))
  if (events.some(e => !e)) return json({ error: 'event' }, 400)
  if(events.some(e=>(e!.site||DEFAULT_SITE)!==site!.id))return json({error:'site_mismatch'},403)
  try {
    const window = Math.floor(now / 60000)
    const ip = request.headers.get('CF-Connecting-IP') || 'local'
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${window}:${ip}`))
    const key = site.id+':'+Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    await env.DB.prepare('INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key, window).run()
    const rate = await env.DB.prepare('SELECT count FROM rate_limits WHERE key=?').bind(key).first<{ count: number }>()
    if ((rate?.count || 0) > 120) return json({ error: 'rate_limit' }, 429)
    const statements = events.flatMap(item => {
      const e = item!; const active = effective(e)
      return [
        env.DB.prepare('INSERT OR IGNORE INTO events(id,user_id,session_id,task_id,name,tool,occurred_at,received_at,day,version,props,effective,site_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(scopedId(site!.id,e.id),scopedId(site!.id,e.user),scopedId(site!.id,e.session),e.task,e.name,e.tool,e.at,now,beijingDay(e.at),e.version,JSON.stringify(e.props),active,site!.id),
        env.DB.prepare('INSERT INTO users(id,first_seen,last_seen,first_effective,site_id) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET first_seen=MIN(first_seen,excluded.first_seen),last_seen=MAX(last_seen,excluded.last_seen),first_effective=CASE WHEN first_effective IS NULL THEN excluded.first_effective WHEN excluded.first_effective IS NULL THEN first_effective ELSE MIN(first_effective,excluded.first_effective) END').bind(scopedId(site!.id,e.user),e.at,e.at,active ? e.at : null,site!.id),
        env.DB.prepare('INSERT INTO sessions(id,user_id,first_seen,last_seen,site_id) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen),first_seen=MIN(first_seen,excluded.first_seen)').bind(scopedId(site!.id,e.session),scopedId(site!.id,e.user),e.at,e.at,site!.id),
      ]
    })
    await env.DB.batch(statements)
    return json({ accepted: events.length })
  } catch { return json({ error: 'storage_unavailable' }, 503) }
}
