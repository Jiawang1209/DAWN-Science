/**
 * SideSash 的拖法（dock-polish ④，2026-08-21）。
 * 学自 DSH-better-sidebar：**拖的时候按帧写、抬手才提交；`pointercancel` 也提交，绝不回滚**。
 * 此前每个 `pointermove` 都走一遍 store + localStorage + 整棵重渲染——触控板一秒能发上百个。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import { SideSash } from "../../src/ui/sash.js"

let 帧: (() => void)[] = []
beforeEach(() => {
  帧 = []
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    帧.push(() => cb(0))
    return 帧.length
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    帧[id - 1] = () => {}
  })
  // jsdom 没有 pointer capture
  Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {} })
})
afterEach(() => vi.unstubAllGlobals())
const 跑一帧 = () => {
  const 这帧 = 帧.splice(0)
  for (const f of 这帧) f()
}

describe("SideSash", () => {
  it("一帧里的多次移动只回调一次（phase = drag），抬手提交一次（phase = commit）", () => {
    const onResize = vi.fn()
    const { container } = render(<SideSash width={300} min={100} max={800} onResize={onResize} />)
    const 缝 = container.querySelector<HTMLElement>(".side-sash")!
    fireEvent.pointerDown(缝, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(缝, { clientX: 310, pointerId: 1 })
    fireEvent.pointerMove(缝, { clientX: 320, pointerId: 1 })
    fireEvent.pointerMove(缝, { clientX: 330, pointerId: 1 })
    expect(onResize).not.toHaveBeenCalled()
    跑一帧()
    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenLastCalledWith(330, "drag")
    fireEvent.pointerUp(缝, { clientX: 335, pointerId: 1 })
    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize).toHaveBeenLastCalledWith(335, "commit")
    // 抬手之后没有晚到的帧再来一下
    跑一帧()
    expect(onResize).toHaveBeenCalledTimes(2)
  })

  it("`pointercancel` 也提交最后一个位置，**不回滚**", () => {
    const onResize = vi.fn()
    const { container } = render(<SideSash width={300} min={100} max={800} onResize={onResize} />)
    const 缝 = container.querySelector<HTMLElement>(".side-sash")!
    fireEvent.pointerDown(缝, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(缝, { clientX: 380, pointerId: 1 })
    fireEvent.pointerCancel(缝, { pointerId: 1 })
    expect(onResize).toHaveBeenLastCalledWith(380, "commit")
    跑一帧()
    expect(onResize).toHaveBeenCalledTimes(1)
  })

  it("右边那条取反；键盘一步 16px 直接提交", () => {
    const onResize = vi.fn()
    const { container } = render(<SideSash width={300} min={100} max={800} onResize={onResize} side="right" />)
    const 缝 = container.querySelector<HTMLElement>(".side-sash")!
    fireEvent.pointerDown(缝, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(缝, { clientX: 280, pointerId: 1 })
    跑一帧()
    expect(onResize).toHaveBeenLastCalledWith(320, "drag")
    fireEvent.pointerUp(缝, { clientX: 280, pointerId: 1 })
    expect(onResize).toHaveBeenLastCalledWith(320, "commit")
    fireEvent.keyDown(缝, { key: "ArrowLeft" })
    expect(onResize).toHaveBeenLastCalledWith(316, "commit")
  })

  it("没动就抬手：不提交（提交会把 store 的值原样写一遍 localStorage）", () => {
    const onResize = vi.fn()
    const { container } = render(<SideSash width={300} min={100} max={800} onResize={onResize} />)
    const 缝 = container.querySelector<HTMLElement>(".side-sash")!
    fireEvent.pointerDown(缝, { clientX: 300, pointerId: 1 })
    fireEvent.pointerUp(缝, { clientX: 300, pointerId: 1 })
    expect(onResize).not.toHaveBeenCalled()
  })
})
