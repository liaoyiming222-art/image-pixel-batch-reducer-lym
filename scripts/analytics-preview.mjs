import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const upstream = 'https://pixelflow-image-tools.pages.dev'
const port = Number(process.env.PIXELFLOW_PREVIEW_PORT || 8788)
const localOrigin = `http://127.0.0.1:${port}`
let adminSession = '', sessionExpires = 0, signingIn
async function session(force = false) {
  if (!force && adminSession && Date.now() < sessionExpires) return adminSession
  if (signingIn) return signingIn
  signingIn = (async () => {
    const { ADMIN_PASSWORD } = JSON.parse(fs.readFileSync(path.join(root, 'analytics-cloudflare.local.json'), 'utf8'))
    const result = await fetch(upstream + '/api/admin/login', { method: 'POST', headers: { Origin: upstream, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PASSWORD }), signal: AbortSignal.timeout(15000), redirect: 'error' })
    const cookie = result.headers.get('Set-Cookie')?.split(';')[0]
    if (!result.ok || !cookie) throw new Error('Local authentication failed')
    adminSession = cookie; sessionExpires = Date.now() + 7 * 3600000
    return cookie
  })()
  try { return await signingIn } finally { signingIn = undefined }
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  try {
    const url = new URL(request.url || '/', localOrigin)
    if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403); response.end('Host not allowed'); return }
    if (url.pathname.startsWith('/api/')) {
      // Only the protected admin API is proxied. Local previews never write product events.
      if (!['/api/admin/stats','/api/admin/users','/api/admin/time-savings'].includes(url.pathname)) { response.writeHead(403); response.end('{"error":"此接口未开放。"}'); return }
      if (request.headers.origin && request.headers.origin !== localOrigin) { response.writeHead(403); response.end('Origin not allowed'); return }
      const chunks = []; let length = 0
      for await (const chunk of request) { length += chunk.length; if (length > 4096) { response.writeHead(413); response.end('Body too large'); return } chunks.push(chunk) }
      const headers = { Origin: upstream, 'Content-Type': 'application/json' }
      headers.Cookie = await session()
      const forward = () => fetch(upstream + url.pathname + url.search, { method: request.method, headers, body: ['POST','PUT','PATCH'].includes(request.method) ? Buffer.concat(chunks) : undefined, signal: AbortSignal.timeout(30000), redirect: 'error' })
      let remote = await forward()
      if (remote.status === 401) { await remote.arrayBuffer(); headers.Cookie = await session(true); remote = await forward() }
      response.statusCode = remote.status
      response.setHeader('Content-Type', remote.headers.get('Content-Type') || 'application/json; charset=utf-8')
      response.end(Buffer.from(await remote.arrayBuffer())); return
    }
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end('Method not allowed'); return }
    let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname))
    if (!file.startsWith(dist + path.sep) && file !== dist) { response.writeHead(403); response.end('Invalid path'); return }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (path.extname(url.pathname)) { response.writeHead(404); response.end('Not found'); return }
      file = path.join(dist, 'index.html')
    }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
    response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(file))
  } catch { response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: '暂时无法连接线上统计服务，请稍后刷新。' })) }
})
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `预览已在 ${localOrigin}/admin 运行，无需重复启动。` : error.message)
  process.exitCode = error.code === 'EADDRINUSE' ? 0 : 1
})
server.listen(port, '127.0.0.1', () => console.log(`统计预览：${localOrigin}/admin\n本地自动验证，数据来自线上 D1。`))
