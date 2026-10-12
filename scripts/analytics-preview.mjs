import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const upstream = 'https://pixelflow-image-tools.pages.dev'
const port = Number(process.env.PIXELFLOW_PREVIEW_PORT || 8788)
const localOrigin = `http://127.0.0.1:${port}`
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  try {
    const url = new URL(request.url || '/', localOrigin)
    if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403); response.end('Host not allowed'); return }
    if (url.pathname.startsWith('/api/')) {
      // Only the protected admin API is proxied. Local previews never write product events.
      if (!url.pathname.startsWith('/api/admin/')) { response.writeHead(403); response.end('{"error":"本地预览不采集业务事件。"}'); return }
      if (request.headers.origin && request.headers.origin !== localOrigin) { response.writeHead(403); response.end('Origin not allowed'); return }
      const chunks = []; let length = 0
      for await (const chunk of request) { length += chunk.length; if (length > 4096) { response.writeHead(413); response.end('Body too large'); return } chunks.push(chunk) }
      const headers = { Origin: upstream, 'Content-Type': 'application/json' }
      if (request.headers.cookie) headers.Cookie = request.headers.cookie
      const remote = await fetch(upstream + url.pathname + url.search, { method: request.method, headers, body: ['POST','PUT','PATCH'].includes(request.method) ? Buffer.concat(chunks) : undefined, signal: AbortSignal.timeout(30000), redirect: 'error' })
      response.statusCode = remote.status
      response.setHeader('Content-Type', remote.headers.get('Content-Type') || 'application/json; charset=utf-8')
      const cookie = remote.headers.get('Set-Cookie')
      // The HTTPS upstream keeps Secure cookies; only this loopback HTTP preview omits Secure.
      if (cookie) response.setHeader('Set-Cookie', cookie.replace(/;\s*Secure/ig, ''))
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
server.listen(port, '127.0.0.1', () => console.log(`统计预览：${localOrigin}/admin\n使用原后台密码登录，数据来自线上 D1。`))
