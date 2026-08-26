/**
 * 坞「产物」格（spec 2026-08-26-产物 §5，Task 11）。
 *
 * 三条要害：按目录分组、未知次数数得出来、已不存在的标出来；
 * 空态与「还没取到」是两码事；点一行进预览、能回清单。
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ArtifactsPanel } from "../../src/ui/artifacts.js"

const art = (path: string, exists = true) =>
  ({ path, kind: "table" as const, bornRunId: "r", bornToolCallId: "c", bornAt: "2026-08-26T10:00:00.000Z", exists })

const noop = { readFile: vi.fn(), onOpenInFiles: vi.fn(), onDownload: vi.fn(), onOpenExternally: vi.fn() }

describe("ArtifactsPanel", () => {
  it("按目录分组、数得出未知次数；已不存在的标出来", () => {
    render(
      <ArtifactsPanel
        data={{ artifacts: [art("outputs/a.csv"), art("outputs/b.csv", false), art("c.txt")], unknown: [{ runId: "r9" }] }}
        {...noop}
      />,
    )
    expect(screen.getByText("outputs/")).toBeTruthy()
    expect(screen.getByText(/另有 1 次运行产出未知/)).toBeTruthy()
    expect(screen.getByText("已不存在")).toBeTruthy()
  })

  it("空态与「还没取到」分得开", () => {
    const { rerender } = render(<ArtifactsPanel data={undefined} {...noop} />)
    expect(screen.getByText(/正在取产物清单/)).toBeTruthy()
    rerender(<ArtifactsPanel data={{ artifacts: [], unknown: [] }} {...noop} />)
    expect(screen.getByText(/还没有生成文件/)).toBeTruthy()
  })

  it("点一行进预览，「回到清单」回来", async () => {
    const readFile = vi.fn().mockResolvedValue({ kind: "text", mediaType: "text/plain", bytes: 2, text: "hi" })
    render(<ArtifactsPanel data={{ artifacts: [art("c.txt")], unknown: [] }} {...noop} readFile={readFile} />)
    fireEvent.click(screen.getByRole("button", { name: "c.txt" }))
    expect(readFile).toHaveBeenCalledWith("c.txt")
    expect(await screen.findByRole("button", { name: "回到清单" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "回到清单" }))
    expect(screen.getByText("c.txt")).toBeTruthy()
  })
})
