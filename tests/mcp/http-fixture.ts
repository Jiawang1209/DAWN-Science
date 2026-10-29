import { createServer, type ServerResponse } from 'node:http'
import type { McpServer } from '../../src/config/schema.js'

/** Stateful loopback fixture: no external services, and writes can lose their reply. */
export async function mcpHttpFixture(mode: 'http' | 'sse' = 'http', streaming: boolean | string = false) {
  let generations = 0, expireNext = false, catalogChanged = false
  let events: ServerResponse | undefined
  let sharedPendingId: unknown
  const sharedPendingIds: unknown[] = []
  const pending = new Map<string, ServerResponse>()
  const resumable = new Map<string, unknown>()
  let resumed = 0
  const calls: string[] = [], cancelled: string[] = [], closedWaits: string[] = []
  const server = createServer((req, res) => {
    if (req.method === 'GET' && mode === 'http' && typeof streaming === 'string' && streaming.startsWith('shared')) {
      events = res
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      if (req.headers['last-event-id']) {
        resumed++
        res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: sharedPendingId, result: { content: [{ type: 'text', text: 'shared resumed receipt' }] } })}\n\n`)
      } else res.write(`id: shared-token\nretry: 1\nevent: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'working' } })}\n\n`)
      return
    }
    if (req.method === 'GET' && mode === 'http' && req.headers['last-event-id']) {
      const token = String(req.headers['last-event-id'])
      if (!resumable.has(token)) { res.writeHead(404).end(); return }
      resumed++
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const id = resumable.get(token)
      if (streaming === 'resume-empty') res.end(`id: ${token}\nretry: 1\nevent: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'still working' } })}\n\n`)
      else if (streaming === 'resume-no-id') res.end(': no progress\n\n')
      else if (streaming === 'resume-hold') {
        pending.set(String(id), res)
        res.on('close', () => { closedWaits.push(`resume-${id}`); pending.delete(String(id)) })
        res.write(': resumed\n\n')
      } else res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'resumed receipt' }] } })}\n\n`)
      return
    }
    if (req.method === 'GET' && mode === 'sse') {
      events = res
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write('event: endpoint\ndata: /messages\n\n')
      return
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const message = JSON.parse(body)
      const id = String(message.id)
      const reply = (result: unknown) => {
        const response = JSON.stringify({ jsonrpc: '2.0', id: message.id, result })
        if (mode === 'sse') { events?.write(`event: message\ndata: ${response}\n\n`); res.writeHead(202).end() }
        else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(response) }
      }
      if (message.method === 'initialize') {
        generations++
        if (mode === 'http') res.setHeader('mcp-session-id', `fixture-${generations}`)
        reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'loopback-fixture', version: '1' } })
      } else if (message.method === 'tools/list') {
        reply({ tools: ['echo', 'hold', 'write', 'error'].map(name => ({ name,
          inputSchema: { type: 'object', ...(catalogChanged ? { properties: { execute: { type: 'boolean' } } } : {}) },
          annotations: { readOnlyHint: !catalogChanged },
        })) })
      } else if (message.method === 'tools/call') {
        const name = message.params.name
        calls.push(name)
        if (name === 'error') {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(`id: failed-receipt\nretry: 1\nevent: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'working' } })}\n\nevent: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'invalid tool arguments' } })}\n\n`)
          return
        }
        if (name === 'write' && expireNext) { expireNext = false; res.writeHead(404).end('Session expired after accepting operation'); return }
        if (name === 'hold') {
          if (typeof streaming === 'string' && streaming.startsWith('shared')) { sharedPendingId = message.id; sharedPendingIds.push(message.id); res.writeHead(202).end(); return }
          pending.set(id, res)
          res.on('close', () => { closedWaits.push(id); pending.delete(id) })
          if (mode === 'sse') res.writeHead(202).end()
          else if (streaming) {
            res.writeHead(200, { 'content-type': typeof streaming === 'string' && !streaming.startsWith('resume') ? streaming : 'text/event-stream' })
            res.write(': stream ready\n\n')
            if (typeof streaming === 'string' && streaming.startsWith('resume')) {
              const token = `receipt-${id}`
              resumable.set(token, message.id)
              const priming = `id: ${token}\nretry: 1\nevent: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'working' } })}\n\n`
              if (streaming === 'resume-broken') res.write(priming)
              else res.end(priming)
            }
          }
          return
        }
        reply({ content: [{ type: 'text', text: name }], structuredContent: { generation: generations } })
      } else {
        if (message.method === 'notifications/cancelled') cancelled.push(String(message.params.requestId))
        res.writeHead(202).end()
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const config = { type: mode, url: `http://127.0.0.1:${port}/${mode === 'sse' ? 'sse' : 'mcp'}` } satisfies McpServer
  return {
    config, calls, cancelled, closedWaits,
    generations: () => generations,
    resumed: () => resumed,
    expireNextWrite: () => { expireNext = true },
    changeCatalog: () => { catalogChanged = true },
    endWaits: () => { for (const res of pending.values()) res.end() },
    breakWaits: () => { for (const res of pending.values()) res.destroy() },
    breakEvents: () => events?.destroy(),
    endEvents: () => events?.end(),
    eventsOpen: () => !!events,
    completeFirstSharedAndEnd: () => {
      events?.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: sharedPendingIds[0], result: { content: [{ type: 'text', text: 'first receipt' }] } })}\n\n`)
    },
    close: async () => {
      events?.end()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
