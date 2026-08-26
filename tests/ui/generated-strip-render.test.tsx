/**
 * 产物条的渲染（2026-08-26，审查 B / D）：取失败要出声、chip 的可达名不与坞里清单行同名。
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { GeneratedStrip } from "../../src/ui/generated-strip.js"

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
})
