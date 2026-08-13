import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalView,
} from "../../src/ui/views.js"
import type { ProjectSummary, SessionSummary, TaskSummary } from "../../src/protocol/index.js"

const project = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  projectId: "p1",
  name: "dawn-science",
  workspace: "/w",
  createdAt: "2026-08-08T00:00:00Z",
  totalRunCount: 3,
  totalSessionCount: 1,
  unresolvedProblemCount: 0,
  ...over,
})

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-08-08T00:00:00Z",
  ...over,
})

const noop = () => {}
const base = {
  projects: [project()],
  sessions: [] as SessionSummary[],
  agents: ["ds-chat", "claude-code"],
  activeProjectId: "p1" as string | undefined,
  activeSessionId: undefined as string | undefined,
  view: "conversation" as const,
  onShowFiles: () => {},
  onPickProject: noop,
  onPickSession: noop,
  onOpenProject: noop,
  onNewSession: noop as (a: string) => void,
  onShowPanel: noop,
}

const task = (over: Partial<TaskSummary> = {}): TaskSummary => ({
  taskId: "t1",
  sessionId: "s1",
  pinned: false,
  sortOrder: 1,
  createdAt: "2026-08-08T00:00:00Z",
  ...over,
})

/**
 * 侧栏（**2026-08-12 按 T3-a 换了主语**）。
 *
 * 作者：*「点击完新建任务后，在对话窗口选择文件夹之后，就属于是一个项目管理，
 * 那么就会归类到左边侧边栏的项目里面。然后如果……不选择文件夹，直接对话，
 * 那么就属于是一个会话，那么就会归类到左边侧边栏的会话里面。」*
 *
 * 上一版这里测的是三个入口（新建任务 / 新建会话 / 新建项目）与两列。
 * **删掉的每一条，删的理由都是它的主语没了**——而它守着的意图
 * （「侧栏能把对话建出来」是 2026-08-08 那次修正的核心）都在下面。
 */
describe("侧栏 · 新建任务是唯一的主动作", () => {
  it("有「新建任务」入口，且只有它一个", () => {
    render(<SessionSidebar {...base} />)
    expect(screen.getByRole("button", { name: "新建任务" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "新建会话" })).toBeNull()
    expect(screen.queryByRole("button", { name: "新建项目" })).toBeNull()
  })

  /**
   * **按下就建，不问工作路径。**
   *
   * 这条守的是 2026-08-08 那次修正的核心：初版 UI 里 `createSession`
   * 一次都没被调用过——**这个 app 做不了它最该做的那件事**，
   * 而 363 个测试一条都没拦住，因为它们全是「叶子组件 + 手喂 props」。
   */
  it("**按下就建，不问工作路径**", () => {
    const onNewTask = vi.fn()
    render(<SessionSidebar {...base} onNewTask={onNewTask} />)
    fireEvent.click(screen.getByRole("button", { name: "新建任务" }))
    expect(onNewTask).toHaveBeenCalled()
  })

  it("**一个项目都没有也能建** —— 不设路径就是普通对话，不需要项目", () => {
    render(<SessionSidebar {...base} projects={[]} activeProjectId={undefined} />)
    expect((screen.getByRole("button", { name: "新建任务" }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it("配置里没有 agent 时禁用，并说明原因", () => {
    render(<SessionSidebar {...base} agents={[]} />)
    expect((screen.getByRole("button", { name: "新建任务" }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText(/还没有可用的 agent/)).toBeDefined()
  })
})

describe("侧栏 · 归类：有路径进项目，没路径进会话", () => {
  /** 任务行要拿到会话摘要才有删除/改名/置顶——夹具把两者对上 */
  const 带会话 = (tasks: TaskSummary[], sessions: SessionSummary[]) => ({
    tasks,
    sessionOf: (id: string) => sessions.find((s) => s.sessionId === id),
    sessionRank: (id: string) => sessions.findIndex((s) => s.sessionId === id),
  })

  it("**没给路径 → 会话那一栏**", () => {
    const { container } = render(<SessionSidebar {...base} {...带会话([task()], [session()])} />)
    // **查分区标题本身**，不是「页面上有没有这两个字」——
    // 底部那个「项目概览」入口也含「项目」，用 /^项目/ 会撞上它
    const 分区 = [...container.querySelectorAll(".side-section")].map((x) => x.textContent ?? "")
    expect(分区.some((t) => t.startsWith("会话"))).toBe(true)
    // **一条项目都没有时那一整块不出现**：写着 (0) 的标题占一行、什么都没说
    expect(分区.some((t) => t.startsWith("项目"))).toBe(false)
  })

  /**
   * **文件夹即项目身份**（作者定的第一条）。
   *
   * 两段对话选同一个路径 → 一个项目底下挂两段，不是两条同名并列项。
   * 它要回答的是「我上次在这个目录聊过什么」，重名条目回答不了。
   */
  it("**同一个路径合并成一个项目**，底下挂两段", () => {
    const ts = [
      task({ taskId: "t1", sessionId: "s1", workspace: "/w/rna" }),
      task({ taskId: "t2", sessionId: "s2", workspace: "/w/rna" }),
    ]
    const ss = [session({ sessionId: "s1" }), session({ sessionId: "s2", title: "第二段" })]
    const { container } = render(<SessionSidebar {...base} {...带会话(ts, ss)} />)

    expect(container.querySelectorAll(".proj-list .proj-item")).toHaveLength(1)
    // 名字是路径的最后一段；全路径也常驻——**同名文件夹到处都是**
    expect(screen.getByText("rna")).toBeDefined()
  })

  it("**不同路径就是不同项目**", () => {
    const ts = [
      task({ taskId: "t1", sessionId: "s1", workspace: "/w/rna" }),
      task({ taskId: "t2", sessionId: "s2", workspace: "/w/atac" }),
    ]
    const ss = [session({ sessionId: "s1" }), session({ sessionId: "s2" })]
    const { container } = render(<SessionSidebar {...base} {...带会话(ts, ss)} />)
    expect(container.querySelectorAll(".proj-list .proj-item")).toHaveLength(2)
  })

  it("**在这个项目里再开一段**：入口就在它自己那一行上", () => {
    const onNewTaskIn = vi.fn()
    const ts = [task({ workspace: "/w/rna" })]
    render(
      <SessionSidebar {...base} {...带会话(ts, [session()])} onNewTaskIn={onNewTaskIn} />,
    )
    fireEvent.click(screen.getByRole("button", { name: /里开一段新对话/ }))
    expect(onNewTaskIn).toHaveBeenCalledWith("/w/rna")
  })

  it("**没说过话的显示「新会话」**，不是一行空白 —— 空白看起来像加载失败", () => {
    const { container } = render(<SessionSidebar {...base} {...带会话([task()], [session()])} />)
    expect(screen.getByText("新会话")).toBeDefined()
    /**
     * **副信息只剩时刻，且在同一行的右端**（2026-08-12 改）。
     *
     * 上一版这里断言副行写着 `ds-chat · …`。那一行现在没有 agent 了：
     * 实测 WorkBuddy 的会话行是 `240×31` 单行，我们的双行是 53——**高出七成**。
     * 而 agent 已经不是这一行才答得了的问题：每条回答上都记着是谁答的
     * （`item.by`），composer 上还有一颗 pill。
     *
     * 意图没变——**这一行不许是空白**，只是「不空白」的内容换了。
     */
    const sub = container.querySelector(".session-list .sess > .sub")
    expect(sub?.textContent?.trim()).toMatch(/\d/)
    expect(container.querySelector(".session-list .sess")?.textContent).not.toContain("ds-chat")
  })

  it("**有标题就用标题** —— 同一个 agent 的两段得分得开", () => {
    const ts = [
      task({ taskId: "t1", sessionId: "s1" }),
      task({ taskId: "t2", sessionId: "s2" }),
    ]
    const ss = [
      session({ sessionId: "s1", title: "看看 sales.csv" }),
      session({ sessionId: "s2", title: "跑一次回归" }),
    ]
    render(<SessionSidebar {...base} {...带会话(ts, ss)} />)
    expect(screen.getByText("看看 sales.csv")).toBeDefined()
    expect(screen.getByText("跑一次回归")).toBeDefined()
  })

  it("点一行就切过去", () => {
    const onPickTask = vi.fn()
    render(
      <SessionSidebar
        {...base}
        {...带会话([task({ taskId: "t9" })], [session({ title: "看看 sales.csv" })])}
        onPickTask={onPickTask}
      />,
    )
    fireEvent.click(screen.getByText("看看 sales.csv"))
    expect(onPickTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "t9" }))
  })

  /**
   * **顺序由会话那一套说了算。**
   *
   * 两张表各有一套 `pinned`/`sortOrder`，而置顶、上下挪、拖拽改的是会话那一套。
   * 照任务那一套排的话，症状是**点了置顶什么都不动**——
   * 又一次「能点、没报错、然后什么都没发生」。
   */
  it("**按会话的顺序排，不按任务的**", () => {
    const ts = [
      task({ taskId: "t1", sessionId: "s1", sortOrder: 1 }),
      task({ taskId: "t2", sessionId: "s2", sortOrder: 2 }),
    ]
    // 会话那一套把 s2 排在前面（比如它刚被置顶）
    const ss = [session({ sessionId: "s2", title: "被置顶的" }), session({ sessionId: "s1", title: "另一段" })]
    const { container } = render(<SessionSidebar {...base} {...带会话(ts, ss)} />)
    const 名字 = [...container.querySelectorAll(".session-list .sess .name")].map((x) => x.textContent)
    expect(名字[0]).toContain("被置顶的")
  })

  it("一条都没有时不画空列表", () => {
    const { container } = render(<SessionSidebar {...base} />)
    expect(container.querySelectorAll(".sess-item")).toHaveLength(0)
  })

  it("项目概览是侧栏底部入口，不是首页", () => {
    const onShowPanel = vi.fn()
    render(<SessionSidebar {...base} onShowPanel={onShowPanel} />)
    fireEvent.click(screen.getByRole("button", { name: "项目概览" }))
    expect(onShowPanel).toHaveBeenCalled()
  })
})

describe("空对话态", () => {
  // **2026-08-09 改写。** 原来两条测的是 `canStart` 那套：有项目就说「去点新建会话」，
  // 没项目就说「先打开一个项目文件夹」。后者已随 Task 3.4 删除——
  // 启动时保证至少有一个默认项目，而且**「先打开文件夹」是一句描述、不是一条出路**。
  // 完整覆盖见 tests/ui/first-run-ui.test.tsx。
  /**
   * **给的是一个能动手的东西，不只是一句提示**（2026-08-12 换主语）。
   *
   * 那颗「＋ 用 X 开始」没有了——空态本身就是输入卡。
   * 作者：*「不要上来就是用 Deepseek 开始，而是要直接是对话窗口。」*
   */
  it("给出一个能直接打字的输入卡，而不只是一句提示", () => {
    const onStart = vi.fn()
    render(<EmptyConversation agents={["ds-chat"]} onStart={onStart} onOpenSettings={noop} />)
    const box = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "直接说" } })
    fireEvent.submit(box.form!)
    expect(onStart).toHaveBeenCalledWith("ds-chat", "直接说", undefined)
  })
})

describe("对话视图", () => {
  it("空对话如实说没有", () => {
    render(<ConversationView session={session()} items={[]} onSend={noop} />)
    expect(screen.getByText(/还没有对话/)).toBeDefined()
  })

  it("区分人与 agent 的发言", () => {
    render(
      <ConversationView
        session={session()}
        items={[
          { type: "turn" as const, id: "1", who: "user" as const, text: "你好", final: true },
          { type: "turn" as const, id: "2", who: "agent" as const, text: "在", final: true },
        ]}
        onSend={noop}
      />,
    )
    expect(screen.getByText("你")).toBeDefined()
    expect(screen.getAllByText("ds-chat").length).toBeGreaterThan(0)
  })

  it("提交非空内容触发发送并清空输入框", () => {
    const onSend = vi.fn()
    render(<ConversationView session={session()} items={[]} onSend={onSend} />)
    const box = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "跑一下测试" } })
    fireEvent.submit(box.form!)
    expect(onSend).toHaveBeenCalledWith("跑一下测试")
    expect(box.value).toBe("")
  })

  it("空白内容不触发发送", () => {
    const onSend = vi.fn()
    render(<ConversationView session={session()} items={[]} onSend={onSend} />)
    const box = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "   " } })
    fireEvent.submit(box.form!)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("会话已结束时输入被禁用，并说明原因", () => {
    render(<ConversationView session={session({ state: "exited" })} items={[]} onSend={noop} disabled />)
    expect((screen.getByPlaceholderText(/会话已结束/) as HTMLTextAreaElement).disabled).toBe(true)
  })

  // **2026-08-09：这个事实搬了家，但必须还在。**
  // 它原来在会话头部，现在在 composer 右下角那颗 pill 里——
  // 同一个事实显示两次会各自漂移，所以头部那份撤掉了
  /**
   * **2026-08-09（①-C · C1）：分类从两种变成三种。**
   *
   * 原来是 `pty ? "外部 CLI" : "内置"`——那时 claude/codex 确实是 pty 托管的。
   * 现在 `pty` 的语义是**一个真终端**（通用 shell），
   * 外部 CLI 的对话模式是新的 `cli`。
   * **那个二元三元表达式会把 `cli` 说成「内置」，而它恰恰是最外部的那个。**
   */
  it("标出会话是外部 CLI、内置还是终端", () => {
    render(
      <ConversationView
        session={session({ kind: "pty" })}
        items={[]}
        agents={["ds-chat"]}
        onSend={noop}
      />,
    )
    expect(screen.getByText("终端")).toBeDefined()
  })
})

describe("PTY 会话的终端视图", () => {
  /**
   * **2026-08-09：这一组的前身是「终端 dock」，被作者的试用结论推翻了。**
   *
   * 原来这里有一条 `默认收起 —— 终端是下钻视图，不是主界面`。
   * 那条断言本身没错，**错的是它守着的那个设计**：对托管 CLI 的会话，
   * 终端不是下钻视图，它就是这个会话本身。把它折起来、在主区域放一个
   * 送不出回车的输入框，结果就是作者报的「claude / codex 在 app 里不好使」。
   *
   * **删掉那条不是测试腐烂，是意图变了**——所以连同理由一起记在这里，
   * 而不是让下一个人从 git log 里考古。
   */
  const paneCount = () => document.querySelectorAll(".term-host").length

  it("挂载终端窗格，没有任何需要先点开的东西", () => {
    render(<TerminalView chunks={["hello from pty"]} />)
    expect(paneCount()).toBe(1)
  })

  it("**没有折叠开关** —— 终端就是主体，折叠它没有意义", () => {
    render(<TerminalView chunks={["x"]} />)
    expect(screen.queryByRole("button", { name: /终端/ })).toBeNull()
  })
})

