import { type Env } from './db'
const encoder = new TextEncoder()
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('')
}
export async function equalSecret(a: string, b: string) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(a)), crypto.subtle.digest('SHA-256', encoder.encode(b))])
  const left = new Uint8Array(x), right = new Uint8Array(y); let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}
export async function issueSession(env: Env) {
  const payload = `${Date.now() + 8 * 3600000}.${crypto.randomUUID()}`
  return `${payload}.${await sign(payload, env.AUTH_SECRET!)}`
}
export async function authorized(request: Request, env: Env) {
  if (!env.ADMIN_PASSWORD || !env.AUTH_SECRET) return false
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)pf_admin=([^;]+)/)?.[1]
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3 || !Number.isFinite(Number(parts[0])) || Number(parts[0]) <= Date.now() || Number(parts[0]) > Date.now() + 8 * 3600000) return false
  return equalSecret(parts[2], await sign(`${parts[0]}.${parts[1]}`, env.AUTH_SECRET))
}
