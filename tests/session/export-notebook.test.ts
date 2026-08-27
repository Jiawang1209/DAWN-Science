/**
 * 笔记本导出（2026-08-27，fix-notebook）：cell → `.ipynb` / `.md`，纯函数。
 *
 * 盯的是**如实**：混排语言不硬塞进一个 kernelspec；截断/太大要说清省了多少；孤儿 cell 不假装有代码。
 */
import { describe, expect, it } from "vitest"
import { cells成ipynb, cells成markdown, 笔记本文件名 } from "../../src/session/export-notebook.js"
import type { Cell } from "../../src/session/notebook-cells.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

type 输出 = Extract<TranscriptItem, { type: "kernelOutput" }>
const 出 = (id: string, output: 输出["output"], language?: "python" | "R"): 输出 => ({
  type: "kernelOutput",
  id,
  kernelInstanceId: "k1",
  kernelRevision: 0,
  ...(language ? { language } : {}),
  output,
})

const 头 = { title: "早报", agentId: "ds-chat", createdAt: "2026-08-27T01:00:00Z", workspace: "/w" }

function 一套(): Cell[] {
  return [
    {
      n: 1, id: "a", who: "agent", language: "python", languageKnown: true, code: "x = 1\nx", status: "ok", startedAt: 1_700_000_000_000, runId: "r1",
      outputs: [
        出("o1", { kind: "stream", stream: "stdout", text: "hi\n" }),
        出("o2", { kind: "result", mediaType: "text/plain", data: "1", bytes: 1, alsoAvailable: [] }),
      ],
    },
    {
      n: 2, id: "b", who: "you", language: "python", languageKnown: true, code: "plot()", status: "ok",
      outputs: [出("o3", { kind: "display", mediaType: "image/png", data: "iVBORw0KGgo=", bytes: 8, alsoAvailable: ["text/plain"] })],
    },
    {
      n: 3, id: "c", who: "agent", language: "R", languageKnown: true, code: "stop('x')", status: "error",
      outputs: [出("o4", { kind: "error", ename: "Error", evalue: "x", traceback: ["\x1b[31mError in stop('x')\x1b[0m"] }, "R")],
    },
    {
      n: 4, id: "d", who: "you", language: "python", languageKnown: true, code: "big", status: "ok", interrupted: true,
      outputs: [
        出("o5", { kind: "stream", stream: "stdout", text: "部分…", truncated: { originalBytes: 20480, keptBytes: 4096 } }),
        出("o6", { kind: "display", mediaType: "image/png", data: "", bytes: 5_000_000, tooLarge: true, alsoAvailable: [] }),
      ],
    },
    { n: 5, id: "e", who: "agent", languageKnown: false, code: "", status: "ok", orphan: true, outputs: [出("o7", { kind: "stream", stream: "stderr", text: "warn" })] },
  ]
}

describe("cells成ipynb", () => {
  it("nbformat 4.5；kernelspec 取多数语言；每格 execution_count = n、metadata.dawn 记谁跑的", () => {
    const nb = JSON.parse(cells成ipynb(头, 一套()))
    expect(nb.nbformat).toBe(4)
    expect(nb.nbformat_minor).toBe(5)
    expect(nb.metadata.kernelspec.name).toBe("python3")
    const codes = nb.cells.filter((c: { cell_type: string }) => c.cell_type === "code")
    expect(codes).toHaveLength(5)
    expect(codes[0].execution_count).toBe(1)
    expect(codes[0].metadata.dawn).toEqual({ who: "agent", startedAt: 1_700_000_000_000, runId: "r1" })
    expect(codes[3].metadata.dawn.interrupted).toBe(true)
  })

  it("输出映射：stream / execute_result / display_data / error；traceback 原样", () => {
    const nb = JSON.parse(cells成ipynb(头, 一套()))
    const codes = nb.cells.filter((c: { cell_type: string }) => c.cell_type === "code")
    expect(codes[0].outputs[0]).toEqual({ output_type: "stream", name: "stdout", text: ["hi\n"] })
    expect(codes[0].outputs[1]).toEqual({ output_type: "execute_result", execution_count: 1, data: { "text/plain": ["1"] }, metadata: {} })
    expect(codes[1].outputs[0]).toEqual({ output_type: "display_data", data: { "image/png": "iVBORw0KGgo=" }, metadata: {} })
    expect(codes[2].outputs[0]).toMatchObject({ output_type: "error", ename: "Error", evalue: "x" })
  })

  it("混排：不同于 kernelspec 的 cell 首行注明语言，顶上一格 markdown 说明；语言未记录也注明", () => {
    const nb = JSON.parse(cells成ipynb(头, 一套()))
    expect(nb.cells[0].cell_type).toBe("markdown")
    expect(nb.cells[0].source.join("")).toContain("混用了 Python 与 R")
    const codes = nb.cells.filter((c: { cell_type: string }) => c.cell_type === "code")
    expect(codes[2].source[0]).toBe("# [R 内核]\n")
    expect(codes[4].source.join("")).toContain("语言未记录")
    expect(codes[4].source.join("")).toContain("未记录代码")
  })

  it("全是一门语言就没有那格说明", () => {
    const only = 一套().filter((c) => c.language === "python")
    const nb = JSON.parse(cells成ipynb(头, only))
    expect(nb.cells[0].cell_type).toBe("code")
  })

  it("截断与太大都要说清省了多少（规格 7.5）", () => {
    const nb = JSON.parse(cells成ipynb(头, 一套()))
    const codes = nb.cells.filter((c: { cell_type: string }) => c.cell_type === "code")
    const 文 = JSON.stringify(codes[3].outputs)
    expect(文).toContain("已截断：原 20 KB，保留 4 KB")
    expect(文).toContain("输出太大未保留：4883 KB")
  })
})

describe("cells成markdown", () => {
  it("每格一个标题、代码围栏按语言；PNG 内嵌 data URI；报错去 ANSI；中断说出来", () => {
    const md = cells成markdown(头, 一套())
    expect(md).toContain("# 早报")
    expect(md).toContain("### [1] Python · agent")
    expect(md).toContain("### [2] Python · 你")
    expect(md).toContain("```python\nx = 1\nx\n```")
    expect(md).toContain("```r\nstop('x')\n```")
    expect(md).toContain("![输出 2](data:image/png;base64,iVBORw0KGgo=)")
    expect(md).toContain("Error in stop('x')")
    expect(md).not.toContain("\x1b[")
    expect(md).toContain("（已中断）")
    expect(md).toContain("已截断：原 20 KB，保留 4 KB")
    expect(md).toContain("（未记录代码）")
  })
})

describe("笔记本文件名", () => {
  it("「笔记本-」前缀 + 标题 + 时间戳 + 后缀，与对话导出不同名", () => {
    const 时 = new Date(2026, 7, 27, 9, 5, 7)
    expect(笔记本文件名("早报", "id", "ipynb", 时)).toBe("笔记本-早报 20260827-090507.ipynb")
    expect(笔记本文件名("", "id", "md", 时)).toBe("笔记本-id 20260827-090507.md")
  })
})
