import { json, sameOrigin, type Context } from '../../lib/db'
export function onRequestPost({ request }: Context) {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403)
  const response = json({ ok: true }); response.headers.set('Set-Cookie', 'pf_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'); return response
}
