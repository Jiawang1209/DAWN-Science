/**
 * 装配层（Task 2.7）。
 *
 * **本文件不 import electron。** 把 store / manager / server 拼起来是纯逻辑，
 * 应当能脱离 Electron 单独验证——与 Task 2.3 让服务端不认识 Electron 是同一手法。
 * `main.ts` 只剩窗口与 IPC 注册两件事。
 */
import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { loadRegistryOrDefault } from "../config/loader.js"
import { migrate } from "../store/schema.js"
import { ProjectStore } from "../store/projects.js"
import { RunStore } from "../store/runs.js"
import { SessionStore } from "../store/sessions.js"
import { ProjectManager } from "../project/manager.js"
import { RunRecorder } from "../project/run-recorder.js"
import { SessionManager, type PtyAgentDef } from "../session/manager.js"
import { NativeRuntime } from "../runtime/native.js"
import { PtyRuntime } from "../runtime/pty.js"
import { familyOf } from "../runtime/family.js"
import { createWorkbenchBackend, type CredentialsPort } from "../workbench/backend.js"
import { createPiCredentialStore } from "../workbench/credential-store.js"
import { SessionTranscripts } from "../workbench/events.js"
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
  configPath: string
  dbPath: string
  readOnly?: boolean
  onInternalError?: (operation: string, err: unknown) => void
  /** 凭证库。**app 自己管凭证**，不要求用户手写进配置文件 */
  credentials: CredentialsPort
  /** 每会话事件缓冲上限（字符）。默认 `DEFAULT_TERMINAL_SCROLLBACK_CHARS` */
  terminalScrollbackChars?: number
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
  /** 事件中枢。`main.ts` 把它的推送接到 webContents */
  events: SessionTranscripts
  /** 启动对账修正的残留会话条数 */
  reconciled: number
  close(): void
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

  // pi 的凭证接口。加密仍由我们负责，**缓存是必需的**——见 credential-store.ts
  const piCredentials = createPiCredentialStore(opts.credentials)

  const sessions = new SessionManager({
    store: sessionStore,
    registry,
    runtimes: {
      native: new NativeRuntime({
        credentials: piCredentials,
        ...(opts.modelsPath ? { modelsPath: opts.modelsPath } : {}),
      }),
      pty: new PtyRuntime({ command: "sh" }),
    },
    // pty agent 的命令逐个由 registry 定义，不能共用一个写死的 runtime
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
  const runRecorder = new RunRecorder({
    runs: runStore,
    projectOf: (sessionId) => sessionStore.get(sessionId)?.projectId,
  })

  const events = new SessionTranscripts({
    terminalMaxChars: opts.terminalScrollbackChars ?? DEFAULT_TERMINAL_SCROLLBACK_CHARS,
  })

  const backend = createWorkbenchBackend({
    projects, projectStore, runs: runStore, sessions, credentials: opts.credentials, registry, events,
    runRecorder,
    // 界面里改完 key 要立刻生效——缓存不失效的话，刚填的 key 读不到
    invalidateCredentials: (providerId) => piCredentials.invalidate(providerId),
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
    close() {
      // 幂等：Electron 的 will-quit 与显式关闭可能都会走到这里
      if (closed) return
      closed = true
      events.dispose()
      db.close()
    },
  }
}
