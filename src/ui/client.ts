/**
 * 渲染进程的取数客户端。
 *
 * 包住 `window.dawn.invoke` 这一个开口，做三件事：
 *   1. **握手校验版本**——不匹配就响亮报错，不静默降级（规格 7.5）
 *   2. **拆信封**——`ok:false` 转成异常，调用方不必每次判断
 *   3. **保住 `warnings`**——非致命问题要有地方去，不能吞掉
 *
 * 本文件只 import `src/protocol`，不碰 runtime / session / store。
 */
import {
  SessionEventSchema,
  WORKBENCH_PROTOCOL_VERSION,
  isCompatible,
  type ErrorCode,
  type OperationName,
  type SessionEvent,
} from "../protocol/index.js"

export interface RawResponse {
  ok: boolean
  workbenchProtocolVersion: string
  requestId?: string
  data?: unknown
  warnings?: string[]
  error?: { code: ErrorCode; message: string; retryable: boolean; details?: unknown }
}

/** 主进程往渲染进程推事件的开口。返回退订函数。 */
export type EventSource = (cb: (raw: unknown) => void) => () => void

declare global {
  interface Window {
    dawn?: {
      invoke(operation: string, request: unknown, requestId?: string): Promise<RawResponse>
      onEvent?: EventSource
      /** 原生目录选择器。取消时 null */
      pickDirectory?: () => Promise<string | null>
    }
  }
}

export class WorkbenchClientError extends Error {
  constructor(
    public readonly code: ErrorCode | "no_bridge" | "version_mismatch",
    message: string,
    public readonly retryable = false,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = "WorkbenchClientError"
  }
}

export interface InvokeResult<T> {
  data: T
  warnings: string[]
}

export type Invoker = (operation: string, request: unknown, requestId?: string) => Promise<RawResponse>

export interface EventSubscription {
  onEvent: (e: SessionEvent) => void
  /**
   * 出了问题就叫一声：跳号、畸形事件、版本不符、处理者抛错。
   *
   * **不给默认的静默兜底**是有意的——事件通道恰恰是最难发现静默丢失的地方
   * （规格 7.5）。省略它意味着调用方明确选择不听，而不是忘了。
   */
  onProblem?: (message: string) => void
}

/**
 * @param invoke 注入点。默认取 `window.dawn.invoke`；测试传入自己的桩，
 *   这样客户端逻辑不必依赖 Electron 也能验。
 * @param eventSource 同理，默认取 `window.dawn.onEvent`。
 * @param pickDirectory 同理，默认取 `window.dawn.pickDirectory`。
 */
export function createClient(
  invoke?: Invoker,
  eventSource?: EventSource,
  pickDirectory?: () => Promise<string | null>,
) {
  const call: Invoker = invoke ?? ((op, req, id) => {
    if (!window.dawn) {
      // 在浏览器里直接开 index.html 会走到这里。说清楚而不是抛一个 undefined 错误
      return Promise.reject(
        new WorkbenchClientError("no_bridge", "找不到 window.dawn —— 本页面必须在 DAWN 的 Electron 壳里打开"),
      )
    }
    return window.dawn.invoke(op, req, id)
  })

  async function raw<T>(operation: OperationName | string, request: unknown = {}): Promise<InvokeResult<T>> {
    const res = await call(operation, request)
    if (!res.ok) {
      const e = res.error
      throw new WorkbenchClientError(
        e?.code ?? "internal_error",
        e?.message ?? `操作 "${operation}" 失败`,
        e?.retryable ?? false,
        e?.details,
      )
    }
    return { data: res.data as T, warnings: res.warnings ?? [] }
  }

  /** 每会话已见到的最大 seq。跳号判断的唯一依据。 */
  const lastSeq = new Map<string, number>()

  return {
    raw,

    /**
     * 订阅历史之后告诉客户端「我已经看到第 N 号了」，
     * 使之后推来的增量能接着往下校验。
     *
     * **历史与增量是同一套编号**（协议 §5.2），没有这一步的话，
     * 订阅完历史再收到第 11 号会被误判成从 1 跳到 11。
     */
    expectSeq(sessionId: string, seq: number): void {
      lastSeq.set(sessionId, seq)
    },

    /** 会话切走时忘掉它的编号，避免下次订阅时拿旧号去比。 */
    forgetSeq(sessionId: string): void {
      lastSeq.delete(sessionId)
    },

    /**
     * 订阅事件推送。返回退订函数。
     *
     * 四种异常都**出声**而不静默：
     *   - 畸形 / 版本不符 ⇒ **丢弃并出声**。让它流进界面状态只会在更远处崩。
     *   - 跳号 ⇒ **交付并出声**。丢了反而更糟：界面会少一段内容且毫无提示。
     *   - 处理者抛错 ⇒ **出声并继续**。一个渲染错误不该让整条流从此断掉。
     */
    subscribeEvents({ onEvent, onProblem }: EventSubscription): () => void {
      const problem = (m: string) => onProblem?.(m)
      const src = eventSource ?? window.dawn?.onEvent
      if (!src) {
        problem("找不到 window.dawn.onEvent —— 本页面必须在 DAWN 的 Electron 壳里打开，否则收不到会话事件")
        return () => {}
      }

      return src((rawEvent) => {
        const parsed = SessionEventSchema.safeParse(rawEvent)
        if (!parsed.success) {
          problem(`收到不合协议的会话事件，已丢弃：${parsed.error.issues[0]?.message ?? "结构不符"}`)
          return
        }
        const e = parsed.data
        if (!isCompatible(WORKBENCH_PROTOCOL_VERSION, e.workbenchProtocolVersion)) {
          problem(
            `会话事件的协议版本不兼容（界面 ${WORKBENCH_PROTOCOL_VERSION}，事件 ${e.workbenchProtocolVersion}），已丢弃`,
          )
          return
        }

        const prev = lastSeq.get(e.sessionId)
        if (prev !== undefined && e.seq !== prev + 1) {
          problem(
            e.seq > prev + 1
              ? `会话 ${e.sessionId} 的事件跳号：第 ${prev + 1}–${e.seq - 1} 号没有收到`
              : `会话 ${e.sessionId} 的事件编号回退：收到第 ${e.seq} 号，但已经看过第 ${prev} 号`,
          )
        }
        // 回退时不要把游标往回拨，否则后面每一条都会再报一次
        lastSeq.set(e.sessionId, Math.max(prev ?? 0, e.seq))

        try {
          onEvent(e)
        } catch (err) {
          problem(`处理会话事件时出错：${err instanceof Error ? err.message : String(err)}`)
        }
      })
    },

    /**
     * 打开原生目录选择器。取消或没有桥接时返回 null。
     *
     * **这不是协议操作**，故不走 `invoke`：它要用 Electron 的 `dialog`，
     * 而协议服务端必须能在 node 下测。放这里是因为客户端本来就是
     * 「包住 window.dawn」的那一层，多开一个注入点只会多一处要接。
     */
    async pickDirectory(): Promise<string | null> {
      const pick = pickDirectory ?? window.dawn?.pickDirectory
      if (!pick) return null
      return pick()
    },

    /** 取数据，丢弃 warnings。多数调用点用这个。 */
    async get<T>(operation: OperationName | string, request: unknown = {}): Promise<T> {
      return (await raw<T>(operation, request)).data
    },

    /**
     * 启动握手。**版本不匹配立即失败**——继续跑只会在某个字段缺失时
     * 以一种更难懂的方式崩掉。
     */
    async handshake(): Promise<{ readOnly: boolean; operations: string[] }> {
      const caps = await raw<{
        workbenchProtocolVersion: string
        operations: string[]
        readOnly: boolean
      }>("getCapabilities")
      const server = caps.data.workbenchProtocolVersion
      if (!isCompatible(WORKBENCH_PROTOCOL_VERSION, server)) {
        throw new WorkbenchClientError(
          "version_mismatch",
          `协议版本不兼容：界面 ${WORKBENCH_PROTOCOL_VERSION}，服务端 ${server}`,
        )
      }
      return { readOnly: caps.data.readOnly, operations: caps.data.operations }
    },
  }
}

export type WorkbenchClient = ReturnType<typeof createClient>
