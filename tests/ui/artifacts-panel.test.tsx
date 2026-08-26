/**
 * 坞「产物」格（spec 2026-08-26-产物 §5，Task 11）。
 *
 * 三条要害：按目录分组、未知次数数得出来、已不存在的标出来；
 * 空态与「还没取到」是两码事；点一行进预览、能回清单——
 * 而且回清单之后，读到一半的迟到内容不许再把人拽回预览。
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { ArtifactsPanel } from "../../src/ui/artifacts.js"
import type { FileContent } from "../../src/ui/files.js"

const art = (path: string, exists = true) =>
  ({ path, kind: "table" as const, bornRunId: "r", bornToolCallId: "c", bornAt: "2026-08-26T10:00:00.000Z", exists })

const noop = { readFile: vi.fn(), onOpenInFiles: vi.fn(), onDownload: vi.fn(), onOpenExternally: vi.fn() }

/** 一个能手动 resolve/reject 的 promise——模拟「点开了但还没读完」那一刻 */
function 挂起<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const 文本内容 = (): FileContent => ({ kind: "text", mediaType: "text/plain", bytes: 2, text: "hi" })

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

  it("点一行进预览，「回到清单」回来——回来之后那一行还在、还能点", async () => {
    const readFile = vi.fn().mockResolvedValue(文本内容())
    render(<ArtifactsPanel data={{ artifacts: [art("c.txt")], unknown: [] }} {...noop} readFile={readFile} />)
    fireEvent.click(screen.getByRole("button", { name: "c.txt" }))
    expect(readFile).toHaveBeenCalledWith("c.txt")
    expect(await screen.findByRole("button", { name: "回到清单" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "回到清单" }))
    // **不是随便找到「c.txt」这几个字**——它得是清单里那颗可以再点开的行按钮
    expect(screen.getByRole("button", { name: "c.txt" })).toBeTruthy()
  })

  it("同一个 path 换个 nonce 能再次被 focus 打开——光 path 不变不会重新触发", async () => {
    const readFile = vi.fn().mockResolvedValue(文本内容())
    const { rerender } = render(
      <ArtifactsPanel data={{ artifacts: [art("c.txt")], unknown: [] }} {...noop} readFile={readFile} focus={{ path: "c.txt", nonce: 1 }} />,
    )
    expect(await screen.findByRole("button", { name: "回到清单" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "回到清单" }))
    expect(screen.queryByRole("button", { name: "回到清单" })).toBeNull()

    // 同一个 path，nonce 没变——不该被重新拉进预览
    rerender(
      <ArtifactsPanel data={{ artifacts: [art("c.txt")], unknown: [] }} {...noop} readFile={readFile} focus={{ path: "c.txt", nonce: 1 }} />,
    )
    expect(screen.queryByRole("button", { name: "回到清单" })).toBeNull()

    // nonce 变了——即使 path 相同也要重新打开
    rerender(
      <ArtifactsPanel data={{ artifacts: [art("c.txt")], unknown: [] }} {...noop} readFile={readFile} focus={{ path: "c.txt", nonce: 2 }} />,
    )
    expect(await screen.findByRole("button", { name: "回到清单" })).toBeTruthy()
  })

  it("读到一半点了回清单——迟到的内容不许把人拽回预览（过期守卫）", async () => {
    const 挂 = 挂起<FileContent>()
    const readFile = vi.fn().mockReturnValue(挂.promise)
    render(<ArtifactsPanel data={{ artifacts: [art("c.txt")], unknown: [] }} {...noop} readFile={readFile} />)

    fireEvent.click(screen.getByRole("button", { name: "c.txt" }))
    expect(await screen.findByRole("button", { name: "回到清单" })).toBeTruthy()

    // 还没等 readFile 回来就已经回了清单
    fireEvent.click(screen.getByRole("button", { name: "回到清单" }))
    expect(screen.queryByRole("button", { name: "回到清单" })).toBeNull()

    // 这时候迟到的内容才回来
    await act(async () => {
      挂.resolve(文本内容())
      await Promise.resolve()
    })

    // 仍然在清单视图——没有被拽回预览
    expect(screen.queryByRole("button", { name: "回到清单" })).toBeNull()
    expect(screen.getByRole("button", { name: "c.txt" })).toBeTruthy()
  })
})

describe("ArtifactsPanel —— 取失败要出声", () => {
  it("**带 error 的清单画成「取不到」+ 重试，不是转圈也不是空态**", () => {
    const onReload = vi.fn()
    render(<ArtifactsPanel data={{ artifacts: [], unknown: [], error: "账本没开" }} {...noop} onReload={onReload} />)
    expect(screen.getByText("取不到产物清单")).toBeTruthy()
    expect(screen.getByText("账本没开")).toBeTruthy()
    expect(screen.queryByText("这段会话还没有生成文件")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
