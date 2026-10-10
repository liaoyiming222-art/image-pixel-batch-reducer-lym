import { equalSecret, issueSession } from '../../lib/auth'
import { json, sameOrigin, type Context } from '../../lib/db'
export async function onRequestPost({ request, env }: Context) {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403)
  if (!env.ADMIN_PASSWORD || !env.AUTH_SECRET || !env.DB) return json({ error: '请先配置数据库和后台登录密钥。' }, 503)
  if (Number(request.headers.get('Content-Length') || 0) > 2048) return json({ error: 'body' }, 413)
  // One shared budget keeps login attempts bounded even if a visitor changes IP.
  const window = Math.floor(Date.now() / 60000); const key = `login:${window}`
  await env.DB.prepare('INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key, window).run()
  const row = await env.DB.prepare('SELECT count FROM rate_limits WHERE key=?').bind(key).first<{ count: number }>()
  if ((row?.count || 0) > 10) return json({ error: '尝试过于频繁，请稍后再试。' }, 429)
  let password = ''
  try { const text = await request.text(); if (text.length > 2048) return json({ error: 'body' }, 413); const body = JSON.parse(text); if (typeof body.password === 'string') password = body.password } catch { return json({ error: 'body' }, 400) }
  if (!await equalSecret(password, env.ADMIN_PASSWORD)) return json({ error: '密码不正确。' }, 401)
  const response = json({ ok: true })
  response.headers.set('Set-Cookie', `pf_admin=${await issueSession(env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`)
  return response
}
