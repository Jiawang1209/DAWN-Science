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
  shell:
    kind: pty
    command: bash
    args: ["--norc"]
    capabilities: [exec]
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

  /**
   * **接线本身要有人盯着**（②-B · R5，2026-08-13）。
   *
   * 后端在准入时冻结环境、把 id 推给记账员，记账员写进 run——这条链上
   * 三段各自都有单元测试，**而把 `wiring.ts` 里那一句接线删掉，它们全都还是绿的**
   * （变异验证当场发现）。那正是本项目栽过好几次的形状：
   * 零件都对，装没装上没人知道。
   *
   * 终端会话在起来的那一刻就有一条 Run（PTY 的命令不可观测，可观测的是会话本身），
   * 所以它是这条链最短的一条真路径——不需要真的去问一个模型。
   */
  it("**终端会话起来后，账本上那条 Run 带着环境** —— 这条盯的是接线", async () => {
    const wb = createWorkbench({
      configPath: configFile(),
      dbPath: newDbPath(),
      credentials: memoryCredentials({ deepseek: "sk-test" }),
    })
    cleanups.push(() => wb.close())

    const repo = newRepo()
    // 先建一个带路径的任务，项目才长出来（终端挂在它下面）
    const 任务 = await wb.server.handle("createTask", { agentId: "ds-chat", workspace: repo })
    expect(任务.ok, `建任务失败了：${JSON.stringify(任务)}`).toBe(true)
    const ps0 = await wb.server.handle("listProjects", {})
    const pid0 = (ps0 as { data: { projectId: string; workspace: string }[] }).data
      .find((x) => x.workspace === repo)!.projectId

    const t = await wb.server.handle("createTerminalSession", { agentId: "shell", projectId: pid0 })
    expect(t.ok, `建终端会话失败了：${JSON.stringify(t)}`).toBe(true)
    const sid = (t as { data: { sessionId: string } }).data.sessionId

    const ps = await wb.server.handle("listProjects", {})
    const pid = (ps as { data: { projectId: string; workspace: string }[] }).data
      .find((x) => x.workspace === repo)!.projectId
    const runs = await wb.server.handle("listRuns", { projectId: pid })
    const 这段的 = (runs as { data: { sessionId: string; environmentSnapshotId?: string }[] }).data
      .filter((r) => r.sessionId === sid)
    expect(这段的.length, "终端会话没有留下任何 Run").toBeGreaterThan(0)
    expect(
      这段的[0]!.environmentSnapshotId,
      "Run 上没有环境——冻结、推送、记账三段里有一段没接上",
    ).toBeTruthy()
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
