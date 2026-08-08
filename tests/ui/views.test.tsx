import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ConversationView, SessionSidebar, TerminalDock } from "../../src/ui/views.js"
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

describe("会话侧栏", () => {
  const noop = () => {}

  it("没有项目时给出下一步动作，而不是空白", () => {
    render(
      <SessionSidebar
        projects={[]} sessions={[]} activeProjectId={undefined} activeSessionId={undefined}
        onPickProject={noop} onPickSession={noop} onOpenProject={noop}
      />,
    )
    expect(screen.getByText(/还没有项目/)).toBeDefined()
    expect(screen.getByRole("button", { name: /打开文件夹/ })).toBeDefined()
  })

  it("列出项目及其运行次数", () => {
    render(
      <SessionSidebar
        projects={[project()]} sessions={[]} activeProjectId={undefined} activeSessionId={undefined}
        onPickProject={noop} onPickSession={noop} onOpenProject={noop}
      />,
    )
    expect(screen.getByText("dawn-science")).toBeDefined()
    expect(screen.getByText(/3 次运行/)).toBeDefined()
  })

  it("点项目触发回调", () => {
    const onPick = vi.fn()
    render(
      <SessionSidebar
        projects={[project()]} sessions={[]} activeProjectId={undefined} activeSessionId={undefined}
        onPickProject={onPick} onPickSession={noop} onOpenProject={noop}
      />,
    )
    fireEvent.click(screen.getByText("dawn-science"))
    expect(onPick).toHaveBeenCalledWith("p1")
  })

  it("选中项目后才显示会话区，并有「项目主页」入口", () => {
    render(
      <SessionSidebar
        projects={[project()]} sessions={[session()]} activeProjectId="p1" activeSessionId={undefined}
        onPickProject={noop} onPickSession={noop} onOpenProject={noop}
      />,
    )
    expect(screen.getByText("项目主页")).toBeDefined()
    expect(screen.getByText("ds-chat")).toBeDefined()
  })
})

describe("对话视图", () => {
  it("空对话如实说没有", () => {
    render(<ConversationView session={session()} turns={[]} onSend={() => {}} />)
    expect(screen.getByText(/还没有对话/)).toBeDefined()
  })

  it("区分人与 agent 的发言", () => {
    render(
      <ConversationView
        session={session()}
        turns={[
          { id: "1", who: "user", text: "你好" },
          { id: "2", who: "agent", text: "在" },
        ]}
        onSend={() => {}}
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
    render(
      <ConversationView session={session({ state: "exited" })} turns={[]} onSend={() => {}} disabled />,
    )
    expect((screen.getByPlaceholderText(/会话已结束/) as HTMLTextAreaElement).disabled).toBe(true)
  })

  it("标出会话是外部 CLI 还是内置", () => {
    render(<ConversationView session={session({ kind: "pty" })} turns={[]} onSend={() => {}} />)
    expect(screen.getByText("外部 CLI")).toBeDefined()
  })
})

describe("终端 dock", () => {
  it("默认收起 —— 终端是下钻视图，不是主界面", () => {
    render(<TerminalDock open={false} onToggle={() => {}} output="hi" available />)
    expect(screen.queryByText("hi")).toBeNull()
  })

  it("展开后显示输出", () => {
    render(<TerminalDock open onToggle={() => {}} output="hello from pty" available />)
    expect(screen.getByText(/hello from pty/)).toBeDefined()
  })

  it("native 会话没有终端，按钮禁用并说明原因", () => {
    render(<TerminalDock open={false} onToggle={() => {}} output="" available={false} />)
    expect((screen.getByRole("button", { name: /终端/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/仅外部 CLI 会话有终端/)).toBeDefined()
  })

  it("点击切换触发回调", () => {
    const onToggle = vi.fn()
    render(<TerminalDock open={false} onToggle={onToggle} output="" available />)
    fireEvent.click(screen.getByRole("button", { name: /终端/ }))
    expect(onToggle).toHaveBeenCalled()
  })

  it("展开但无输出时如实说暂无，而不是留白", () => {
    render(<TerminalDock open onToggle={() => {}} output="" available />)
    expect(screen.getByText(/暂无输出/)).toBeDefined()
  })
})
