import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'

const CANCEL_REASON = 'DAWN_MCP_REQUEST_FINISHED'
export const isMcpFetchCancellation = (error: Error): boolean => error.message.includes(CANCEL_REASON)

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
    if (typeof init?.body === 'string') {
      try {
        const message = JSON.parse(init.body)
        if (message.method === 'tools/call' && typeof message.id === 'string') id = message.id
      } catch { /* Initialization, notifications and SSE keep their original lifetime. */ }
    }
    const token = init?.method?.toUpperCase() === 'GET' ? new Headers(init.headers).get('last-event-id') : undefined
    const active = id ? this.active.get(id) : token ? this.resumable.get(token) : undefined
    // Only suppress our cancelled/completed request tokens. Unknown tokens may
    // belong to the SDK's independent shared GET stream (including HTTP 202 calls).
    if (token && this.retiredTokens.delete(token)) return new Response(null, { status: 405 })
    if (!active) return fetch(input, init)
    if (token && ++active.resumeAttempts > 2) throw new Error('MCP 响应续传未取得进展，结果未知；不会重新发送工具调用。')
    const signal = init?.signal ? AbortSignal.any([active.controller.signal, init.signal]) : active.controller.signal
    const response = await fetch(input, { ...init, signal })
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) return response
    const reader = response.body.getReader()
    const tokenVersion = active.tokenVersion
    // SDK send() returns before a POST SSE result; observe EOF as well as errors.
    // Yield one event-loop turn so the SDK's parser drains its final queued bytes.
    const lost = () => setImmediate(() => {
      // A server-issued event id permits the SDK to resume a response via GET;
      // it never permits another tools/call POST. All reads share this caller's abort.
      if (this.active.get(active.id) === active && (!active.latestToken || (token && active.tokenVersion === tokenVersion))) active.lost()
    })
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read()
          if (chunk.done) { controller.close(); lost() }
          else controller.enqueue(chunk.value)
        } catch (error) { controller.error(error); lost() }
      },
      async cancel(reason) { await reader.cancel(reason) },
    })
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}
