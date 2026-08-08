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
import { loadRegistry } from "../config/loader.js"
import { migrate } from "../store/schema.js"
import { ProjectStore } from "../store/projects.js"
import { RunStore } from "../store/runs.js"
import { SessionStore } from "../store/sessions.js"
import { ProjectManager } from "../project/manager.js"
import { SessionManager, type PtyAgentDef } from "../session/manager.js"
import { NativeRuntime } from "../runtime/native.js"
import { PtyRuntime } from "../runtime/pty.js"
import { familyOf } from "../runtime/family.js"
import { createWorkbenchBackend } from "../workbench/backend.js"
import { WorkbenchServer } from "../workbench/server.js"

export interface CreateWorkbenchOptions {
  configPath: string
  dbPath: string
  /**
   * 用于展开配置里的 `${ENV}`。**显式传入而非直接读 `process.env`**——
   * 装配层偷偷读全局状态会让测试无法隔离，也让「这个 key 从哪来」变得不可追。
   */
  env?: Record<string, string | undefined>
  readOnly?: boolean
  onInternalError?: (operation: string, err: unknown) => void
}

export interface Workbench {
  server: WorkbenchServer
  db: Database.Database
  sessions: SessionManager
  /** 启动对账修正的残留会话条数 */
  reconciled: number
  close(): void
}

export function createWorkbench(opts: CreateWorkbenchOptions): Workbench {
  const registry = loadRegistry(opts.configPath, opts.env ?? process.env)

  mkdirSync(dirname(opts.dbPath), { recursive: true })
  const db = new Database(opts.dbPath)
  migrate(db)

  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)

  const sessions = new SessionManager({
    store: sessionStore,
    registry,
    runtimes: { native: new NativeRuntime(), pty: new PtyRuntime({ command: "sh" }) },
    // pty agent 的命令逐个由 registry 定义，不能共用一个写死的 runtime
    ptyRuntimeFor: (_id: string, def: PtyAgentDef) => {
      const family = familyOf(def.command)
      return new PtyRuntime({
        command: def.command,
        args: def.args,
        ...(family ? { family } : {}),
      })
    },
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

  const backend = createWorkbenchBackend({ projects, projectStore, runs: runStore, sessions })
  const server = new WorkbenchServer(backend, {
    ...(opts.readOnly === undefined ? {} : { readOnly: opts.readOnly }),
    ...(opts.onInternalError ? { onInternalError: opts.onInternalError } : {}),
  })

  let closed = false
  return {
    server,
    db,
    sessions,
    reconciled,
    close() {
      // 幂等：Electron 的 will-quit 与显式关闭可能都会走到这里
      if (closed) return
      closed = true
      db.close()
    },
  }
}
