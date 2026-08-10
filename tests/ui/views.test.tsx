import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalView,
} from "../../src/ui/views.js"
import type { ProjectSummary, SessionSummary } from "../../src/protocol/index.js"

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

describe("侧栏 · 新建会话是主动作", () => {
  // 这一组是 2026-08-08 修正的核心：初版 UI 里 createSession 一次都没被调用，
  // 也就是说这个 app 做不了它最该做的那件事。
  it("有「新建会话」入口", () => {
    render(<SessionSidebar {...base} />)
    expect(screen.getByRole("button", { name: /新建会话/ })).toBeDefined()
  })

  /**
   * **2026-08-09 改写。** 原来这条是「点开 → 列出 agent → 选一个」。
   * agent 的选择已搬到 composer 右下角的 pill（作者要求，对标 Hermes 的 model pill），
   * 侧栏这一层因此收掉——**一个动作只有一个家**。
   *
   * 意图没变：这条仍然守着「侧栏能把会话建出来」，
   * 它是 2026-08-08 那次修正的核心（初版 UI 里 createSession 一次都没被调用）。
   */
  it("**按下就建，不再多一层选择** —— 用清单里的第一个 agent", () => {
    const onNewSession = vi.fn()
    render(<SessionSidebar {...base} onNewSession={onNewSession} />)
    fireEvent.click(screen.getByRole("button", { name: /新建会话/ }))
    expect(onNewSession).toHaveBeenCalledWith("ds-chat")
  })

  // **2026-08-09 改写。** 原来这条断言「没有项目 ⇒ 禁用 + 提示先打开文件夹」。
  // Task 3.4 之后那个状态在正常路径上不再出现（启动即保证有默认项目），
  // 而那句提示是描述不是出路，已删。这里只保留防御性行为：真出现无项目时不崩、且仍禁用。
  it("万一一个项目都没有，按钮禁用但不崩", () => {
    render(<SessionSidebar {...base} projects={[]} activeProjectId={undefined} />)
    expect((screen.getByRole("button", { name: /新建会话/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText(/先打开一个项目文件夹/)).toBeNull()
  })

  it("配置里没有 agent 时禁用，并说明原因", () => {
    render(<SessionSidebar {...base} agents={[]} />)
    expect((screen.getByRole("button", { name: /新建会话/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/还没有可用的 agent/)).toBeDefined()
  })
})

describe("侧栏 · 项目与会话", () => {
  /**
   * **2026-08-11：项目从下拉框改成一列。**
   *
   * 作者：*「新建的项目，就在左侧的新建项目的下面……新建完的项目，
   * 里面可以有多个会话。」* 下拉框是「一个值」的形状——
   * 你看不见有几个项目，更看不见哪个项目里有多少会话。
   */
  it("**项目是一列，不是一个下拉框**", () => {
    const { container } = render(
      <SessionSidebar {...base} projects={[project(), project({ projectId: "p2", name: "other" })]} />,
    )
    expect(container.querySelectorAll(".proj-item")).toHaveLength(2)
    expect(screen.getByText("dawn-science")).toBeDefined()
    expect(screen.getByText("other")).toBeDefined()
  })

  it("**每一行说出它装着几个会话** —— 那层包含关系要看得见", () => {
    render(<SessionSidebar {...base} projects={[project({ totalSessionCount: 3 })]} />)
    expect(screen.getByText("3 个会话")).toBeDefined()
  })

  it("点一行就切过去", () => {
    const onPickProject = vi.fn()
    render(
      <SessionSidebar
        {...base}
        projects={[project(), project({ projectId: "p2", name: "other" })]}
        onPickProject={onPickProject}
      />,
    )
    fireEvent.click(screen.getByText("other"))
    expect(onPickProject).toHaveBeenCalledWith("p2")
  })

  it("**每一行都能删它自己**，不是只能删当前那个", () => {
    const onDeleteProject = vi.fn()
    render(
      <SessionSidebar
        {...base}
        projects={[project(), project({ projectId: "p2", name: "other" })]}
        onDeleteProject={onDeleteProject}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "删除项目：other" }))
    expect(onDeleteProject).toHaveBeenCalledWith("p2")
  })

  it("列出会话，点击触发回调", () => {
    const onPickSession = vi.fn()
    render(<SessionSidebar {...base} sessions={[session()]} onPickSession={onPickSession} />)
    // 行的主标签现在是**标题**；agent 退到副行里（2026-08-10）
    fireEvent.click(screen.getByText("新会话"))
    expect(onPickSession).toHaveBeenCalledWith("s1")
  })

  it("**没说过话的会话显示「新会话」**，不是一行空白 —— 空白看起来像加载失败", () => {
    render(<SessionSidebar {...base} sessions={[session()]} />)
    expect(screen.getByText("新会话")).toBeDefined()
    // agent 与时刻退到副行：**它是来路，不是名字**
    expect(screen.getByText(/ds-chat · /)).toBeDefined()
  })

  it("**有标题就用标题** —— 同一个 agent 的两个会话得分得开", () => {
    render(
      <SessionSidebar
        {...base}
        sessions={[
          { ...session(), sessionId: "s1", title: "看看 sales.csv" },
          { ...session(), sessionId: "s2", title: "跑一次回归" },
        ]}
      />,
    )
    expect(screen.getByText("看看 sales.csv")).toBeDefined()
    expect(screen.getByText("跑一次回归")).toBeDefined()
  })

  it("没有会话时如实说明", () => {
    render(<SessionSidebar {...base} />)
    expect(screen.getByText(/还没有会话/)).toBeDefined()
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
  it("给出一个真的能点的开始动作，而不只是一句提示", () => {
    const onStart = vi.fn()
    render(<EmptyConversation agents={["ds-chat"]} onStart={onStart} onOpenSettings={noop} />)
    fireEvent.click(screen.getByRole("button", { name: /开始|新建/ }))
    expect(onStart).toHaveBeenCalledWith("ds-chat")
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
    const box = screen.getByPlaceholderText(/回车发送/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "跑一下测试" } })
    fireEvent.submit(box.form!)
    expect(onSend).toHaveBeenCalledWith("跑一下测试")
    expect(box.value).toBe("")
  })

  it("空白内容不触发发送", () => {
    const onSend = vi.fn()
    render(<ConversationView session={session()} items={[]} onSend={onSend} />)
    const box = screen.getByPlaceholderText(/回车发送/) as HTMLTextAreaElement
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
        onNewSession={noop}
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

