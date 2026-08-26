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
/**
 * 一次 Run 的花费。
 *
 * ## `visible` 说的是**金额**，不是 token（2026-08-16 补的这句话）
 *
 * 上一版把 token 三档只放在 `visible: true` 那一支里，于是
 * **「钱看不见、token 看得见」这个最常见的情况没地方表达**——
 * 而它正是我们每一轮的实况：provider 报 token，一分钱都不报。
 * 结果是账本里一个 token 都没有，而运行时其实一直知道
 * （上下文栏用的就是同一份数）。作者要做「用量」那一屏时才发现这件事。
 *
 * 所以 token 在两支里都能出现；`strict` 挡的仍然是**不可见时夹带金额**。
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
    /**
     * **拿得到的那部分照样报**。缺省 = 这一项也不知道，
     * 与 0 不是一回事（0 会被读成「免费」）。
     */
    inputTokens: NonNegInt.optional(),
    outputTokens: NonNegInt.optional(),
    cacheReadTokens: NonNegInt.optional(),
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
    /**
     * **这次运行是在什么环境里跑的**（②-B · R5，2026-08-13）。
     *
     * 此前环境只挂在溯源链上（资源 → 产出它的 run → 环境），
     * **Run 自己指不到自己的环境**——而 ②-B 的判据要的正是
     * 「Run 记录里有环境快照」。
     *
     * **缺省 = 不知道**（老库里的 run、探测失败、这类会话没有环境概念），
     * 与 `filesWritten` 同一条口径：不读作「没有环境」。
     *
     * 指向的可能是内核快照，也可能是机器快照——**两者不可比**，
     * 判据在 `env/snapshot.ts` 的 `compareEnvironments`，界面不许自己比。
     */
    environmentSnapshotId: z.string().min(1).optional(),
    cost: CostSchema.optional(),
    /**
     * 这一次**新建**了哪些文件（产物条，2026-08-26）。与 `filesWritten` 同一口径：
     * 缺省 = 不知道，空数组 = 确认没新建。
     */
    filesCreated: z.array(z.string().min(1)).optional(),
    /** pi 的 toolCallId（只有 tool_call 类 Run 有）——转录里 tool item 的 id 就是它 */
    toolCallId: z.string().min(1).optional(),
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
    /**
     * **临时的**（2026-08-11）：没有指定项目的那种对话，自带一个独立目录。
     *
     * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
     *
     * 它仍然是一条项目记录——agent 得有地方读写、账本得有归属——
     * 界面据这个标记把它放在上面那一列（「会话」），不混进项目列表。
     *
     * **缺省 = 不是临时的**。老服务端不发这个字段，读成「正式项目」正好对。
     */
    temporary: z.literal(true).optional(),
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
      /**
       * Jupyter 内核（②-A · K4）。**与前三种都不同**：
       * 它的输出是**结构化条目**（图/表/报错各是一种东西），
       * 不是文本流也不是字节流——界面据此画结构化 Console 而不是终端。
       *
       * Rho 明令禁止用 xterm.js 做 REPL，理由不是审美：
       * **ANSI 字节流里的输出不可查询、不可溯源、不可审计。**
       */
      "kernel",
      /**
       * **ACP agent**（Agent Client Protocol，2026-08-16）。
       *
       * 与 `cli` 的区别不是形态，是**谁说了算**：`cli` 是我们驱动一个
       * headless 进程、事后读它吐的 JSON；ACP 那边 agent **会主动问**
       * （要不要允许这次工具调用），也接受取消。
       *
       * 界面据此多画一样东西：**权限卡**。所以它必须是一种单独的 kind——
       * 混进 `cli` 会让「这段会话会不会问我」变成一个问不出来的问题。
       */
      "acp",
    ]),
    state: z.enum(["starting", "alive", "exited"]),
    /**
     * 会话标题，由第一句用户发言推出（2026-08-10）。
     *
     * **缺省 = 还没说过话**，不是空标题——界面据此显示「新会话」。
     * 少了它，同一个 agent 建出来的会话在侧栏上完全无法区分
     * （作者：*「会话的 ID 怎么都是一个呢？」*）。
     */
    title: z.string().min(1).optional(),
    /** 置顶。**只是分组**——置顶的与没置顶的各自按 `sortOrder` 排 */
    pinned: z.boolean(),
    /** 列表里的位置。**每条都有**，见 schema v8：混用手动序与创建序是一笔烂账 */
    sortOrder: z.int(),
    /** 归档时刻（7.18）。项目列表不列归档了的；只在 `listArchivedSessions` 里带着这个字段 */
    archivedAt: Iso.optional(),
    pid: z.int().optional(),
    exitCode: z.int().optional(),
    createdAt: Iso,
    /**
     * **上一次这段会话干了活是什么时候**（2026-08-19）。
     *
     * 作者：*「我们现在的会话都是 alive 啥的，其实我们可以学习一下 Hermes，
     * 距离上一次对话是多久了。」*
     *
     * 从账本反推（`runs` 的 `MAX(COALESCE(finished_at, started_at))`），
     * **不是新加一列**——新加一列的话所有已存在的会话都是空的，
     * 屏幕上会是一整列「时间不明」。
     *
     * **缺席 = 这段会话建了但没干过活**（量过：作者库里最近 12 段有 4 段是这样），
     * 不是「零时刻」，也不等于 `createdAt`。界面据此退回显示创建时刻，
     * 但那个决定在界面那一层，不在这里。
     */
    lastActiveAt: Iso.optional(),
    /**
     * 这段对话的活干在哪台机器上（②-B · R4′）。**缺省 = 本地。**
     *
     * `cwd` 是**此刻**的当前目录，会随模型 `cd` 变。它必须一直显示在
     * 对话头上：*你以为在 A 目录、实际在 B 目录，然后说一句
     * 「把这里的文件都删了」*——这种事故只有一个防法，
     * 就是那个路径一直在眼皮底下。
     */
    remote: z
      .object({ connectionId: z.string().min(1), label: z.string().min(1), cwd: z.string().min(1) })
      .strict()
      .optional(),
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

/**
 * 一台远端服务器的连接状态（②-B · R3）。
 *
 * **断了要说清为什么，且不静默重连**（计划 §3.3）。
 * 一个只写「未连接」的状态会让人以为是自己还没点，
 * 而实情可能是密码错了、跳板机拒了、或者对端把连接掐了。
 */
export const RemoteStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idle") }).strict(),
  z.object({ kind: z.literal("connecting") }).strict(),
  z.object({ kind: z.literal("ready") }).strict(),
  /** **原因必填**——不带原因的「断了」等于没报 */
  z.object({ kind: z.literal("disconnected"), reason: z.string().min(1) }).strict(),
])
export type RemoteState = z.infer<typeof RemoteStateSchema>

/**
 * 一台远端服务器（②-B · R3）。
 *
 * ## 这份记录里**没有口令**
 *
 * 只有主机、端口、用户名、私钥路径、分组——**那些不是秘密**。
 * 口令与私钥 passphrase 进系统钥匙串，与模型 key 同一套。
 * 这是 `models.json` 那次的直接延伸：**明文落盘的密钥等于没有密钥**。
 *
 * `hasSecret` 只说「配过没有」，**绝不回显**——凭证那条的显示纪律。
 */
export const RemoteConnectionSchema = z
  .object({
    id: z.string().min(1),
    /** 显示名。默认就是 `user@host`，但人常给它起「实验室」这种名字 */
    label: z.string().min(1),
    /**
     * 分组。**只是一个字符串标签，不是树**。
     * 缺省 = 没分组，界面把它们放在最上面，**不造一个叫「未分组」的假分组**
     */
    group: z.string().min(1).optional(),
    host: z.string().min(1),
    port: z.int().min(1).max(65535),
    username: z.string().min(1),
    /** 私钥路径。**路径不是秘密**，所以它回显；口令才进钥匙串 */
    privateKeyPath: z.string().min(1).optional(),
    /** 钥匙串里有没有它的口令。**只说有没有，不说是什么** */
    hasSecret: z.boolean(),
    sortOrder: z.int(),
    createdAt: Iso,
    /**
     * **上一次连上是什么时候**（2026-08-19）。
     *
     * 作者：*「远端服务器也需要激活的时候 alive，非 alive 的话，
     * 就是显示时间。」*
     *
     * **缺省 = 从没连上过**——而且账本里也没有任何会话在它上面干过活
     * （schema v14 用那个事实回填过一次：一段会话在 T 时刻跑在这台机器上，
     * 那么 T 时刻我们必然连着它）。缺席不是「零时刻」，
     * 界面据此退回显示「加进来多久了」。
     */
    lastConnectedAt: Iso.optional(),
    /** 此刻的连接状态。**服务端说了算**——界面自己猜会猜成「以为连着」 */
    state: RemoteStateSchema,
  })
  .strict()
export type RemoteConnection = z.infer<typeof RemoteConnectionSchema>

/**
 * 一个任务（T1，2026-08-12）。
 *
 * 作者：*「任务的对话框里面设置工作路径。如果在任务里面不设置任何工作目录的话，
 * 那么其实就是我们的普通对话。」*
 *
 * **它取代此前的三样**（项目 / 项目下的会话 / 临时会话）——
 * 那三样的区别只有一个：**工作路径是谁给的**。
 */
export const TaskSummarySchema = z
  .object({
    taskId: z.string().min(1),
    /** **缺省 = 还没说过话**，界面显示「新任务」，不是一行空白 */
    title: z.string().min(1).optional(),
    /**
     * 工作路径。**缺省 = 这是一段普通对话。**
     *
     * 服务端仍会给它一个目录让 agent 有地方读写，但那是实现细节，
     * **不进这里**——摆出来只会让人看见一个自己从没选过的路径。
     */
    workspace: z.string().min(1).optional(),
    /**
     * 临时会话的 scratch 目录（2026-08-25）。上面那条「实现细节不进这里」说的是**别摆给人看**——
     * 这一格不是给人看的：空态排队的外部文件要在会话建出来的那一刻知道往哪儿落盘，
     * 界面拿它当落点，不显示、不参与「临时 / 项目」的分组判据（那仍看 `workspace`）。
     */
    scratchWorkspace: z.string().min(1).optional(),
    /** 活儿在哪台远端机器上（②-B · R3）。**缺省 = 本地** */
    connectionId: z.string().min(1).optional(),
    /**
     * 这个任务现在跑的是哪段会话。
     *
     * **缺省 = 还没起来**（刚迁过来、或者进程重启之后）。
     * 那不是错误——界面据此知道「点开时要先把它拉起来」。
     */
    sessionId: z.string().min(1).optional(),
    pinned: z.boolean(),
    sortOrder: z.int(),
    createdAt: Iso,
  })
  .strict()
export type TaskSummary = z.infer<typeof TaskSummarySchema>

/**
 * 一个产物（spec 2026-08-26-产物 §3）：本会话某次 tool_call **新建**的文件。
 * 不是表，是从 Run 推导的视图；不存内容（S18 作者否决）。
 */
export const ArtifactSchema = z
  .object({
    /** 相对工作区 */
    path: z.string().min(1),
    /** 按后缀判（`src/files/file-kind.ts`），认不出 = other，不猜 */
    kind: z.enum(["markdown", "text", "table", "image", "code", "shell", "notebook", "archive", "pdf", "other"]),
    bornRunId: z.string().min(1),
    /** 转录里 tool item 的 id；界面靠它把产物挂到那一轮。老 run 没有 */
    bornToolCallId: z.string().min(1).optional(),
    bornAt: Iso,
    /** 现在还在不在。**缺省 = 查不了**（远端会话），不是「不在」 */
    exists: z.boolean().optional(),
  })
  .strict()
export type Artifact = z.infer<typeof ArtifactSchema>
