import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ConversationView, EmptyConversation } from "../../src/ui/views.js"
import { resetAllState } from "../../src/ui/state/index.js"
import type { SessionSummary } from "../../src/protocol/index.js"
import type { EnhanceOutcome } from "../../src/ui/enhance.js"

const session: SessionSummary = { sessionId: "layout", projectId: "p", agentId: "ds-chat", kind: "native", pinned: false, sortOrder: 1, state: "alive", createdAt: "2026-10-20T00:00:00Z" }
beforeEach(resetAllState)
afterEach(cleanup)

it("权限紧邻添加入口，模型和发送共用底栏，上下文位于卡外统计区", () => {
  const { container } = render(<ConversationView session={session} items={[]} onSend={vi.fn()}
    models={[{ provider: "deepseek", model: "deepseek-v4" }]} model={{ provider: "deepseek", model: "deepseek-v4" }} onPickModel={vi.fn()}
    权限={{ 当前: "allow-all", 跟随默认: true, onPick: vi.fn() }} />)
  const tools = container.querySelector(".composer-tools")!
  expect(tools.querySelector(".attach")?.nextElementSibling?.classList.contains("perm-pill")).toBe(true)
  const controls = container.querySelector(".composer-footer > .composer-controls")!
  expect(controls.querySelector(".model-pill")).toBeTruthy()
  expect(controls.querySelector(".send-btn")).toBeTruthy()
  expect(container.querySelector(".composer-box .composer-controls")).toBeNull()
  expect(container.querySelector(".composer-session-usage .ctx-meter")).toBeTruthy()
  expect(container.querySelector(".composer-card .ctx-meter")).toBeNull()
})

it("首页权限和模型发送也与添加入口同栏", () => {
  const { container } = render(<EmptyConversation agents={["ds-chat"]} onStart={vi.fn()} onOpenSettings={vi.fn()}
    权限={{ 当前: "allow-all", onPick: vi.fn() }} />)
  expect(container.querySelector(".composer-tools .attach")?.nextElementSibling?.classList.contains("perm-pill")).toBe(true)
  expect(container.querySelector(".composer-footer > .composer-controls .agent-pill")).toBeTruthy()
  expect(container.querySelector(".composer-footer > .composer-controls .send-btn")).toBeTruthy()
  expect(container.querySelector(".composer-box .composer-controls")).toBeNull()
})

it("目录和真实运行位置位于输入卡上沿，查看路径保留草稿", () => {
  render(<ConversationView session={{ ...session, remote: { connectionId: "soil", label: "生态服务器", cwd: "/home/research/soil" } }} items={[]} onSend={vi.fn()} />)
  const input = screen.getByPlaceholderText(/输入问题/) as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: "检查样本缺失值" } })
  const directory = screen.getByRole("button", { name: "工作目录：/home/research/soil" })
  expect(directory.closest(".composer-environment")).not.toBeNull()
  expect(screen.getAllByText("生态服务器").some(el => el.closest(".composer-environment"))).toBe(true)
  fireEvent.click(directory)
  expect(screen.getByRole("dialog", { name: "工作目录" }).textContent).toContain("/home/research/soil")
  expect(input.value).toBe("检查样本缺失值")
})

it("添加菜单收纳方案与终端，Escape返回触发按钮且不提交草稿", () => {
  const onSetPlan = vi.fn(async (_on: boolean) => {})
  const onSend = vi.fn()
  const onToggleDock = vi.fn()
  render(<ConversationView session={session} items={[]} onSend={onSend} 会话开关们={[{ id: "dawn.plan", name: "生成方案", category: "plan", kind: "boolean", current: "", options: [] }]} onSetPlan={onSetPlan} onToggleDock={onToggleDock} />)
  const input = screen.getByPlaceholderText(/输入问题/) as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: "先看一眼数据" } })
  expect(screen.queryByRole("button", { name: "终端面板" })).toBeNull()
  const add = screen.getByRole("button", { name: "添加内容" })
  fireEvent.click(add)
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "生成方案" }))
  expect(onSetPlan).toHaveBeenCalledWith(true)
  expect(screen.queryByRole("menu")).toBeNull()
  fireEvent.click(add)
  fireEvent.click(screen.getByRole("menuitem", { name: "终端面板" }))
  expect(onToggleDock).toHaveBeenCalledOnce()
  fireEvent.click(add)
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
  expect(screen.queryByRole("menu")).toBeNull()
  expect(document.activeElement).toBe(add)
  expect(input.value).toBe("先看一眼数据")
  expect(onSend).not.toHaveBeenCalled()
})

it("首页同样通过添加菜单启用方案且清楚显示状态", () => {
  const onToggle = vi.fn()
  render(<EmptyConversation agents={["ds-chat"]} onStart={vi.fn()} onOpenSettings={vi.fn()} onPickDirectory={async () => null} 先出方案={{ on: true, onToggle }} />)
  expect(screen.getByRole("button", { name: "工作目录" }).closest(".composer-environment")).not.toBeNull()
  expect(screen.getByRole("status").textContent).toContain("生成方案")
  fireEvent.click(screen.getByRole("button", { name: "添加内容" }))
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "生成方案" }))
  expect(onToggle).toHaveBeenCalledWith(false)
})

it("优化收进添加菜单，关闭菜单后改写仍完成并可撤回", async () => {
  let finish!: (outcome: EnhanceOutcome) => void
  const onEnhance = vi.fn(() => new Promise<EnhanceOutcome>(resolve => { finish = resolve }))
  render(<ConversationView session={session} items={[]} onSend={vi.fn()} onEnhance={onEnhance} />)
  const input = screen.getByPlaceholderText(/输入问题/) as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: "检查数据" } })
  expect(screen.queryByRole("button", { name: "优化输入" })).toBeNull()
  const add = screen.getByRole("button", { name: "添加内容" })
  fireEvent.click(add)
  fireEvent.click(screen.getByRole("menuitem", { name: "优化输入" }))
  expect(onEnhance).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("menuitemradio", { name: /基础/ }))
  expect(onEnhance).toHaveBeenCalledWith(expect.objectContaining({ mode: "basic" }))
  expect(screen.queryByRole("menu")).toBeNull()
  await act(async () => finish({ text: "检查字段类型与缺失值", usedContext: null, model: "mock", borrowed: false }))
  expect(input.value).toBe("检查字段类型与缺失值")
  fireEvent.click(add)
  expect(screen.queryByRole("menuitem", { name: "撤回上次优化" })).toBeNull()
  fireEvent.click(screen.getByRole("menuitem", { name: "优化输入" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "撤回上次优化" }))
  expect(input.value).toBe("检查数据")
  expect(screen.queryByRole("menu")).toBeNull()
})

it("优化档位向右打开独立菜单，Escape只收起二级并返回档位入口", () => {
  render(<ConversationView session={session} items={[]} onSend={vi.fn()} onEnhance={async () => ({ text: "改写", usedContext: null, model: "mock", borrowed: false })} />)
  fireEvent.click(screen.getByRole("button", { name: "添加内容" }))
  const mode = screen.getByRole("menuitem", { name: "优化输入" })
  expect(screen.queryByRole("menuitem", { name: /^档位：/ })).toBeNull()
  fireEvent.keyDown(mode, { key: "ArrowRight" })
  const submenu = screen.getByRole("menu", { name: "选档位" })
  expect(submenu.closest(".attach-menu")).toBeNull()
  expect(mode.getAttribute("data-submenu")).toBe("right")
  fireEvent.keyDown(submenu, { key: "Escape" })
  expect(screen.queryByRole("menu", { name: "选档位" })).toBeNull()
  expect(screen.getByRole("menu", { name: "添加内容" })).toBeTruthy()
  expect(document.activeElement).toBe(mode)
})

it("悬停整行优化即可打开右侧菜单，保持原焦点且不执行改写", () => {
  const onEnhance = vi.fn(async () => ({ text: "改写", usedContext: null, model: "mock", borrowed: false }))
  render(<ConversationView session={session} items={[]} onSend={vi.fn()} onEnhance={onEnhance} />)
  fireEvent.click(screen.getByRole("button", { name: "添加内容" }))
  const focused = document.activeElement
  fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "优化输入" }))
  expect(screen.getByRole("menu", { name: "选档位" })).toBeTruthy()
  expect(document.activeElement).toBe(focused)
  expect(onEnhance).not.toHaveBeenCalled()
})

it("Escape收起档位后，浮层复位产生的悬停不立即重开；离开再悬停仍可打开", () => {
  render(<ConversationView session={session} items={[]} onSend={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "添加内容" }))
  const mode = screen.getByRole("menuitem", { name: "优化输入" })
  fireEvent.mouseEnter(mode)
  fireEvent.keyDown(screen.getByRole("menu", { name: "选档位" }), { key: "Escape" })
  fireEvent.mouseEnter(mode)
  expect(screen.queryByRole("menu", { name: "选档位" })).toBeNull()
  fireEvent.mouseLeave(mode)
  fireEvent.mouseEnter(mode)
  expect(screen.getByRole("menu", { name: "选档位" })).toBeTruthy()
  fireEvent.keyDown(screen.getByRole("menu", { name: "选档位" }), { key: "Escape" })
  fireEvent.keyDown(screen.getByRole("menu", { name: "添加内容" }), { key: "Escape" })
  fireEvent.click(screen.getByRole("button", { name: "添加内容" }))
  fireEvent.mouseEnter(mode)
  expect(screen.getByRole("menu", { name: "选档位" })).toBeTruthy()
})
