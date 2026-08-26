/**
 * 坞标签「笔记本」的角标（plan 2026-08-26-笔记本 Task 8）。
 *
 * 与产物格同一条路：RightDock 拿不到转录，计数由 App 灌进 `$cellCount`。
 * 钉两件事：**有 cell 才有角标**（0 不画，别让一颗「0」看起来像坏了）；
 * **可访问名不带计数**——`getByRole("tab", { name: "笔记本" })` 装了角标也得找得到。
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { RightDock } from "../../src/ui/views.js"
import { $cellCount, setCellCount } from "../../src/ui/state/catalog.js"
import { RIGHT_DOCK_DEFAULT } from "../../src/ui/state/right-dock.js"

afterEach(() => {
  cleanup()
  $cellCount.set(0)
})

function 画() {
  return render(
    <RightDock tenant="files" width={RIGHT_DOCK_DEFAULT} onWidth={() => {}} onClose={() => {}} onPick={() => {}}>
      <div />
    </RightDock>,
  )
}

describe("笔记本角标", () => {
  it("没有 cell 时不画角标", () => {
    画()
    const tab = screen.getByRole("tab", { name: "笔记本" })
    expect(tab.querySelector(".dock-tab-badge")).toBeNull()
  })

  it("有 cell 时角标是 cell 数，可访问名仍是「笔记本」", () => {
    setCellCount(3)
    画()
    const tab = screen.getByRole("tab", { name: "笔记本" })
    expect(tab.querySelector(".dock-tab-badge")?.textContent).toBe("3")
  })
})
