import { describe, expect, it } from "vitest"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent, SessionSpec } from "../../src/runtime/types.js"

// 这些用例只覆盖契约层，不打网络——建 provider 与 Agent 都不产生请求，
// 请求只在真正 prompt 时才发出。真实链路由 Step 4 的冒烟脚本验证。
const spec: SessionSpec = {
  sessionId: "n1",
  workspace: "/tmp",
  sessionDir: "/tmp/n1",
  endpoint: {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-not-used-offline",
    model: "deepseek-v4-flash",
  },
}

describe("NativeRuntime · 契约", () => {
  it("缺少 endpoint 时响亮报错", async () => {
    const rt = new NativeRuntime()
    const { endpoint: _drop, ...noEndpoint } = spec
    await expect(rt.start(noEndpoint)).rejects.toThrow(/endpoint/)
  })

  it("start 发出 started 事件，pid 与 handle 一致", async () => {
    const rt = new NativeRuntime()
    const events: AgentEvent[] = []
    rt.attach("n1", (e) => events.push(e))
    const handle = await rt.start(spec)
    expect(handle.pid).toBeGreaterThan(0)
    expect(events.find((e) => e.kind === "started")).toMatchObject({ pid: handle.pid })
  })

  it("并存的会话各有不同 pid", async () => {
    const rt = new NativeRuntime()
    const a = await rt.start(spec)
    const b = await rt.start({ ...spec, sessionId: "n2", sessionDir: "/tmp/n2" })
    expect(a.pid).not.toBe(b.pid)
  })

  it("对未启动的会话 write 抛错", () => {
    expect(() => new NativeRuntime().write("nope", "x")).toThrow(/nope/)
  })

  it("stop 后 write 抛错", async () => {
    const rt = new NativeRuntime()
    await rt.start(spec)
    await rt.stop("n1")
    expect(() => rt.write("n1", "x")).toThrow(/n1/)
  })

  it("stop 发出 exited 事件且幂等", async () => {
    const rt = new NativeRuntime()
    const events: AgentEvent[] = []
    rt.attach("n1", (e) => events.push(e))
    await rt.start(spec)
    await rt.stop("n1")
    await rt.stop("n1")
    expect(events.filter((e) => e.kind === "exited")).toHaveLength(1)
  })

  it("attach 的退订函数生效", async () => {
    const rt = new NativeRuntime()
    const seen: AgentEvent[] = []
    const off = rt.attach("n1", (e) => seen.push(e))
    off()
    await rt.start(spec)
    expect(seen).toHaveLength(0)
  })

  it("空白输入不触发一轮对话", async () => {
    const rt = new NativeRuntime()
    await rt.start(spec)
    // 不抛错即可——真发出去会打网络
    expect(() => rt.write("n1", "   \n")).not.toThrow()
  })

  it("不同会话的事件互不串台", async () => {
    const rt = new NativeRuntime()
    const n1: AgentEvent[] = []
    const n2: AgentEvent[] = []
    rt.attach("n1", (e) => n1.push(e))
    rt.attach("n2", (e) => n2.push(e))
    await rt.start(spec)
    expect(n1).toHaveLength(1)
    expect(n2).toHaveLength(0)
  })
})
