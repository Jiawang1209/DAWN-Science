/**
 * 对话内核 · 状态跟踪（笔记本，2026-08-26）。
 *
 * 笔记本那格要显示「哪台内核在忙、哪台退出了」，还要能按一下「中断」——
 * 这两件事都落在 `挂载.ts`：它是唯一同时认识「对话」与「内核会话 id」的地方。
 *
 * 假内核照 `挂载.test.ts` 里「执行」那组的写法：能 start / attach / write / abort / stop，
 * 事件由测试主动 `发`。
 */
import { describe, expect, it } from "vitest"
import { 对话内核 } from "../../src/kernel/挂载.js"
import type { SessionId } from "../../src/runtime/types.js"

/** status 条目的最小合法 provenance（照 `src/kernel/outputs.ts` 的 `Provenance`） */
const provenance = { msgId: "m1", parentMsgId: "p1", timestamp: "2026-08-26T00:00:00Z" }

function 假内核(选: { 带abort?: boolean; 带variables?: boolean } = {}) {
  const 收到: string[] = []
  const 中断过: string[] = []
  const 问过变量: string[] = []
  const 听众 = new Map<string, Set<(e: unknown) => void>>()
  const runtime: Record<string, unknown> = {
    start: async (spec: { sessionId: string }) => ({ sessionId: spec.sessionId, pid: 0 }),
    attach: (id: string, sink: (e: unknown) => void) => {
      const set = 听众.get(id) ?? new Set()
      听众.set(id, set)
      set.add(sink)
      return () => set.delete(sink)
    },
    write: (_id: string, code: string) => {
      收到.push(code)
    },
    stop: async () => {},
  }
  if (选.带abort) runtime.abort = async (id: string) => void 中断过.push(id)
  if (选.带variables)
    runtime.variables = async (id: string) => {
      问过变量.push(id)
      return { supported: true, variables: [] }
    }
  const 发 = (id: string, e: unknown) => {
    for (const s of [...(听众.get(id) ?? [])]) s(e)
  }
  return { runtime: runtime as never, 收到, 中断过, 问过变量, 发 }
}

function 挂上(runtime: never, 状态变了?: (对话: SessionId) => void) {
  return new 对话内核({
    runtime,
    workspaceOf: () => "/w",
    sessionDirOf: () => "/d",
    interpreterOf: () => "/py",
    // exactOptionalPropertyTypes：没给就不写这个键
    ...(状态变了 ? { 状态变了 } : {}),
  })
}

const c1 = "c1" as SessionId

describe("对话内核 · 状态（笔记本，2026-08-26）", () => {
  it("没起 → 列表为空；起了 → idle；执行中 busy；idle 后回 idle，并且每一步都回调", async () => {
    const { runtime, 发 } = 假内核()
    const 变了: string[][] = []
    const k = 挂上(runtime, (对话) => 变了.push(k.状态列表(对话).map((s) => `${s.language}:${s.state}`)))
    expect(k.状态列表(c1)).toEqual([])

    const p = k.执行(c1, "python", "1+1")
    // start 解析、代码写进去之后：这一轮正在跑
    await new Promise((r) => setTimeout(r, 0))
    expect(k.状态列表(c1)).toEqual([{ language: "python", state: "busy" }])
    expect(变了).toContainEqual(["python:idle"]) // 起来时先是 idle
    expect(变了.at(-1)).toEqual(["python:busy"])

    发("c1::python", { kind: "kernel_output", sessionId: "c1::python", entry: { kind: "status", state: "idle", provenance } })
    await p
    expect(k.状态列表(c1)).toEqual([{ language: "python", state: "idle" }])
    expect(变了.at(-1)).toEqual(["python:idle"])
  })

  it("运行时自己发的 busy 也认——真内核每轮开头都吐一条 status: busy", async () => {
    const { runtime, 发 } = 假内核()
    const k = 挂上(runtime)
    await k.拿(c1, "R")
    发("c1::R", { kind: "kernel_output", sessionId: "c1::R", entry: { kind: "status", state: "busy", provenance } })
    expect(k.状态列表(c1)).toEqual([{ language: "R", state: "busy" }])
  })

  it("内核退出 → exited，并回调", async () => {
    const { runtime, 发 } = 假内核()
    const 变了: string[] = []
    const k = 挂上(runtime, (对话) => 变了.push(k.状态列表(对话).map((s) => s.state).join(",")))
    await k.拿(c1, "python")
    发("c1::python", { kind: "exited", sessionId: "c1::python", exitCode: 1 })
    expect(k.状态列表(c1)).toEqual([{ language: "python", state: "exited" }])
    expect(变了.at(-1)).toBe("exited")
  })

  it("两门语言各自跟踪，互不串", async () => {
    const { runtime, 发 } = 假内核()
    const k = 挂上(runtime)
    await k.拿(c1, "python")
    await k.拿(c1, "R")
    发("c1::R", { kind: "kernel_output", sessionId: "c1::R", entry: { kind: "status", state: "busy", provenance } })
    expect(k.状态列表(c1)).toEqual([
      { language: "python", state: "idle" },
      { language: "R", state: "busy" },
    ])
  })

  it("中断(对话, 语言) 调 runtime.abort(<对话>::<语言>)", async () => {
    const { runtime, 中断过 } = 假内核({ 带abort: true })
    const k = 挂上(runtime)
    await k.拿(c1, "python")
    await k.中断(c1, "python")
    expect(中断过).toEqual(["c1::python"])
  })

  it("没这台就抛「没有这台内核」；运行时没 abort 就抛「不支持中断」", async () => {
    const 无 = 假内核()
    await expect(挂上(无.runtime).中断(c1, "python")).rejects.toThrow(/没有这台内核/)
    const k = 挂上(无.runtime)
    await k.拿(c1, "python")
    await expect(k.中断(c1, "python")).rejects.toThrow(/不支持中断/)
  })

  it("收() 之后列表清空，并回调", async () => {
    const { runtime } = 假内核()
    const 变了: number[] = []
    const k = 挂上(runtime, (对话) => 变了.push(k.状态列表(对话).length))
    await k.拿(c1, "python")
    await k.收(c1)
    expect(k.状态列表(c1)).toEqual([])
    expect(变了.at(-1)).toBe(0)
  })

  it("内核会话id() / 变量() 按对话+语言找到那台；没有就 undefined", async () => {
    const { runtime, 问过变量 } = 假内核({ 带variables: true })
    const k = 挂上(runtime)
    expect(k.内核会话id(c1, "python")).toBeUndefined()
    expect(await k.变量(c1, "python")).toBeUndefined()
    await k.拿(c1, "python")
    expect(k.内核会话id(c1, "python")).toBe("c1::python")
    expect(await k.变量(c1, "python")).toEqual({ supported: true, variables: [] })
    expect(问过变量).toEqual(["c1::python"])
    // 运行时没有 variables 能力 → undefined，不抛
    const 无 = 假内核()
    const k2 = 挂上(无.runtime)
    await k2.拿(c1, "python")
    expect(await k2.变量(c1, "python")).toBeUndefined()
  })
})
