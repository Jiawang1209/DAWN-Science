import { createServer, type RequestListener } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { McpRequestFetch } from '../../src/mcp/request-fetch.js'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { await Promise.all(cleanup.splice(0).map(fn => fn())) })
async function server(handler: RequestListener) {
  const s = createServer(handler)
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r))
  cleanup.push(() => new Promise<void>((r, reject) => { s.closeAllConnections(); s.close(e => e ? reject(e) : r()) }))
  return `http://127.0.0.1:${(s.address() as {port:number}).port}`
}
it('跨源重定向不会把自定义密钥或请求正文发往另一个服务', async () => {
  let received = false
  const other = await server((_req, res) => { received = true; res.end('leaked') })
  const origin = await server((_req, res) => { res.writeHead(307, { location: other }); res.end() })
  const f = new McpRequestFetch()
  await expect(f.fetch(origin, { method:'POST', headers:{'X-API-Key':'test-secret'}, body:'private-tool-arguments' })).rejects.toThrow(/重定向|redirect/i)
  expect(received).toBe(false)
})
it('同源307保留自定义认证头和正文', async () => {
  const origin = await server((req, res) => {
    if (req.url === '/') { res.writeHead(307, {location:'/rpc'}); res.end(); return }
    let body = ''; req.on('data', chunk => body += chunk)
    req.on('end', () => res.end(`${req.headers['x-api-key']}:${body}`))
  })
  const response = await new McpRequestFetch().fetch(origin, {method:'POST', headers:{'X-API-Key':'test-secret'}, body:'arguments'})
  expect(await response.text()).toBe('test-secret:arguments')
})
