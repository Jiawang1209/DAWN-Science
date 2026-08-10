/**
 * Workbench 的真实后端（补 Part 1 的收口）。
 *
 * Task 2.3 交付了 `WorkbenchBackend` 接口与服务端；本文件是它的真实现，
 * 把 ①-A 的 `SessionManager` / `LeaseManager` 与 ①-B 的 `ProjectManager` /
 * `RunStore` / git 事实拼起来。
 *
 * **业务性失败一律抛 `fault(code, message)`**，而不是让它变成 `internal_error`——
 * 否则「项目不存在」与「数据库炸了」在 UI 上会长得一模一样。
 */
import type { ProviderRegistry } from "../config/schema.js"
import { deriveSessionTitle } from "../session/title.js"
import type { SessionManager } from "../session/manager.js"
import type { ProjectManager } from "../project/manager.js"
import type { RunStore } from "../store/runs.js"
import type { SettingsStore } from "../store/settings.js"
import { diagnoseInterpreter } from "../kernel/specs.js"
import {
  listDirectory as listWorkspaceDirectory,
  readFileForPreview as readWorkspaceFile,
  resolveInWorkspace,
} from "../files/access.js"
import type { RunRecorder } from "../project/run-recorder.js"
import type { ProjectStore } from "../store/projects.js"
import { diffSince, snapshot, NotAGitRepoError, type GitBaseline } from "../project/git-facts.js"
import { discoverCliModels } from "../runtime/cli/models.js"
import { familyOf } from "../runtime/family.js"
import { UserFacingError } from "../errors.js"
import { fault, type WorkbenchBackend } from "./server.js"
import type { SessionTranscripts } from "./events.js"
import { discoverKernelSpecs } from "../kernel/specs.js"

/**
 * 凭证库的最小接口。后端只需要这四个动作，不关心它存在哪、怎么加密。
 *
 * **2026-08-08 返工 R2：键从 endpointId 改为 providerId。**
 * 配置里已经没有 endpoints 段了，凭证按 pi 的 provider 存。
 */
export interface CredentialsPort {
  get(providerId: string): string | undefined
  set(providerId: string, secret: string): void
  delete(providerId: string): void
  configured(): string[]
  isEncrypted(): boolean
}

export interface WorkbenchBackendOptions {
  projects: ProjectManager
  projectStore: ProjectStore
  runs: RunStore
  /** 应用级设置。两个解释器路径住在这里（②-A 后续） */
  settings?: SettingsStore
  /**
   * 交给系统打开一个**绝对路径**（②-B · F3）。
   *
   * **端口注入，不在后端里 import Electron**——后端要能在没有 Electron 的
   * 测试里跑。路径的合法性由后端自己保证（走 `resolveInWorkspace`），
   * 这个端口只负责「交给系统」。
   */
  openPath?: (absolutePath: string) => Promise<string>
  sessions: SessionManager
  credentials: CredentialsPort
  /** 配置里的 provider 注册表，供界面列出可选 agent */
  registry: ProviderRegistry
  /** 会话事件中枢。界面靠它才能看见 agent 说了什么 */
  events: SessionTranscripts
  /**
   * 模型目录：该 provider 真正有哪些模型（①-B″ · U2）。
   *
   * **不给则 `available` 缺省**——缺省的含义是「不知道」，不是「没有」。
   * 界面因此不会把「后端没接这个端口」显示成「这个 provider 一个模型都没有」。
   */
  models?: { available(providerId: string): Promise<string[]> }
  /**
   * 去哪找外部 CLI 自己的配置（codex 的 `models_cache.json`）。
   *
   * **可注入的理由是测试隔离**：不注入时读开发机真实的家目录，
   * 而 e2e 的第一条原则是「每个用例一套全新的目录」——
   * 2026-08-09 加自动发现时捅了这个洞，当场补上。
   */
  cliHome?: string
  /** 凭证变更后让 pi 侧缓存失效。不给则不失效（测试场景） */
  invalidateCredentials?: (providerId: string) => void
  /**
   * Run 记账员。**不给则不记账**——但那意味着 Runs 面板永远是空的，
   * 只有不关心历史的测试才该省略它（不变式 3）。
   */
  runRecorder?: RunRecorder
}

export function createWorkbenchBackend(opts: WorkbenchBackendOptions): WorkbenchBackend {
  const { projects, projectStore, runs, sessions, credentials, registry, events, invalidateCredentials, runRecorder, models, cliHome, settings, openPath } = opts

  /** 会话开始时的 git 基线，用于算「这次会话改了什么」。进程重启后丢失——见下方注释。 */
  const baselines = new Map<string, GitBaseline>()

  const requireProject = (projectId: string) => {
    const s = projects.summary(projectId)
    if (!s) throw fault("not_found", `项目 "${projectId}" 不存在`)
    return s
  }

  return {
    listProjects: async () => projects.list(),

    /**
     * 界面要列出可选 agent 才能新建会话，要列出 provider 才能填凭证。
     *
     * **2026-08-08 返工 R2**：`endpoints` 段没了，改为回传**本配置实际用到的
     * provider 集合**——不是 pi 内置的全部 39 个。理由：设置界面该问的是
     * 「你声明要用的这些 provider，凭证配了吗」，而不是把 39 个都列出来让人挑。
     *
     * **不回传任何凭证**。
     */
    getProviders: async () => {
      const nativeAgents = Object.values(registry.agents).filter(
        (d): d is Extract<typeof d, { kind: "native" }> => d.kind === "native",
      )
      const used = [...new Set(nativeAgents.map((d) => d.provider))].sort()
      return {
        agents: Object.entries(registry.agents).map(([agentId, def]) => ({
          agentId,
          kind: def.kind,
          ...(def.kind === "native"
            ? { provider: def.provider, model: def.model }
            : {
                command: def.command,
                /**
                 * cli 的模型清单：**配置声明优先，其次自动发现**。
                 *
                 * - 配置里写了 `models` → 用它（**显式压过推断**，这是通则）
                 * - 没写 → 问 CLI 自己（codex 有 `models_cache.json`；claude 没有）
                 * - 都没有 → **不给这个字段**：缺省是「不知道」，
                 *   空数组会被读成「确认一个都没有」
                 *
                 * `model`（钉死当前用哪个）**几乎总该不写**：写了就等于给 CLI 传
                 * `--model`，会盖掉用户自己 CLI 的配置（2026-08-09 作者两个 CLI 都撞上了）。
                 */
                ...(def.kind === "cli" && def.model ? { model: def.model } : {}),
                ...(def.kind === "cli"
                  ? (() => {
                      const list =
                        def.models ??
                        discoverCliModels(familyOf(def.command) ?? "", cliHome)
                      return list ? { models: list } : {}
                    })()
                  : {}),
              }),
        })),
        providers: await Promise.all(
          used.map(async (providerId) => ({
            providerId,
            // 配置里声明过的（凭证界面看这一份）
            models: [...new Set(nativeAgents.filter((d) => d.provider === providerId).map((d) => d.model))],
            // 目录里真正有的（模型选择器看这一份）。**取不到就不给字段**——
            // 缺省是「不知道」，空数组是「确认没有」，两者不能混
            ...(models ? { available: await models.available(providerId) } : {}),
          })),
        ),
      }
    },

    /** **只回报配没配，绝不回报凭证本身**——界面不需要知道值 */
    listCredentials: async () => ({
      configured: credentials.configured(),
      encrypted: credentials.isEncrypted(),
    }),

    setCredential: async ({ providerId, secret }) => {
      credentials.set(providerId, secret)
      // 凭证变了必须让 pi 侧的缓存失效，否则刚填的 key 不会生效
      // （缓存的存在理由见 credential-store.ts：一次会话 202 次 read）
      invalidateCredentials?.(providerId)
      return {}
    },

    deleteCredential: async ({ providerId }) => {
      credentials.delete(providerId)
      invalidateCredentials?.(providerId)
      return {}
    },

    getProject: async ({ projectId }) => requireProject(projectId),

    listSessions: async ({ projectId }) => {
      requireProject(projectId)
      return projects.sessions(projectId)
    },

    listRuns: async ({ projectId, sessionId, pageSize }) => {
      requireProject(projectId)
      return projects.runs(projectId, {
        ...(sessionId ? { sessionId } : {}),
        limit: pageSize,
      })
    },

    getRun: async ({ runId }) => {
      const run = runs.get(runId)
      if (!run) throw fault("not_found", `Run "${runId}" 不存在`)

      // 产出：只有拿得到基线才算得出。基线在进程重启后丢失——
      // 那时**不返回 fileChanges 字段**，而不是返回一个空数组。
      // 空数组会被读成「什么都没改」，那是错的；缺字段读成「不知道」，才对。
      const project = projectStore.get(run.projectId)
      const baseline = baselines.get(run.sessionId)
      let fileChanges
      if (project && baseline) {
        try {
          fileChanges = await diffSince(project.workspace, baseline)
        } catch (err) {
          if (!(err instanceof NotAGitRepoError)) throw err
          // 非 git 仓库：同样不编造，留空
        }
      }

      return { ...run, ...(fileChanges ? { fileChanges } : {}) }
    },

    getProvenance: async ({ resourceId }) => {
      const link = runs.getProvenance(resourceId)
      if (!link) throw fault("not_found", `资源 "${resourceId}" 没有溯源记录`)
      return link
    },

    previewTakeover: async ({ sessionId, requester }) =>
      sessions.leases.previewTakeover(sessionId, requester),

    openProject: async ({ workspace }) => {
      const rec = projects.open(workspace)
      return projects.summary(rec.projectId)!
    },

    subscribeSession: async ({ sessionId }) => {
      try {
        return events.subscribe(sessionId)
      } catch (err) {
        // 「会话不在本进程中活动」是业务性失败——进程重启后旧会话就是这个状态，
        // 界面要能分辨它和「数据库炸了」
        throw fault("not_found", err instanceof Error ? err.message : String(err))
      }
    },

    unsubscribeSession: async ({ sessionId }) => {
      events.unsubscribe(sessionId)
      return {}
    },

    createSession: async ({ projectId, agentId }) => {
      const project = requireProject(projectId)
      /**
       * **把「打算给用户看的失败」翻成 fault，其余照旧归一成 internal_error。**
       *
       * 服务端只把 `fault()` 的消息原样交给界面，其余只进日志——那条策略是对的
       * （消息里可能有路径、连接串、密钥片段）。所以要让一句话到达用户，
       * **必须在抛出的一侧显式声明它是给用户看的**，而不是让下游去猜哪条安全。
       *
       * 2026-08-09 由 ①-C 的第一条 e2e 撞出来：会话层写得很清楚的
       * 「provider 未配置凭证——请在设置里填写它的 API key」，
       * 在界面上是 `操作 "createSession" 执行失败`。
       */
      const rec = await sessions.create(agentId, project.workspace, { projectId }).catch((err: unknown) => {
        if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
        throw err
      })

      // 先登记再接线：attach 的回调可能同步就来一条事件
      const kind = registry.agents[agentId]?.kind ?? "native"
      events.track(rec.id, kind)
      sessions.attach(rec.id, (e) => {
        events.ingest(rec.id, e)
        // **记账与呈现是两件事，各走各的。** 中枢管「界面看得见什么」，
        // 记账员管「账本上留下什么」——把它们合成一条会让任何一方的改动
        // 都可能悄悄影响另一方
        runRecorder?.ingest(e)
      })
      // PTY 的「命令」不可观测（只有字节流），可观测的是会话本身。见 run-recorder.ts
      if (kind === "pty") runRecorder?.beginPtySession(rec.id)

      // 记下 git 基线，供之后算「这次会话改了什么」。
      // 拿不到（非 git 仓库）就不记——后续 getRun 会因此不返回 fileChanges，
      // 这比返回一个空数组诚实。
      try {
        baselines.set(rec.id, await snapshot(project.workspace))
      } catch (err) {
        if (!(err instanceof NotAGitRepoError)) throw err
      }

      return projects.sessions(projectId).find((s) => s.sessionId === rec.id)!
    },

    writeToSession: async ({ sessionId, data, as }) => {
      try {
        sessions.write(sessionId, data, as)
        // 用户的发言回灌进事件流，**界面不做本地乐观追加**——
        // 事件流是对话的唯一事实来源，两条路各写一半迟早对不上。
        // PTY 会话由中枢自行忽略：终端本来就会回显，再补一条是重复。
        if (as === "user") {
          /**
           * **第一句话定名字**（2026-08-10）。写在这里而不是运行时里：
           * 这是「会话」这个记录的属性，与哪种运行时无关——
           * 内核会话第一段代码同样能当名字。
           *
           * `setTitleIfAbsent` 在 SQL 里判空，不在这里先读后写：
           * 先读后写有窗口，而「第二句话把标题改掉了」的症状是
           * 侧栏上的名字会自己变，人会以为点错了会话。
           */
          const title = deriveSessionTitle(data)
          if (title) projects.setSessionTitle(sessionId, title)
          events.userTurn(sessionId, data)
          // 运行时没有 turn_start 事件——回合的起点只有这里知道。
          // PTY 会话由记账员自己忽略（那是按键，不是发话），见 run-recorder.ts
          runRecorder?.beginTurn(sessionId)
        }
      } catch (err) {
        // 写权被拒是业务性失败，不是内部错误——UI 要能分辨并提示用户去抢租约
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    stopSession: async ({ sessionId }) => {
      await sessions.stop(sessionId)
      baselines.delete(sessionId)
      return {}
    },

    abortSession: async ({ sessionId }) => {
      try {
        await sessions.abort(sessionId)
      } catch (err) {
        // 「运行时不支持中止」是业务性失败，界面要能分辨并提示去终端按 Ctrl-C
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    getContextUsage: async ({ sessionId }) => {
      const u = sessions.contextUsage(sessionId)
      // 拿不到时给一个**三档全零、且没有上限**的结果：
      // 上限缺省的含义是"不知道"，界面据此显示「尚未采集」而不是「用了 0%」
      return u ?? { bytes: { system: 0, tools: 0, history: 0 } }
    },

    setSessionModel: async ({ sessionId, provider, model }) => {
      try {
        // **provider 对 cli 会话没有意义**（外部 CLI 没这个概念），
        // 放宽之后这里给空串——运行时那边也只是为了签名一致才留着这个参数
        await sessions.setModel(sessionId, provider ?? "", model)
      } catch (err) {
        // **全是业务性失败**：模型不存在、没配 key、这一轮还没说完。
        // 界面要原样把理由说给人听，所以不能吞成一句「操作失败」
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    steerSession: async ({ sessionId, text }) => {
      try {
        await sessions.steer(sessionId, text, "user")
        events.userTurn(sessionId, text)
      } catch (err) {
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    /**
     * 列出本机内核（②-A · K2）。
     *
     * **每次现扫，不缓存。** 用户可能刚在别处 `installspec` 了一个——
     * 缓存住的表现是「我装了但 DAWN 看不见」，而那看起来像 DAWN 坏了。
     */
    listKernels: async () => {
      const d = discoverKernelSpecs()
      return {
        kernels: d.specs.map((k) => ({
          name: k.name,
          displayName: k.displayName,
          ...(k.language ? { language: k.language } : {}),
          ...(k.executable ? { executable: k.executable } : {}),
          dir: k.dir,
        })),
        problems: d.problems,
        shadowed: d.shadowed.map((k) => ({ name: k.name, dir: k.dir })),
      }
    },

    /**
     * 变量面板（②-A · K5 · S14）。
     *
     * **不支持与「真没有」必须分开**：前者是「我们没去问」，
     * 后者是「问了，确实一个都没有」。混成一个空列表，
     * 用户会以为自己的变量丢了。
     */
    listVariables: async ({ sessionId }) => {
      const v = (await sessions.variables(sessionId)) as
        | { supported: false; reason: string }
        | { supported: true; variables: unknown[] }
        | undefined
      if (!v) {
        // 不是内核会话，或会话不在。**如实说，不返回空列表**
        return { supported: false as const, reason: "这个会话没有内核，看不到变量" }
      }
      return v as never
    },

    /**
     * 两个解释器路径（2026-08-10，作者定的机制）。
     * **没配的那个不给字段**——「还没配」与「配了一个空路径」在界面上要说不同的话。
     */
    getInterpreters: async () => settings?.interpreters() ?? {},

    setInterpreter: async ({ language, path }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置存储")
      settings.set(language === "python" ? "interpreter.python" : "interpreter.r", path, new Date().toISOString())
      /**
       * **当场验，不等到建会话才炸。**
       *
       * 填完路径就该知道它行不行——「保存成功」然后建会话时才报错，
       * 中间隔着的那段时间会让人以为是别的东西坏了。
       *
       * 这里只做**静态**判断（路径存不存在）：包缺没缺要真起一次才知道，
       * 那是建会话时的事，届时同一套诊断会说清楚。
       */
      const now = settings.interpreters()
      const configured = language === "python" ? now.python : now.r
      const d = configured ? diagnoseInterpreter(language, configured) : undefined
      return { ...now, ...(d ? { problem: d.message } : {}) }
    },

    /**
     * 列一层工作区目录（②-B · F2）。
     *
     * **工作区从项目取，不从请求取**——让调用方传工作区，
     * 等于把路径守卫的起点也交给它，那守卫就形同虚设。
     */
    listDirectory: async ({ projectId, path, includeIgnored }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      return listWorkspaceDirectory(p.workspace, path, {
        ...(includeIgnored === undefined ? {} : { includeIgnored }),
      })
    },

    /** 读一个文件供预览。**只读**，且路径守卫在 `files/access.ts` 里 */
    readFile: async ({ projectId, path }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      return readWorkspaceFile(p.workspace, path)
    },

    openExternally: async ({ projectId, path }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // **守卫在这里，不在调用方**：解析失败会抛，越界也会抛
      const abs = resolveInWorkspace(p.workspace, path)
      if (!openPath) return { problem: "本次运行没有装配「用系统程序打开」的能力" }
      const err = await openPath(abs)
      // Electron 的 `shell.openPath` 成功时返回空串，失败时返回原因
      return err ? { problem: err } : {}
    },

    deleteSession: async ({ sessionId }) => {
      const rec = sessions.get(sessionId)
      if (!rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      const removed = await sessions.remove(sessionId)
      if (!removed) throw fault("not_found", `没有这个会话：${sessionId}`)
      // 转录只活在内存里，跟着走
      events.forget(sessionId)
      baselines.delete(sessionId)
      /**
       * **账本留着，并且把还剩多少说出来。**
       * 一句「已删除」会让人以为历史也一起没了——而它没有，
       * 这正是这个产品与一个聊天窗口的区别（不变式 5）。
       */
      const kept = rec.projectId ? runs.countByProject(rec.projectId) : 0
      return { ledgerKept: kept }
    },

    deletionImpact: async ({ projectId }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // **摆真数字**：界面手里的会话列表与账本都是分页/局部的，猜不出来
      return {
        sessions: sessions.countByProject(projectId),
        runs: runs.countByProject(projectId),
        workspace: p.workspace,
      }
    },

    deleteProject: async ({ projectId }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)

      /**
       * **先把活着的会话停掉**，再删记录。反过来的话进程还活着
       * 而我们已经忘了它是谁的——一个没人认领的孤儿进程。
       */
      for (const rec of sessions.listByProject(projectId)) {
        if (rec.state !== "exited") await sessions.stop(rec.id).catch(() => {})
        events.forget(rec.id)
        baselines.delete(rec.id)
      }
      const sessionsDeleted = sessions.deleteByProject(projectId)
      const runsDeleted = runs.deleteByProject(projectId)
      projectStore.delete(projectId)
      /**
       * **磁盘上的文件夹一个字节都没动。** 回它的路径，让人一眼确认
       * ——「移除的是工作台里的记录，不是我的数据」。
       */
      return { sessionsDeleted, runsDeleted, workspace: p.workspace }
    },

    acquireLease: async ({ sessionId, holder }) => {
      try {
        return sessions.leases.acquire(sessionId, holder)
      } catch (err) {
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
    },
  }
}
