/**
 * 装配层的测试。**不起 Electron**——Electron 只负责窗口与 IPC，
 * 「把 store / manager / server 拼起来」是纯逻辑，应当能单独验证。
 * 这与 Task 2.3 让服务端不认识 Electron 是同一个手法。
 */
import { afterEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorkbench, 内核变化出声 } from "../../src/electron/wiring.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { memoryCredentials } from "../helpers/credentials.js"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"
import { 对话内核 } from "../../src/kernel/挂载.js"
import { SettingsStore } from "../../src/store/settings.js"
import { 造门 } from "../../src/policy/permissions.js"
import { 假口令 } from "../../src/remote/fake-ssh.js"

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

/**
 * @param mcp 追加一段 `mcp:`（2026-08-15）。**默认不加**——
 *   绝大多数用例与 MCP 无关，凭空多起一个进程只会让它们变慢变脆。
 */
function configFile(mcp?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-cfg-"))
  const file = join(dir, "providers.yaml")
  writeFileSync(
    file,
    (mcp ?? "") + `agents:
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

  it("配置文件nosuch时响亮报错", () => {
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

/**
 * **工具权限门真的接上了吗**（2026-08-13）。
 *
 * 这条盯的是接线，不是判据。判据在 `tests/policy/permissions.test.ts` 里有 30 条，
 * 而**它们全绿的同时，门可以一次都没被装上**——`native.ts` 里那道门写好之后
 * 就是这么闲置了很久的，它自己的注释还写着「授权门静默失效比没有还危险」。
 *
 * 走的是 `NativeRuntime` 真实的工具包装路径：拿到包装过的工具定义，
 * 直接调它的 `execute`，看门有没有把它拦下。
 */
describe("工具权限门 · 接线", () => {
  function 造运行时(档: "allow-all" | "ask-risky" | "deny-risky") {
    return new NativeRuntime({ gate: 造门(() => 档) })
  }

  /** 从运行时手上拿到那批**包装过的**工具定义 */
  function 工具们(rt: NativeRuntime, workspace: string): Record<string, unknown>[] {
    const 拿 = (rt as unknown as {
      gatedTools(cwd: string, sessionId: string): Record<string, unknown>[] | undefined
    }).gatedTools.bind(rt)
    const out = 拿(workspace, "s1")
    expect(out, "运行时没有给出包装过的工具——门根本没机会生效").toBeDefined()
    return out!
  }

  async function 跑(工具: Record<string, unknown>, params: Record<string, unknown>) {
    const exec = 工具.execute as (
      id: string, p: Record<string, unknown>, s: undefined, u: undefined, c: undefined,
    ) => Promise<{ isError?: boolean; content?: { text?: string }[] }>
    return exec("call-1", params, undefined, undefined, undefined)
  }

  it("**deny-risky 档下，写 data/raw 被门拦下**，且理由到了模型手里", async () => {
    const 全部 = 工具们(造运行时("deny-risky"), "/w/proj")
    const write = 全部.find((t) => t.name === "write")
    expect(write, "pi 的 write 工具没在包装名单里——判据键的名字可能对不上").toBeDefined()

    const r = await 跑(write!, { path: "data/raw/a.csv", content: "x" })
    expect(r.isError, "门没拦住").toBe(true)
    expect(r.content?.[0]?.text, "拒绝理由要能让模型改道").toMatch(/data\/processed/)
  })

  /**
   * **放行就该真的写进去。**
   *
   * 用一个真目录，而不是靠「报了别的错」来证明没被拦——
   * 后者是拿一个失败去证明另一个失败，读的人分不清哪个是判据。
   */
  it("**allow-all 档下不拦** —— 默认档不改变现有手感", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dawn-gate-"))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const 全部 = 工具们(造运行时("allow-all"), dir)
    const write = 全部.find((t) => t.name === "write")

    await 跑(write!, { path: "data/raw/a.csv", content: "让它写" })
    expect(
      readFileSync(join(dir, "data/raw/a.csv"), "utf8"),
      "全放行这一档竟然没写进去",
    ).toBe("让它写")
  })

  /**
   * **这一条盯的是 `wiring.ts` 里那句 `gate: 权限门`。**
   *
   * 上面三条直接 `new NativeRuntime({gate})`——它们验的是运行时那一层，
   * **把接线摘掉照样全绿**（变异验证当场发现，与 R5 那次同一个形状）。
   * 所以这里走 `createWorkbench` 真正装配出来的那个运行时。
   */
  it("**createWorkbench 装配出来的运行时带着门** —— 盯的是接线那一句", async () => {
    const dbPath = newDbPath()
    const wb = createWorkbench({
      configPath: configFile(), dbPath, credentials: memoryCredentials(),
    })
    cleanups.push(() => wb.close())
    // 档位存进设置：门是每次调用现取的，所以这里改完立刻生效
    new SettingsStore(wb.db).set("permission.mode", "deny-risky", "2026-08-13T00:00:00.000Z")

    const 拿 = (wb.nativeRuntime as unknown as {
      gatedTools(cwd: string, sessionId: string): Record<string, unknown>[] | undefined
    }).gatedTools.bind(wb.nativeRuntime)
    const write = 拿("/w/proj", "s1")?.find((t) => t.name === "write")
    expect(write, "装配出来的运行时没有包装过的 write").toBeDefined()

    const r = await 跑(write!, { path: "data/raw/a.csv", content: "x" })
    expect(r.isError, "wiring 里那句 gate 没接上——门在运行时那层是好的，但没装上去").toBe(true)
  })

  /**
   * **问一句**（2026-08-23，学自 dsh-auto-mode 的 ask）：危险操作不再直接拒，而是发一条 `permission_request`
   * （与 ACP 权限卡同一形状），等 `answerPermission`。点「允许这一次」就真写进去；拒绝就把理由回给模型。
   */
  describe("ask-risky 档：问一句", () => {
    it("**允许这一次 → 真的写进去**；卡的形状与 ACP 的一样、答完卡会消失", async () => {
      const dir = mkdtempSync(join(tmpdir(), "dawn-ask-"))
      cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
      const rt = 造运行时("ask-risky")
      const 事件: AgentEvent[] = []
      rt.attach("s1" as never, (e) => 事件.push(e))
      const write = 工具们(rt, dir).find((t) => t.name === "write")!
      const p = 跑(write, { path: "data/raw/a.csv", content: "人点了允许" })
      // 等卡弹出来
      await new Promise((r) => setTimeout(r, 50))
      const 问 = 事件.find((e) => e.kind === "permission_request") as Extract<AgentEvent, { kind: "permission_request" }> | undefined
      expect(问, "问一句档没发出权限询问").toBeDefined()
      expect(问!.title).toMatch(/data\/raw/)
      expect(问!.options.map((o) => o.optionId)).toEqual(["allow_once", "reject"])
      rt.answerPermission("s1" as never, 问!.requestId, "allow_once")
      const r = await p
      expect(r.isError).toBeUndefined()
      expect(readFileSync(join(dir, "data/raw/a.csv"), "utf8")).toBe("人点了允许")
      expect(事件.some((e) => e.kind === "permission_settled" && e.requestId === 问!.requestId), "答完了卡要消失").toBe(true)
    })

    it("**拒绝 → 不写，理由回给模型**，说清是人拒的", async () => {
      const dir = mkdtempSync(join(tmpdir(), "dawn-ask-"))
      cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
      const rt = 造运行时("ask-risky")
      const 事件: AgentEvent[] = []
      rt.attach("s1" as never, (e) => 事件.push(e))
      const write = 工具们(rt, dir).find((t) => t.name === "write")!
      const p = 跑(write, { path: "data/raw/a.csv", content: "x" })
      await new Promise((r) => setTimeout(r, 50))
      const 问 = 事件.find((e) => e.kind === "permission_request") as Extract<AgentEvent, { kind: "permission_request" }>
      rt.answerPermission("s1" as never, 问.requestId, "reject")
      const r = await p
      expect(r.isError).toBe(true)
      expect(r.content?.[0]?.text).toMatch(/人拒绝了/)
      expect(existsSync(join(dir, "data/raw/a.csv"))).toBe(false)
    })

    it("**硬拒不问**：sudo 在问一句档也直接拒，不发询问", async () => {
      const rt = 造运行时("ask-risky")
      const 事件: AgentEvent[] = []
      rt.attach("s1" as never, (e) => 事件.push(e))
      const bash = 工具们(rt, "/w/proj").find((t) => t.name === "bash")!
      const r = await 跑(bash, { command: "sudo rm -rf /var/log" })
      expect(r.isError).toBe(true)
      expect(r.content?.[0]?.text).toMatch(/提权/)
      expect(事件.some((e) => e.kind === "permission_request")).toBe(false)
    })
  })

  /**
   * **本会话产物**（2026-08-23，学自 dsh-auto-mode 的产物登记）：这段会话自己 `write` 出来的文件，
   * 拦下档删它也不拦；会话之前就有的照拦。
   */
  it("拦下档：删本会话自己写出来的文件不拦，删之前就有的拦", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dawn-artifact-"))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    writeFileSync(join(dir, "old.csv"), "之前就有")
    const rt = 造运行时("deny-risky")
    const 全部 = 工具们(rt, dir)
    const write = 全部.find((t) => t.name === "write")!
    const bash = 全部.find((t) => t.name === "bash")!
    await 跑(write, { path: "tmp.csv", content: "本会话写的" })
    expect(existsSync(join(dir, "tmp.csv"))).toBe(true)
    const 删新 = await 跑(bash, { command: "rm tmp.csv" })
    expect(删新.isError, "删本会话自己写的文件被拦了").not.toBe(true)
    expect(existsSync(join(dir, "tmp.csv"))).toBe(false)
    const 删旧 = await 跑(bash, { command: "rm old.csv" })
    expect(删旧.isError).toBe(true)
    expect(删旧.content?.[0]?.text).toMatch(/之前就有/)
    expect(existsSync(join(dir, "old.csv"))).toBe(true)
  })

  it("语境真的传下去了：工作区之外的写入拦得住", async () => {
    const 全部 = 工具们(造运行时("deny-risky"), "/w/proj")
    const write = 全部.find((t) => t.name === "write")
    const r = await 跑(write!, { path: "/tmp/dawn-outside-x.txt", content: "x" })
    expect(r.isError).toBe(true)
    expect(r.content?.[0]?.text).toMatch(/工作区/)
  })

  it("**插件生成的文件也登记成本会话产物**：删它不拦(审查 debug B2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dawn-plugin-artifact-"))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const rt = 造运行时("deny-risky")
    const spec = { sessionId: "s1", workspace: dir, sessionDir: join(dir, ".dawn") } as unknown as Parameters<NativeRuntime["start"]>[0]
    // 拿插件门包装,包一个假的 xlsx_write(在写路径参数名单里,写 file_path)
    const 包 = (rt as unknown as { 插件门包装(s: typeof spec): (d: unknown) => unknown }).插件门包装(spec)
    const 假xlsx = 包({
      name: "xlsx_write",
      execute: async (_id: string, params: Record<string, unknown>) => {
        writeFileSync(join(dir, String(params.file_path)), "插件写的")
        return { content: [{ type: "text", text: "ok" }], details: undefined }
      },
    }) as Record<string, unknown>
    await 跑(假xlsx, { file_path: "报表.xlsx" })
    expect(existsSync(join(dir, "报表.xlsx"))).toBe(true)
    // 同一会话的 bash 删它:是本会话产物,拦下档也不拦(此前插件文件没登记 → 会被当成「之前就有」拦下)
    const bash = 工具们(rt, dir).find((t) => t.name === "bash")!
    const 删 = await 跑(bash, { command: "rm 报表.xlsx" })
    expect(删.isError, "删本会话插件写的文件被拦了(B2 没修好)").not.toBe(true)
    expect(existsSync(join(dir, "报表.xlsx"))).toBe(false)
  })
})

/**
 * `run_code` 真的交到模型手上了吗（②第四批，2026-08-14）。
 *
 * `tests/tools/run-code.test.ts` 有 13 条，**验的是工具对象本身**——
 * 而它们全绿的同时，这个工具可以根本没被装上。
 * 这个项目栽在「零件都对、装没装上没人知道」上不止一次，
 * **其中一次就在 `toolsFor` 这个函数里**（退役掉的那个数据工具在这儿丢过）。
 */
describe("run_code · 接线", () => {
  const spec = () =>
    ({
      sessionId: "c1",
      workspace: "/w/proj",
      sessionDir: "/w/proj/.dawn/c1",
      native: { provider: "deepseek", model: "m" },
    }) as never

  function 工具名(rt: NativeRuntime): string[] {
    const 拿 = (rt as unknown as {
      toolsFor(s: never, n: { provider: string; model: string }): { name: string }[] | undefined
    }).toolsFor.bind(rt)
    return (拿(spec(), { provider: "deepseek", model: "m" }) ?? []).map((t) => t.name)
  }

  const 假内核 = () =>
    new 对话内核({
      runtime: { start: async () => ({ sessionId: "k", pid: 0 }) } as never,
      workspaceOf: () => "/w/proj",
      sessionDirOf: () => "/dir",
      interpreterOf: () => "/usr/bin/python3",
    })

  it("**给了内核就有 run_code**", () => {
    expect(工具名(new NativeRuntime({ kernels: 假内核() }))).toContain("run_code")
  })

  /**
   * **不给就完全是原来的样子。**
   * 这是作者定的纪律的可验证形式：加新功能不该改变没用到它的那些装配
   * （CLI、测试替身都不传 `kernels`）。
   */
  it("**不给内核就没有这个工具** —— 老装配一个字不受影响", () => {
    expect(工具名(new NativeRuntime({}))).not.toContain("run_code")
  })

  /**
   * **它与 subagent 无关，不能挂在那个分支里。**
   * `toolsFor` 在没有 `subagentChildEntry` 时提前返回——挂过去的话，
   * 那种装配里 `run_code` 整个消失，而「少了一个工具」不报任何错。
   */
  it("**没配子 agent 入口时也在** —— 这是它最容易被弄丢的地方", () => {
    expect(工具名(new NativeRuntime({ kernels: 假内核() }))).toContain("run_code")
  })

  /**
   * **这一条盯的是 `wiring.ts` 里那句 `kernels: 对话的内核`。**
   *
   * 上面几条直接 `new NativeRuntime({ kernels })`——它们验的是运行时那一层，
   * **把装配里那句摘掉照样全绿**（本项目栽过三次的形状，两次就在这个函数附近）。
   * 所以这里走 `createWorkbench` 真正装配出来的那个运行时。
   */
  it("**createWorkbench 装配出来的运行时带着 run_code** —— 盯的是接线那一句", () => {
    const wb = createWorkbench({
      configPath: configFile(), dbPath: newDbPath(), credentials: memoryCredentials(),
    })
    cleanups.push(() => wb.close())
    const 拿 = (wb.nativeRuntime as unknown as {
      toolsFor(s: never, n: { provider: string; model: string }): { name: string }[] | undefined
    }).toolsFor.bind(wb.nativeRuntime)
    const 名 = (拿(spec(), { provider: "deepseek", model: "m" }) ?? []).map((t) => t.name)
    expect(名, "装配里没把对话内核接上去").toContain("run_code")
  })

  /**
   * **这一条盯的是 `wiring.ts` 里那句 `mcp: { 取工具, 池, 门 }`。**
   *
   * 与上面两条同一个形状（门、内核各栽过一次）：直接 `new MCP池(...)`
   * 验的是客户端那一层，**把装配里那句摘掉照样全绿**。
   * 所以这里走 `createWorkbench` 真正装配出来的那个运行时，
   * 并且对着**一台真 MCP 服务器**（`scripts/mcp-test-server.mjs`）跑一遍。
   *
   * MCP 的工具**不经过 `toolsFor` 那条同步路径**——列一台服务器的工具
   * 要真的把它起起来、说一轮协议，所以它在 `start()` 里备好。
   * 判据因此挑装配交给运行时的那个 `取工具`。
   */
  it("**createWorkbench 装配出来的运行时带着 MCP** —— 盯的是接线那一句", async () => {
    const 脚本 = join(process.cwd(), "scripts", "mcp-test-server.mjs")
    const wb = createWorkbench({
      configPath: configFile(
        `mcp:\n  testbox:\n    command: ${JSON.stringify(process.execPath)}\n    args: [${JSON.stringify(脚本)}]\n`,
      ),
      dbPath: newDbPath(),
      credentials: memoryCredentials(),
    })
    cleanups.push(() => wb.close())

    const 装 = (wb.nativeRuntime as unknown as {
      opts?: {
        mcp?: {
          取工具(w: string | undefined): Promise<{ 工具: { 全名: string }[]; 问题: string[] }>
        }
      }
    }).opts?.mcp
    expect(装, "装配里没把 MCP 接上去").toBeDefined()

    const r = await 装!.取工具(undefined)
    expect(r.问题, `有服务器没连上：${r.问题.join("；")}`).toEqual([])
    expect(r.工具.map((t) => t.全名), "真服务器的工具没列出来").toContain("testbox__echo")
    await wb.closeAsync(3000)
  })

  /**
   * **这一条盯的是 `wiring.ts` 里那句 `skills: 技能位置`。**
   *
   * 与门、内核、MCP 那三条同一个形状：上面几条直接调 pi 的 `loadSkills`
   * 验的是 pi 那一层，**把装配里那句摘掉照样全绿**。
   *
   * pi 默认的两个位置在我们这儿都不好使——`<agentDir>/skills` 是**每会话一个**
   * （放那儿等于每段会话各放一份，也就是等于不存在），
   * `<cwd>/.pi/skills` 与我们 `.dawn/` 的约定不一致。所以这句接线是必需的。
   */
  it("**createWorkbench 装配出来的运行时带着技能目录** —— 盯的是接线那一句", () => {
    const 技能根 = mkdtempSync(join(tmpdir(), "dawn-skills-"))
    cleanups.push(() => rmSync(技能根, { recursive: true, force: true }))
    const wb = createWorkbench({
      configPath: configFile(),
      dbPath: newDbPath(),
      credentials: memoryCredentials(),
      skillsDir: 技能根,
    })
    cleanups.push(() => wb.close())

    const 装 = (wb.nativeRuntime as unknown as {
      opts?: { skills?: { 全局目录?: string; 项目目录名?: string } }
    }).opts?.skills
    expect(装, "装配里没把技能目录接上去").toBeDefined()
    expect(装!.全局目录, "全局技能目录没接上").toBe(技能根)
    /** **项目级跟着我们自己的约定**（`.dawn/`），不跟 pi 的 `.pi/` */
    expect(装!.项目目录名, "项目级技能目录应当在 .dawn 下").toContain(".dawn")
  })

  it("内置四件套还在 —— 加自定义工具不该把它们挤掉", () => {
    const 名 = 工具名(new NativeRuntime({ kernels: 假内核() }))
    for (const t of ["read", "write", "edit", "bash"]) {
      expect(名, `内置工具 ${t} 没了`).toContain(t)
    }
  })
})

/**
 * 内核起 / 退出要在转录里出声（spec 笔记本 §3/§6，审查 2026-08-26）。
 * `createWorkbench` 里那句 `状态变了` 把 `内核变化出声` 接在 `setKernels` 旁边；这里验的是它说的话。
 */
describe("内核变化出声 · 接线", () => {
  const 收集 = () => {
    const events = new SessionTranscripts({ terminalMaxChars: 1000 })
    events.track("c1", "native")
    events.subscribe("c1")
    const 通知 = () => events.peekItems("c1").filter((i) => i.type === "notice").map((i) => (i as { text: string }).text)
    return { events, 通知 }
  }

  it("starting → 「正在起 Python 内核…」", () => {
    const { events, 通知 } = 收集()
    内核变化出声(events, "c1", { language: "python", state: "starting" })
    expect(通知()).toEqual(["正在起 Python 内核…"])
  })

  it("exited → 「R 内核退出了：<原因>；再跑一次会起新的一台」；没原因就不带冒号", () => {
    const { events, 通知 } = 收集()
    内核变化出声(events, "c1", { language: "R", state: "exited", reason: "退出码 137" })
    内核变化出声(events, "c1", { language: "python", state: "exited" })
    expect(通知()).toEqual(["R 内核退出了：退出码 137；再跑一次会起新的一台", "Python 内核退出了；再跑一次会起新的一台"])
  })

  it("起失败 → 「Python 内核起不来：<原因>」，不说「退出了」", () => {
    const { events, 通知 } = 收集()
    内核变化出声(events, "c1", { language: "python", state: "exited", reason: "python 进程起不来", 起失败: true })
    expect(通知()).toEqual(["Python 内核起不来：python 进程起不来"])
  })

  /**
   * 远程内核（2026-09-03）：断线那条**不带**「再跑一次会起新的一台」的尾巴——
   * 运行时的 `连接断了` 已经在转录里说过同样意思的一句，而且这时候「再跑一次」并不成立
   * （得先把那台服务器连回来）。
   */
  it("远端断线 → 「Python 内核退出了：与服务器断开，内核里的变量已经不在了…」，不接「再跑一次」那半句", () => {
    const { events, 通知 } = 收集()
    内核变化出声(events, "c1", { language: "python", state: "exited", reason: "disconnected" })
    expect(通知()).toEqual(["Python 内核退出了：与服务器断开，内核里的变量已经不在了；重新连接后再跑会起新的一台"])
  })

  it("idle / busy 不出声；我们自己收掉的也不出声", () => {
    const { events, 通知 } = 收集()
    内核变化出声(events, "c1", { language: "python", state: "idle" })
    内核变化出声(events, "c1", { language: "python", state: "busy" })
    内核变化出声(events, "c1", { language: "python", state: "exited", 收掉: true })
    expect(通知()).toEqual([])
  })
})

describe("默认项目与临时会话根（2026-08-28 真实 HOME 全新演练抓的）", () => {
  it("**同一条路径在装配时就拦下**——否则第一段临时会话撞 UNIQUE，全新机器上第一句话就失败", () => {
    const root = mkdtempSync(join(tmpdir(), "dawn-same-root-"))
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    expect(() =>
      createWorkbench({ configPath: configFile(), dbPath: newDbPath(), credentials: memoryCredentials(), defaultWorkspace: root, scratchRoot: root }),
    ).toThrow(/不能是同一个/)
  })

  it("路径不同：默认项目建得出，第一段临时会话也开得出（此前就是这两步互相撞）", async () => {
    const base = mkdtempSync(join(tmpdir(), "dawn-two-roots-"))
    cleanups.push(() => rmSync(base, { recursive: true, force: true }))
    const wb = createWorkbench({ configPath: configFile(), dbPath: newDbPath(), credentials: memoryCredentials(), defaultWorkspace: join(base, "workspace"), scratchRoot: join(base, "scratch"), skipCredentialGate: true })
    cleanups.push(() => wb.close())
    const p = await wb.server.handle("getProviders", {})
    const agentId = (p as { data: { agents: { agentId: string; kind: string }[] } }).data.agents.find((a) => a.kind === "native")?.agentId
    expect(agentId).toBeDefined()
    const r = await wb.server.handle("createTask", { agentId })
    expect(r.ok, JSON.stringify(r)).toBe(true)
  })
})

describe("更新之后：上一版的默认项目就坐在这一版的临时会话根上（2026-09-01）", () => {
  /**
   * 上一版 `DEFAULT_WORKSPACE = ~/DAWN/scratch`，`ensureDefault` 在那儿建了一个**非临时**项目。
   * 这一版把默认挪到 `~/DAWN/workspace`、临时根仍是 scratch：`ensureDefault` 见到已有项目就返回，
   * 装配处「默认 ≠ 临时根」那道闸比的是两个字符串、也过了——直到第一段临时会话去 insert 同一条 workspace，
   * 撞 UNIQUE，用户只看到「操作 createTask 执行失败」。手动把 scratch 打开成项目的人同样中招。
   */
  it("上一版在 scratch 建过普通项目 ⇒ 这一版第一段临时会话仍开得出", async () => {
    const base = mkdtempSync(join(tmpdir(), "dawn-updated-"))
    cleanups.push(() => rmSync(base, { recursive: true, force: true }))
    const db = newDbPath()
    const scratch = join(base, "scratch")
    // 上一版：默认工作区就是 scratch
    const 旧版 = createWorkbench({ configPath: configFile(), dbPath: db, credentials: memoryCredentials(), defaultWorkspace: scratch, scratchRoot: join(base, "unused"), skipCredentialGate: true })
    旧版.close()
    // 这一版：默认挪到 workspace，临时根还是 scratch——同一个 db
    const wb = createWorkbench({ configPath: configFile(), dbPath: db, credentials: memoryCredentials(), defaultWorkspace: join(base, "workspace"), scratchRoot: scratch, skipCredentialGate: true })
    cleanups.push(() => wb.close())
    const p = await wb.server.handle("getProviders", {})
    const agentId = (p as { data: { agents: { agentId: string; kind: string }[] } }).data.agents.find((a) => a.kind === "native")?.agentId
    expect(agentId).toBeDefined()
    const r = await wb.server.handle("createTask", { agentId })
    expect(r.ok, JSON.stringify(r)).toBe(true)
    // 复用的是那个旧项目：不新建、也不把它改成临时的（那是用户的项目）
    const projects = (await wb.server.handle("listProjects", {})) as { data: { workspace: string; temporary?: boolean }[] }
    const 占着的 = projects.data.filter((x) => x.workspace === scratch)
    expect(占着的).toHaveLength(1)
    expect(占着的[0]!.temporary).toBeUndefined()
  })

  /**
   * 复用普通项目的代价（2026-09-01 终审抓的）：`listTemporarySessions` 只认 `p.temporary`，
   * 界面的项目列表只认 `!p.temporary`——落在那个普通项目名下的临时会话，
   * 「会话」那一列看不到、`listSessions(activeProjectId)` 也只在它恰好是当前项目时才有。
   * 看不见的会话等于没建成。**不把项目翻成临时的**（那等于替用户删一个项目）；
   * 让「占着临时根的那个项目」在列临时会话时也算数。
   */
  it("落在那个旧项目名下的临时会话，listTemporarySessions 列得出来", async () => {
    const base = mkdtempSync(join(tmpdir(), "dawn-updated-"))
    cleanups.push(() => rmSync(base, { recursive: true, force: true }))
    const db = newDbPath()
    const scratch = join(base, "scratch")
    const 旧版 = createWorkbench({ configPath: configFile(), dbPath: db, credentials: memoryCredentials(), defaultWorkspace: scratch, scratchRoot: join(base, "unused"), skipCredentialGate: true })
    旧版.close()
    const wb = createWorkbench({ configPath: configFile(), dbPath: db, credentials: memoryCredentials(), defaultWorkspace: join(base, "workspace"), scratchRoot: scratch, skipCredentialGate: true })
    cleanups.push(() => wb.close())
    const p = await wb.server.handle("getProviders", {})
    const agentId = (p as { data: { agents: { agentId: string; kind: string }[] } }).data.agents.find((a) => a.kind === "native")?.agentId
    const r = (await wb.server.handle("createTask", { agentId })) as { ok: boolean; data: { sessionId?: string } }
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(r.data.sessionId).toBeDefined()
    const 临时 = (await wb.server.handle("listTemporarySessions", {})) as { data: { sessionId: string }[] }
    expect(临时.data.map((s) => s.sessionId)).toContain(r.data.sessionId)
  })
})

/**
 * 远端会话第一次要内核（远程内核，2026-09-03，spec 定案 1）。
 *
 * 任务 9 补上了假服务器那半（`fake-ssh-kernel.ts` 真起本机 ipykernel），这条终于能跑了。
 *
 * **走的入口换过一次**：`backend.ts` 的 `runInKernel` 曾经无差别拒远端会话（`拒远端`，
 * 2026-08-27 那次「远端还没有内核」留下的旧闸门）。审查 2026-09-04（commit a2a5cea）把它
 * 松开了——`拒远端` 现在只在挂载层**没接**远端内核时才拦（`!opts.kernels?.能起远端()`），
 * `wiring.ts` 一直都接着，所以远端会话不会被拦。这里因此照计划原来的写法，直接走
 * `runInKernel`，不用再绕 `wb.nativeRuntime` 的 `run_code` 工具。
 */
describe("远端会话的解释器（远程内核）", () => {
  const PY = process.env.DAWN_FAKE_SSH_PYTHON

  // **不静默跳过**：没设这条环境变量时如实说一声，而不是安静地什么都没验证
  it.runIf(!PY)("跳过：没设 DAWN_FAKE_SSH_PYTHON", () => {
    console.error("[跳过] 没设 DAWN_FAKE_SSH_PYTHON，跳过「远端会话第一次要内核」这条真起内核的用例")
  })

  it.skipIf(!PY)("没配 → 探测；唯一 → 写进这台服务器的配置并出声", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "dawn-remote-kernel-"))
    cleanups.push(() => rmSync(scratch, { recursive: true, force: true }))
    const wb = createWorkbench({
      configPath: configFile(),
      dbPath: newDbPath(),
      credentials: memoryCredentials({ deepseek: "sk-test" }),
      fakeSsh: true,
      scratchRoot: scratch,
    })
    /**
     * **兜底**：正常路径走 `closeAsync()`（见下面的 try/finally）。这里不能用 `wb.close()`——
     * 那条是 fire-and-forget，`对话的内核.收全部()` 只是「发出去」不等它跑完，`afterEach`
     * 也不 await 这个回调的返回值，于是真起的那台 ipykernel 可能在进程退出前根本没被
     * `stop()` 到（审查抓到过一次真实泄漏：两台 kernel 进程在测试跑完后还活着）。
     */
    cleanups.push(async () => {
      await wb.closeAsync(15_000)
    })

    try {
      // 1. 加一台假服务器、连上
      const saved = (await wb.server.handle("saveConnection", {
        label: "fake-genek", host: "h", username: "u", secret: 假口令,
      })) as { ok: boolean; data: { id: string } }
      expect(saved.ok, JSON.stringify(saved)).toBe(true)
      const connectionId = saved.data.id
      const connected = await wb.server.handle("connectRemote", { id: connectionId })
      expect(connected.ok, JSON.stringify(connected)).toBe(true)

      // 开一段远端会话
      const p = await wb.server.handle("getProviders", {})
      const agentId = (p as { data: { agents: { agentId: string; kind: string }[] } }).data.agents
        .find((a) => a.kind === "native")?.agentId
      expect(agentId).toBeDefined()
      const rs = (await wb.server.handle("createRemoteSession", { connectionId, agentId })) as {
        ok: boolean
        data: { sessionId: string }
      }
      expect(rs.ok, JSON.stringify(rs)).toBe(true)
      const sessionId = rs.data.sessionId

      // 2. runInKernel：这段会话没配过解释器，第一次跑代码要触发探测（挂在 wiring.ts 的 interpreterOf 里）
      const r = await wb.server.handle("runInKernel", { sessionId, language: "python", code: "print(1)" })
      expect(r.ok, JSON.stringify(r)).toBe(true)

      // 3. 断言：connectionStore 记下了这条解释器路径；转录里有一条 notice 说「已记进这台服务器」
      const list = (await wb.server.handle("listConnections", {})) as {
        data: { id: string; interpreters?: { python?: string } }[]
      }
      const rec = list.data.find((c) => c.id === connectionId)
      expect(rec?.interpreters?.python).toBe(PY)
      const 通知 = wb.events.peekItems(sessionId).filter((i) => i.type === "notice").map((i) => (i as { text: string }).text)
      expect(通知.some((t) => t.includes("已记进这台服务器"))).toBe(true)

      /**
       * 4. 这条用例真起过内核，才值得断言「停完不留字」——起不来的话下面那条断言毫无意义。
       *
       * **只认这次装配自己的装机 id**（审查反馈）：整个 tmpdir 前后 diff 会把并发跑的
       * 别的 worker 也在写的 `dawn-<别的id>-python-*.json` 算成「这条用例的残留」——
       * 那是误判不是真相（`tests/workbench/backend.test.ts` 那批 `dawn-memories-*`
       * 临时目录同样带 `dawn-` 前缀，同一个理由）。装机 id 落在 `settings` 表的
       * `install.id` 键（`wiring.ts` 的 `装机id()`），起内核那一刻早就生成好了。
       */
      const id = (wb.db.prepare("SELECT value FROM settings WHERE key = 'install.id'").get() as
        | { value: string }
        | undefined)?.value
      expect(id, "起过内核就该有装机 id 了").toBeDefined()
      const 内核文件模式 = new RegExp(`^dawn-${id}-(python|R)-[a-z0-9]+\\.json(\\.log)?$`)
      const 新增的 = readdirSync(tmpdir()).filter((f) => 内核文件模式.test(f))
      expect(新增的.length, "这条用例应该真起过一台内核，tmp 里理应多出 connection.json / .log").toBeGreaterThan(0)

      // 5. 停掉——`closeAsync` 会等 `对话的内核.收全部()`，那条会走 `停远端内核`（真 kill + 真 rm）。
      // 默认的 1500ms 超时是给「正常退出」用的；`停远端内核` 的存活轮询最多 20 × 500ms，给够时间再查残留
      await wb.closeAsync(15_000)
      for (const f of 新增的) {
        expect(existsSync(join(tmpdir(), f)), `残留没清干净：${f}`).toBe(false)
      }
    } finally {
      // `closeAsync` 已经关过就是幂等的 no-op；提前抛出时这一句仍会尽力收摊
      await wb.closeAsync(15_000).catch(() => {})
    }
  }, 30_000)
})
