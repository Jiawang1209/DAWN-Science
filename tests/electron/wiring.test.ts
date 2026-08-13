/**
 * 装配层的测试。**不起 Electron**——Electron 只负责窗口与 IPC，
 * 「把 store / manager / server 拼起来」是纯逻辑，应当能单独验证。
 * 这与 Task 2.3 让服务端不认识 Electron 是同一个手法。
 */
import { afterEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorkbench } from "../../src/electron/wiring.js"
import { memoryCredentials } from "../helpers/credentials.js"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-wire-"))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  }
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env })
  writeFileSync(join(dir, "seed.txt"), "seed\n")
  execFileSync("git", ["add", "."], { cwd: dir, env })
  execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir, env })
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function configFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-cfg-"))
  const file = join(dir, "providers.yaml")
  writeFileSync(
    file,
    `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat]
`,
  )
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return file
}

function newDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-db-"))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, "dawn.db")
}

describe("createWorkbench", () => {
  it("装配出可用的服务端，握手能通", async () => {
    const wb = createWorkbench({
      configPath: configFile(),
      dbPath: newDbPath(),
      credentials: memoryCredentials(),
    })
    cleanups.push(() => wb.close())
    const r = await wb.server.handle("getCapabilities", {})
    expect(r.ok).toBe(true)
  })

  it("数据库文件被真正创建", () => {
    const dbPath = newDbPath()
    const wb = createWorkbench({ configPath: configFile(), dbPath, credentials: memoryCredentials() })
    cleanups.push(() => wb.close())
    expect(existsSync(dbPath)).toBe(true)
  })

  /** **T4：入口只剩「建任务」**——项目是从任务的工作目录长出来的，不再先开项目 */
  it("端到端：建一个带路径的任务 → 项目出现 → 列会话", async () => {
    const wb = createWorkbench({
      configPath: configFile(),
      dbPath: newDbPath(),
      // **建任务要真的开一段会话**，而开会话要过凭证这道闸——
      // 此前这条走 `openProject`，压根没碰到闸门
      credentials: memoryCredentials({ deepseek: "sk-test" }),
    })
    cleanups.push(() => wb.close())

    const repo = newRepo()
    const t = await wb.server.handle("createTask", { agentId: "ds-chat", workspace: repo })
    expect(t.ok, `建任务失败了：${JSON.stringify(t)}`).toBe(true)

    const ps = await wb.server.handle("listProjects", {})
    const pid = (ps as { data: { projectId: string; workspace: string }[] }).data
      .find((x) => x.workspace === repo)?.projectId
    expect(pid, "任务带了工作路径，项目就该长出来").toBeDefined()

    const list = await wb.server.handle("listSessions", { projectId: pid })
    expect((list as { data: unknown[] }).data).toHaveLength(1)
  })

  it("缺凭证时仍然起得来 —— 桌面应用不该因为配置里少个变量就打不开", () => {
    const wb = createWorkbench({
      configPath: configFile(), dbPath: newDbPath(), credentials: memoryCredentials(),
    })
    cleanups.push(() => wb.close())
    expect(wb.server).toBeDefined()
  })

  it("配置文件不存在时响亮报错", () => {
    expect(() =>
      createWorkbench({ configPath: "/nonexistent/providers.yaml", dbPath: newDbPath(), credentials: memoryCredentials() }),
    ).toThrow()
  })

  it("启动时执行对账，并把修正条数报出来", () => {
    const dbPath = newDbPath()
    const cfg = configFile()
    const first = createWorkbench({ configPath: cfg, dbPath, credentials: memoryCredentials() })
    // 手工塞一条残留的 alive 记录，模拟上次进程没走干净
    first.db
      .prepare(
        `INSERT INTO sessions (id,agent_id,workspace,session_dir,state,created_at)
         VALUES ('stale','ds-chat','/w','/w/.dawn/stale','alive','2026-08-07T00:00:00Z')`,
      )
      .run()
    first.close()

    const second = createWorkbench({ configPath: cfg, dbPath, credentials: memoryCredentials() })
    cleanups.push(() => second.close())
    expect(second.reconciled).toBe(1)
  })

  it("close 之后数据库句柄被释放，可重复调用", () => {
    const wb = createWorkbench({ configPath: configFile(), dbPath: newDbPath(), credentials: memoryCredentials() })
    expect(() => wb.close()).not.toThrow()
    expect(() => wb.close()).not.toThrow()
  })
})
