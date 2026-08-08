import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import {
  ConversationView,
  EmptyConversation,
  SessionSidebar,
  TerminalDock,
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
  showingPanel: false,
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

  it("点开后列出可选 agent，选中即触发创建", () => {
    const onNewSession = vi.fn()
    render(<SessionSidebar {...base} onNewSession={onNewSession} />)
    fireEvent.click(screen.getByRole("button", { name: /新建会话/ }))
    fireEvent.click(screen.getByRole("button", { name: "claude-code" }))
    expect(onNewSession).toHaveBeenCalledWith("claude-code")
  })

  it("没有项目时禁用，并说明先打开文件夹", () => {
    render(<SessionSidebar {...base} projects={[]} activeProjectId={undefined} />)
    expect((screen.getByRole("button", { name: /新建会话/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/先打开一个项目文件夹/)).toBeDefined()
  })

  it("配置里没有 agent 时禁用，并说明原因", () => {
    render(<SessionSidebar {...base} agents={[]} />)
    expect((screen.getByRole("button", { name: /新建会话/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/还没有可用的 agent/)).toBeDefined()
  })
})

describe("侧栏 · 项目与会话", () => {
  it("项目切换器列出全部项目", () => {
    render(<SessionSidebar {...base} projects={[project(), project({ projectId: "p2", name: "other" })]} />)
    const select = screen.getByLabelText("当前项目") as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(["dawn-science", "other"])
  })

  it("切换项目触发回调", () => {
    const onPickProject = vi.fn()
    render(
      <SessionSidebar
        {...base}
        projects={[project(), project({ projectId: "p2", name: "other" })]}
        onPickProject={onPickProject}
      />,
    )
    fireEvent.change(screen.getByLabelText("当前项目"), { target: { value: "p2" } })
    expect(onPickProject).toHaveBeenCalledWith("p2")
  })

  it("列出会话，点击触发回调", () => {
    const onPickSession = vi.fn()
    render(<SessionSidebar {...base} sessions={[session()]} onPickSession={onPickSession} />)
    fireEvent.click(screen.getByText("ds-chat"))
    expect(onPickSession).toHaveBeenCalledWith("s1")
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
  it("有项目时告诉你去点新建会话", () => {
    render(<EmptyConversation canStart />)
    expect(screen.getByText(/新建会话/)).toBeDefined()
  })

  it("没有项目时告诉你先打开文件夹 —— 给下一步动作，不留白", () => {
    render(<EmptyConversation canStart={false} />)
    expect(screen.getByText(/先打开一个项目文件夹/)).toBeDefined()
  })
})

describe("对话视图", () => {
  it("空对话如实说没有", () => {
    render(<ConversationView session={session()} turns={[]} onSend={noop} />)
    expect(screen.getByText(/还没有对话/)).toBeDefined()
  })

  it("区分人与 agent 的发言", () => {
    render(
      <ConversationView
        session={session()}
        turns={[
          { id: "1", who: "user", text: "你好", final: true },
          { id: "2", who: "agent", text: "在", final: true },
        ]}
        onSend={noop}
      />,
    )
    expect(screen.getByText("你")).toBeDefined()
    expect(screen.getAllByText("ds-chat").length).toBeGreaterThan(0)
  })

  it("提交非空内容触发发送并清空输入框", () => {
    const onSend = vi.fn()
    render(<ConversationView session={session()} turns={[]} onSend={onSend} />)
    const box = screen.getByPlaceholderText(/回车发送/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "跑一下测试" } })
    fireEvent.submit(box.form!)
    expect(onSend).toHaveBeenCalledWith("跑一下测试")
    expect(box.value).toBe("")
  })

  it("空白内容不触发发送", () => {
    const onSend = vi.fn()
    render(<ConversationView session={session()} turns={[]} onSend={onSend} />)
    const box = screen.getByPlaceholderText(/回车发送/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "   " } })
    fireEvent.submit(box.form!)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("会话已结束时输入被禁用，并说明原因", () => {
    render(<ConversationView session={session({ state: "exited" })} turns={[]} onSend={noop} disabled />)
    expect((screen.getByPlaceholderText(/会话已结束/) as HTMLTextAreaElement).disabled).toBe(true)
  })

  it("标出会话是外部 CLI 还是内置", () => {
    render(<ConversationView session={session({ kind: "pty" })} turns={[]} onSend={noop} />)
    expect(screen.getByText("外部 CLI")).toBeDefined()
  })
})

describe("终端 dock", () => {
  // xterm 的真实渲染不在 jsdom 里验（它要字体度量与 canvas）。
  // 这里只验容器契约：什么时候挂载窗格、按钮什么时候可用。
  const paneCount = () => document.querySelectorAll(".term-host").length

  it("默认收起 —— 终端是下钻视图，不是主界面", () => {
    render(<TerminalDock open={false} onToggle={noop} chunks={["hi"]} available />)
    expect(paneCount()).toBe(0)
  })

  it("展开后挂载终端窗格", () => {
    render(<TerminalDock open onToggle={noop} chunks={["hello from pty"]} available />)
    expect(paneCount()).toBe(1)
  })

  it("native 会话没有终端，按钮禁用并说明原因", () => {
    render(<TerminalDock open={false} onToggle={noop} chunks={[]} available={false} />)
    expect((screen.getByRole("button", { name: /终端/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/仅外部 CLI 会话有终端/)).toBeDefined()
  })

  it("不可用时即便 open 也不挂窗格 —— 免得白白初始化一个 xterm", () => {
    render(<TerminalDock open onToggle={noop} chunks={[]} available={false} />)
    expect(paneCount()).toBe(0)
  })

  it("点击切换触发回调", () => {
    const onToggle = vi.fn()
    render(<TerminalDock open={false} onToggle={onToggle} chunks={[]} available />)
    fireEvent.click(screen.getByRole("button", { name: /终端/ }))
    expect(onToggle).toHaveBeenCalled()
  })

  it("无输出时如实说暂无，而不是留白", () => {
    render(<TerminalDock open={false} onToggle={noop} chunks={[]} available />)
    expect(screen.getByText(/暂无输出/)).toBeDefined()
  })
})
