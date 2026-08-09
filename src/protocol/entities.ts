/**
 * Workbench Protocol 的实体模型（Task 2.1）。
 *
 * 结构取自 Rho 的 `crates/rho-protocol/src/workbench.rs`（规格 7.33），
 * 按本项目的需要做了三处扩展：成本、跨工具的 session kind、git 事实。
 *
 * **本文件是 UI 与核心之间的唯一契约。** `src/ui/**` 只准 import 它，
 * 不准 import `runtime/` / `session/` / `store/`——该约束由 Task 2.13 的测试强制。
 */
import { z } from "zod"

const Iso = z.iso.datetime({ offset: true })
const NonNegInt = z.int().min(0)

/** 人与 agent 同构，只差这个字段（规格 7.22）。 */
export const RunOriginSchema = z.enum(["user", "agent", "system"])
export type RunOrigin = z.infer<typeof RunOriginSchema>

export const RunStatusSchema = z.enum(["running", "completed", "failed", "cancelled"])
export type RunStatus = z.infer<typeof RunStatusSchema>

/**
 * 成本。**「不可见」与「零」必须是两种东西**（计划 §2.4）。
 *
 * PTY agent 用的是用户自己的订阅额度，我们拿不到数字。显示 0 是错的——
 * 会让人以为免费。用可辨识联合在**类型层面**强制区分，而不是靠 UI 约定：
 * 约定会被绕过，类型不会。
 */
export const CostSchema = z.discriminatedUnion("visible", [
  z.object({
    visible: z.literal(true),
    inputTokens: NonNegInt,
    outputTokens: NonNegInt,
    cacheReadTokens: NonNegInt.optional(),
    totalUSD: z.number().min(0),
  }).strict(),
  z.object({
    visible: z.literal(false),
    /** 为什么拿不到，例如「该 agent 使用自有订阅额度」 */
    reason: z.string().trim().min(1),
  }).strict(), // strict：不可见时夹带金额会被拒，防止 UI 误读
])
export type Cost = z.infer<typeof CostSchema>

export const RunSummarySchema = z
  .object({
    runId: z.string().min(1),
    projectId: z.string().min(1),
    sessionId: z.string().min(1),
    /** 重跑与续跑链（规格 8.6 的 rerunOf） */
    parentRunId: z.string().min(1).optional(),
    origin: RunOriginSchema,
    /**
     * 开放字符串而非枚举：①-B 只产生 `agent_turn`，②-A 会加
     * `execute_r` / `execute_py`。写死枚举会逼 ②-A 改协议 major 版本。
     */
    requestType: z.string().min(1),
    status: RunStatusSchema,
    startedAt: Iso,
    finishedAt: Iso.optional(),
    /** 异常结束的原因 */
    terminalReason: z.string().min(1).optional(),
    hasError: z.boolean(),
    /**
     * 退出码。**结构化字段，不是日志文本里的一行。**
     *
     * 契约冻结点八项之一：阶段 ④ 要回答「这次测试过没过」，
     * 它必须能直接读，不能靠解析输出。缺省表示**尚未结束、或该类 Run
     * 没有退出码概念**——与「退出码为 0」是两回事。
     */
    exitCode: z.number().int().optional(),
    /**
     * 这一次运行改了哪些文件（**从 git 事实算，不听 agent 声明**——不变式 5）。
     *
     * **缺省 = 不知道**（非 git 仓库、只读工具、快照失败），
     * 与「空数组」（确认没改任何文件）是两回事。把"不知道"写成"没有"就是编造。
     */
    filesWritten: z.array(z.string().min(1)).optional(),
    filesRead: z.array(z.string().min(1)).optional(),
    /** 可能混入作者自己的改动。共用工作目录时无法区分谁改的，**如实标注** */
    mayIncludeUserEdits: z.boolean().optional(),
    artifactCount: NonNegInt.optional(),
    cost: CostSchema.optional(),
  })
  .superRefine((v, ctx) => {
    // 进行中却带结束时间，或已结束却没有——都是自相矛盾的记录，
    // 与其让 UI 去猜，不如在协议边界就拒掉。
    const finished = v.status !== "running"
    if (finished && !v.finishedAt) {
      ctx.addIssue({ code: "custom", path: ["finishedAt"], message: `status="${v.status}" 时必须提供 finishedAt` })
    }
    if (!finished && v.finishedAt) {
      ctx.addIssue({ code: "custom", path: ["finishedAt"], message: `status="running" 时不得提供 finishedAt` })
    }
  })
export type RunSummary = z.infer<typeof RunSummarySchema>

/**
 * 溯源链。**完整性是一等公民**（规格 7.33）。
 *
 * PTY agent 的内置 Read / Edit / Bash 不经过我方注入的 MCP，因此看不见。
 * 处理方式不是隐藏，也不是留白，而是显式记「这条链断了，因为 X」。
 */
export const ProvenanceLinkSchema = z
  .object({
    resourceId: z.string().min(1),
    producingRunId: z.string().min(1).optional(),
    environmentSnapshotId: z.string().min(1).optional(),
    sourcePath: z.string().min(1).optional(),
    provenanceComplete: z.boolean(),
    incompleteReason: z.string().trim().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.provenanceComplete && !v.incompleteReason) {
      ctx.addIssue({
        code: "custom",
        path: ["incompleteReason"],
        message: "provenanceComplete=false 时必须写明 incompleteReason —— 不隐藏、不留白",
      })
    }
    if (v.provenanceComplete && v.incompleteReason) {
      ctx.addIssue({
        code: "custom",
        path: ["incompleteReason"],
        message: "provenanceComplete=true 却给出了不完整原因，自相矛盾",
      })
    }
  })
export type ProvenanceLink = z.infer<typeof ProvenanceLinkSchema>

/**
 * 产出的 git 事实（不变式 5：不听 agent 声明，看仓库）。
 *
 * ①-B 没有 worktree 隔离（实体 #50 在阶段 ③），只能算「相对会话开始的 diff」，
 * 因而**可能混入作者本人的手动修改**。该事实必须随数据一起传递，
 * 不能指望 UI 记得加脚注——所以 `mayIncludeUserEdits` 是必填而非可选。
 */
export const FileChangeFactsSchema = z
  .object({
    files: z.array(z.string().min(1)),
    mayIncludeUserEdits: z.boolean(),
    baselineHead: z.string().min(1),
    computedAt: Iso,
  })
  .strict()
export type FileChangeFacts = z.infer<typeof FileChangeFactsSchema>

export const ProjectSummarySchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().min(1),
    /** 绝对路径。相对路径在多进程/多窗口下会指向不同位置 */
    workspace: z.string().startsWith("/"),
    createdAt: Iso,
    totalRunCount: NonNegInt,
    totalSessionCount: NonNegInt,
    unresolvedProblemCount: NonNegInt,
  })
  .strict()
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

/** 与 ①-A 的 `SessionRecord` 对齐——state 三态、pid/exitCode 可选，逐字段比对过。 */
export const SessionSummarySchema = z
  .object({
    sessionId: z.string().min(1),
    projectId: z.string().min(1),
    agentId: z.string().min(1),
    kind: z.enum([
      "native",
      "pty",
      /**
       * 外部 CLI 的 headless 模式（①-C）。**与 `pty` 是两件事**：
       * `pty` 是字节流终端，`cli` 拿到的是结构化事件——界面正靠这个判别式
       * 决定画对话还是画终端。
       */
      "cli",
    ]),
    state: z.enum(["starting", "alive", "exited"]),
    pid: z.int().optional(),
    exitCode: z.int().optional(),
    createdAt: Iso,
  })
  .strict()
export type SessionSummary = z.infer<typeof SessionSummarySchema>

export const WorkbenchCapabilitiesSchema = z
  .object({
    workbenchProtocolVersion: z.string().regex(/^\d+\.\d+$/),
    operations: z.array(z.string().min(1)),
    entityTypes: z.array(z.string().min(1)),
    maxPageSize: z.int().min(1),
    readOnly: z.boolean(),
  })
  .strict()
export type WorkbenchCapabilities = z.infer<typeof WorkbenchCapabilitiesSchema>
