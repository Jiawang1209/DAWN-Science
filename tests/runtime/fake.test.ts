import { describe, expect, it } from "vitest"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { AgentEvent } from "../../src/runtime/types.js"

const spec = { sessionId: "s1", workspace: "/w", sessionDir: "/w/.dawn/s1" }

describe("FakeRuntime", () => {
  it("start 后 handle 带 pid，且发出 started 事件", async () => {
    const rt = new FakeRuntime()
    const events: AgentEvent[] = []
    rt.attach("s1", (e) => events.push(e))
    const handle = await rt.start(spec)
    expect(handle.pid).toBeGreaterThan(0)
    expect(events.map((e) => e.kind)).toContain("started")
  })

  it("write 的内容以 output 事件回放", async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const events: AgentEvent[] = []
    rt.attach("s1", (e) => events.push(e))
    rt.write("s1", "hello")
    expect(events).toContainEqual({ kind: "output", sessionId: "s1", data: "echo:hello" })
  })

  it("stop 后发出 exited 事件并带退出码", async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const events: AgentEvent[] = []
    rt.attach("s1", (e) => events.push(e))
    await rt.stop("s1")
    expect(events).toContainEqual({ kind: "exited", sessionId: "s1", exitCode: 0 })
  })

  it("多个观察者都能收到同一事件", async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const a: AgentEvent[] = []
    const b: AgentEvent[] = []
    rt.attach("s1", (e) => a.push(e))
    rt.attach("s1", (e) => b.push(e))
    rt.write("s1", "x")
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it("attach 返回的退订函数确实生效，且不影响其它观察者", async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const a: AgentEvent[] = []
    const b: AgentEvent[] = []
    const off = rt.attach("s1", (e) => a.push(e))
    rt.attach("s1", (e) => b.push(e))

    rt.write("s1", "one")
    off()
    rt.write("s1", "two")

    expect(a).toHaveLength(1) // 退订后不再收到
    expect(b).toHaveLength(2)
  })

  it("对未启动的会话 write 抛错", () => {
    const rt = new FakeRuntime()
    expect(() => rt.write("nope", "x")).toThrow(/nope/)
  })

  it("stop 后再 write 抛错 —— 会话已不存活", async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    await rt.stop("s1")
    expect(() => rt.write("s1", "x")).toThrow(/s1/)
  })

  it("stop 幂等：对已停止的会话再 stop 不重复发事件", async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const events: AgentEvent[] = []
    rt.attach("s1", (e) => events.push(e))
    await rt.stop("s1")
    await rt.stop("s1")
    expect(events.filter((e) => e.kind === "exited")).toHaveLength(1)
  })

  it("不同会话的事件互不串台", async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    await rt.start({ ...spec, sessionId: "s2", sessionDir: "/w/.dawn/s2" })
    const s1: AgentEvent[] = []
    const s2: AgentEvent[] = []
    rt.attach("s1", (e) => s1.push(e))
    rt.attach("s2", (e) => s2.push(e))

    rt.write("s1", "only-s1")

    expect(s1).toHaveLength(1)
    expect(s2).toHaveLength(0)
  })

  it("并存的会话各有不同 pid", async () => {
    const rt = new FakeRuntime()
    const h1 = await rt.start(spec)
    const h2 = await rt.start({ ...spec, sessionId: "s2", sessionDir: "/w/.dawn/s2" })
    expect(h1.pid).not.toBe(h2.pid)
  })
})
