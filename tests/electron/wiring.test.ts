/**
 * 装配层的测试。**不起 Electron**——Electron 只负责窗口与 IPC，
 * 「把 store / manager / server 拼起来」是纯逻辑，应当能单独验证。
 * 这与 Task 2.3 让服务端不认识 Electron 是同一个手法。
 */
import { afterEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorkbench } from "../../src/electron/wiring.js"
import { memoryCredentials } from "../helpers/credentials.js"
import { NativeRuntime } from "../../src/runtime/native.js"
import { 对话内核 } from "../../src/kernel/挂载.js"
import { SettingsStore } from "../../src/store/settings.js"
import { 造门 } from "../../src/policy/permissions.js"

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
  function 造运行时(档: "allow-all" | "deny-risky") {
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

  it("语境真的传下去了：工作区之外的写入拦得住", async () => {
    const 全部 = 工具们(造运行时("deny-risky"), "/w/proj")
    const write = 全部.find((t) => t.name === "write")
    const r = await 跑(write!, { path: "/etc/hosts", content: "x" })
    expect(r.isError).toBe(true)
    expect(r.content?.[0]?.text).toMatch(/工作区/)
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
