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
   * 列一层工作区目录（②-B · F2）。**不递归。**
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
   * 读一个文件供预览（②-B · F2）。**只读。**
   *
   * 三态：文本 / 图片 / 其它。**「其它」必须说清是什么、多大**——
   * 一片空白会被读成「这个文件是空的」。
   */
  readFile: {
    request: z.object({ projectId: z.string().min(1), path: z.string().min(1) }).strict(),
    response: z.discriminatedUnion("kind", [
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
   * 用系统程序打开工作区里的一个文件（②-B · F3）。
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
      .object({ providers: z.array(z.string().min(1)), problem: z.string().optional() })
      .strict(),
    mutating: false,
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
