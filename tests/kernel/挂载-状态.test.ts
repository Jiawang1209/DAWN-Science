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

function 假内核(选: { 带abort?: boolean; 带variables?: boolean; write抛?: boolean } = {}) {
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
      if (选.write抛) throw new Error("写不进去")
      收到.push(code)
    },
    stop: async (id: string) => 发(id, { kind: "exited", sessionId: id, exitCode: 0 }),
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

  it("收() 之后列表清空；回调在表里删完之后才叫", async () => {
    const { runtime } = 假内核()
    const 变了: number[] = []
    const k = 挂上(runtime, (对话) => 变了.push(k.状态列表(对话).length))
    await k.拿(c1, "python")
    变了.length = 0
    await k.收(c1)
    expect(k.状态列表(c1)).toEqual([])
    // stop 引出的 exited 不再推一遍（那时列表还有一项）；只有删完之后的那一次
    expect(变了).toEqual([0])
  })

  it("收() 之后内部监听已注销：旧内核会话上的事件不再改状态、不再回调", async () => {
    const { runtime, 发 } = 假内核()
    let 叫了 = 0
    const k = 挂上(runtime, () => void 叫了++)
    await k.拿(c1, "python")
    await k.收(c1)
    const 之前 = 叫了
    发("c1::python", { kind: "kernel_output", sessionId: "c1::python", entry: { kind: "status", state: "busy", provenance } })
    发("c1::python", { kind: "exited", sessionId: "c1::python", exitCode: 1 })
    expect(叫了).toBe(之前)
    expect(k.状态列表(c1)).toEqual([])
  })

  it("执行时 write 抛 → 不留 busy，回 idle 并回调", async () => {
    const { runtime } = 假内核({ write抛: true })
    const 变了: string[] = []
    const k = 挂上(runtime, (对话) => 变了.push(k.状态列表(对话).map((s) => s.state).join(",")))
    await expect(k.执行(c1, "python", "1")).rejects.toThrow(/写不进去/)
    expect(k.状态列表(c1)).toEqual([{ language: "python", state: "idle" }])
    expect(变了.slice(-2)).toEqual(["busy", "idle"])
  })

  it("同一台内核串行执行：第二段等第一段的 idle 才开始，各拿各的输出，中途一直 busy（审查 Critical）", async () => {
    /**
     * 异步假运行时：write 之后**隔几个 tick** 才回输出与 idle——真内核就是这样（要走一趟 ZMQ）。
     * 同步回 idle 的假运行时测不出这个 bug：两段 attach 的窗口根本不存在。
     */
    const 收到: string[] = []
    const 听众 = new Map<string, Set<(e: unknown) => void>>()
    let 完成第一段!: () => void
    const 第一段的门 = new Promise<void>((r) => (完成第一段 = r))
    const 发 = (id: string, entry: unknown) => {
      for (const s of [...(听众.get(id) ?? [])]) s({ kind: "kernel_output", sessionId: id, entry })
    }
    const runtime = {
      start: async (spec: { sessionId: string }) => ({ sessionId: spec.sessionId, pid: 0 }),
      attach: (id: string, sink: (e: unknown) => void) => {
        const set = 听众.get(id) ?? new Set()
        听众.set(id, set)
        set.add(sink)
        return () => set.delete(sink)
      },
      write: (id: string, code: string) => {
        收到.push(code)
        void (async () => {
          // 第一段要等测试放行才吐输出；第二段立刻吐。若没串行，第二段的输出会先到、被第一段收走
          if (code === "A") await 第一段的门
          else await Promise.resolve()
          发(id, { kind: "stream", stream: "stdout", text: `out-${code}`, provenance })
          await Promise.resolve()
          发(id, { kind: "status", state: "idle", provenance })
        })()
      },
      stop: async () => {},
    } as never
    const 变了: string[] = []
    const k = 挂上(runtime, (对话) => 变了.push(k.状态列表(对话).map((s) => s.state).join(",")))
    const pA = k.执行(c1, "python", "A")
    const pB = k.执行(c1, "python", "B")
    // 第二段还没送进内核：它在排队
    await new Promise((r) => setTimeout(r, 5))
    expect(收到).toEqual(["A"])
    expect(k.状态列表(c1)).toEqual([{ language: "python", state: "busy" }])
    完成第一段()
    const a = await pA
    expect(a.输出.map((e) => (e as { text?: string }).text)).toEqual(["out-A", undefined])
    const b = await pB
    expect(收到).toEqual(["A", "B"])
    expect(b.输出.map((e) => (e as { text?: string }).text)).toEqual(["out-B", undefined])
    expect(k.状态列表(c1)).toEqual([{ language: "python", state: "idle" }])
    // 两段之间不允许露出一个 idle：整个过程只有一次 busy、最后一次 idle
    expect(变了.filter((v) => v !== "")).toEqual(["idle", "busy", "idle"])
  })

  it("前一段抛了（write 抛）不拖住后一段：队列吞掉失败继续", async () => {
    let 抛 = true
    const { runtime, 发 } = 假内核()
    ;(runtime as { write: (id: string, code: string) => void }).write = (id, code) => {
      if (抛) { 抛 = false; throw new Error("写不进去") }
      queueMicrotask(() => 发(id, { kind: "kernel_output", sessionId: id, entry: { kind: "status", state: "idle", provenance } }))
      void code
    }
    const k = 挂上(runtime)
    const pA = k.执行(c1, "python", "A")
    const pB = k.执行(c1, "python", "B")
    await expect(pA).rejects.toThrow(/写不进去/)
    await expect(pB).resolves.toMatchObject({ 语言: "python" })
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
