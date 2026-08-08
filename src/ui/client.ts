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
  WORKBENCH_PROTOCOL_VERSION,
  isCompatible,
  type ErrorCode,
  type OperationName,
} from "../protocol/index.js"

export interface RawResponse {
  ok: boolean
  workbenchProtocolVersion: string
  requestId?: string
  data?: unknown
  warnings?: string[]
  error?: { code: ErrorCode; message: string; retryable: boolean; details?: unknown }
}

declare global {
  interface Window {
    dawn?: {
      invoke(operation: string, request: unknown, requestId?: string): Promise<RawResponse>
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

/**
 * @param invoke 注入点。默认取 `window.dawn.invoke`；测试传入自己的桩，
 *   这样客户端逻辑不必依赖 Electron 也能验。
 */
export function createClient(invoke?: Invoker) {
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

  return {
    raw,

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
