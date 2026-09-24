/**
 * 坞格「对话」与分栏右键的两处可见性（侧边对话 Task 6 审查修补，2026-09-24）。
 */
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SideChat } from "../../src/ui/side-chat.js"
import { SessionTabs } from "../../src/ui/session-tabs.js"

const 空 = () => {}

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
