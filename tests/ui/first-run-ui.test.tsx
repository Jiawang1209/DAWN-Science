/**
 * 第一次打开时，界面必须给出**可执行的下一步**（Task 3.4）。
 *
 * 作者三次打开、三次不知道该点哪里。根因不是缺功能，是缺**出路**：
 * 此前没有项目时侧栏写「先打开一个项目文件夹」、主区写同一句话，
 * 而那句话既不是按钮也不指向任何地方——**它是一句描述，不是一条出路**。
 *
 * Hermes 的说法：*"The states around loading are distinct experiences — empty,
 * loading, reconnecting, degraded/stale, and exhausted-recovery each deserve
 * their own honest copy and **their own way out**."*
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { EmptyConversation, SessionSidebar } from "../../src/ui/views.js"
import type { ProjectSummary } from "../../src/protocol/index.js"

const project = (): ProjectSummary => ({
  projectId: "p1",
  name: "scratch",
  workspace: "/home/me/DAWN/scratch",
  createdAt: "2026-08-09T00:00:00Z",
  totalRunCount: 0,
  totalSessionCount: 0,
  unresolvedProblemCount: 0,
})

const noop = () => {}
const sidebar = (over: Partial<Parameters<typeof SessionSidebar>[0]> = {}) =>
  render(
    <SessionSidebar
      projects={[project()]}
      sessions={[]}
      agents={["ds-chat", "claude"]}
      activeProjectId="p1"
      activeSessionId={undefined}
      view="conversation"
      onShowFiles={() => {}}
      onPickProject={noop}
      onPickSession={noop}
      onOpenProject={noop}
      onNewSession={noop}
      onShowPanel={noop}
      onOpenSettings={noop}
      {...over}
    />,
  )

describe("第一次打开 · 不再有「先打开一个项目文件夹」这条死路", () => {
  it("有默认项目时，新建任务是可点的", () => {
    sidebar()
    // 本项目没装 jest-dom，直接查属性
    expect(screen.getByRole("button", { name: "新建任务" }).hasAttribute("disabled")).toBe(false)
  })

  it("界面上不出现「先打开一个项目文件夹」 —— 那是一句描述，不是一条出路", () => {
    const { container } = sidebar()
    expect(container.textContent).not.toContain("先打开一个项目文件夹")
  })

  it("没有可用 agent 时，说清为什么并**给出去处**", () => {
    const { container } = sidebar({ agents: [] })
    expect(container.textContent).toMatch(/agent/)
    /**
     * 不能只说「没有 agent」，要能点到能解决它的地方。
     *
     * **2026-08-11 起侧栏左下角也有一行「设置」**（作者提），
     * 于是「名字里带设置的按钮」有两个——这里要的是**那句说明旁边**的那一个，
     * 所以限定在提示块里。两个都通向同一屏，多一个入口不是问题；
     * 定位器分不清才是。
     */
    expect(screen.getAllByRole("button", { name: /设置|配置/ }).length).toBeGreaterThan(0)
    expect(container.querySelector(".pad")?.textContent).toMatch(/设置/)
  })
})

describe("空对话区 · 必须给出下一步动作", () => {
  /**
   * **主区给的是一个能直接打字的输入卡**（2026-08-12 换主语）。
   *
   * 上一版等的是一颗「＋ 用 X 开始」。作者：*「不要上来就是用 Deepseek 开始，
   * 而是要直接是对话窗口。」* —— 那颗按钮多要了一步：
   * 人已经知道自己要说什么了，却得先回答「用谁」。
   *
   * 这条守的意图一个字没变：**别只摆一句提示，摆一个能动手的东西**。
   */
  it("有 agent 时，主区提供一个能直接打字的输入卡", () => {
    const onStart = vi.fn()
    render(<EmptyConversation agents={["ds-chat"]} onStart={onStart} onOpenSettings={noop} />)
    const box = screen.getByPlaceholderText(/今天帮你做些什么/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "直接说" } })
    fireEvent.submit(box.form!)
    expect(onStart).toHaveBeenCalledWith("ds-chat", "直接说", undefined)
  })

  it("没有 agent 时，指向设置而不是留一片空白", () => {
    const onOpenSettings = vi.fn()
    render(<EmptyConversation agents={[]} onStart={noop} onOpenSettings={onOpenSettings} />)
    const btn = screen.getByRole("button", { name: /设置|配置/ })
    btn.click()
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it("不出现任何把用户推向「先去选文件夹」的文案", () => {
    const { container } = render(
      <EmptyConversation agents={["ds-chat"]} onStart={noop} onOpenSettings={noop} />,
    )
    expect(container.textContent).not.toMatch(/先打开.*文件夹|先选.*目录/)
  })
})
