import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js'
import { safeParse, type AnySchema, type SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { McpError, type ClientRequest, type JSONRPCMessage, type MessageExtraInfo, type Progress } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import { isMcpFetchCancellation, type McpRequestFetch } from './request-fetch.js'

/** A failed send/closed transport has an unknown outcome once dispatch began. */
export class McpConnectionError extends Error {}

export class McpCallCancelled extends Error {
  constructor(readonly dispatched: boolean, reason = 'MCP 调用已取消') {
    super(`${reason}。${dispatched ? '请求已发送，外部操作结果未知；请先核对服务器状态或回执，不要自动重复调用。' : '请求尚未发送。'}`)
  }
}

/** SDK callTool still validates results/output schemas; only its request timer is replaced. */
export class McpClient extends Client {
  readonly channel: Transport
  private readonly calls: ToolCallTransport

  constructor(transport: Transport, requestFetch?: McpRequestFetch) {
    super({ name: 'dawn-science', version: '0.0.1' }, { capabilities: {} })
    this.calls = new ToolCallTransport(transport, requestFetch)
    // SDK transport sessionId declarations differ under exactOptionalPropertyTypes.
    this.channel = this.calls as Transport
  }

  override request<T extends AnySchema>(request: ClientRequest, schema: T, options?: RequestOptions): Promise<SchemaOutput<T>> {
    if (request.method !== 'tools/call' || options?.task || options?.relatedTask) return super.request(request, schema, options)
    return this.calls.call(request, schema, options)
  }
}

interface Pending {
  complete: (message: JSONRPCMessage) => void
  fail: (error: Error) => void
  progress: ((progress: Progress) => void) | undefined
}

/**
 * Public Transport adapter. Own string ids cannot collide with SDK numeric ids.
 * Initialization, discovery, notifications and server requests still go to the SDK.
 * No private SDK state, huge timer sentinel, or transport-wide abort is used.
 */
class ToolCallTransport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void
  private readonly prefix = `dawn-call-${randomUUID()}-`
  private sequence = 0
  private readonly pending = new Map<string, Pending>()
  private closed = false

  constructor(private readonly inner: Transport, private readonly requestFetch?: McpRequestFetch) {
    if (requestFetch) requestFetch.onSharedResponseEnd = () => {
      this.disconnected(new Error('MCP 共享响应流在返回部分结果后结束，剩余请求的结果未知。'))
      void inner.close().catch(() => {})
    }
    inner.onmessage = (message, extra) => {
      if (!('method' in message) && 'id' in message && (typeof message.id === 'string' || typeof message.id === 'number')) this.requestFetch?.noteResponse(message.id)
      if ('id' in message && !('method' in message) && typeof message.id === 'string' && message.id.startsWith(this.prefix)) {
        this.pending.get(message.id)?.complete(message)
        return // discard late results after cancellation
      }
      if ('method' in message && message.method === 'notifications/progress') {
        const token = message.params?.progressToken
        if (typeof token === 'string' && token.startsWith(this.prefix)) {
          const progress = message.params as unknown as Progress
          this.pending.get(token)?.progress?.(progress)
          return
        }
      }
      this.onmessage?.(message, extra)
    }
    inner.onerror = error => {
      if (isMcpFetchCancellation(error) || this.closed) return
      this.onerror?.(error)
      this.disconnected(error)
      void inner.close().catch(() => {})
    }
    inner.onclose = () => this.disconnected()
  }

  // Undefined must stay undefined: the SDK skips initialize for an existing id.
  get sessionId(): string | undefined { return this.inner.sessionId }
  setProtocolVersion(version: string): void { this.inner.setProtocolVersion?.(version) }
  start(): Promise<void> { return this.inner.start() }
  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> { return this.inner.send(message, options) }

  private disconnected(cause?: Error): void {
    if (this.closed) return
    this.closed = true
    for (const pending of [...this.pending.values()]) pending.fail(new McpConnectionError(`MCP 连接已断开，已发送请求的外部结果未知；请核对回执，不要自动重试。${cause ? ` ${cause.message}` : ''}`))
    this.onclose?.()
  }

  async close(): Promise<void> {
    this.disconnected()
    await this.inner.close()
  }

  call<T extends AnySchema>(request: ClientRequest, schema: T, options?: RequestOptions): Promise<SchemaOutput<T>> {
    if (options?.signal?.aborted) return Promise.reject(new McpCallCancelled(false))
    if (this.closed) return Promise.reject(new McpConnectionError('MCP 连接已断开，请求未发送。'))
    return new Promise((resolve, reject) => {
      const id = `${this.prefix}${++this.sequence}`
      let dispatched = false, settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = (retireToken = true) => {
        settled = true
        this.pending.delete(id)
        if (timer !== undefined) clearTimeout(timer)
        options?.signal?.removeEventListener('abort', abort)
        this.requestFetch?.end(id, retireToken)
      }
      const fail = (error: Error) => { if (!settled) { cleanup(); reject(error) } }
      const cancel = (reason?: string) => {
        if (settled) return
        fail(new McpCallCancelled(dispatched, reason))
        if (dispatched && !this.closed) {
          // Best effort only; never wait for a cancellation acknowledgement.
          void this.inner.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: reason ?? 'Caller cancelled' } }).catch(() => {})
        }
      }
      const abort = () => cancel()
      this.pending.set(id, {
        fail,
        progress: options?.onprogress,
        complete: message => {
          if (settled) return
          // The SDK considers only JSON-RPC result responses final for SSE
          // resumption. Retire an error's token to prevent an unsolicited GET.
          cleanup('error' in message)
          if ('error' in message) { reject(new McpError(message.error.code, message.error.message, message.error.data)); return }
          if (!('result' in message)) { reject(new Error('MCP 响应缺少 result')); return }
          const parsed = safeParse(schema, message.result)
          if (parsed.success) resolve(parsed.data)
          else reject(parsed.error)
        },
      })
      options?.signal?.addEventListener('abort', abort, { once: true })
      const deadline = options?.timeout ?? options?.maxTotalTimeout
      if (deadline !== undefined) {
        if (!Number.isFinite(deadline) || deadline <= 0 || deadline > 2_147_483_647) { fail(new Error('MCP 请求超时必须是 1 至 2147483647 毫秒')); return }
        timer = setTimeout(() => cancel('MCP 调用超时 (request timed out)'), deadline)
      }
      const params = options?.onprogress ? { ...request.params, _meta: { ...request.params?._meta, progressToken: id } } : request.params
      this.requestFetch?.begin(id, () => fail(new McpConnectionError('MCP 响应流已结束但未收到结果，外部结果未知；请核对回执，不要自动重试。')))
      dispatched = true
      void this.inner.send({ ...request, jsonrpc: '2.0', id, ...(params ? { params } : {}) }, {
        onresumptiontoken: token => this.requestFetch?.rememberToken(id, token),
      }).catch(error => {
        fail(new McpConnectionError(`MCP 请求发送失败，外部结果未知；请核对回执，不要自动重试：${error instanceof Error ? error.message : String(error)}`))
      })
    })
  }
}

/** Stop one waiter without cancelling shared initialization. Always detach the listener. */
export function waitForMcp<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new McpCallCancelled(false))
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new McpCallCancelled(false)) }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
