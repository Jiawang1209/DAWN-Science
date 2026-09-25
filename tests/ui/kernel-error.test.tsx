/**
 * 内核报错的画法（2026-09-25，作者：「中断了之后，会出现报错，这个报错能否折叠起来」）。
 *
 * 截图里是一整块红色、满屏 `[0;31m` 的 KeyboardInterrupt。判据：
 * 默认收起、入口带字常驻、展开后颜色是类名不是文字、中断画成中性灰、真报错照旧红。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { KernelOutputRow } from "../../src/ui/views.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

const E = "\x1b"
type 输出项 = Extract<TranscriptItem, { type: "kernelOutput" }>

const 报错 = (ename: string, evalue: string, traceback: string[]): 输出项 => ({
  type: "kernelOutput",
  id: "o1",
  kernelInstanceId: "k1",
  kernelRevision: 1,
  output: { kind: "error", ename, evalue, traceback },
})

const 中断TB = [
  `${E}[0;31m---------------------------------------------------------------------------${E}[0m`,
  `${E}[0;31mKeyboardInterrupt${E}[0m                         Traceback (most recent call last)`,
  `Cell ${E}[0;32mIn[1], line 2${E}[0m\n${E}[1;32m----> 2${E}[0m time${E}[38;5;241m.${E}[39msleep(${E}[38;5;241m100${E}[39m)`,
  `${E}[38;5;124mKeyboardInterrupt${E}[39m: `,
]

const 真错TB = [
  `${E}[0;31mZeroDivisionError${E}[0m                         Traceback (most recent call last)`,
  `Cell ${E}[0;32mIn[2], line 1${E}[0m\n${E}[1;32m----> 1${E}[0m ${E}[38;5;241m1${E}[39m${E}[38;5;241m/${E}[39m${E}[38;5;241m0${E}[39m`,
  `${E}[0;31mZeroDivisionError${E}[0m: division by zero`,
]

describe("内核报错 · 默认收起", () => {
  it("收起时只有一行摘要，traceback 不在 DOM 里；入口带字", () => {
    const { container } = render(<KernelOutputRow item={报错("ZeroDivisionError", "division by zero", 真错TB)} />)
    expect(container.querySelector(".kout-trace")).toBeNull()
    const 开关 = screen.getByRole("button", { name: /展开 traceback/ })
    expect(开关.getAttribute("aria-expanded")).toBe("false")
    expect(开关.textContent).toContain("ZeroDivisionError: division by zero")
  })

  it("点开之后出 traceback，再点收回；文案跟着换", () => {
    const { container } = render(<KernelOutputRow item={报错("ZeroDivisionError", "division by zero", 真错TB)} />)
    fireEvent.click(screen.getByRole("button", { name: /展开 traceback/ }))
    expect(container.querySelector(".kout-trace")).not.toBeNull()
    const 开关 = screen.getByRole("button", { name: /折叠 traceback/ })
    expect(开关.getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(开关)
    expect(container.querySelector(".kout-trace")).toBeNull()
  })

  it("展开入口不是悬停才出现的：常驻、不透明", () => {
    render(<KernelOutputRow item={报错("ZeroDivisionError", "division by zero", 真错TB)} />)
    const 字 = screen.getByText("展开 traceback")
    expect(getComputedStyle(字).opacity === "" || getComputedStyle(字).opacity === "1").toBe(true)
  })

  it("没有 traceback 就没有开关，只有摘要", () => {
    const { container } = render(<KernelOutputRow item={报错("Error", "boom", [])} />)
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector(".kout-ename")!.textContent).toBe("Error: boom")
  })
})

describe("内核报错 · ANSI", () => {
  it("展开后 DOM 里没有 `[0;31m` 这种残渣，也没有 ESC；颜色落成类名", () => {
    const { container } = render(<KernelOutputRow item={报错("ZeroDivisionError", "division by zero", 真错TB)} />)
    fireEvent.click(screen.getByRole("button", { name: /展开 traceback/ }))
    const 文字 = container.textContent!
    expect(文字).not.toMatch(/\[[0-9;]*m/)
    expect(文字).not.toContain(E)
    expect(文字).toContain("----> 1 1/0")
    expect(container.querySelector(".kout-trace .ansi-fg-red")!.textContent).toBe("ZeroDivisionError")
    expect(container.querySelector(".kout-trace .ansi-fg-green.ansi-bold")).not.toBeNull()
  })

  it("stdout / stderr 里的颜色码同样画成颜色", () => {
    const item: 输出项 = {
      type: "kernelOutput",
      id: "o2",
      kernelInstanceId: "k1",
      kernelRevision: 1,
      output: { kind: "stream", stream: "stderr", text: `${E}[33mUserWarning${E}[0m: careful\n` },
    }
    const { container } = render(<KernelOutputRow item={item} />)
    expect(container.textContent).toBe("UserWarning: careful\n")
    expect(container.querySelector(".kout-text .ansi-fg-yellow")!.textContent).toBe("UserWarning")
  })
})

describe("内核报错 · 中断不是失败", () => {
  it("KeyboardInterrupt：中性（不挂红），摘要写「KeyboardInterrupt · 已中断」", () => {
    const { container } = render(<KernelOutputRow item={报错("KeyboardInterrupt", "", 中断TB)} />)
    const 块 = container.querySelector(".kout-error")!
    expect(块.classList.contains("kout-interrupted")).toBe(true)
    expect(块.getAttribute("data-interrupted")).toBe("true")
    expect(块.querySelector(".kout-ename")!.textContent).toBe("KeyboardInterrupt · 已中断")
    expect(container.querySelector(".kout-trace")).toBeNull()
  })

  it("所在那格被停下的（笔记本传 interrupted）也按中断画，哪怕 ename 不是 KeyboardInterrupt", () => {
    const { container } = render(<KernelOutputRow item={报错("RInterrupt", "", ["x"])} interrupted />)
    expect(container.querySelector(".kout-error")!.classList.contains("kout-interrupted")).toBe(true)
    expect(container.querySelector(".kout-ename")!.textContent).toBe("RInterrupt · 已中断")
  })

  it("真报错不挂中性类，照旧红（CSS 里 .kout-ename 是 danger，中性那条只在 .kout-interrupted 下）", () => {
    const { container } = render(<KernelOutputRow item={报错("ValueError", "bad", 真错TB)} />)
    const 块 = container.querySelector(".kout-error")!
    expect(块.classList.contains("kout-interrupted")).toBe(false)
    expect(块.hasAttribute("data-interrupted")).toBe(false)
  })

  it("样式：真报错的摘要是 danger 红；中断那条摘要是 text-3 灰、左线是默认灰线（jsdom 不算级联，直接读规则）", () => {
    const css = readFileSync(join(import.meta.dirname, "../../src/ui/styles.css"), "utf8")
    expect(css).toMatch(/\.kout-ename \{[^}]*color: var\(--dawn-danger\)/)
    expect(css).toMatch(/\.kout-interrupted \.kout-ename \{[^}]*color: var\(--dawn-text-3\)/)
    expect(css).toMatch(/\.kout-error\.kout-interrupted \{[^}]*border-left-color: var\(--dawn-stroke-3\)/)
  })
})
