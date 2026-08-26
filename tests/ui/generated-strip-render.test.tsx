/**
 * 产物条的渲染（2026-08-26，审查 B / D）：取失败要出声、chip 的可达名不与坞里清单行同名。
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { GeneratedStrip } from "../../src/ui/generated-strip.js"

const art = (path: string, kind: "table" | "image" = "table", exists = true) =>
  ({ path, kind, bornRunId: "r", bornToolCallId: "c", bornAt: "2026-08-26T10:00:00.000Z", exists }) as const

describe("GeneratedStrip", () => {
  it("load_failed → 「产物清单没取到」+ 原因，不画 GENERATED", () => {
    render(<GeneratedStrip 产物={{ kind: "unknown", reason: "load_failed", error: "ECONNRESET" }} onOpen={vi.fn()} />)
    expect(screen.getByText("本轮产出未知")).toBeTruthy()
    expect(screen.getByText("产物清单没取到：ECONNRESET")).toBeTruthy()
    expect(screen.queryByRole("group", { name: "本轮生成的文件" })).toBeNull()
  })

  it("chip 的可达名是「打开产物 <路径>」，与坞清单行那颗（名字就是路径）分得开", () => {
    const onOpen = vi.fn()
    render(
      <GeneratedStrip
        产物={{ kind: "some", unknownCount: 0, artifacts: [{ path: "outputs/a.csv", kind: "table", bornRunId: "r", bornToolCallId: "c", bornAt: "2026-08-26T10:00:00.000Z", exists: true }] }}
        onOpen={onOpen}
      />,
    )
    const chip = screen.getByRole("button", { name: "打开产物 outputs/a.csv" })
    expect(screen.queryByRole("button", { name: "outputs/a.csv" })).toBeNull()
    chip.click()
    expect(onOpen).toHaveBeenCalledWith("outputs/a.csv")
  })

  it("chip 按生成先后排，不按字母序（b 先建就 b 在前）", () => {
    render(<GeneratedStrip 产物={{ kind: "some", unknownCount: 0, artifacts: [art("out/b.csv"), art("out/a.csv")] }} onOpen={vi.fn()} />)
    const 名字 = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))
    expect(名字).toEqual(["打开产物 out/b.csv", "打开产物 out/a.csv"])
  })

  it("图片 chip：loadThumb 有结果就在徽标那格画 <img>（src 是 data URL），IMAGE 徽标退场", async () => {
    const { container } = render(
      <GeneratedStrip
        产物={{ kind: "some", unknownCount: 0, artifacts: [art("figures/p.png", "image")] }}
        onOpen={vi.fn()}
        loadThumb={() => Promise.resolve("data:image/png;base64,AAAA")}
      />,
    )
    await waitFor(() => expect(container.querySelector(".generated-chip img")).toBeTruthy())
    expect(container.querySelector(".generated-chip img")!.getAttribute("src")).toBe("data:image/png;base64,AAAA")
    expect(screen.queryByText("IMAGE")).toBeNull()
  })

  it("图片 chip：loadThumb 返回 undefined 或没给 → 退回 IMAGE 徽标，绝不画 img", async () => {
    const { container, rerender } = render(
      <GeneratedStrip 产物={{ kind: "some", unknownCount: 0, artifacts: [art("figures/p.png", "image")] }} onOpen={vi.fn()} loadThumb={() => Promise.resolve(undefined)} />,
    )
    await Promise.resolve()
    expect(screen.getByText("IMAGE")).toBeTruthy()
    expect(container.querySelector(".generated-chip img")).toBeNull()
    // 根本没给 loadThumb 也一样
    rerender(<GeneratedStrip 产物={{ kind: "some", unknownCount: 0, artifacts: [art("figures/p.png", "image")] }} onOpen={vi.fn()} />)
    expect(screen.getByText("IMAGE")).toBeTruthy()
    expect(container.querySelector(".generated-chip img")).toBeNull()
  })

  it("图片 chip：img 触发 error（读得到但解码不出）→ 退回 IMAGE 徽标，不留断图", async () => {
    const { container } = render(
      <GeneratedStrip 产物={{ kind: "some", unknownCount: 0, artifacts: [art("figures/p.png", "image")] }} onOpen={vi.fn()} loadThumb={() => Promise.resolve("data:image/png;base64,AAAA")} />,
    )
    const img = await waitFor(() => {
      const el = container.querySelector(".generated-chip img")
      if (!el) throw new Error("还没画出 img")
      return el as HTMLImageElement
    })
    fireEvent.error(img)
    expect(container.querySelector(".generated-chip img")).toBeNull()
    expect(screen.getByText("IMAGE")).toBeTruthy()
  })

  it("已不存在的图片 chip：即便给了 loadThumb 也不加载、退回徽标 + 「已不存在」，不画断图", () => {
    const loadThumb = vi.fn().mockResolvedValue("data:image/png;base64,AAAA")
    const { container } = render(
      <GeneratedStrip 产物={{ kind: "some", unknownCount: 0, artifacts: [art("figures/p.png", "image", false)] }} onOpen={vi.fn()} loadThumb={loadThumb} />,
    )
    expect(loadThumb).not.toHaveBeenCalled()
    expect(screen.getByText("IMAGE")).toBeTruthy()
    expect(screen.getByText("已不存在")).toBeTruthy()
    expect(container.querySelector(".generated-chip img")).toBeNull()
  })
})
