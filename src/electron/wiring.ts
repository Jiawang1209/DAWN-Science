/**
 * 装配层（Task 2.7）。
 *
 * **本文件不 import electron。** 把 store / manager / server 拼起来是纯逻辑，
 * 应当能脱离 Electron 单独验证——与 Task 2.3 让服务端不认识 Electron 是同一手法。
 * `main.ts` 只剩窗口与 IPC 注册两件事。
 */
import { homedir } from "node:os"
import Database from "better-sqlite3"
import { writeModelsJson } from "../config/models-json.js"
import { EnvironmentStore } from "../store/environments.js"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { loadRegistryOrDefault } from "../config/loader.js"
import { migrate } from "../store/schema.js"
import { ProjectStore } from "../store/projects.js"
import { RunStore } from "../store/runs.js"
import { SessionStore } from "../store/sessions.js"
import { ProjectManager } from "../project/manager.js"
import { RunRecorder } from "../project/run-recorder.js"
import { diffSince, snapshot, type GitBaseline } from "../project/git-facts.js"
import { 造门, 造MCP门 } from "../policy/permissions.js"
import { MCP池 } from "../mcp/客户端.js"
import { 合名单 } from "../mcp/名单.js"
import { SessionManager, type PtyAgentDef } from "../session/manager.js"
import { NativeRuntime } from "../runtime/native.js"
import { CliRuntime } from "../runtime/cli/runtime.js"
import { AcpRuntime } from "../runtime/acp/runtime.js"
import { PtyRuntime } from "../runtime/pty.js"
import { KernelRuntime } from "../runtime/kernel.js"
import { 对话内核 } from "../kernel/挂载.js"
import { familyOf } from "../runtime/family.js"
import { createWorkbenchBackend, type CredentialsPort } from "../workbench/backend.js"
import { SettingsStore } from "../store/settings.js"
import { createPiCredentialStore } from "../workbench/credential-store.js"
import { SessionTranscripts } from "../workbench/events.js"
import { Client as SshClient } from "ssh2"
import { ConnectionStore } from "../store/connections.js"
import { TaskStore } from "../store/tasks.js"
import { RemoteConnections } from "../remote/connections.js"
import { 造一台假服务器 } from "../remote/fake-ssh.js"
import type { RemoteState, SshClientLike } from "../remote/ssh.js"
import { WorkbenchServer } from "../workbench/server.js"

/**
 * 每会话事件缓冲的字符上限。
 *
 * 取值依据 Spike C：xterm 的 5000 行 scrollback 是 20 万行输入下内存仍稳在
 * 526 MB 的原因，而 scrollback 是内存的主控参数。20 万字符约合数千行，
 * 与该量级同阶。**它是内存预算，不是显示偏好**——调大之前先算会话数 × 上限。
 */
export const DEFAULT_TERMINAL_SCROLLBACK_CHARS = 200_000

export interface CreateWorkbenchOptions {
  /**
   * 临时会话的目录根。**测试必须给**——不给就落到开发机的 `~/DAWN/scratch`。
   */
  scratchRoot?: string
  /**
   * 全局技能目录。**测试必须给**——不给就落到开发机的 `~/DAWN/skills`，
   * 与 `scratchRoot` 同一条理由（那条已经为此栽过：往家目录里写）。
   */
  skillsDir?: string
  /**
   * 自带技能的目录（随应用发布，**只读**）。
   *
   * **不往用户目录里偷偷写**：拷一份过去的话，应用升级时那份是旧的，
   * 而人根本不知道自己手上是哪一版。放在这儿，它永远跟着应用走。
   * 想改？把那个文件夹复制到 `~/DAWN/skills` 下再改——那是显式的。
   */
  builtinSkillsDir?: string
  configPath: string
  dbPath: string
  readOnly?: boolean
  onInternalError?: (operation: string, err: unknown) => void
  /** 凭证库。**app 自己管凭证**，不要求用户手写进配置文件 */
  credentials: CredentialsPort
  /**
   * 交给系统打开一个绝对路径（②-A′ · F3）。
   *
   * **参数传进来，不在这里 import electron**——wiring 是纯逻辑，
   * 要能在没有 Electron 的测试里跑起来。主进程传 `shell.openPath`。
   */
  openPath?: (absolutePath: string) => Promise<string>
  /** 每会话事件缓冲上限（字符）。默认 `DEFAULT_TERMINAL_SCROLLBACK_CHARS` */
  terminalScrollbackChars?: number
  /** 写权租约的 TTL（秒）。**默认 300**；e2e 调小它来验过期那条路 */
  leaseTtlSeconds?: number
  /**
   * 用假服务器代替真 SSH（②-B · R3）。**mock 模式与 e2e 用**。
   *
   * 准入规则 1：新增的协议操作要在同一次改动里有 mock 分支，
   * 否则「添加服务器 → 连接」这条路径在 mock 模式下走不通，
   * 于是它只能靠人拿真机试——那意味着**它几乎不会被试**。
   */
  fakeSsh?: boolean
  /**
   * 一个项目都没有时使用的默认工作区。
   *
   * 给出时启动阶段会保证至少存在一个项目——**「打开文件夹」因此不再是准入门槛**。
   * 已经有项目时这个值不生效，目录也不会被创建。
   */
  defaultWorkspace?: string
  /**
   * pi 的 `models.json` 路径。给出时可覆盖内置 provider 的 baseUrl 与凭证。
   *
   * **这是 mock 模式的入口**：`scripts/dev-mock.mjs` 写一份指向本地假推理
   * 服务器的 models.json，于是整条真链路照跑、只有模型是假的。
   */
  modelsPath?: string
  /**
   * 子 agent 入口的绝对路径。**给了才注册 `subagent` 工具**（①-B″ · S1）。
   *
   * 由 `main.ts` 按 `import.meta.dirname` 算出来——那是 `dist/electron/`，
   * 子侧入口就打在它旁边。**不在这里算**：本模块不该知道构建产物的布局。
   */
  subagentChildEntry?: string
  /**
   * 去哪找外部 CLI 自己的配置（codex 的 `models_cache.json`）。
   * **不给时读真实家目录**；e2e 指向隔离目录，理由见 `backend.ts` 的同名字段。
   */
  cliHome?: string
  /**
   * 跳过「建会话前检查凭证」这道自有守卫。
   *
   * **只在 mock 模式下为真**：那时凭证由 models.json 提供，我们的守卫
   * （它的存在理由是「不要带着空 key 去发请求」）就成了多余的阻拦。
   */
  skipCredentialGate?: boolean
}

export interface Workbench {
  server: WorkbenchServer
  db: Database.Database
  sessions: SessionManager
  /**
   * 装配好的内置运行时。**只为让「权限门接上了没有」可被验证**（2026-08-13）。
   *
   * 不导出它，那句 `gate: 权限门` 就没有任何测试盯得住：
   * 直接 `new NativeRuntime({gate})` 的用例验的是运行时那一层，
   * **摘掉接线它们照样绿**（变异验证当场发现）。
   */
  nativeRuntime: NativeRuntime
  /** 事件中枢。`main.ts` 把它的推送接到 webContents */
  events: SessionTranscripts
  /**
   * 远端连接状态的推送口（②-B · R3）。**只有一个听众**——`main.ts`。
   *
   * 它与会话那条通道分开的理由：**一台服务器不属于任何会话**。
   * 塞进 `SessionUpdate` 就得给它编一个假的 `sessionId`，
   * 而编出来的 id 迟早会被人当真。
   */
  onRemoteState(cb: (u: { connectionId: string; state: RemoteState }) => void): () => void
  /** 启动对账修正的残留会话条数 */
  reconciled: number
  close(): void
  /** 退出前的收摊：**先停会话再关库**（否则 zeromq 的析构会让进程 SIGABRT） */
  closeAsync(timeoutMs?: number): Promise<void>
  /** 退出时要不要等收摊。**只有内核会话需要**——其余的等一秒是白等 */
  needsGracefulShutdown(): boolean
}

export function createWorkbench(opts: CreateWorkbenchOptions): Workbench {
  // 缺配置就写一份带注释的默认模板，**不是抛 ENOENT**——见 loader.ts 的说明
  const registry = loadRegistryOrDefault(opts.configPath)

  mkdirSync(dirname(opts.dbPath), { recursive: true })
  const db = new Database(opts.dbPath)
  migrate(db)

  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  // 应用级设置：两个解释器路径住在这里（②-A 后续）
  const settingsStore = new SettingsStore(db)

  // pi 的凭证接口。加密仍由我们负责，**缓存是必需的**——见 credential-store.ts
  const piCredentials = createPiCredentialStore(opts.credentials)

  /**
   * provider 的连接设置 → pi 认的 `models.json`（2026-08-10）。
   *
   * pi 自带 40 个 provider 的地址，**有 8 个不自带**（Bedrock / Azure / Vertex /
   * Cloudflare 两个 / opencode 两个 / radius）——它们的地址跟账号、区域、项目走。
   * pi 读这些的入口只有 `modelsPath` 指的那份 json，而生产环境**从来没传过**。
   *
   * **每次启动重新生成**：以 `providers.yaml` 为唯一事实来源。
   * 那个路径同时是 pi 缓存远端目录的地方，可能被它覆盖——
   * 不重新生成的话，用户的覆盖会某天悄悄消失而没有任何迹象。
   */
  /**
   * **写到一个跟基底不同名的文件里**（`models.generated.json`）。
   *
   * 同名会让「基底」和「产物」变成同一个文件，于是删掉一条连接设置之后，
   * 下一次生成又会从上一次的产物里把它读回来——**删不掉，且没有任何迹象**。
   * 开发/测试时基底是假服务器那份目录，正好会撞上这个。
   */
  const 生成的模型目录 = writeModelsJson(
    join(dirname(opts.dbPath), "models.generated.json"),
    registry.providers,
    opts.modelsPath,
  )

  /** **提出来复用**：模型目录端口要问的就是这一个实例（它持有 ModelRuntime 缓存） */
  /**
   * **工具权限门**（2026-08-13）。
   *
   * 此前 `NativeRuntime` 一直没收到 gate——`native.ts` 里那道门写得很认真、
   * 注释还写着*「授权门静默失效比没有还危险」*，而它**从来没被接上过**。
   * `providers.yaml` 里那行 `capabilities: [chat, exec]` 至今没有任何东西在执行。
   *
   * **档位是每次调用现取的**（`settings.get`），不是建会话时读一次：
   * 读一次的话，在设置里改完档要等下次建会话才生效，
   * 那是「设置里改了、界面上没反应」的经典形状。
   */
  const 权限门 = 造门(() => (settingsStore.get("permission.mode") === "deny-risky" ? "deny-risky" : "allow-all"))

  /**
   * Jupyter 内核的运行时。**提出来命名，因为现在有两个用处**（②，2026-08-14）：
   * `kind: kernel` 那条既有的会话类型，以及**普通对话挂的内核**。
   * 各造一个的话，两边会各起各的进程，而「这段对话的 df 在哪台里」就说不清了。
   */
  const 内核运行时 = new KernelRuntime()

  /**
   * 对话的内核（②）。**每种语言一台、各自懒起**——
   * 没人跑代码时它一个进程都不占。
   */
  const 对话的内核 = new 对话内核({
    runtime: 内核运行时,
    // **工作区从会话表取**：代码总得有个地方跑，取不到就起不了（那时如实报错）
    workspaceOf: (对话) => sessionStore.get(对话)?.workspace,
    // 每台内核一个隔离目录，与 per-session 隔离同一条纪律
    // 挂在数据库同级（与 `models.generated.json` 同一条惯例），**每台一个目录**
    sessionDirOf: (对话, 语言) => join(dirname(opts.dbPath), "kernels", 对话, 语言),
    /**
     * 解释器路径**每次现取**（与 `interpreterOf` 那条同一个理由）：
     * 缓存住的表现是「我在设置里改了，起内核还是用旧的」。
     *
     * **只配一门是常态**（作者点出来的：有人只用 R，有人只用 Python），
     * 所以另一门返回 undefined 不是异常——挂载层会如实说「还没配」。
     */
    interpreterOf: (语言) =>
      settingsStore.get(语言 === "python" ? "interpreter.python" : "interpreter.r"),
    /**
     * **把内核的输出送进对话的转录**（②，2026-08-14）。
     *
     * 内核事件带的是内核自己的 sessionId（`c1::python`），
     * 直接 ingest 会落到一段不存在的会话上——所以换成对话的 id，
     * **并带上是哪门语言**（协议 5.5），否则两台内核的输出混在一起没有判据。
     *
     * **只转发内核输出这一种**：`started` / `idle` 那些是内核会话自己的
     * 生命周期事件，混进对话的转录会让「这一轮说完了没有」凭空多出几个边界。
     */
    转发: (对话, 语言, 事件) => {
      const e = 事件 as { kind?: string }
      if (e.kind !== "kernel_output") return
      events.ingest(对话, { ...(事件 as object), sessionId: 对话, language: 语言 } as never)
    },
  })

  /**
   * MCP（2026-08-15）。**一池子连接跟着应用走**，不跟着会话走：
   * 一段会话结束就关掉的话，下一段又要重起一遍（有些服务器起来要好几秒）。
   *
   * 密钥从钥匙串取，键是 `mcp:<服务器名>:<变量名>`——
   * **`providers.yaml` 里只有变量名**，那份文件会被分享、会进 git。
   */
  const mcp池 = new MCP池({
    取密: (服务器名, 变量名) => opts.credentials.get(`mcp:${服务器名}:${变量名}`),
  })

  const mcp门 = 造MCP门(
    () => (settingsStore.get("permission.mode") === "deny-risky" ? "deny-risky" : "allow-all"),
    /**
     * **信任读本机的设置库，不读配置文件。**
     * 项目级名单住在 `.dawn/mcp.yaml`，会跟着仓库被 clone——
     * 让它声明自己可信，门就等于不存在。
     */
    (服务器名) => settingsStore.get(`mcp.trusted.${服务器名}`) === "1",
  )

  /**
   * 这段会话能用哪几台、各有哪些工具。
   *
   * **一台起不来不拖垮其余的**：`备好` 从不抛异常，失败会变成一条 `问题`，
   * 由运行时在对话里留一句话（规格 7.5：不静默）。
   */
  const 取MCP工具 = async (工作区: string | undefined) => {
    const 名单 = 合名单(registry.mcp, 工作区)
    // 关掉哪几台同样是本机的事（同一个理由）
    const 能用的 = 名单.服务器.filter((x) => settingsStore.get(`mcp.off.${x.名}`) !== "1")
    const 问题 = [...名单.问题]
    const 工具: import("../mcp/客户端.js").MCP工具[] = []
    for (const 台 of 能用的) {
      const r = await mcp池.备好(台.名, 台.服务器, 工作区)
      if (r.失败) 问题.push(`「${台.名}」没连上：${r.失败}`)
      else 工具.push(...r.工具)
    }
    return { 工具, 名单: 能用的.map((x) => ({ 名: x.名, 服务器: x.服务器 })), 问题 }
  }

  /**
   * 技能的两个位置（S20，2026-08-15）。
   *
   * **全局那个放在看得见的地方**（`~/DAWN/skills`，与 `~/DAWN/scratch` 同一个家）：
   * 技能是**用文件夹装的**（一个 `SKILL.md` + 可能带的脚本），
   * 人要能在访达里把它拖进去。藏进应用数据目录的话，
   * 「怎么装一个技能」就只能靠文档——而那正是「看不见的能力等于不存在」。
   *
   * **项目级用 `.dawn/skills`**，与 `.dawn/agents/`、`.dawn/mcp.yaml` 同一个家；
   * pi 默认那个是 `.pi/skills`，我们不跟——一个项目里两套隐藏目录更难解释。
   */
  const 技能位置 = {
    全局目录: opts.skillsDir ?? join(homedir(), "DAWN", "skills"),
    项目目录名: join(".dawn", "skills"),
    ...(opts.builtinSkillsDir ? { 自带目录: opts.builtinSkillsDir } : {}),
  }

  const nativeRuntime = new NativeRuntime({
    credentials: piCredentials,
    gate: 权限门,
    // 给了才认这两个位置；不给就完全是 pi 的原样
    skills: 技能位置,
    // 给了才有那些外部工具；不给的装配一个字不受影响
    mcp: { 取工具: 取MCP工具, 池: mcp池, 门: mcp门 },
    // 给了才有 `run_code`；不给的装配（CLI、测试替身）一个字不受影响
    kernels: 对话的内核,
    ...(生成的模型目录 ? { modelsPath: 生成的模型目录 } : {}),
    ...(opts.subagentChildEntry ? { subagentChildEntry: opts.subagentChildEntry } : {}),
  })

  const sessions = new SessionManager({
    store: sessionStore,
    /**
     * 写权租约的 TTL（秒）。**默认 300**（`SessionManager` 里）。
     *
     * **可注入的唯一理由是可测**：作者报的那个「切回旧对话就写不进去了」
     * 只在租约过期之后才出现，而按默认值验一次要等五分钟——
     * 那种测试没人会跑，于是这条路等于没人看。
     */
    ...(opts.leaseTtlSeconds ? { leaseTtlSeconds: opts.leaseTtlSeconds } : {}),
    registry,
    runtimes: {
      native: nativeRuntime,
      pty: new PtyRuntime({ command: "sh" }),
      /**
       * Jupyter 内核（②-A · K4）。
       *
       * **必须装配**——不装的话 `kind: kernel` 的 agent 会在建会话时
       * 响亮失败（`SessionManager` 里那条显式分支），而不是悄悄变成一个 PTY。
       */
      kernel: 内核运行时,
      /**
       * 外部 CLI 的对话模式（①-C）。
       *
       * 命令来自 registry 的 agent 定义，**由 `commandOf` 现查**——
       * 与 `ptyRuntimeFor` 同一个理由：写死一个命令的话，
       * 配置里的 `codex` 会被起成 claude，**而进程照样起得来**。
       *
       * `onThreadId` **一拿到就落库**：codex 一轮一个进程，
       * 进程随时会退出，留在内存里等于随时会丢。
       */
      cli: new CliRuntime({
        commandOf: (spec) => {
          const rec = sessionStore.get(spec.sessionId)
          const def = rec ? registry.agents[rec.agentId] : undefined
          if (!def || def.kind !== "cli") {
            throw new Error(`会话 "${spec.sessionId}" 不是 cli agent，无法起外部 CLI`)
          }
          const family = familyOf(def.command)
          return { command: def.command, args: def.args, ...(family ? { family } : {}) }
        },
        onThreadId: (sessionId, threadId) => sessionStore.setCliThreadId(sessionId, threadId),
      }),
      /**
       * ACP 适配器（A1，2026-08-16）。
       *
       * 命令**由 registry 现查**——与 `cli` / `ptyRuntimeFor` 同一个理由：
       * 写死一个命令的话，配置里的 codex 适配器会被起成 claude 的，
       * **而进程照样起得来**。
       */
      acp: new AcpRuntime({
        commandOf: (spec) => {
          const rec = sessionStore.get(spec.sessionId)
          const def = rec ? registry.agents[rec.agentId] : undefined
          if (!def || def.kind !== "acp") {
            throw new Error(`会话 "${spec.sessionId}" 不是 acp agent，无法起 ACP 适配器`)
          }
          return { command: def.command, args: def.args }
        },
        /**
         * 上一次那段 ACP 会话（A3）。**两样都取到才给**——
         * 只有 id 没有指纹时不敢用它（见 schema 里那段）。
         */
        // **现查，不缓存**：与 `commandOf` 同一条理由
        agentIdOf: (spec) => sessionStore.get(spec.sessionId)?.agentId,
        priorOf: (spec) => {
          const rec = sessionStore.get(spec.sessionId)
          return rec?.acpSessionId && rec.acpFingerprint
            ? { acpSessionId: rec.acpSessionId, fingerprint: rec.acpFingerprint }
            : undefined
        },
        // **一拿到就落库**：进程随时会退，留在内存里等于随时会丢
        onSessionId: (sessionId, acpSessionId, fingerprint) =>
          sessionStore.setAcpSession(sessionId, acpSessionId, fingerprint),
      }),
    },
    // pty agent 的命令逐个由 registry 定义，不能共用一个写死的 runtime
    /**
     * 解释器路径**每次现取**。
     *
     * 缓存住的表现是「我在设置里改了，建会话还是用旧的」——
     * 而那看起来像改动没保存。
     */
    interpreterOf: (language) =>
      settingsStore.get(language === "python" ? "interpreter.python" : "interpreter.r"),
    ptyRuntimeFor: (_id: string, def: PtyAgentDef) => {
      const family = familyOf(def.command)
      return new PtyRuntime({
        command: def.command,
        args: def.args,
        ...(family ? { family } : {}),
      })
    },
    // 只问有无，取值由 pi 内部经 piCredentials 完成
    ...(opts.skipCredentialGate
      ? {}
      : { hasCredential: (providerId: string) => opts.credentials.configured().includes(providerId) }),
    workspaceRoot: process.cwd(),
  })

  // 上次进程留下的 starting/alive 不可能仍然存活，显式转 exited（规格 7.5）
  const reconciled = sessions.reconcileOnStartup()

  const projects = new ProjectManager({
    projects: projectStore,
    sessions: sessionStore,
    runs: runStore,
    registry,
  })

  // **打开就能说话**：一个项目都没有时建一个默认工作区。
  // 已经有项目时什么都不做，也不创建那个目录
  if (opts.defaultWorkspace) projects.ensureDefault(opts.defaultWorkspace)

  /**
   * Run 记账员。**不变式 3 的落地点**——每条执行路径在诞生时就记账。
   *
   * `projectOf` 走会话表：**取不到就不记，绝不猜**。Rho 的教训是
   * 猜 project 归属会让整个运行对比功能失去依据（run-recorder.ts 有原文）。
   */
  /**
   * 会话 → 它准入时那份环境快照的 id（②-B · R5，2026-08-13）。
   *
   * **后端往里写，记账员往外读**——单向。记账员比后端先造出来，
   * 反过来让它去问后端就得延迟绑定，而延迟绑定的接线出错时不出声。
   */
  const 会话环境 = new Map<string, string>()

  const runRecorder = new RunRecorder({
    runs: runStore,
    projectOf: (sessionId) => sessionStore.get(sessionId)?.projectId,
    // **取不到就不记**：缺这一格读作「不知道这次跑在什么环境里」
    environmentOf: (sessionId) => 会话环境.get(sessionId),
    /**
     * **外部 agent 干的活，文件事实从 git 算**（B1 路线 C，2026-08-16）。
     *
     * ## 只给外部 agent 用
     *
     * 内置对话的事实来自我们自己的工具包装器（`tool_files`），
     * **两套一起上会打架**：包装器算的是「这次工具调用改了什么」，
     * git 算的是「这一整轮改了什么」——后者会把前者覆盖成一个更粗的答案。
     *
     * 所以这里只认 `kind: acp` 与 `kind: cli`：它们用的是**自己的**读写工具，
     * 那些调用根本不经过我们，账本上此前只有「跑了一轮」。
     *
     * ## 拿不到就什么都不补
     *
     * 不是 git 仓库、没有工作区、git 出错——一律留 NULL。
     * **「不知道」与「确认没改」是两回事**（不变式 5）。
     */
    外部文件事实: {
      拍基线: (sessionId) => {
        if (!外部agent(sessionId)) return
        const ws = 会话工作区(sessionId)
        if (!ws) return
        void snapshot(ws)
          .then((b) => 回合基线.set(sessionId, b))
          .catch(() => 回合基线.delete(sessionId))
      },
      比一次: async (sessionId) => {
        const 基 = 回合基线.get(sessionId)
        const ws = 会话工作区(sessionId)
        if (!基 || !ws) return undefined
        const f = await diffSince(ws, 基)
        return {
          filesWritten: [...f.files],
          /**
           * **`filesRead` 不给**——git 只知道「改了什么」，读了什么它一无所知。
           * 给一个空数组等于宣称「确认一个文件都没读」，那是编造（不变式 5）。
           * 缺省时那一列原样不动，读作「不知道」。
           */
          // **共用目录时分不清谁改的**，如实标注（与内置那条同一口径）
          mayIncludeUserEdits: f.mayIncludeUserEdits,
        }
      },
    },
  })

  /** 每个外部会话上一轮开始时的工作区基线（B1 路线 C） */
  const 回合基线 = new Map<string, GitBaseline>()
  /** 这个会话是不是「用自己工具的外部 agent」——只有它们需要从 git 反推 */
  const 外部agent = (sessionId: string): boolean => {
    const rec = sessionStore.get(sessionId)
    const kind = rec ? registry.agents[rec.agentId]?.kind : undefined
    return kind === "acp" || kind === "cli"
  }
  const 会话工作区 = (sessionId: string): string | undefined => {
    const rec = sessionStore.get(sessionId)
    if (!rec) return undefined
    const p = rec.projectId ? projectStore.get(rec.projectId) : undefined
    return p?.workspace ?? rec.workspace
  }

  const events = new SessionTranscripts({
    terminalMaxChars: opts.terminalScrollbackChars ?? DEFAULT_TERMINAL_SCROLLBACK_CHARS,
  })

  // 环境快照落库（S17）。**内容寻址**：同一个环境反复开会话只存一行
  const environments = new EnvironmentStore(db)

  /**
   * 远端连接（②-B · R3/R4）。**名单在库里，谁连着在管理器里。**
   *
   * ## `fakeSsh` 是准入规则 1 要求的那个 mock
   *
   * `dev:mock` 与 e2e **没有一台真服务器可连**。没有假的那份，
   * 「添加服务器 → 连接 → 它连上了」这条主路径在 mock 模式下根本走不通，
   * 于是它只能靠人拿真机试——而那意味着**它几乎不会被试**。
   *
   * 换掉的只有**「另一端是谁」**：`RemoteExecutor` 里真正要紧的那些
   * （环境捕获、单引号转义、退出码、断线不重连）走的仍是真代码。
   */
  const connectionStore = new ConnectionStore(db)
  const remoteConnections = new RemoteConnections({
    createClient: opts.fakeSsh
      ? 造一台假服务器
      : () => new SshClient() as unknown as SshClientLike,
    // **口令从钥匙串取，与模型 key 同一个库**，键上带 `ssh:` 前缀免得撞名
    secretFor: (id) => opts.credentials.get(`ssh:${id}`),
    ...(process.env["SSH_AUTH_SOCK"] ? { agentSock: process.env["SSH_AUTH_SOCK"] } : {}),
    onState: (connectionId, state) => 远端状态变了?.({ connectionId, state }),
  })
  /** 状态推给界面的出口。**装配层接上之后才有值**——接不上就只是没人听 */
  let 远端状态变了: ((u: { connectionId: string; state: RemoteState }) => void) | undefined

  const backend = createWorkbenchBackend({
    onEnvironmentFrozen: (sessionId, snapshotId) => 会话环境.set(sessionId, snapshotId),
    remote: { store: connectionStore, manager: remoteConnections },
    // MCP 那一屏要能问「这台连上了没有、有哪些工具」——**问的是同一个池子**，
    // 另开一个的话，设置屏说「连着」而对话里用的是另一条连接
    mcp: { 池: mcp池 },
    // **与运行时同一份**：两处各写各的，屏上列的与实际跑的会分家
    skills: 技能位置,
    tasks: new TaskStore(db),
    projects, projectStore, runs: runStore, sessions, credentials: opts.credentials, registry, events,
    settings: settingsStore,
    configPath: opts.configPath,
    /**
     * 临时会话的目录根。**默认 `~/DAWN/scratch`**——
     * ASCII、不带空格：agent 会自己写 shell 命令去操作这个目录，
     * 一个带空格或中文的路径只要它有一次忘了加引号就散架。
     * e2e 必须覆盖它（`DAWN_SCRATCH_ROOT`），否则会往开发机的家目录里写。
     */
    scratchRoot: opts.scratchRoot ?? join(homedir(), "DAWN", "scratch"),
    /**
     * 连接设置改了：**重新生成 `models.json`，并丢掉缓存的目录**。
     * 不做的话地址写进了配置却要重启才生效，而界面会说「已保存」——半真的话。
     */
    onProvidersChanged: (providers) => {
      const 新路径 = writeModelsJson(
        join(dirname(opts.dbPath), "models.generated.json"),
        providers,
        opts.modelsPath,
      )
      /**
       * **把新路径交给运行时，不只是重置目录**（2026-08-11 修）。
       *
       * 只重置的话，启动时没有任何 `providers:` 覆盖的那种情况就永远好不了：
       * 那时 `writeModelsJson` 返回 undefined，运行时拿到的是「不落盘」，
       * **后来生成的这份文件它永远不会去读**。作者加完 `kimi-k3`
       * 在模型选择器里找不到它，就是这个。
       */
      nativeRuntime.useModelsPath(新路径)
    },
    environments,
    runRecorder,
    // 界面里改完 key 要立刻生效——缓存不失效的话，刚填的 key 读不到
    invalidateCredentials: (providerId) => piCredentials.invalidate(providerId),
    // 模型选择器要问「这个 provider 能用哪些模型」——那份目录只有运行时知道
    models: {
      available: (providerId) => nativeRuntime.availableModels(providerId),
      // **「我能配谁」的来源是 pi 的模型目录**，不是一份手打的清单
      known: () => nativeRuntime.knownProviders(),
      needsBaseUrl: () => nativeRuntime.providersNeedingBaseUrl(),
      // 显示名同样**来自 pi 的表**，不是一份我们手打的对照表
      names: () => nativeRuntime.providerNames(),
    },
    ...(opts.cliHome ? { cliHome: opts.cliHome } : {}),
    ...(opts.openPath ? { openPath: opts.openPath } : {}),
  })
  const server = new WorkbenchServer(backend, {
    ...(opts.readOnly === undefined ? {} : { readOnly: opts.readOnly }),
    ...(opts.onInternalError ? { onInternalError: opts.onInternalError } : {}),
  })

  let closed = false
  return {
    server,
    db,
    sessions,
    events,
    reconciled,
    /**
     * 装配好的内置运行时。**只为让「门接上了没有」可被验证**（2026-08-13）。
     *
     * 不导出它的话，那句 `gate: 权限门` 没有任何测试盯得住——
     * 直接 `new NativeRuntime({gate})` 的用例验的是运行时那一层，
     * 摘掉这里的接线它们照样绿（变异验证当场发现）。
     * 这个项目栽在「零件都对、装没装上没人知道」上不止一次。
     */
    nativeRuntime,
    onRemoteState(cb) {
      远端状态变了 = cb
      return () => {
        远端状态变了 = undefined
      }
    },
    close() {
      // 幂等：Electron 的 will-quit 与显式关闭可能都会走到这里
      if (closed) return
      closed = true
      events.dispose()
      // **退出时把连接断干净**：留着的 SSH socket 会让进程不肯退
      remoteConnections.closeAll()
      db.close()
    },

    /**
     * 退出前的收摊（2026-08-11）。**先停会话，再关库。**
     *
     * 顺序不能反：内核会话背后是 zeromq 的 socket，
     * **带着未关闭的 socket 退出会让 native 析构抛 `Napi::Error` 并 SIGABRT**。
     * 那个崩溃的代价不在本次退出（反正要退），而在**下一次启动**——
     * macOS 的崩溃上报会把它拖慢好几秒。
     *
     * **有上限**：一个停不下来的内核不该让「关掉应用」变成「关不掉」。
     */
    /** 退出时**要不要等**：只有内核会话需要（见 `hasLiveKernelSessions`） */
    needsGracefulShutdown() {
      return sessions.hasLiveKernelSessions()
    },

    async closeAsync(timeoutMs = 1500) {
      if (closed) return
      await Promise.race([
        /**
         * **MCP 的那些进程也要收**（2026-08-15）。
         * 不收就是一堆孤儿进程——而它们多半连着数据库。
         * 与会话一起进同一个超时竞赛：**收摊不能因为一台服务器不肯退而卡住**。
         */
        Promise.all([sessions.stopAll(), mcp池.全关()]),
        new Promise<void>((r) => setTimeout(r, timeoutMs)),
      ])
      this.close()
    },
  }
}
