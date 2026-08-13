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
  RemoteConnectionSchema,
  TaskSummarySchema,
  RunSummarySchema,
  SessionSummarySchema,
  WorkbenchCapabilitiesSchema,
} from "./entities.js"
import { SessionSnapshotSchema } from "./events.js"

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
          ]),
          /** native：pi 的 provider id */
          provider: z.string().optional(),
          model: z.string().optional(),
          command: z.string().optional(),
          /**
           * cli：这个 agent 能选哪些模型（**由配置声明**，Spike H）。
           * 两个外部 CLI 都没有「列出可选项」的接口，所以只能问配置。
           * **缺省 = 没声明**，那时界面不显示模型选择器——不假装有得选。
           */
          models: z.array(z.string()).optional(),
        }),
      ),
      /**
       * **本配置实际用到的 provider**，不是 pi 内置的全部 39 个。
       * 设置界面该问的是「你声明要用的这些，凭证配了吗」。
       */
      providers: z.array(
        z.object({
          providerId: z.string(),
          /** **配置里声明过的 agent 各自用了哪个模型。** 凭证界面看这一份 */
          models: z.array(z.string()),
          /**
           * **该 provider 在模型目录里真正有哪些模型**（①-B″ · U2）。
           *
           * 与上面那一份**语义不同，不能合并**：一个回答「你要用哪些」，
           * 一个回答「你能用哪些」。模型选择器问的是后者。
           *
           * **缺省 = 不知道**（后端没接模型目录端口），与「空数组」
           * （确认该 provider 一个模型都没有）是两回事。
           */
          available: z.array(z.string()).optional(),
          /**
           * 这家服务的**显示名**：`deepseek` → `DeepSeek`（2026-08-11）。
           *
           * 作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」*
           * `ds-chat` 是配置里的一个键——**我们的内部标识，不是这家服务的名字**。
           *
           * **来自 pi 的 provider 表，不是一份手打的对照表**；
           * **缺省 = pi 没给**，界面退回用 id，不在这里编一个。
           */
          name: z.string().optional(),
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

  /**
   * 订阅会话事件（协议 1.3）。
   *
   * **归为只读**：它不改变会话，只是开始看。服务端内部会记下订阅者，
   * 但那是传输层的簿记，不是被观察对象的状态变化——
   * 若判为 mutating，`readOnly` 模式下界面就连回读都做不了，那毫无道理。
   *
   * **2.0 起不再有 `fromSeq`**：订阅一律给全量快照。断线重连、revision 跳号，
   * 处理方式都是同一个——再要一次快照。少一个参数就少一条要对齐的规则。
   */
  subscribeSession: {
    request: z.object({ sessionId: z.string().min(1) }).strict(),
    response: SessionSnapshotSchema,
    mutating: false,
  },
  unsubscribeSession: {
    request: z.object({ sessionId: z.string().min(1) }),
    response: Empty,
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
  /**
   * 开一段**临时会话**：没有指定项目的那种（2026-08-11）。
   *
   * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
   *
   * ## 为什么是一个操作，而不是「先建项目再建会话」
   *
   * 它俩必须一起成立：目录建了、项目记录写了，会话却没起来，
   * 那就在磁盘上和库里各留一份垃圾，而界面上什么都看不到。
   * **一次调用，一个结果**——服务端自己保证这两件事同生共死。
   *
   * 每个临时会话**一个独立目录**（作者选的），路径由服务端定：
   * 让界面去拼路径等于把「往哪写」的决定权交给渲染进程。
   */
  createTemporarySession: {
    request: z.object({ agentId: z.string().min(1) }).strict(),
    response: SessionSummarySchema,
    mutating: true,
  },

  /**
   * 开一个**终端**（2026-08-11）。
   *
   * 作者最早提终端时就说清了两种情况：*「这个终端的路径，应该是项目文件夹的路径
   * （如果选择开启新项目的话），如果没有选择的话，那么终端就在家目录下。」*
   *
   * ## 为什么不是「`createSession` 加一个 cwd 参数」
   *
   * **那等于把「shell 在哪儿开」的决定权交给渲染进程。** 终端里敲什么由人决定，
   * 但**从哪个目录开始**是一条边界——它决定了 `rm -rf .` 会删掉谁。
   * 所以路径由服务端定：给了项目就用项目的工作区，没给就用家目录。
   */
  createTerminalSession: {
    request: z
      .object({
        agentId: z.string().min(1),
        /** 在哪个项目里开。**不给 = 没有打开项目**，那时开在家目录 */
        projectId: z.string().min(1).optional(),
      })
      .strict(),
    response: SessionSummarySchema,
    mutating: true,
  },

  /**
   * 全部临时会话（2026-08-11）。**跨项目**——每个临时会话自带一个项目，
   * 所以按项目一个个问会变成 N 次调用。
   */
  listTemporarySessions: {
    request: Empty,
    response: z.array(SessionSummarySchema),
    mutating: false,
  },

  /**
   * ── 远端连接（②-B · R3/R4）─────────────────────────────────────────
   *
   * 作者要的形状：*「左边搞一个固定的『远端连接』，可以增加分组，
   * 分组里面是 ssh 的服务器，类似 XTerminal 的那种登陆效果。」*
   */

  /**
   * ── 任务（T1，2026-08-12）────────────────────────────────────────
   *
   * **旧的 project / session 操作原样保留。** 界面与后端不该在同一次升级里
   * 同时换——那样一旦哪一边出错，就分不清是谁的问题。
   * 摘掉旧操作是 T4 的事。
   */

  listTasks: {
    request: Empty,
    response: z.array(TaskSummarySchema),
    mutating: false,
  },

  /**
   * 新建一个任务。**路径可以不给**——不给就是一段普通对话。
   *
   * 这正是作者要的那个动作：*「新建任务」*，而工作路径**事后也能设**
   * （见 `setTaskWorkspace`）——先聊起来，需要落到某个目录再落。
   */
  createTask: {
    request: z
      .object({
        agentId: z.string().min(1),
        workspace: z.string().min(1).optional(),
        connectionId: z.string().min(1).optional(),
      })
      .strict(),
    response: TaskSummarySchema,
    mutating: true,
  },

  /**
   * 给任务设工作路径，或**取消设置**。
   *
   * `workspace` 不给 = 取消 = 退回普通对话。**那是一个明确的动作**，
   * 不是「忘了填」——所以它写得进去。
   */
  setTaskWorkspace: {
    request: z
      .object({ taskId: z.string().min(1), workspace: z.string().min(1).optional() })
      .strict(),
    response: TaskSummarySchema,
    mutating: true,
  },

  /**
   * 删掉一个任务（4.9，2026-08-12）。
   *
   * **按 taskId 删，不按 sessionId。** 作者报的：*「我看现在还有一些历史遗留的
   * 对话……因为我现在无法删除。」*
   *
   * 根因是界面手上只有「当前项目 + 临时」两拨会话摘要，而迁移过来的任务
   * 指向的会话在别的项目里——**查不到摘要，那一行就没有删除键**。
   * 让删除只需要 taskId，界面就不必先认识那段会话：
   * **服务端本来就知道它挂在哪。**
   *
   * 与 `deleteSession` 同一套后果（停进程、删记录、**账本不动**），
   * 不是第二份实现——它内部走的就是那一条。
   */
  deleteTask: {
    request: z.object({ taskId: z.string().min(1) }).strict(),
    /** 还剩多少条账本。**一句「已删除」会让人以为历史也没了**，而它没有 */
    response: z.object({ ledgerKept: z.int().nonnegative() }).strict(),
    mutating: true,
  },

  /**
   * 这个工作区里有哪些**技能**（4.10，2026-08-12）。
   *
   * 技能 = `.dawn/agents/*.md` 里的子 agent 定义——**它本来就能跑**
   * （`src/subagent/` 有加载器与执行器），此前只是界面上看不见。
   *
   * **读不进来的文件也要端出来**（`problems`）：一个格式写错的定义
   * 静静地不出现，人只会以为「我写的技能没生效」而找不到原因（规格 7.5）。
   */
  listSkills: {
    request: ByProject,
    response: z
      .object({
        agents: z.array(
          z
            .object({
              name: z.string().min(1),
              description: z.string(),
              /** 缺省 = **继承默认工具集**，不是「一个工具都不给」 */
              tools: z.array(z.string()).optional(),
              model: z.string().min(1).optional(),
              filePath: z.string().min(1),
            })
            .strict(),
        ),
        /** 读不进来的那些。**不静默跳过** */
        problems: z.array(z.object({ filePath: z.string(), reason: z.string() }).strict()),
        /** 定义目录在哪。**界面要能把这个路径说出来**，否则「去哪写」没人知道 */
        dir: z.string().min(1),
      })
      .strict(),
    mutating: false,
  },

  /** 全部连接，**带此刻的状态**。状态由服务端说了算，界面自己猜会猜成「以为连着」 */
  listConnections: {
    request: Empty,
    response: z.array(RemoteConnectionSchema),
    mutating: false,
  },

  /**
   * 新增或修改一台。**不给 `id` 就是新增。**
   *
   * ## `secret` 只进不出
   *
   * 它在请求里，**永远不在响应里**——响应只用 `hasSecret` 说「配过没有」。
   * 这条与模型 key 是同一套纪律：**回显一次，它就落进了截图、日志和录屏。**
   * 不传 `secret` = 不动原来那个（不是「清空」）；传空串才是清除。
   */
  saveConnection: {
    request: z
      .object({
        id: z.string().min(1).optional(),
        label: z.string().min(1),
        group: z.string().min(1).optional(),
        host: z.string().min(1),
        port: z.int().min(1).max(65535).optional(),
        username: z.string().min(1),
        privateKeyPath: z.string().min(1).optional(),
        /** 口令或私钥 passphrase。**进钥匙串，不进库** */
        secret: z.string().optional(),
      })
      .strict(),
    response: RemoteConnectionSchema,
    mutating: true,
  },

  /** 删掉一台。**连着的先断开**，钥匙串里那份也一并删掉——留着就是一份没人认领的秘密 */
  removeConnection: {
    request: z.object({ id: z.string().min(1) }).strict(),
    response: Empty,
    mutating: true,
  },

  /**
   * 连上。**等到真的连上（或失败）才返回**。
   *
   * 立刻返回「连接中」会让界面把「正在连」与「连上了」混为一谈，
   * 而这两者之间可能隔着一次超时。失败时如实抛错，**不退回某个乐观状态**。
   */
  connectRemote: {
    request: z.object({ id: z.string().min(1) }).strict(),
    response: RemoteConnectionSchema,
    mutating: true,
  },

  /**
   * 在一台远端服务器上开一段对话（②-B · R4′）。
   *
   * 作者：*「我只需要 ssh 连接到服务器，然后自然语言告诉我跳到哪个文件夹
   * 之类的不就好了？」「连上就默认用家目录，先聊起来，需要换地方再换。」*
   *
   * ## 没有「先选个目录」这道手续
   *
   * **起点由服务端定 = 那台机器上的家目录**，不收渲染进程给的路径——
   * 与 `createTerminalSession` 同一条理由：从哪个目录开始是一条边界，
   * 它决定了 `rm -rf .` 会删掉谁。之后换地方靠说话。
   *
   * **没连上就先连**：人点的是「在这台机器上干活」，
   * 让他先按一次「连接」再按一次「新对话」是把我们的实现顺序摊给他看。
   */
  createRemoteSession: {
    request: z
      .object({
        connectionId: z.string().min(1),
        agentId: z.string().min(1),
      })
      .strict(),
    response: SessionSummarySchema,
    mutating: true,
  },

  /** 主动断开。**这与「断线」不是一回事**——前者是人按的，后者要报原因 */
  disconnectRemote: {
    request: z.object({ id: z.string().min(1) }).strict(),
    response: RemoteConnectionSchema,
    mutating: true,
  },

  writeToSession: {
    request: z.object({
      sessionId: z.string().min(1),
      data: z.string(),
      /** 必填：不能匿名写。写权可追责的唯一入口（规格 7.1） */
      as: HolderSchema,
      /**
       * 随这一轮一起送进模型的图片（协议 4.12；4.13 加了粘贴那一支）。
       *
       * **两个来源，形状不同，因为它们手上的东西本来就不同**：
       *
       * - `path`：从磁盘挑的。**渲染进程只送路径**——读盘、缩放、转 base64
       *   都在主进程做。给渲染进程开一条读文件的通道，**那条通道就不只能
       *   用来读图片**，边界比省一次拷贝重要。
       * - `bytes`：**粘贴板里的**。它压根没有路径——剪贴板里的截图不是
       *   磁盘上的一个文件。硬要给它编一个临时路径写到盘上，
       *   等于为了迁就形状去制造垃圾文件。
       *
       * 用判别式而不是「几个可选字段」：后者允许
       * `{path, data}` 同时给、或者两个都不给这种说不通的组合，
       * **而那种请求只会在更下游炸，那时报错离原因已经很远了**。
       *
       * 空数组与不给是同一个意思。**不支持图片的运行时会报错，不会静默丢掉。**
       */
      images: z
        .array(
          z.discriminatedUnion("from", [
            z.object({ from: z.literal("path"), path: z.string().min(1) }).strict(),
            z
              .object({
                from: z.literal("bytes"),
                /** base64，**不带 `data:` 前缀** */
                data: z.string().min(1),
                mimeType: z.string().min(1),
              })
              .strict(),
          ]),
        )
        .optional(),
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
      /** pi 的 provider id。**2026-08-08 由 endpointId 改名**——凭证按 provider 存 */
      providerId: z.string().min(1),
      secret: z.string().min(1),
    }),
    response: Empty,
    mutating: true,
  },
  deleteCredential: {
    request: z.object({ providerId: z.string().min(1) }),
    response: Empty,
    mutating: true,
  },
  /**
   * 中止当前回合。**界面终于能有一个停止按钮**——
   * 此前 agent 一旦跑起来就只能等它自己停。
   */
  abortSession: {
    request: z.object({ sessionId: z.string().min(1) }).strict(),
    response: Empty,
    mutating: true,
  },

  /**
   * 上下文用量（①-B″ · U3）。
   *
   * **每个字段各自为真，缺的就缺着。** `bytes` 是**字节，不是 token**——
   * `pi-ai` 没有 tokenizer，拿字节占比去凑一个 token 分解就是编造，
   * 而分解不准比不分解更坏：它会让人据此做错决定。
   *
   * `usedTokens` 暂缺（provider 报的 usage 尚未采集），界面应显示「尚未采集」，
   * **不要用字节去估**。
   */
  getContextUsage: {
    request: z.object({ sessionId: z.string().min(1) }).strict(),
    response: z.object({
      model: z.string().optional(),
      /** 模型自带的上下文上限（token）。**真数**；缺省 = 不知道 */
      contextWindow: z.int().min(0).optional(),
      /**
       * 最近一次请求的输入 token（含缓存命中）。**provider 报的真数。**
       * 缺省 = **尚未采集，不是 0**。
       */
      usedTokens: z.int().min(0).optional(),
      /** 三档内容的**字节数，不是 token** */
      bytes: z.object({
        system: z.int().min(0),
        tools: z.int().min(0),
        history: z.int().min(0),
      }),
    }),
    mutating: false,
  },

  /**
   * 会话中途换模型（①-B″ · U2）。
   *
   * **能力由 Spike E 在真链路上验过**：换了之后下一次请求确实打到新模型
   * （从假后端记下的请求体证明）。可选模型来自 `getProviders` 已有的
   * `providers[].models`——不必再造一个查询。
   *
   * 失败是**业务性**的，界面要能分辨并给出路：
   * 模型不存在 / 没配 API key / 这一轮还没说完。
   */
  setSessionModel: {
    request: z
      .object({
        sessionId: z.string().min(1),
        /**
         * pi 的 provider id。**cli 会话没有这个概念**（①-C），故放宽为可选。
         *
         * 放宽是**兼容的方向**：老界面照旧会传，新界面对 cli 会话不传。
         */
        provider: z.string().min(1).optional(),
        model: z.string().min(1),
      })
      .strict(),
    response: Empty,
    mutating: true,
  },

  /**
   * 插一句引导，**不打断整轮**。
   *
   * 与 `writeToSession` 的区别：后者是「说完了，该你了」，
   * 前者是「你继续，但注意这个」。pi 的 `steer` 直接支持。
   */
  steerSession: {
    request: z.object({ sessionId: z.string().min(1), text: z.string().min(1) }).strict(),
    response: Empty,
    mutating: true,
  },

  /**
   * 列出本机能用的内核（②-A · K2）。
   *
   * **必须连解释器路径一起给。** 作者机器上五个 kernelspec 里有三个是 conda 环境，
   * 光看名字（`d2l` / `datascience` / `python_learn`）完全分不出哪个是哪个——
   * 挑错的后果不是报错，是**跑在了另一个环境里而不自知**。
   *
   * `problems` 与 `shadowed` 都要回：**坏掉的注册项要能被看见**，
   * 被同名挡住的那份是「为什么我改了配置没生效」的唯一答案。
   */
  listKernels: {
    request: Empty,
    response: z.object({
      kernels: z.array(
        z.object({
          name: z.string(),
          displayName: z.string(),
          /** kernel.json 没写就没有这个字段。**不猜** */
          language: z.string().optional(),
          /** argv[0]。**界面必须显示它**——见上面那段 */
          executable: z.string().optional(),
          dir: z.string(),
        }),
      ),
      /** 读不出来的注册项。**不静默跳过** */
      problems: z.array(z.object({ dir: z.string(), reason: z.string() })),
      /** 被同名的前一份挡住的 */
      shadowed: z.array(z.object({ name: z.string(), dir: z.string() })),
    }),
    /** 只读：扫目录不改任何东西 */
    mutating: false,
  },

  /**
   * 这个会话现在有哪些变量（②-A · K5 · S14）。
   *
   * **三态，不是两态**——它们对用户意味着完全不同的事：
   *   `supported: false` + `reason`  —— 这个内核我们还不会问（例如 R）
   *   `supported: true` + 空数组      —— 问到了，**真的一个变量都没有**
   *   操作本身失败                    —— 会话不存在等
   *
   * 把前两者混成一个空列表，就是把「我们没去问」说成「这里什么都没有」。
   */
  listVariables: {
    request: z.object({ sessionId: z.string().min(1) }).strict(),
    response: z.discriminatedUnion("supported", [
      z.object({ supported: z.literal(false), reason: z.string().min(1) }).strict(),
      z
        .object({
          supported: z.literal(true),
          variables: z.array(
            z
              .object({
                name: z.string(),
                type: z.string(),
                /** 维度／长度。**拿不到就没有这个字段** */
                dimensions: z.string().optional(),
                preview: z.string(),
                /** **预览被砍过。** 砍过的和完整的看起来一模一样，所以必须显式标注 */
                previewTruncated: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
    ]),
    mutating: false,
  },

  /**
   * 两个解释器路径（2026-08-10，作者定的机制）。
   *
   * *「我不是要求你扫描整个电脑，而是直接提供一个 R 解释器和 Python 解释器的
   * 路径即可。**只有配置了，我们才能调用**。」*
   *
   * 所以**没配的那个不给字段**——不是空串。空串会被读成「配了一个空路径」，
   * 而实情是「还没配」，界面据此说的话完全不同。
   */
  /**
   * **App 的默认工作目录**（4.11，2026-08-12，作者要的）。
   *
   * 作者：*「设置里面要增加一个 App 默认设置的工作目录，也就是初始化的目录，
   * windows 就默认设置在桌面，mac 默认家目录下设置一个 `DAWN` 的目录。」*
   *
   * **两处用它**：没给工作目录的那些对话落在这儿（此前落在应用数据目录里——
   * 一个用户永远找不到的地方），以及**选文件夹时从这儿起步**。
   *
   * 返回里带 `isDefault`：**「我没配过、这是系统给的默认值」与「我配的就是它」
   * 是两回事**——界面据此决定要不要说「默认」。
   */
  getDefaultWorkspace: {
    request: Empty,
    response: z
      .object({ path: z.string().min(1), isDefault: z.boolean() })
      .strict(),
    mutating: false,
  },

  /** 改默认工作目录。**传空串等于恢复系统默认** */
  setDefaultWorkspace: {
    request: z.object({ path: z.string() }).strict(),
    response: z.object({ path: z.string().min(1), isDefault: z.boolean() }).strict(),
    mutating: true,
  },

  getInterpreters: {
    request: Empty,
    response: z
      .object({
        python: z.string().optional(),
        r: z.string().optional(),
      })
      .strict(),
    mutating: false,
  },

  /** 设一个解释器路径。**传空串等于清除**——那是「我不想配了」 */
  setInterpreter: {
    request: z
      .object({
        language: z.enum(["python", "R"]),
        /** 绝对路径。空串 = 清除 */
        path: z.string(),
      })
      .strict(),
    response: z
      .object({
        /** 存下来之后的现状。**回显是必须的**——看不见自己配了什么等于没配 */
        python: z.string().optional(),
        r: z.string().optional(),
        /**
         * 这条路径能不能用。**当场验，不等到建会话才炸**。
         * 三种实情各说各的话，见 `diagnoseInterpreter`。
         */
        problem: z.string().optional(),
      })
      .strict(),
    mutating: true,
  },

  /**
   * 列一层工作区目录（②-A′ · F2）。**不递归。**
   *
   * 递归会让「一次调用」的代价不可预期——一个 `node_modules` 就能让它跑几十秒。
   * 界面按需一层层要，代价始终有界。
   *
   * `ignored` 与 `omitted` **都要回**：忽略掉的与省略掉的如果不出声，
   * 人会以为那些文件不存在。
   */
  listDirectory: {
    request: z
      .object({
        projectId: z.string().min(1),
        /** 相对工作区的路径。**空串 = 根目录**；绝对路径会被拒 */
        path: z.string().default(""),
        includeIgnored: z.boolean().optional(),
      })
      .strict(),
    response: z
      .object({
        path: z.string(),
        entries: z.array(
          z
            .object({
              name: z.string(),
              kind: z.enum(["file", "dir"]),
              /** 目录没有这个字段——**目录的「大小」是个误导** */
              size: z.int().min(0).optional(),
              // ISO 时间串。此处不复用 entities 的 `Iso`（它没导出）
              modifiedAt: z.string().min(1),
            })
            .strict(),
        ),
        ignored: z.int().min(0),
        omitted: z.int().min(0),
      })
      .strict(),
    mutating: false,
  },

  /**
   * 读一个文件供预览（②-A′ · F2）。**只读。**
   *
   * 三态：文本 / 图片 / 其它。**「其它」必须说清是什么、多大**——
   * 一片空白会被读成「这个文件是空的」。
   */
  readFile: {
    request: z.object({ projectId: z.string().min(1), path: z.string().min(1) }).strict(),
    response: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("pdf"),
          mediaType: z.literal("application/pdf"),
          /** 字节。**经守卫过的后端取回，不给渲染进程 `file://`** */
          base64: z.string(),
          bytes: z.int().min(0),
        })
        .strict(),
      z
        .object({
          kind: z.literal("text"),
          mediaType: z.string(),
          text: z.string(),
          bytes: z.int().min(0),
          /** 截断要说清**省了多少**（规格 7.5） */
          truncated: z.object({ originalBytes: z.int(), keptBytes: z.int() }).strict().optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("image"),
          mediaType: z.string(),
          /** base64。**不给 file:// 路径**——那等于把守卫的判断权交给渲染进程 */
          base64: z.string(),
          bytes: z.int().min(0),
        })
        .strict(),
      z
        .object({
          kind: z.literal("other"),
          mediaType: z.string(),
          bytes: z.int().min(0),
          reason: z.string().min(1),
        })
        .strict(),
    ]),
    mutating: false,
  },

  /**
   * 用系统程序打开工作区里的一个文件（②-A′ · F3）。
   *
   * **它仍然走同一个路径守卫**——直接给绝对路径调 `shell.openPath`
   * 等于把刚建好的守卫绕过去。这里收的是**工作区内的相对路径**，
   * 由后端解析并校验之后才交给系统。
   */
  openExternally: {
    request: z.object({ projectId: z.string().min(1), path: z.string().min(1) }).strict(),
    /** 系统拒绝时的说明。**打不开要出声**，不是静静地什么都不发生 */
    response: z.object({ problem: z.string().optional() }).strict(),
    mutating: false,
  },

  /**
   * 删掉一个会话（2026-08-10）。
   *
   * **账本不动。** 账本记的是「对你的文件发生过什么」，那件事不因为
   * 你删掉一个会话就没发生（不变式 5）。响应里如实回还剩多少条——
   * 让人看得见「我删的是会话，不是历史」。
   */
  deleteSession: {
    request: z.object({ sessionId: z.string().min(1) }).strict(),
    response: z.object({ ledgerKept: z.int().min(0) }).strict(),
    mutating: true,
  },

  /**
   * 从工作台移除一个项目（2026-08-10）。
   *
   * **绝不删除磁盘上的文件夹。** 移除的是工作台里的一条记录，
   * 连同它名下的会话与账本（账本本来就是按项目组织的，项目没了它没有归属）。
   *
   * 响应回**真的删了多少**，不是一句「已删除」——
   * 不可逆的操作要能事后对账。
   */
  deleteProject: {
    request: z.object({ projectId: z.string().min(1) }).strict(),
    response: z
      .object({ sessionsDeleted: z.int().min(0), runsDeleted: z.int().min(0), workspace: z.string() })
      .strict(),
    mutating: true,
  },

  /**
   * 删除前的影响面（2026-08-10）。
   *
   * **确认框上要摆真数字**，不是「确定要删除吗？」。
   * 界面手里没有这些数（会话列表只装当前项目的，账本更是分页的），
   * 所以问后端要——**猜一个数字比不给数字更坏**。
   */
  deletionImpact: {
    request: z.object({ projectId: z.string().min(1) }).strict(),
    response: z.object({ sessions: z.int().min(0), runs: z.int().min(0), workspace: z.string() }).strict(),
    mutating: false,
  },

  /**
   * pi 认识的全部 provider（2026-08-10）。
   *
   * **与 `getProviders` 不是一回事**：那一份是「providers.yaml 里声明过的 agent
   * 各自用了哪个 provider」——**「我配过谁」**；这一份是 pi 的模型目录里出现过的
   * 全部 provider——**「我能配谁」**。作者机器上前者是 1，后者是 39。
   *
   * 目录取不到时**如实说取不到**（`problem`），不返回一个短清单——
   * **缺失不等于不支持**，而一个悄悄变短的清单没有任何人会发现。
   */
  listKnownProviders: {
    request: z.object({}).strict(),
    response: z
      .object({
        providers: z.array(z.string().min(1)),
        /**
         * 每个 provider 有哪些模型（2026-08-10）。
         *
         * **必须在这里给**：`getProviders` 的 `available` 只覆盖**配置里用到的**
         * 那几个，而「想加一个新 agent」恰恰是在给一个**还没被用到**的 provider
         * 挑模型——那时前者是空的。
         */
        models: z.record(z.string(), z.array(z.string())).optional(),
        /**
         * **这些 provider 的地址 pi 不自带**，得人自己填
         * （Bedrock / Azure / Vertex / Cloudflare×2 / opencode×2 / radius）。
         * 界面据此给它们一个输入框——不给的话，填了 key 也连不上而没人知道为什么。
         */
        needsBaseUrl: z.array(z.string()).optional(),
        /**
         * 已经写下的连接设置（2026-08-10 由 `baseUrls` 扩成这个）。
         *
         * **只回写过的**，没写过的不给键——空对象会被读成「写过，但都是空的」，
         * 而那与「没写过」在界面上要说两句不同的话。
         *
         * 三样一起回：设置里那个编辑器要能改任何一项，
         * 只回地址的话「协议」与「模型清单」每次打开都是空的，
         * 看起来像被清掉了。
         */
        connections: z
          .record(
            z.string(),
            z
              .object({
                baseUrl: z.string().optional(),
                api: z.string().optional(),
                models: z.array(z.string()).optional(),
              })
              .strict(),
          )
          .optional(),
        problem: z.string().optional(),
      })
      .strict(),
    mutating: false,
  },

  /**
   * 这个会话准入时的环境快照（②-B · S17）。
   *
   * **三态**，与 `listVariables` 同一条纪律：
   *   - 不支持（内核语言不是 Python/R）→ 说清为什么
   *   - 还没拿到（探测失败、会话刚起）→ 说清为什么，**不给一份空快照**
   *   - 拿到了 → 完整快照 + 它的内容指纹
   *
   * **一份空快照会被读成「这个环境什么都没有」**，而实情是「我们没问到」。
   *
   * 返回的是**准入时刻**冻结的那一份，不是现在重新探的
   * （Rho 的禁令：不得回头探测当前库）。
   */
  getEnvironment: {
    request: z.object({ sessionId: z.string().min(1) }).strict(),
    response: z.discriminatedUnion("captured", [
      z.object({ captured: z.literal(false), reason: z.string().min(1) }).strict(),
      z
        .object({
          captured: z.literal(true),
          /** 内容指纹。**同一个环境的两个会话给同一个 id** */
          id: z.string().min(1),
          language: z.enum(["python", "R"]),
          version: z.string(),
          executable: z.string(),
          platform: z.string(),
          libraryPaths: z.array(z.string()),
          packages: z.array(z.object({ name: z.string(), version: z.string() }).strict()),
          /** 实际装了多少。**与 `packages.length` 不同即为被截断**（规格 7.5） */
          packagesTotal: z.int().min(0),
        })
        .strict(),
    ]),
    mutating: false,
  },

  /**
   * 会话改名（2026-08-10）。
   *
   * 作者：*「可以置顶，可以挪动对话的顺序，可以重命名，可以删除。」*
   *
   * **空串等于清掉**，回到自动标题「新会话」——而不是存一个空标题，
   * 那在界面上是一行空白，看起来像加载失败。
   */
  renameSession: {
    request: z.object({ sessionId: z.string().min(1), title: z.string().max(200) }).strict(),
    response: z.object({}).strict(),
    mutating: true,
  },

  /** 置顶／取消置顶。**只是分组，不是另一种序**——两组各自按位置排 */
  setSessionPinned: {
    request: z.object({ sessionId: z.string().min(1), pinned: z.boolean() }).strict(),
    response: z.object({}).strict(),
    mutating: true,
  },

  /**
   * 上移／下移一格。
   *
   * **只在同一组里换**（置顶的和没置顶的各排各的）——跨组换等于偷偷改了置顶状态。
   * **已经在头/尾时如实回 `moved: false`**，不假装成功也不报错：
   * 「没得动了」是一个正常结果。
   */
  moveSession: {
    request: z
      .object({ sessionId: z.string().min(1), direction: z.enum(["up", "down"]) })
      .strict(),
    response: z.object({ moved: z.boolean() }).strict(),
    mutating: true,
  },

  /**
   * 按给定顺序重排会话（拖拽排序，2026-08-10）。
   *
   * **客户端发完整顺序，服务端一次写完。** 在客户端算「插在 A 与 B 之间」的
   * 位置需要间隙分配，间隙用光还得重排——那是把服务端的活搬到客户端，
   * 再把重排变成一个偶发事件。
   *
   * **不属于这个项目的 id 会被忽略**（不是报错、也不是照写）——
   * 照写会让一条会话被挪进别人的项目里。响应回**真正重排了几条**。
   */
  reorderSessions: {
    request: z
      .object({ projectId: z.string().min(1), orderedIds: z.array(z.string().min(1)).max(1000) })
      .strict(),
    response: z.object({ reordered: z.int().min(0) }).strict(),
    mutating: true,
  },

  /**
   * 在配置里加一个 native agent（2026-08-10）。
   *
   * 作者：*「我配置了 kimi-coding 的 API，但是配置完，在对话里面无法选择 kimi 呢？」*
   *
   * **填 key 只是「连得上」**——能不能建会话看的是配置里有没有声明 agent。
   * 此前那句解释躺在设置界面一个默认折叠的说明里，等于不存在；
   * 而**让人打开一个 yaml 手写一段，本身就是这个应用没做完**。
   *
   * 只支持 `kind: native`：cli 与 pty 要填的是命令行与参数，那是另一件事，
   * **在这里顺手支持等于让一个「加个模型」的按钮悄悄能起任意进程**。
   */
  createAgent: {
    request: z
      .object({
        agentId: z.string().min(1).max(32),
        provider: z.string().min(1),
        model: z.string().min(1),
      })
      .strict(),
    /** 加完之后**立刻可用**（内存里那份 registry 原地更新，不用重启） */
    response: z.object({ agentId: z.string() }).strict(),
    mutating: true,
  },

  /**
   * 写一个 provider 的连接设置（2026-08-10）。
   *
   * pi 自带 40 个 provider 的地址，**有 8 个不自带**——它们跟账号、区域、
   * 项目走（Azure 的 deployment、Vertex 的 project、Cloudflare 的 account id）。
   * 而**自带地址的那 32 个也得能改**：作者在 platform.kimi.com 买的按量 API
   * 与 pi 自带的 Kimi For Coding 订阅线不是一条路，填对了 key 照样 401。
   *
   * **三样一起给，是全量替换那一条**，不是打补丁。
   * 打补丁的话「把 api 清空」表达不出来——而清空正是「我填错了，
   * 回到 pi 的默认」唯一的说法。
   *
   * **三样全空 = 取消覆盖。** 存一个空地址会让请求打到空处，
   * 而报错与「你填空了」毫无关系。
   *
   * `apiKey` **不在这里**：它走 `setCredential` 进 OS 的加密存储。
   * 这个操作写的是 `providers.yaml`，一份用户随时会打开来读的明文文件。
   */
  setProviderConnection: {
    request: z
      .object({
        providerId: z.string().min(1),
        baseUrl: z.string().max(500).optional(),
        api: z.string().max(100).optional(),
        /** 这个端点有哪些模型。**自建端点必须给**——pi 猜不出你的 vLLM 上跑着什么 */
        models: z.array(z.string().min(1)).max(200).optional(),
      })
      .strict(),
    response: z.object({}).strict(),
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

/**
 * 某个操作的响应类型。
 *
 * **给界面用的**：手抄一份响应的形状迟早会和这里漂开，
 * 而漂开的那一刻编译器什么都不会说——它比对的是两份都「自洽」的类型。
 */
export type ResponseOf<N extends OperationName> = z.infer<(typeof OPERATIONS)[N]["response"]>

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
