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


/**
 * 服务器自成一列（2026-08-14，作者要的）。
 *
 * 作者：*「我们不是有会话和项目吗？我们可以再增加一个服务器的会话，
 * 这样服务器的会话就可以进行归类了。」*
 *
 * 判据是任务身上的 `connectionId`，**不是「有没有工作目录」**——
 * 一段远端任务同样可以设了远端路径，此前它会掉进「项目」那一列，
 * 与本地项目混在一起，而那两者根本不是同一台机器上的东西。
 */
describe("侧栏 · 服务器那一列", () => {
  const 任务 = (over: Record<string, unknown> = {}) => ({
    taskId: `t${Math.random().toString(36).slice(2, 7)}`,
    pinned: false,
    sortOrder: 1,
    createdAt: "2026-08-14T00:00:00Z",
    ...over,
  })

  const 画 = (tasks: unknown[], 服务器名?: (id: string) => string | undefined) =>
    render(
      <SessionSidebar
        {...base}
        projects={[]}
        activeProjectId={undefined}
        tasks={tasks as never}
        {...(服务器名 ? { 服务器名 } : {})}
      />,
    ).container

  it("远端任务按服务器归成一列，标题是那台机器的名字", () => {
    画([任务({ connectionId: "c1", title: "跑训练" })], (id) => (id === "c1" ? "实验室-3" : undefined))
    expect(screen.getByText("实验室-3")).toBeDefined()
  })

  /**
   * **取不到名字就显示连接 id。**
   * 编一个「未命名服务器」出来，与「这台就叫这个名字」在屏幕上分不开。
   */
  it("**名字取不到就显示 id** —— 不编一个占位名", () => {
    画([任务({ connectionId: "lab-7" })])
    expect(screen.getByText("lab-7")).toBeDefined()
  })

  /**
   * **远端任务不再掉进项目那一列。**
   * 这是这次改动的全部内容：设了远端路径的任务此前会与本地项目并列，
   * 而它们根本不在同一台机器上。
   */
  it("**设了路径的远端任务归服务器，不归项目**", () => {
    const c = 画([任务({ connectionId: "c1", workspace: "/data/proj" })], () => "实验室")
    expect(screen.getByText("实验室")).toBeDefined()
    // 项目那一列不该因此多出一条
    expect(c.querySelectorAll(".side-server").length).toBe(1)
  })

  it("**没有远端任务时不画这一列** —— 不留一个空标题", () => {
    const c = 画([任务({ workspace: "/w/a" }), 任务({})])
    expect(c.querySelector(".side-server"), "凭空多了一个服务器分区").toBeNull()
  })

  /**
   * **一个收纳，不是每台一个标题**（2026-08-14 作者指出我第一版做错了）。
   *
   * 作者：*「会话有一个收纳叫做会话，项目有一个收纳叫做项目，
   * 其实服务器有一个收纳，那就叫服务器。」*
   * 机器一多，「每台一个平级标题」会把侧栏摊开——而「项目」那一列
   * 不管几个项目都只占一个标题。
   */
  it("**「服务器」这个标题只有一个** —— 不是每台机器各占一个", () => {
    const c = 画(
      [任务({ connectionId: "a" }), 任务({ connectionId: "b" })],
      (id) => `服务器-${id}`,
    )
    const 标题 = [...c.querySelectorAll(".side-section")].filter((e) =>
      (e.textContent ?? "").includes("服务器"),
    )
    expect(标题.length, "收纳标题应当只有一个").toBe(1)
  })

  it("收纳标题带图标 —— 与项目、会话并列的三个收纳，一眼看得出", () => {
    const c = 画([任务({ connectionId: "a" })], () => "实验室")
    expect(c.querySelector(".side-section .side-section-icon")).toBeTruthy()
  })

  it("两台服务器各成一列，不混在一起", () => {
    const c = 画(
      [任务({ connectionId: "a" }), 任务({ connectionId: "b" }), 任务({ connectionId: "a" })],
      (id) => `服务器-${id}`,
    )
    expect(c.querySelectorAll(".side-server").length).toBe(2)
  })
})

/**
 * 服务器那一列的多选（2026-08-14 作者要的：*「服务器那里也可以多选」*）。
 *
 * 最要紧的一条是**按下之后行上真的长出勾选框**——
 * 第一版 `任务行` 里写死的是「会话在多选吗」，于是服务器那一列
 * **按钮在、勾选框永远不出现**，点了像什么都没发生。
 * 「入口在、底下没接」是本项目栽过好几次的形状。
 */
describe("侧栏 · 服务器多选", () => {
  const 任务 = (over: Record<string, unknown> = {}) => ({
    taskId: `t${Math.random().toString(36).slice(2, 7)}`,
    pinned: false,
    sortOrder: 1,
    createdAt: "2026-08-14T00:00:00Z",
    connectionId: "c1",
    ...over,
  })

  const 画 = () =>
    render(
      <SessionSidebar
        {...base}
        projects={[]}
        activeProjectId={undefined}
        tasks={[任务(), 任务()] as never}
        服务器名={() => "实验室"}
        onDeleteMany={() => {}}
      />,
    ).container

  it("**看得见的是「多选」** —— 与项目、会话那两颗同一个字", () => {
    const c = 画()
    const 颗 = [...c.querySelectorAll(".side-bulk")].find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("服务器"),
    )
    expect(颗, "服务器那一列没有多选入口").toBeTruthy()
    expect(颗!.textContent).toContain("多选")
  })

  /**
   * **可及名字互不为子串**：`getByRole(name)` 是子串匹配，
   * 三颗都叫「多选」时，靠它们各自的 `aria-label` 区分。
   */
  it("**读屏听见的是「多选服务器」** —— 与另两颗互不为子串", () => {
    const 名 = [...画().querySelectorAll(".side-bulk")].map((b) => b.getAttribute("aria-label"))
    expect(名).toContain("多选服务器")
    for (const a of 名) {
      for (const b of 名) {
        if (a !== b) expect(b!.includes(a!), `「${a}」是「${b}」的子串`).toBe(false)
      }
    }
  })

  it("**按下之后行上真的长出勾选框** —— 第一版就是这里没接", () => {
    const c = 画()
    expect(c.querySelectorAll(".server-session-list input[type=checkbox]").length).toBe(0)
    const 颗 = [...c.querySelectorAll(".side-bulk")].find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("服务器"),
    ) as HTMLElement
    fireEvent.click(颗)
    /**
     * **只数行上那些**（2026-08-15 收窄）：机器那一行现在也有一个勾选框
     * （整台一起选），而这条钉的是「**行**上长出勾选框」——本意没变。
     */
    expect(
      c.querySelectorAll(".server-session-list input[type=checkbox]").length,
      "按钮在、勾选框却没出现",
    ).toBe(2)
  })

  it("选择模式下有「已选 N / 全选 / 删除」", () => {
    const c = 画()
    fireEvent.click(
      [...c.querySelectorAll(".side-bulk")].find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("服务器"),
      ) as HTMLElement,
    )
    expect(c.querySelector(".side-bulkbar")).toBeTruthy()
    expect(c.querySelector(".side-bulk-count")!.textContent).toMatch(/已选\s*0/)
  })
})

/**
 * **当前会话所在的项目，也要收得起来**（2026-08-15 作者报的）。
 *
 * 作者：*「`未命名文件夹` 下面有会话，但是我折叠不进去，而 `tmp_dir` 就可以。」*
 * 差别正是前者装着**当前那段会话**——判据里那句
 * 「里面有当前会话就展开」压过了人的点击。
 * **自动展开是个默认值，不该压过人的选择。**
 */
describe("侧栏 · 项目折叠", () => {
  const 任务 = (over: Record<string, unknown> = {}) => ({
    taskId: "t1",
    workspace: "/w/未命名文件夹",
    pinned: false,
    sortOrder: 1,
    createdAt: "2026-08-15T00:00:00Z",
    ...over,
  })

  it("**装着当前会话的项目，点一下也能收起来**", () => {
    const c = render(
      <SessionSidebar
        {...base}
        projects={[]}
        activeProjectId={undefined}
        tasks={[任务()] as never}
        activeTaskId="t1"
      />,
    ).container

    // 一开始是自动展开的（人还没选过）
    expect(c.querySelectorAll(".proj-session-list li").length).toBe(1)

    // 那一行是个 `Row`（渲染成可点的按钮），不是外面那个 `.proj-head` 容器
    const 头 = c.querySelector(".proj-head .row") as HTMLElement
    expect(头, "项目那一行没找到").toBeTruthy()
    fireEvent.click(头)

    expect(
      c.querySelectorAll(".proj-session-list li").length,
      "点了收不起来——自动展开压过了人的点击",
    ).toBe(0)
  })
})

/**
 * 收纳可以收起来（2026-08-15 作者要的：项目 / 服务器 / 会话三个收纳，
 * 以及服务器底下每一台机器）。
 *
 * **折叠这类交互最容易「按钮在、底下没接」**——所以每条都点一下再看内容没了没有。
 */
describe("侧栏 · 收起来", () => {
  const 任务 = (over: Record<string, unknown> = {}) => ({
    taskId: `t${Math.random().toString(36).slice(2, 7)}`,
    pinned: false,
    sortOrder: 1,
    createdAt: "2026-08-15T00:00:00Z",
    ...over,
  })

  const 画 = (tasks: unknown[]) =>
    render(
      <SessionSidebar
        {...base}
        projects={[]}
        activeProjectId={undefined}
        tasks={tasks as never}
        服务器名={() => "实验室"}
      />,
    ).container

  const 点收纳 = (c: HTMLElement, 名: string) => {
    const 颗 = [...c.querySelectorAll(".side-section-toggle")].find((b) =>
      (b.textContent ?? "").includes(名),
    ) as HTMLElement
    expect(颗, `没有「${名}」这个可折叠的收纳标题`).toBeTruthy()
    fireEvent.click(颗)
  }

  it("**会话收纳收起来之后，底下的行就没了**", () => {
    const c = 画([任务(), 任务()])
    expect(c.querySelectorAll(".session-list li").length).toBe(2)
    点收纳(c, "会话")
    expect(c.querySelectorAll(".session-list li").length, "按了却还在").toBe(0)
  })

  it("**项目收纳也能收起来**", () => {
    const c = 画([任务({ workspace: "/w/a" })])
    expect(c.querySelectorAll(".proj-list li").length).toBe(1)
    点收纳(c, "项目")
    expect(c.querySelectorAll(".proj-list li").length).toBe(0)
  })

  it("**服务器收纳也能收起来**", () => {
    const c = 画([任务({ connectionId: "c1" })])
    expect(c.querySelectorAll(".side-server").length).toBe(1)
    点收纳(c, "服务器")
    expect(c.querySelectorAll(".side-server").length).toBe(0)
  })

  /** 一台机器单独收起，**不影响同一收纳里的另一台** */
  it("**单台机器能收起，另一台不受影响**", () => {
    const c = 画([任务({ connectionId: "a" }), 任务({ connectionId: "b" })])
    expect(c.querySelectorAll(".server-session-list li").length).toBe(2)
    fireEvent.click(c.querySelectorAll(".side-subhead")[0] as HTMLElement)
    expect(c.querySelectorAll(".server-session-list li").length, "另一台也被收掉了").toBe(1)
  })
})

/**
 * 整台服务器一起选（2026-08-15 作者要的：
 * *「服务器的多选，也可以删除不同的 IP，现在仅仅是一个 IP 下的不同会话」*）。
 */
describe("侧栏 · 整台服务器一起选", () => {
  const 任务 = (id: string, c = "a") => ({
    taskId: id,
    connectionId: c,
    pinned: false,
    sortOrder: 1,
    createdAt: "2026-08-15T00:00:00Z",
  })

  const 进多选 = () => {
    const c = render(
      <SessionSidebar
        {...base}
        projects={[]}
        activeProjectId={undefined}
        tasks={[任务("t1"), 任务("t2"), 任务("t3", "b")] as never}
        服务器名={(id) => `机器-${id}`}
        onDeleteMany={() => {}}
      />,
    ).container
    fireEvent.click(
      [...c.querySelectorAll(".side-bulk")].find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("服务器"),
      ) as HTMLElement,
    )
    return c
  }

  /** 这一台的勾选框：`aria-label` 里带「选择这台服务器」 */
  const 台勾 = (c: HTMLElement, 名: string) =>
    [...c.querySelectorAll("input[type=checkbox]")].find((x) =>
      (x.getAttribute("aria-label") ?? "").includes(`选择这台服务器：${名}`),
    ) as HTMLInputElement

  it("**勾一台，把它底下的全勾上**（另一台不受影响）", () => {
    const c = 进多选()
    fireEvent.click(台勾(c, "机器-a"))
    expect(c.querySelector(".side-bulk-count")!.textContent, "勾了一台却没把它底下的全选上")
      .toMatch(/已选\s*2/)
  })

  it("再勾一次就全取消", () => {
    const c = 进多选()
    fireEvent.click(台勾(c, "机器-a"))
    fireEvent.click(台勾(c, "机器-a"))
    expect(c.querySelector(".side-bulk-count")!.textContent).toMatch(/已选\s*0/)
  })

  /**
   * **半选要如实画成 indeterminate。**
   * 只勾了其中一段却显示成全勾，人会以为按删除会删掉整台——
   * 而那是不可撤销的。
   */
  it("**只勾了其中一段时，这一台是半选，不是全勾**", () => {
    const c = 进多选()
    const 单条 = [...c.querySelectorAll(".side-server input[type=checkbox]")].find(
      (x) => !(x.getAttribute("aria-label") ?? "").includes("选择这台服务器"),
    ) as HTMLInputElement
    fireEvent.click(单条)
    const 台 = 台勾(c, "机器-a")
    expect(台.checked, "半选却显示成全勾").toBe(false)
    expect(台.indeterminate, "半选没有画成 indeterminate").toBe(true)
  })
})
