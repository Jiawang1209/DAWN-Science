import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'

const CANCEL_REASON = 'DAWN_MCP_REQUEST_FINISHED'
export const isMcpFetchCancellation = (error: Error): boolean => error.message.includes(CANCEL_REASON)

/** Retain same-origin MCP redirects, never forward credentials or RPC bodies to another origin. */
export const mcpSafeFetch: FetchLike = async (input, init) => {
  let request = new Request(input, init)
  for (let hop = 0; ; hop++) {
    // Keep a clone before fetch consumes the body, for a same-origin 307/308.
    const next = request.clone()
    const response = await fetch(request, { redirect: 'manual' })
    const location = response.headers.get('location')
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return response
    const url = new URL(location, request.url)
    await response.body?.cancel()
    if (url.origin !== new URL(request.url).origin || url.username || url.password) throw new Error('MCP 拒绝跨源重定向；请配置服务的最终 URL')
    if (hop >= 19) throw new Error('MCP 重定向次数过多')
    const method = next.method
    if ((response.status === 303 && method !== 'GET' && method !== 'HEAD') || ([301,302].includes(response.status) && method === 'POST')) {
      const headers = new Headers(next.headers)
      for (const name of ['content-type','content-length','content-encoding','content-language','content-location']) headers.delete(name)
      request = new Request(url, { method:'GET', headers, signal:next.signal })
    } else request = new Request(url, next)
  }
}

interface ActiveRequest {
  id: string
  controller: AbortController
  lost: () => void
  latestToken?: string
  resumeAttempts: number
  tokenVersion: number
}

/** HTTP request cancellation must not abort a transport's shared SSE session. */
export class McpRequestFetch {
  private readonly active = new Map<string, ActiveRequest>()
  private readonly resumable = new Map<string, ActiveRequest>()
  private readonly retiredTokens = new Set<string>()
  private readonly routes = new Map<string | number, { dedicated: boolean }>()
  private readonly sharedStreams = new Set<{ receivedResponse: boolean }>()
  onSharedResponseEnd?: () => void

  noteResponse(id: string | number): void {
    if (!this.routes.get(id)?.dedicated) {
      for (const stream of this.sharedStreams) stream.receivedResponse = true
    }
    this.routes.delete(id)
  }

  begin(id: string, lost: () => void): void { this.active.set(id, { id, controller: new AbortController(), lost, resumeAttempts: 0, tokenVersion: 0 }) }
  rememberToken(id: string, token: string): void {
    const active = this.active.get(id)
    if (!active) return
    if (active.latestToken !== token) {
      active.resumeAttempts = 0
      if (active.latestToken) this.resumable.delete(active.latestToken)
    }
    active.latestToken = token
    active.tokenVersion++
    this.resumable.set(token, active)
  }
  end(id: string, retireToken: boolean): void {
    const active = this.active.get(id)
    this.active.delete(id)
    this.routes.delete(id)
    if (active?.latestToken) {
      this.resumable.delete(active.latestToken)
      if (retireToken) this.retiredTokens.add(active.latestToken)
    }
    // A result can arrive before EOF. Release only this POST reader, including
    // the SDK's detached text/event-stream reader, without resetting the session.
    active?.controller.abort(new Error(CANCEL_REASON))
  }

  readonly fetch: FetchLike = async (input, init) => {
    let id: string | undefined
    let rpcId: string | number | undefined
    let route: { dedicated: boolean } | undefined
    if (typeof init?.body === 'string') {
      try {
        const message = JSON.parse(init.body)
        if (message.method === 'tools/call' && typeof message.id === 'string') id = message.id
        if (typeof message.method === 'string' && (typeof message.id === 'string' || typeof message.id === 'number')) {
          rpcId = message.id
          route = { dedicated: false }
          this.routes.set(rpcId!, route)
        }
      } catch { /* Initialization, notifications and SSE keep their original lifetime. */ }
    }
    const token = init?.method?.toUpperCase() === 'GET' ? new Headers(init.headers).get('last-event-id') : undefined
    const active = id ? this.active.get(id) : token ? this.resumable.get(token) : undefined
    // Only suppress our cancelled/completed request tokens. Unknown tokens may
    // belong to the SDK's independent shared GET stream (including HTTP 202 calls).
    if (token && this.retiredTokens.delete(token)) return new Response(null, { status: 405 })
    if (active && token && ++active.resumeAttempts > 2) throw new Error('MCP 响应续传未取得进展，结果未知；不会重新发送工具调用。')
    const signal = active ? (init?.signal ? AbortSignal.any([active.controller.signal, init.signal]) : active.controller.signal) : init?.signal
    const response = await mcpSafeFetch(input, { ...init, ...(signal ? { signal } : {}) })
    if (route && rpcId !== undefined && this.routes.get(rpcId) === route) route.dedicated = response.status !== 202
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) return response
    const shared = !active && init?.method?.toUpperCase() === 'GET' ? { receivedResponse: false } : undefined
    if (!active && !shared) return response
    if (shared) this.sharedStreams.add(shared)
    const reader = response.body.getReader()
    const tokenVersion = active?.tokenVersion
    // SDK send() returns before a POST SSE result; observe EOF as well as errors.
    // Yield one event-loop turn so the SDK's parser drains its final queued bytes.
    const lost = () => setImmediate(() => {
      // A server-issued event id permits the SDK to resume a response via GET;
      // it never permits another tools/call POST. All reads share this caller's abort.
      if (shared) {
        this.sharedStreams.delete(shared)
        // SDK stops resuming a shared GET after *any* result, even when other
        // HTTP202 calls still wait. Invalidate it so those calls cannot hang.
        if (shared.receivedResponse) this.onSharedResponseEnd?.()
      } else if (active && this.active.get(active.id) === active && (!active.latestToken || (token && active.tokenVersion === tokenVersion))) active.lost()
    })
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read()
          if (chunk.done) { controller.close(); lost() }
          else controller.enqueue(chunk.value)
        } catch (error) {
          // Preserve the SDK's safe GET resumption after a socket failure. An
          // owned POST needs a server-issued token; the shared GET is resumable.
          if (active?.latestToken || shared) controller.close()
          else controller.error(error)
          lost()
        }
      },
      async cancel(reason) { await reader.cancel(reason) },
    })
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}
