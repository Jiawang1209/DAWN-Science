/**
 * `cells()` 派生（Task 6，2026-08-26；review 修补 2026-08-26）：转录 → 一叠 cell。
 *
 * 覆盖计划里列的四条：run_code 归并、你的 cell 归并（含透传）、
 * 别的工具不算 cell、孤儿输出兜底；外加 review 加的两条：
 * 孤儿输出没有 language 不假装是 python、两台内核并存时输出按 language 归位。
 */
import { describe, expect, it } from "vitest"
import type { TranscriptItem } from "../../src/protocol/index.js"
import { cells } from "../../src/ui/notebook.js"

const tool = (id: string, language: string, code: string, status: "running" | "ok" | "error" = "ok") => ({
  type: "tool" as const,
  id,
  name: "run_code",
  input: { language, code },
  status,
})

/** language 缺省时不带这个字段——跟真实的 kernelOutput 一样，不是「language: undefined」 */
const kout = (id: string, language: "python" | "R" | undefined, text: string) => ({
  type: "kernelOutput" as const,
  id,
  kernelInstanceId: "k",
  kernelRevision: 0,
  ...(language === undefined ? {} : { language }),
  output: { kind: "stream" as const, stream: "stdout" as const, text },
})

const cell = (id: string, language: "python" | "R", code: string, status: "running" | "ok" | "error" = "ok") => ({
  type: "cell" as const,
  id,
  language,
  code,
  status,
  startedAt: 0,
})

describe("cells()", () => {
  it("run_code 工具项 + 后续 kernelOutput 归同一 cell；到下一条 turn/tool/cell 为止", () => {
    const items: TranscriptItem[] = [
      { type: "turn", id: "u1", who: "user", text: "", final: true },
      tool("c1", "python", "x=1"),
      kout("k1", "python", "1"),
      kout("k2", "python", "2"),
      { type: "turn", id: "a1", who: "agent", text: "", final: true },
      tool("c2", "R", "1+1"),
      kout("k3", "R", "2"),
    ]
    const r = cells(items)
    expect(r.map((c) => [c.who, c.language, c.code, c.outputs.length])).toEqual([
      ["agent", "python", "x=1", 2],
      ["agent", "R", "1+1", 1],
    ])
    expect(r[0]?.n).toBe(1)
    expect(r[1]?.n).toBe(2)
  })

  it("你的 cell 项同样归并；status/runId 透传", () => {
    const items: TranscriptItem[] = [
      { type: "cell", id: "c1", language: "python", code: "x=1", status: "running", startedAt: 0, runId: "run-1" },
      kout("k1", "python", "1"),
    ]
    const r = cells(items)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      n: 1,
      who: "you",
      language: "python",
      code: "x=1",
      status: "running",
      runId: "run-1",
    })
    expect(r[0]?.outputs).toHaveLength(1)
  })

  it("cell 项的 interrupted 透传；没有就没有这个键（7.27）", () => {
    const r = cells([
      { type: "cell", id: "c1", language: "python", code: "loop", status: "error", startedAt: 0, endedAt: 1, interrupted: true },
      { type: "cell", id: "c2", language: "python", code: "1", status: "ok", startedAt: 2 },
    ])
    expect(r[0]?.interrupted).toBe(true)
    expect("interrupted" in r[1]!).toBe(false)
  })

  it("别的工具（bash/write）不算 cell；没有 run_code 的对话 → []", () => {
    const items: TranscriptItem[] = [
      { type: "turn", id: "u1", who: "user", text: "hi", final: true },
      { type: "tool", id: "t1", name: "bash", input: { command: "ls" }, status: "ok" },
      { type: "tool", id: "t2", name: "write", input: { path: "a.txt" }, status: "ok" },
      { type: "turn", id: "a1", who: "agent", text: "done", final: true },
    ]
    expect(cells(items)).toEqual([])
  })

  it("kernelOutput 出现在任何 cell 之前（孤儿输出）→ 归到一个 who: agent、code 为空的『（未记录代码）』cell，不丢", () => {
    const items: TranscriptItem[] = [kout("k1", "python", "1")]
    const r = cells(items)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      n: 1,
      who: "agent",
      code: "",
      status: "ok",
      orphan: true,
    })
    expect(r[0]?.outputs).toHaveLength(1)
  })

  it("孤儿输出没有 language → languageKnown false，不假装是 python", () => {
    const items: TranscriptItem[] = [kout("k1", undefined, "1")]
    const r = cells(items)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      who: "agent",
      orphan: true,
      languageKnown: false,
    })
    expect(r[0]?.language).toBeUndefined()
  })

  it("两台内核并存：输出按各自的 language 归位到匹配的 cell，不是硬塞给当前打开的那个", () => {
    const items: TranscriptItem[] = [
      { type: "turn", id: "u1", who: "user", text: "", final: true },
      cell("c1", "python", "a=1"),
      tool("c2", "R", "1+1"),
      kout("k1", "python", "…"),
      kout("k2", "R", "2"),
    ]
    const r = cells(items)
    expect(r).toHaveLength(2)
    const pythonCell = r.find((c) => c.language === "python")
    const rCell = r.find((c) => c.language === "R")
    expect(pythonCell?.outputs).toHaveLength(1)
    expect(pythonCell?.outputs[0]?.output).toMatchObject({ text: "…" })
    expect(rCell?.outputs).toHaveLength(1)
    expect(rCell?.outputs[0]?.output).toMatchObject({ text: "2" })
  })
})
