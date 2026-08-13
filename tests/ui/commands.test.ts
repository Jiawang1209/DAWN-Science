/**
 * 命令注册表（①-B″ · U1）。
 *
 * 对标 Hermes：
 * > ***"One action, one home."*** *A command may have keyboard, palette, and visible
 * > affordances, but they **invoke the same action and state**.
 * > **Do not fork behavior per entry point.**"*
 *
 * 这句话不是靠自觉遵守的。**它必须在结构上成立**：
 * 命令的 `run` 里不许有实现，只许调用传进来的 `Actions`——
 * 而 `Actions` 与界面上的按钮是同一个对象。
 *
 * 做这个 Task 之前，App 里 `() => setView("settings")` 写了**四遍**，
 * 中止和打开项目还各自带着实现。面板再加一个入口就是第五份，
 * 那时「一个动作一个家」就只是一句写在文档里的话。
 */
import { describe, expect, it, vi } from "vitest"
import { buildCommands, type Actions } from "../../src/ui/commands.js"
import type { SessionSummary } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-08-09T00:00:00Z",
}

function actions(): Actions {
  return {
    openSettings: vi.fn(),
    showConversation: vi.fn(),
    showProjectPanel: vi.fn(),
    newTask: vi.fn(),
    abort: vi.fn(),
  deleteSession: vi.fn(),
    toggleDock: vi.fn(),
    setTheme: vi.fn(),
  }
}

const build = (over: Partial<Parameters<typeof buildCommands>[0]> = {}) =>
  buildCommands({
    actions: actions(),
    agents: ["ds-chat", "codex-cli"],
    session,
    busy: false,
    view: "conversation",
    ...over,
  })

describe("命令注册表 · 形状", () => {
  it("每条命令都有 id / 标题 / 分组 / run", () => {
    for (const c of build()) {
      expect(c.id, "id 不能为空").toBeTruthy()
      expect(c.title, `${c.id} 缺标题`).toBeTruthy()
      expect(c.group, `${c.id} 缺分组`).toBeTruthy()
      expect(typeof c.run, `${c.id} 的 run 不是函数`).toBe("function")
    }
  })

  it("id 不重复 —— 重复的 id 会让「执行哪一个」变成运气", () => {
    const ids = build().map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("覆盖到计划里的分组", () => {
    const groups = new Set(build().map((c) => c.group))
    for (const g of ["会话", "项目", "设置"]) {
      expect(groups.has(g as never), `缺分组：${g}`).toBe(true)
    }
  })

  /**
   * **「视图」这一组现在是上下文相关的**（2026-08-09）。
   *
   * 它此前有两条：「切换终端」（无条件）与「返回对话」（不在对话时才有）。
   * 前者随终端 dock 一并删掉——**对象没了的动作不该留在面板里**。
   * 于是这一组只在「人不在对话视图上」时才存在。
   *
   * 断言因此从「无条件有这一组」改成「在它该出现的场景里有」。
   * **改的是场景，不是意图。**
   */
  it("不在对话视图时，「视图」组给得出回去的路", () => {
    const groups = new Set(build({ view: "panel" }).map((c) => c.group))
    expect(groups.has("视图" as never)).toBe(true)
  })
})

describe("命令注册表 · 一个动作一个家", () => {
  // run **只许转发**。它自己实现一遍，就是第二个家
  it("「新建会话」调用的是传进来的 newSession", () => {
    const a = actions()
    const cmds = buildCommands({
      actions: a,
      agents: ["ds-chat", "codex-cli"],
      session,
      busy: false,
      view: "conversation",
    })
    /**
     * **T4：面板里那条是「新建任务」，不再是每个 agent 一条。**
     * 它与侧栏那颗、与顶栏那个标志是同一个动作：回初始画面，
     * 在那儿挑 LLM、挑工作目录。
     */
    cmds.find((c) => c.id === "task.new")!.run()
    expect(a.newTask).toHaveBeenCalled()
  })

  it("「打开设置」调用的是传进来的 openSettings", () => {
    const a = actions()
    const cmds = buildCommands({ actions: a, agents: [], session, busy: false, view: "conversation" })
    cmds.find((c) => c.id === "settings.open")!.run()
    expect(a.openSettings).toHaveBeenCalledTimes(1)
  })

  /**
   * **一条，不是每个 agent 一条**（T4，2026-08-13）。
   *
   * 原来是 `session.new:ds-chat` / `session.new:codex-cli` …一串。它有两个毛病：
   * 配三家就把面板刷掉三行；更要紧的是**它绕过了选工作目录那一步**，
   * 建出来的永远是普通会话。
   *
   * 现在与侧栏那颗「新建任务」是同一个动作：回初始画面，在那儿挑 LLM、
   * 挑目录，开口那一刻才建。**一个动作一个家**——挑 agent 的家是 composer 上那颗 pill。
   */
  it("「新建任务」只有一条，且不按 agent 分叉", () => {
    const ids = build().map((c) => c.id)
    expect(ids).toContain("task.new")
    expect(ids.filter((id) => id.startsWith("task.new"))).toHaveLength(1)
    expect(ids.some((id) => id.startsWith("session.new"))).toBe(false)
  })
})

describe("命令注册表 · 不可用要说原因，不许消失", () => {
  /**
   * Rho 的规矩：**缺失不等于不支持。**
   *
   * 一条命令搜不到时，人无法区分「这个功能不存在」和「它现在用不了」。
   * 所以不可用的命令**留在列表里**，并且写清为什么——
   * 这与协议层 `ProvenanceLink` 要求 `incompleteReason` 是同一条纪律。
   */
  it("没有正在进行的回合时，「中止」仍在列表里，但标注不可用并给出原因", () => {
    const c = build({ busy: false }).find((x) => x.id === "session.abort")
    expect(c, "「中止」不该消失").toBeDefined()
    expect(c!.unavailable, "必须写明为什么用不了").toBeTruthy()
  })

  it("正在进行时，「中止」可用", () => {
    const c = build({ busy: true }).find((x) => x.id === "session.abort")
    expect(c!.unavailable).toBeUndefined()
  })

  it("没有会话时，「中止」的原因说的是没有会话，而不是笼统的「不可用」", () => {
    const c = build({ session: undefined, busy: false }).find((x) => x.id === "session.abort")
    expect(c!.unavailable).toMatch(/会话/)
  })

  it("**一个 agent 都没有时，「新建任务」也要说清为什么**", () => {
    const cmds = build({ agents: [] })
    const c = cmds.find((x) => x.id === "task.new")
    expect(c, "没有 agent 时应当仍有一条占位的「新建任务」").toBeDefined()
    expect(c!.unavailable).toMatch(/agent/)
  })
})

describe("命令注册表 · 随上下文变化", () => {
  it("在设置页时给的是「返回对话」", () => {
    const ids = build({ view: "settings" }).map((c) => c.id)
    expect(ids).toContain("view.conversation")
  })

  it("三个主题各一条命令", () => {
    const ids = build().map((c) => c.id)
    for (const t of ["system", "light", "dark"]) {
      expect(ids).toContain(`theme.${t}`)
    }
  })

  it("主题命令转发给 setTheme，且带上正确的值", () => {
    const a = actions()
    const cmds = buildCommands({ actions: a, agents: [], session, busy: false, view: "conversation" })
    cmds.find((c) => c.id === "theme.dark")!.run()
    expect(a.setTheme).toHaveBeenCalledWith("dark")
  })
})
