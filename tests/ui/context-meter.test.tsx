/**
 * 上下文仪表（2026-09-27，spec §2.1）：读数纯函数的每一档、`/compact` 识别、仪表常驻与弹层。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { ContextMeter, 读仪表, 是压缩命令, use上下文用量, type 仪表读数 } from "../../src/ui/context-meter.js"

const 底 = { bytes: { system: 0, tools: 0, history: 0 }, contextWindow: 128_000, compactAt: 111_616 }

describe("读仪表", () => {
  it("内核 / 终端：不画", () => {
    expect(读仪表("kernel", undefined)).toBeUndefined()
    expect(读仪表("pty", undefined)).toBeUndefined()
  })
  it("外部 agent：灰着写「读不到」，不能压", () => {
    for (const k of ["acp", "cli"] as const) {
      const r = 读仪表(k, undefined)!
      expect(r).toMatchObject({ 档: "dim", 值: "读不到", 能压: false })
      expect(r.细节.join("")).toContain("外部 agent")
    }
  })
  it("还没有过回复：「—」并说为什么不先估一个", () => {
    const r = 读仪表("native", 底)!
    expect(r.值).toBe("—")
    expect(r.细节.join("")).toContain("第一次回复之后才知道")
  })
  it("有真数：百分比；不足 1% 写 <1%", () => {
    expect(读仪表("native", { ...底, usedTokens: 20 })!.值).toBe("<1%")
    expect(读仪表("native", { ...底, usedTokens: 47_200 })).toMatchObject({ 值: "37%", 档: "normal" })
  })
  it("有估的一截：写「约」", () => {
    expect(读仪表("native", { ...底, usedTokens: 47_200, estimated: true })!.值).toBe("约 37%")
  })
  it("线的 85% 起是提醒档；过线是 over", () => {
    expect(读仪表("native", { ...底, usedTokens: 95_000 })!.档).toBe("warn")
    expect(读仪表("native", { ...底, usedTokens: 111_617 })!.档).toBe("over")
  })
  it("刚压缩过：「已压缩」，不给数", () => {
    const r = 读仪表("native", { ...底, afterCompaction: true })!
    expect(r.值).toBe("已压缩")
    expect(r.已用).toBeUndefined()
  })
  it("上限拿不到：只写数，并说不会自动压缩", () => {
    const r = 读仪表("native", { bytes: 底.bytes, usedTokens: 12_300 })!
    expect(r.值).toBe("12.3k")
    expect(r.细节.join("")).toContain("不会自动压缩")
  })
  it("取数失败：灰着说没取到，不装作有数", () => {
    const r = 读仪表("native", undefined, "连不上后端")!
    expect(r).toMatchObject({ 档: "dim", 值: "—" })
    expect(r.细节.join("")).toContain("连不上后端")
  })
})

describe("是压缩命令", () => {
  it("整句是 /compact：没有要求", () => {
    expect(是压缩命令("/compact")).toEqual({})
    expect(是压缩命令("  /COMPACT  ")).toEqual({})
  })
  it("后面跟一句：那句是要求", () => {
    expect(是压缩命令("/compact 保留暗号和图的路径")).toEqual({ instructions: "保留暗号和图的路径" })
  })
  it("不是它：/compactx、句中提到、别的斜杠", () => {
    expect(是压缩命令("/compactx")).toBeUndefined()
    expect(是压缩命令("请 /compact 一下")).toBeUndefined()
    expect(是压缩命令("/skill:compact")).toBeUndefined()
  })
})

describe("ContextMeter", () => {
  // 在 beforeEach 里算、不在 describe 体里算：`tests/ui/setup.ts` 的 beforeEach 才把语言切到中文，
  // describe 体在收集阶段就跑了，那时算出来的细节是英文
  let 读数: 仪表读数
  beforeEach(() => {
    读数 = 读仪表("native", { ...底, usedTokens: 47_200 })!
  })
  it("常驻：按钮上就写着比例（不是悬停才出现）", () => {
    render(<ContextMeter 读数={读数} />)
    expect(screen.getByRole("button", { name: "上下文 37%" })).toBeTruthy()
  })
  it("按钮上只写环 + 数（2026-09-28，处处如此）：「上下文」三个字不画，按钮名字由 aria-label 带全句（快满了也是）", () => {
    const { container, rerender } = render(<ContextMeter 读数={读数} />)
    const 钮 = screen.getByRole("button", { name: "上下文 37%" })
    expect(钮.getAttribute("aria-label")).toBe("上下文 37%")
    expect(container.querySelector(".ctx-meter-word")).toBeNull()
    expect(钮.textContent).toBe("37%")
    rerender(<ContextMeter 读数={{ ...读数, 档: "warn" }} />)
    expect(screen.getByRole("button", { name: "上下文 37% · 快满了" })).toBeTruthy()
    expect(container.querySelector(".ctx-meter-trigger")?.textContent).toBe("37% · 快满了")
  })
  it("点开：真数、自动压缩线、「现在压缩」；打开时要一次新数", () => {
    const onOpen = vi.fn()
    render(<ContextMeter 读数={读数} onOpen={onOpen} onCompact={async () => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "上下文 37%" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    const 层 = screen.getByRole("dialog")
    expect(层.textContent).toContain("47.2k / 128k tokens")
    expect(层.textContent).toContain("到 111.6k tokens 会自动压缩")
    expect(screen.getByRole("button", { name: "现在压缩" })).toBeTruthy()
  })
  it("悬停就看得到用量，移开就收；点一下钉住，移开不收", () => {
    vi.useFakeTimers()
    const onOpen = vi.fn()
    const { container } = render(<ContextMeter 读数={读数} onOpen={onOpen} />)
    const 盒 = container.querySelector(".ctx-meter")!
    fireEvent.mouseEnter(盒)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("dialog").textContent).toContain("47.2k / 128k tokens")
    fireEvent.mouseLeave(盒)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "上下文 37%" }))
    fireEvent.mouseLeave(盒)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole("dialog")).toBeTruthy()
    vi.useRealTimers()
  })
  it("忙着：「现在压缩」灰着，旁边写原因", () => {
    render(<ContextMeter 读数={读数} onCompact={async () => {}} 不能压的原因="这一轮还在跑，做完再压缩" />)
    fireEvent.click(screen.getByRole("button", { name: "上下文 37%" }))
    expect((screen.getByRole("button", { name: "现在压缩" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("这一轮还在跑，做完再压缩")).toBeTruthy()
  })
  it("压缩请求失败：在弹层里出声", async () => {
    render(<ContextMeter 读数={读数} onCompact={async () => { throw new Error("写入被拒") }} />)
    fireEvent.click(screen.getByRole("button", { name: "上下文 37%" }))
    fireEvent.click(screen.getByRole("button", { name: "现在压缩" }))
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "写入被拒")
  })
  it("外部 agent：没有「现在压缩」", () => {
    render(<ContextMeter 读数={读仪表("acp", undefined)!} onCompact={async () => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "上下文 读不到" }))
    expect(screen.queryByRole("button", { name: "现在压缩" })).toBeNull()
  })
  it("键盘：聚焦按钮就打开；Tab 进「现在压缩」不收、焦点还在那颗上；焦点离开整块才收", () => {
    vi.useFakeTimers()
    try {
      render(
        <>
          <ContextMeter 读数={读数} onCompact={async () => {}} />
          <input aria-label="外面" />
        </>,
      )
      const 钮 = screen.getByRole("button", { name: "上下文 37%" })
      act(() => 钮.focus())
      expect(screen.getByRole("dialog")).toBeTruthy()
      const 压 = screen.getByRole("button", { name: "现在压缩" })
      act(() => 压.focus())
      act(() => vi.advanceTimersByTime(200))
      expect(screen.getByRole("dialog")).toBeTruthy()
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "现在压缩" }))
      act(() => (screen.getByLabelText("外面") as HTMLInputElement).focus())
      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByRole("dialog")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
  it("150ms 之内移回来：不收，也不再要一次新数", () => {
    vi.useFakeTimers()
    try {
      const onOpen = vi.fn()
      const { container } = render(<ContextMeter 读数={读数} onOpen={onOpen} />)
      const 盒 = container.querySelector(".ctx-meter")!
      fireEvent.mouseEnter(盒)
      fireEvent.mouseLeave(盒)
      act(() => vi.advanceTimersByTime(100))
      fireEvent.mouseEnter(盒)
      act(() => vi.advanceTimersByTime(200))
      expect(screen.getByRole("dialog")).toBeTruthy()
      expect(onOpen).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it("钉住之后：Esc 收", () => {
    render(<ContextMeter 读数={读数} />)
    const 钮 = screen.getByRole("button", { name: "上下文 37%" })
    fireEvent.click(钮)
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.keyDown(钮, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("钉住之后：在外面按下鼠标就收；在弹层里按不收", () => {
    render(
      <>
        <ContextMeter 读数={读数} />
        <p>外面</p>
      </>,
    )
    fireEvent.click(screen.getByRole("button", { name: "上下文 37%" }))
    fireEvent.mouseDown(screen.getByRole("dialog"))
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.mouseDown(screen.getByText("外面"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("use上下文用量：一件事只取一次", () => {
  const 用量 = { bytes: 底.bytes, usedTokens: 1 }
  type P = { id: string; busy: boolean; 记号: string }
  const 摆 = (初: P) => {
    const 取 = vi.fn(async () => 用量)
    const r = renderHook((p: P) => use上下文用量(p.id, 取, p.busy, p.记号), { initialProps: 初 })
    return { 取, r }
  }
  it("挂上：一次", () => {
    const { 取 } = 摆({ id: "A", busy: false, 记号: "c1:done" })
    expect(取).toHaveBeenCalledTimes(1)
  })
  it("换到一段压缩过的会话：一次（不是换会话一次、记号变了又一次）", () => {
    const { 取, r } = 摆({ id: "A", busy: false, 记号: "" })
    取.mockClear()
    r.rerender({ id: "B", busy: false, 记号: "c1:done" })
    expect(取).toHaveBeenCalledTimes(1)
  })
  it("换会话时上一段正忙、这一段不忙：一次", () => {
    const { 取, r } = 摆({ id: "A", busy: true, 记号: "" })
    取.mockClear()
    r.rerender({ id: "B", busy: false, 记号: "c1:done" })
    expect(取).toHaveBeenCalledTimes(1)
  })
  it("一次压缩：开始不取；结束（记号变了、busy 同时落下）只取一次", () => {
    const { 取, r } = 摆({ id: "A", busy: false, 记号: "" })
    取.mockClear()
    r.rerender({ id: "A", busy: true, 记号: "c1:running" })
    expect(取).toHaveBeenCalledTimes(0)
    r.rerender({ id: "A", busy: false, 记号: "c1:done" })
    expect(取).toHaveBeenCalledTimes(1)
  })
  it("一轮做完：一次", () => {
    const { 取, r } = 摆({ id: "A", busy: false, 记号: "" })
    取.mockClear()
    r.rerender({ id: "A", busy: true, 记号: "" })
    r.rerender({ id: "A", busy: false, 记号: "" })
    expect(取).toHaveBeenCalledTimes(1)
  })
  it("不忙时冒出一条已压完的（没有 start 的 end）：也取一次", () => {
    const { 取, r } = 摆({ id: "A", busy: false, 记号: "" })
    取.mockClear()
    r.rerender({ id: "A", busy: false, 记号: "c1:failed" })
    expect(取).toHaveBeenCalledTimes(1)
  })
})
