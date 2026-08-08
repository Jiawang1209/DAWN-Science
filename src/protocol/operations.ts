/**
 * Workbench Protocol 的操作契约（Task 2.2）。
 *
 * 信封与错误码取自 Rho 的 `workbench.rs`（规格 7.33），三处设计直接照搬：
 *
 *   1. **每个响应都带协议版本**——不只握手时带。过期的 UI 在**任何一次调用**
 *      上都能察觉版本漂移，而不是只在启动时检查一次。
 *   2. **错误带 `retryable`**——客户端据此决定是否重试，不靠猜测错误码语义。
 *   3. **成功响应带 `warnings`**——非致命问题要有地方说。没有这个字段，
 *      「部分成功」只能二选一：要么谎报全成，要么整体失败。两个都不对。
 *
 * 一处刻意偏离：Rho 的成功信封里 `project_id` 是必填，但我们有
 * `getCapabilities` / `listProjects` 这类不属于任何单一项目的操作，故改为可选。
 */
import { z } from "zod"
import {
  CostSchema,
  FileChangeFactsSchema,
  ProjectSummarySchema,
  ProvenanceLinkSchema,
  RunSummarySchema,
  SessionSummarySchema,
  WorkbenchCapabilitiesSchema,
} from "./entities.js"

/** 客户端不能请求无限结果——上限由服务端定，不由调用方定。 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

/**
 * 稳定的错误码，供客户端逻辑分支使用；`message` 只面向人，不参与判断。
 * 前九项中七项采自 Rho，另加两项本项目特有的：
 *   - `invalid_request` —— 请求不合 schema（Rho 在别处处理）
 *   - `conflict` —— 租约冲突（Rho 没有租约概念）
 */
export const ErrorCodeSchema = z.enum([
  "not_found",
  "invalid_request",
  "conflict",
  "internal_error",
  "unsupported_protocol_version",
  "page_size_exceeded",
  "invalid_cursor",
  "project_unavailable",
  "size_limit_exceeded",
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

export const PageInfoSchema = z
  .object({
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    hasMore: z.boolean(),
    /** 可选：有些查询算总数的代价过高，宁可不给也不给一个错的 */
    totalCount: z.int().min(0).optional(),
    pageSize: z.int().min(1).max(MAX_PAGE_SIZE),
  })
  .strict()
export type PageInfo = z.infer<typeof PageInfoSchema>

/** 成功信封。`ok` 是字面量 true，与错误信封构成可辨识联合。 */
export function WorkbenchSuccessSchema<T extends z.ZodType>(data: T) {
  return z
    .object({
      ok: z.literal(true),
      workbenchProtocolVersion: z.string().regex(/^\d+\.\d+$/),
      requestId: z.string().min(1).optional(),
      projectId: z.string().min(1).optional(),
      data,
      page: PageInfoSchema.optional(),
      warnings: z.array(z.string().min(1)).default([]),
    })
    .strict()
}

export const WorkbenchErrorSchema = z
  .object({
    ok: z.literal(false),
    workbenchProtocolVersion: z.string().regex(/^\d+\.\d+$/),
    requestId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    error: z
      .object({
        code: ErrorCodeSchema,
        message: z.string().trim().min(1),
        /** 必填：客户端要据此决定重试，缺省会逼它去猜 */
        retryable: z.boolean(),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict()
export type WorkbenchError = z.infer<typeof WorkbenchErrorSchema>

// ── 请求 schema ───────────────────────────────────────────────────────────

const Paged = z.object({
  pageSize: z.int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  after: z.string().min(1).optional(),
})

const Empty = z.object({}).strict()
const ByProject = z.object({ projectId: z.string().min(1) })

/** 写权持有者。与 ①-A 的 `Holder` 同构。 */
const HolderSchema = z.enum(["engine", "user"])

// ── 操作注册表 ─────────────────────────────────────────────────────────────

export interface OperationDef {
  request: z.ZodType
  response: z.ZodType
  /** 是否改变状态。只读操作可在 `readOnly` 模式下放行。 */
  mutating: boolean
}

/**
 * 操作清单原定在 Task 2.2 冻结（计划 §4 风险表：避免协议设计过度）。
 *
 * **2026-08-08 解冻一次，新增凭证的三个操作**。理由是作者首次启动桌面版时
 * 指出的真实缺陷：桌面应用的凭证应当在 app 里设置，而当时没有任何操作能做到
 * ——冻结是为了防范围蔓延，不是为了拒绝必要的补漏。协议版本随之 1.0 → 1.1。
 */
export const OPERATIONS = {
  // ── 只读 ──
  getCapabilities: {
    request: Empty,
    response: WorkbenchCapabilitiesSchema,
    mutating: false,
  },
  listProjects: {
    request: Paged,
    response: z.array(ProjectSummarySchema),
    mutating: false,
  },
  getProject: {
    request: ByProject,
    response: ProjectSummarySchema,
    mutating: false,
  },
  listSessions: {
    request: ByProject.merge(Paged),
    response: z.array(SessionSummarySchema),
    mutating: false,
  },
  listRuns: {
    request: ByProject.merge(Paged).extend({
      sessionId: z.string().min(1).optional(),
    }),
    response: z.array(RunSummarySchema),
    mutating: false,
  },
  getRun: {
    request: z.object({ runId: z.string().min(1) }),
    response: RunSummarySchema.and(
      z.object({
        fileChanges: FileChangeFactsSchema.optional(),
        cost: CostSchema.optional(),
      }),
    ),
    mutating: false,
  },
  getProvenance: {
    request: z.object({ resourceId: z.string().min(1) }),
    response: ProvenanceLinkSchema,
    mutating: false,
  },
  /**
   * 配置里声明了哪些 agent 与 endpoint。
   *
   * **界面要列出可选 agent 才能让用户新建会话**——此前没有这个操作，
   * 界面只能硬编码猜，而那意味着「新建会话」这个主动作根本做不出来。
   * **不回传任何凭证**，只回传「配置里有没有写死 key」这个布尔。
   */
  getProviders: {
    request: Empty,
    response: z.object({
      agents: z.array(
        z.object({
          agentId: z.string(),
          kind: z.enum(["native", "pty"]),
          endpoint: z.string().optional(),
          model: z.string().optional(),
          command: z.string().optional(),
        }),
      ),
      endpoints: z.array(
        z.object({
          endpointId: z.string(),
          baseUrl: z.string(),
          models: z.array(z.string()),
          /** 配置文件里是否写死了 key。凭证本身绝不回传 */
          hasKeyInConfig: z.boolean(),
        }),
      ),
    }),
    mutating: false,
  },

  /**
   * 已配置凭证的 endpoint 清单。**只返回 id，绝不返回凭证本身**——
   * 界面只需要知道「配没配」，不需要知道「是什么」。
   */
  listCredentials: {
    request: Empty,
    response: z.object({
      configured: z.array(z.string()),
      /** 当前是否由系统安全存储加密。false 时界面须提示用户 */
      encrypted: z.boolean(),
    }),
    mutating: false,
  },

  /** 预览不得改变状态——规格 7.1，①-A 已有对应测试 */
  previewTakeover: {
    request: z.object({ sessionId: z.string().min(1), requester: HolderSchema }),
    response: z.object({
      sessionId: z.string(),
      currentHolder: HolderSchema.nullable(),
      requester: HolderSchema,
      wouldPreempt: z.boolean(),
      allowed: z.boolean(),
    }),
    mutating: false,
  },

  // ── 可写 ──
  openProject: {
    request: z.object({ workspace: z.string().startsWith("/") }),
    response: ProjectSummarySchema,
    mutating: true,
  },
  createSession: {
    request: z.object({ projectId: z.string().min(1), agentId: z.string().min(1) }),
    response: SessionSummarySchema,
    mutating: true,
  },
  writeToSession: {
    request: z.object({
      sessionId: z.string().min(1),
      data: z.string(),
      /** 必填：不能匿名写。写权可追责的唯一入口（规格 7.1） */
      as: HolderSchema,
    }),
    response: Empty,
    mutating: true,
  },
  stopSession: {
    request: z.object({ sessionId: z.string().min(1) }),
    response: Empty,
    mutating: true,
  },
  setCredential: {
    request: z.object({
      endpointId: z.string().min(1),
      secret: z.string().min(1),
    }),
    response: Empty,
    mutating: true,
  },
  deleteCredential: {
    request: z.object({ endpointId: z.string().min(1) }),
    response: Empty,
    mutating: true,
  },
  acquireLease: {
    request: z.object({ sessionId: z.string().min(1), holder: HolderSchema }),
    response: z.object({
      sessionId: z.string(),
      holder: HolderSchema,
      expiresAt: z.iso.datetime({ offset: true }),
      fingerprint: z.string(),
    }),
    mutating: true,
  },
} as const satisfies Record<string, OperationDef>

export type OperationName = keyof typeof OPERATIONS

export function operationNames(): string[] {
  return Object.keys(OPERATIONS)
}

/**
 * 未知操作名**抛错而非默认只读**。
 * 默认只读看似安全，实则相反——一个拼错的操作名会被静默当作查询放行，
 * 掩盖调用方的 bug。未知就是未知（规格 7.5）。
 */
export function isMutating(name: string): boolean {
  const op = (OPERATIONS as Record<string, OperationDef>)[name]
  if (!op) throw new Error(`未知操作 "${name}"。已注册：${operationNames().join(", ")}`)
  return op.mutating
}
