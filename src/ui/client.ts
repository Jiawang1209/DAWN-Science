/**
 * 渲染进程的取数客户端。
 *
 * 包住 `window.dawn.invoke` 这一个开口，做三件事：
 *   1. **握手校验版本**——不匹配就响亮报错，不静默降级（规格 7.5）
 *   2. **拆信封**——`ok:false` 转成异常，调用方不必每次判断
 *   3. **保住 `warnings`**——非致命问题要有地方去，不能吞掉
 *
 * 本文件只 import `src/protocol`（和同层的 `i18n`——错误要按当前语言显示），不碰 runtime / session / store。
 */
import {
  RemoteUpdateSchema,
  SessionUpdateSchema,
  WORKBENCH_PROTOCOL_VERSION,
  isCompatible,
  type ErrorCode,
  type OperationName,
  type RemoteUpdate,
  type SessionUpdate,
  取错误i18n,
} from "../protocol/index.js"
import { tf } from "./i18n/index.js"

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
      pickDirectory?: (defaultPath?: string) => Promise<string | null>
      /** 取色器的一帧（2026-08-24）：当前窗口截图 */
      capturePage?: () => Promise<{ dataUrl: string; width: number; height: number }>
      /** 外部文件附件（2026-08-25）：发送才落盘 */
      attachSave?: (
        workspace: string,
        sessionId: string,
        files: { 名: string; 源路径?: string; 字节?: Uint8Array }[],
      ) => Promise<{ 批次目录: string; 相对路径们: string[] }>
      attachUsage?: (workspace: string, sessionId: string) => Promise<{ 批次: number; 文件: number; 字节: number }>
      attachClean?: (workspace: string, sessionId: string) => Promise<{ 批次: number; 文件: number; 字节: number }>
      /** 拖拽的 File → 真实路径（Electron webUtils）；拿不到给空串 */
      pathForFile?: (file: File) => string
      /** 系统剪贴板里的文件路径；读不到给空数组 */
      clipboardFiles?: () => Promise<string[]>
    }
  }
}

export class WorkbenchClientError extends Error {
  /**
   * 后端渲染好的那句中文，**不管界面是什么语言**——日志、bug 报告拿它对得上后端的日志。
   * `message` 才是给人看的：`details.i18n` 在的话按当前语言 `tf` 过（B15，2026-09-01）。
   */
  readonly 原文: string
  constructor(
    public readonly code: ErrorCode | "no_bridge" | "version_mismatch",
    message: string,
    public readonly retryable = false,
    public readonly details?: unknown,
  ) {
    // 在这里翻而不是在每个 catch 里翻：所有读 `e.message` 的地方（几十处）就都免费拿到当前语言。
    // 中文界面下 `tf` 原样返回中文，与后端渲染的那句逐字节相同
    const i18n = 取错误i18n(details)
    super(i18n ? tf(i18n.msgid, ...i18n.args) : message)
    this.原文 = message
    this.name = "WorkbenchClientError"
  }
}

export interface InvokeResult<T> {
  data: T
  warnings: string[]
}

export type Invoker = (operation: string, request: unknown, requestId?: string) => Promise<RawResponse>

export interface UpdateSubscription {
  onUpdate: (u: SessionUpdate) => void
  /**
   * revision 跳号时调用：**应当重新取一次快照**。
   *
   * 这是 snapshot + revision 相对旧设计（seq + 环形缓冲）真正的收获——
   * 旧设计跳号只能出声，新设计跳号可以自愈。
   */
  onResync: (sessionId: string) => void
  /**
   * 出了问题就叫一声：畸形更新、版本不符、处理者抛错。
   *
   * **不给默认的静默兜底**是有意的——事件通道恰恰是最难发现静默丢失的地方
   * （规格 7.5）。省略它意味着调用方明确选择不听，而不是忘了。
   */
  onProblem?: (message: string) => void
  /**
   * 一台服务器的连接状态变了（②-B · R3）。
   *
   * **它必须是推来的，不能靠界面轮询**：从断开到被发现之间那段时间里，
   * 轮询的界面显示的是「连着」——**那是一个看起来很确定的谎**。
   */
  onRemote?: (u: RemoteUpdate) => void
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
  pickDirectory?: (defaultPath?: string) => Promise<string | null>,
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

  /** 每会话已确认的 revision。跳号判断的唯一依据 */
  const lastRevision = new Map<string, number>()
  /** 已经请求过重取快照、还没等到新快照的会话。**防止跳号后每条都再喊一次** */
  const resyncing = new Set<string>()

  return {
    raw,

    /**
     * 取到快照后告诉客户端「我已经同步到第 N 版了」。
     *
     * 快照与增量共用同一个 revision 计数，没有这一步，
     * 订阅完快照再收到第 11 版会被误判成跳号。
     */
    expectRevision(sessionId: string, revision: number): void {
      lastRevision.set(sessionId, revision)
      resyncing.delete(sessionId)
    },

    /** 会话切走时忘掉它的版本号，避免下次订阅时拿旧号去比。 */
    forgetRevision(sessionId: string): void {
      lastRevision.delete(sessionId)
      resyncing.delete(sessionId)
    },

    /**
     * 订阅推送。返回退订函数。
     *
     * **跳号的处置是本次重写的核心差别。**
     * 旧设计（seq + 环形缓冲）只能出声——界面少了一段内容，而且补不回来。
     * 现在改为**请求重取快照**：调用 `onResync`，由调用方再要一次全量。
     * 少的那一段会被完整补上。**能自愈的机制不需要道歉。**
     *
     * 其余三种异常仍然出声：
     *   - 畸形 / 版本不符 ⇒ 丢弃并出声
     *   - 处理者抛错 ⇒ 出声并继续（一个渲染错误不该让整条流断掉）
     */
    subscribeUpdates({ onUpdate, onResync, onProblem, onRemote }: UpdateSubscription): () => void {
      const problem = (m: string) => onProblem?.(m)
      const src = eventSource ?? window.dawn?.onEvent
      if (!src) {
        problem("找不到 window.dawn.onEvent —— 本页面必须在 DAWN 的 Electron 壳里打开，否则收不到会话更新")
        return () => {}
      }

      return src((raw) => {
        /**
         * **先认远端更新。** 它与会话更新共用一条 IPC 通道但不是同一种东西
         * （没有 `sessionId`，也没有 revision）。
         * 不先分派的话，每一条远端状态都会被下面那句判成「不合协议」并出声——
         * 一条正常的推送变成一次报警，报警多了就没人看了。
         */
        const remote = RemoteUpdateSchema.safeParse(raw)
        if (remote.success) {
          onRemote?.(remote.data)
          return
        }
        const parsed = SessionUpdateSchema.safeParse(raw)
        if (!parsed.success) {
          problem(`收到不合协议的会话更新，已丢弃：${parsed.error.issues[0]?.message ?? "结构不符"}`)
          return
        }
        const u = parsed.data
        if (!isCompatible(WORKBENCH_PROTOCOL_VERSION, u.workbenchProtocolVersion)) {
          problem(
            `会话更新的协议版本不兼容（界面 ${WORKBENCH_PROTOCOL_VERSION}，更新 ${u.workbenchProtocolVersion}），已丢弃`,
          )
          return
        }

        const prev = lastRevision.get(u.sessionId)
        if (prev !== undefined && u.revision !== prev + 1) {
          // 已经在等新快照了就别再喊——否则跳号之后每一条都会触发一次重取
          if (!resyncing.has(u.sessionId)) {
            resyncing.add(u.sessionId)
            onResync(u.sessionId)
          }
          // **不交付**：快照会覆盖这一切，交付一条错位的更新只会让界面先错一下
          return
        }
        lastRevision.set(u.sessionId, u.revision)

        try {
          onUpdate(u)
        } catch (err) {
          problem(`处理会话更新时出错：${err instanceof Error ? err.message : String(err)}`)
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
    /** @param defaultPath 从哪儿起步（设置里那个默认工作目录）。不给就交给系统 */
    async pickDirectory(defaultPath?: string): Promise<string | null> {
      const pick = pickDirectory ?? window.dawn?.pickDirectory
      if (!pick) return null
      return pick(defaultPath)
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
