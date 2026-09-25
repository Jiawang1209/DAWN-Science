/**
 * 坞格「对话」与分栏右键的两处可见性（侧边对话 Task 6 审查修补，2026-09-24）。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createEvent, fireEvent, render, screen } from "@testing-library/react"
import { SideChat } from "../../src/ui/side-chat.js"
import { SessionTabs } from "../../src/ui/session-tabs.js"
import { 侧槽 } from "../../src/ui/state/side-chat.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

const 空 = () => {}
const 基本 = {
  同处: [] as { sessionId: string; title: string; running: boolean }[],
  running: false,
  canReadMain: undefined,
  onNew: 空,
  onPick: 空,
  onSwap: 空,
  onTakeOut: 空,
  conversation: undefined,
}

describe("坞格空态的「另开一段」", () => {
  it("是一颗看得出来的按钮：描边 + ＋，不与下面那排会话同一副样子", () => {
    render(
      <SideChat
        session={undefined}
        同处={[{ sessionId: "s2", title: "另一段", running: false }]}
        running={false}
        canReadMain={undefined}
        onNew={空}
        onPick={空}
        onSwap={空}
        onTakeOut={空}
        conversation={undefined}
      />,
    )
    const 新 = screen.getByRole("button", { name: "另开一段" })
    expect(新.className).toContain("btn-outline")
    expect(新.className).not.toContain("btn-ghost")
    expect(新.querySelector("svg")).toBeTruthy()
    // 会话行仍是 ghost：两者长得不一样才有判据
    expect(screen.getByRole("button", { name: "另一段" }).className).toContain("btn-ghost")
  })
})

describe("分栏右键「放进坞里」不给终端", () => {
  const 页签 = [
    { sessionId: "a", title: "对话甲" },
    { sessionId: "t", title: "终端乙", canDock: false },
  ]
  it("终端那格右键不开菜单；对话那格开", () => {
    render(<SessionTabs tabs={页签} current="a" onPick={空} onPutInDock={空} />)
    fireEvent.contextMenu(screen.getByText("终端乙"))
    expect(screen.queryByRole("menuitem", { name: "放进坞里" })).toBeNull()
    fireEvent.contextMenu(screen.getByText("对话甲"))
    expect(screen.getByRole("menuitem", { name: "放进坞里" })).toBeTruthy()
  })
})

describe("坞格的几种状态（审查 M7）", () => {
  it("没有地方：只说为什么，不画「另开一段」也不画清单", () => {
    render(<SideChat session={undefined} {...基本} onNew={undefined} noPlace="这段对话不属于任何项目，坞里没法另开" />)
    expect(screen.getByText("这段对话不属于任何项目，坞里没法另开")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "另开一段" })).toBeNull()
    expect(screen.queryByText("这里还没有别的会话")).toBeNull()
  })

  it("挂着一段但摘要还没到手：说「在打开」，不冒充空态", () => {
    render(<SideChat session={undefined} {...基本} opening />)
    expect(screen.getByText("正在打开这段对话")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "另开一段" })).toBeNull()
  })

  it("正在另开：按钮置灰，再点不会再建一段（审查 M4）", () => {
    const onNew = vi.fn()
    render(<SideChat session={undefined} {...基本} onNew={onNew} newBusy />)
    const 新 = screen.getByRole("button", { name: "另开一段" }) as HTMLButtonElement
    expect(新.disabled).toBe(true)
    fireEvent.click(新)
    expect(onNew).not.toHaveBeenCalled()
  })

  it("挂着时：头上两颗常驻按钮各发各的回调", () => {
    const onSwap = vi.fn()
    const onTakeOut = vi.fn()
    render(
      <SideChat
        session={{ sessionId: "s1", projectId: "P", agentId: "a", kind: "native", title: "坞里这段" } as never}
        {...基本}
        onSwap={onSwap}
        onTakeOut={onTakeOut}
        conversation={undefined}
      />,
    )
    expect(screen.getByText("坞里这段")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "换到主区" }))
    expect(onSwap).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "从坞里拿下" }))
    expect(onTakeOut).toHaveBeenCalledTimes(1)
    // 两颗都常驻：不是悬停才出现的
    expect(getComputedStyle(screen.getByRole("button", { name: "换到主区" })).opacity).not.toBe("0")
  })

  it("挂着且有回调时：与主区同一条 `.conv-head`——大标题 + 用量、导出对话、换到主区、×；只有一行头，没有 `.conv-title`（2026-09-25）", () => {
    const 轮 = (id: string, who: "user" | "agent", text: string): TranscriptItem =>
      ({ type: "turn", id, who, text, final: true, ...(who === "agent" ? { usage: { input: 12, output: 8 } } : {}) }) as TranscriptItem
    侧槽.setItems([
      轮("u1", "user", "一"), 轮("a1", "agent", "好"),
      轮("u2", "user", "二"), 轮("a2", "agent", "好"),
      轮("u3", "user", "三"), 轮("a3", "agent", "好"),
    ])
    const { container } = render(
      <SideChat
        session={{ sessionId: "s1", projectId: "P", agentId: "a", kind: "native", title: "坞里这段", state: "alive" } as never}
        {...基本}
        canReadMain={false}
        conversation={() => ({ onSend: 空, onExport: async () => ({ path: "/x.md", turns: 3 }) })}
      />,
    )
    const 头们 = container.querySelectorAll("header")
    expect(头们).toHaveLength(1)
    const 头 = 头们[0]!
    expect(头.classList.contains("conv-head")).toBe(true)
    // 标题住在主区那一格（`.conv-head-text`），用量在它下面；`.conv-title` 留给主区当判据
    expect(头.querySelector(".conv-head-text .side-chat-head .side-chat-title")!.textContent).toBe("坞里这段")
    expect(头.querySelector(".conv-head-text .session-usage")).not.toBeNull()
    expect(container.querySelector(".conv-title")).toBeNull()
    for (const 名 of ["导出对话", "换到主区", "从坞里拿下"]) {
      const b = screen.getByRole("button", { name: 名 })
      expect(头.contains(b), 名).toBe(true)
      expect(getComputedStyle(b).opacity).not.toBe("0")
    }
    // 看不见主对话那句摆在头下面，不在头里
    const 注 = container.querySelector(".side-chat-caveat")!
    expect(头.contains(注)).toBe(false)
    // 轮次刻度尺照画（窄到放不下时由 CSS 容器查询收起，jsdom 不算那一层）
    expect(container.querySelector(".side-chat .turn-nav")).not.toBeNull()
    侧槽.reset()
  })

  it("输入卡看得出边：挂着态的底是主区那块 `surface-app`，不是与卡面同值的 `surface-panel`（2026-09-25 作者 A）", () => {
    const css = readFileSync(join(import.meta.dirname, "../../src/ui/styles.css"), "utf8")
    const tok = readFileSync(join(import.meta.dirname, "../../src/ui/tokens.css"), "utf8")
    expect(css).toMatch(/\.side-chat:not\(\.side-chat-empty\) \{ background: var\(--dawn-surface-app\); \}/)
    // 根因：坞底 panel 与卡面 input 在明暗两套里同值——哪天它们分开了，这条注释与判据都该重看
    const 亮 = tok.slice(0, tok.indexOf("--theme-surface-app: var(--theme-gray-900)"))
    expect(亮.match(/--theme-surface-panel: ([^;]+);/)![1]).toBe(亮.match(/--theme-surface-input: ([^;]+);/)![1])
    // 刻度尺只在坞宽到放得下时画
    expect(css).toMatch(/\.side-chat \.turn-nav \{ display: none; \}\n@container \(min-width: 344px\)/)
  })

  it("空态上拖进文件：接住并出声，不让它静静没了（审查 M2）", () => {
    const onStrayFiles = vi.fn()
    const { container } = render(<SideChat session={undefined} {...基本} onStrayFiles={onStrayFiles} />)
    const 格 = container.querySelector(".side-chat-empty")!
    const 文件 = new File(["x"], "a.csv", { type: "text/csv" })
    const 事件 = createEvent.drop(格, { dataTransfer: { files: [文件], items: [{ kind: "file" }] } })
    fireEvent(格, 事件)
    expect(onStrayFiles).toHaveBeenCalledTimes(1)
    expect(事件.defaultPrevented).toBe(true)
  })
})

describe("分栏右键菜单的键盘（审查 M3）", () => {
  const 页签 = [
    { sessionId: "a", title: "对话甲" },
    { sessionId: "b", title: "对话乙" },
  ]
  it("开了焦点进第一项；Esc 收起、焦点回到那格页签", () => {
    render(<SessionTabs tabs={页签} current="a" onPick={空} onPutInDock={空} />)
    fireEvent.contextMenu(screen.getByText("对话乙"))
    const 项 = screen.getByRole("menuitem", { name: "放进坞里" })
    expect(document.activeElement).toBe(项)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menuitem", { name: "放进坞里" })).toBeNull()
    expect((document.activeElement as HTMLElement | null)?.dataset.session).toBe("b")
  })
  it("能开菜单的页签标着 aria-haspopup", () => {
    render(<SessionTabs tabs={页签} current="a" onPick={空} onPutInDock={空} />)
    expect(screen.getByRole("tab", { name: "对话甲" }).getAttribute("aria-haspopup")).toBe("menu")
  })
})
