/**
 * Workbench Protocol 的服务端（Task 2.3）。
 *
 * **本文件不认识 Electron。** 它只是一个 `handle(operation, request)` 的外壳，
 * 因此可以在 Node 里直接测——不用起 GUI，不用 IPC。Electron 的 IPC 桥（Task 2.8）
 * 只是把 `invoke` 转接到这里，不含任何业务逻辑。
 *
 * 职责恰好三件：
 *   1. **派发**——认识 13 个操作，其余一律拒
 *   2. **双向校验**——请求进来过一遍 schema，响应出去再过一遍
 *   3. **错误归一**——把后端的异常翻译成稳定的错误码，且不泄露内部细节
 *
 * 后端（`WorkbenchBackend`）是接口而非实现。沿用 ①-A 已验证的模式：
 * 先定接口 + Fake，真实现随后（当初 `AgentRuntime` + `FakeRuntime` 即如此）。
 */
import { z } from "zod"
import { UserFacingError } from "../errors.js"
import {
  OPERATIONS,
  WORKBENCH_PROTOCOL_VERSION,
  WorkbenchErrorSchema,
  WorkbenchSuccessSchema,
  MAX_PAGE_SIZE,
  isMutating,
  operationNames,
  type ErrorCode,
} from "../protocol/index.js"

type Op = keyof typeof OPERATIONS

/**
 * 后端把每个操作实现为一个 async 函数，入参已通过 schema 校验。
 *
 * **`getCapabilities` 不在其中**——协议版本、操作清单、只读模式都是
 * **协议层与服务端配置的事实**，后端不知道也不该知道自己被架在什么模式下。
 * 让后端回答它，等于让被观察者自报观察条件。
 */
export type WorkbenchBackend = {
  [K in Exclude<Op, "getCapabilities">]: (
    request: z.infer<(typeof OPERATIONS)[K]["request"]>,
  ) => Promise<unknown>
}

/**
 * 后端可以抛这种错误来指定业务性的错误码。
 * 否则一切异常都会被压成 `internal_error`——那会让「项目不存在」
 * 和「数据库炸了」在 UI 上长得一模一样。
 */
export interface WorkbenchFault extends Error {
  workbenchCode: ErrorCode
}

export function fault(code: ErrorCode, message: string): WorkbenchFault {
  return Object.assign(new Error(message), { workbenchCode: code })
}

function isFault(e: unknown): e is WorkbenchFault {
  return e instanceof Error && typeof (e as WorkbenchFault).workbenchCode === "string"
}

/**
 * 哪些错误码值得客户端重试(审查 debug F7)。此前所有 `fail` 都硬写 `retryable:false`,
 * 协议为它写的「客户端据此决定是否重试」形同虚设。判据:**暂时性、同一请求原样再发有可能成功的**才可重试——
 *   - `conflict`:租约被别人占着,过一会儿可能就放了;
 *   - `project_unavailable`:项目暂时连不上(远端重连中),稍后可能恢复。
 * 其余一律不可重试:`invalid_request`/`not_found`/游标越界这些是请求本身的问题,重发只会再失败;
 * `internal_error` 也不重试——它可能是一次已经改了状态的可写操作半途出错,盲目重试有双重执行的风险。
 */
const 可重试错误码 = new Set<ErrorCode>(["conflict", "project_unavailable"])

export interface WorkbenchServerOptions {
  readOnly?: boolean
  /** 内部错误的落地点。默认吞掉——但**只在这里吞**，客户端拿到的是归一后的错误 */
  onInternalError?: (operation: string, err: unknown) => void
}

export type WorkbenchResponse =
  | { ok: true; workbenchProtocolVersion: string; requestId?: string; data: unknown; warnings: string[] }
  | z.infer<typeof WorkbenchErrorSchema>

export class WorkbenchServer {
  private readonly readOnly: boolean
  private readonly onInternalError: ((operation: string, err: unknown) => void) | undefined

  constructor(
    private readonly backend: WorkbenchBackend,
    opts: WorkbenchServerOptions = {},
  ) {
    this.readOnly = opts.readOnly ?? false
    this.onInternalError = opts.onInternalError
  }

  /** 握手信息全部来自协议注册表与本服务端的配置，不问后端。 */
  private capabilities() {
    return {
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      operations: operationNames(),
      entityTypes: ["Project", "Session", "Run", "Provenance", "Capabilities"],
      maxPageSize: MAX_PAGE_SIZE,
      readOnly: this.readOnly,
    }
  }

  private fail(code: ErrorCode, message: string, retryable: boolean, requestId?: string, details?: unknown): WorkbenchResponse {
    return WorkbenchErrorSchema.parse({
      ok: false,
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      ...(requestId ? { requestId } : {}),
      error: { code, message, retryable, ...(details === undefined ? {} : { details }) },
    })
  }

  async handle(
    operation: string,
    request: unknown,
    ctx: { requestId?: string } = {},
  ): Promise<WorkbenchResponse> {
    const { requestId } = ctx
    const def = (OPERATIONS as Record<string, (typeof OPERATIONS)[Op]>)[operation]

    // 1. 派发：未知操作立即拒，并列出已注册的，便于定位拼写错误
    if (!def) {
      return this.fail(
        "invalid_request",
        `未知操作 "${operation}"。已注册：${operationNames().join(", ")}`,
        false,
        requestId,
      )
    }

    // 2. 只读模式：可写操作在这里挡下，不进后端
    if (this.readOnly && isMutating(operation)) {
      return this.fail("invalid_request", `服务端处于只读模式，拒绝可写操作 "${operation}"`, false, requestId)
    }

    // 3. 请求校验
    const parsedReq = def.request.safeParse(request ?? {})
    if (!parsedReq.success) {
      return this.fail(
        "invalid_request",
        `操作 "${operation}" 的请求不合契约`,
        false,
        requestId,
        parsedReq.error.issues,
      )
    }

    // 4. 执行。getCapabilities 由服务端自答，不落到后端——见 WorkbenchBackend 注释
    let raw: unknown
    try {
      raw =
        operation === "getCapabilities"
          ? this.capabilities()
          : await this.backend[operation as Exclude<Op, "getCapabilities">](parsedReq.data as never)
    } catch (err) {
      if (isFault(err)) {
        // 业务性失败：保留后端指定的错误码与消息;retryable 按码判(审查 debug F7)
        return this.fail(err.workbenchCode, err.message, 可重试错误码.has(err.workbenchCode), requestId)
      }
      // 守卫抛的「在工作区之外」「找不到」这类**本来就是写给人看的**（2026-08-23 审查抓的：此前一律压成「操作执行失败」，界面看不到原因）
      if (err instanceof UserFacingError) return this.fail("invalid_request", err.message, false, requestId)
      // 意外异常：归一为 internal_error。**原始信息只进日志，不进响应**——
      // 它可能含路径、连接串、密钥片段。Rho 的注释同此：details are not exposed publicly。
      this.onInternalError?.(operation, err)
      return this.fail("internal_error", `操作 "${operation}" 执行失败`, false, requestId)
    }

    // 5. 响应校验（双向校验的后一半）
    //    后端返回错结构不能漏给 UI——那会让 UI 在运行期才崩，且现场已经丢了。
    const envelope = WorkbenchSuccessSchema(def.response).safeParse({
      ok: true,
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      ...(requestId ? { requestId } : {}),
      data: raw,
    })
    if (!envelope.success) {
      this.onInternalError?.(operation, envelope.error)
      return this.fail("internal_error", `操作 "${operation}" 的响应不合契约`, false, requestId)
    }
    return envelope.data as WorkbenchResponse
  }
}
