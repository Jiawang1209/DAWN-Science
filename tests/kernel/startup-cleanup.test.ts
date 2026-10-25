import { expect, it, vi } from "vitest"
import { 对话内核 } from "../../src/kernel/挂载.js"
import type { SessionId } from "../../src/runtime/types.js"

function setup() {
  const gates: (() => void)[] = []
  const runtime = {
    start: vi.fn(async (spec: { sessionId: string }) => {
      await new Promise<void>(resolve => gates.push(resolve))
      return { sessionId: spec.sessionId, pid: 1 }
    }),
    stop: vi.fn(async () => {}),
    attach: vi.fn(() => () => {}),
    write: vi.fn(),
  }
  const changed = vi.fn()
  const kernels = new 对话内核({ runtime: runtime as never, workspaceOf: () => "/work", interpreterOf: () => "/python", sessionDirOf: () => "/session", 状态变了: changed })
  return { runtime, kernels, changed, gates }
}
const sid = "c" as SessionId
const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error: error as Error }))

it("启动期收等待晚到内核回收，旧代码不能写入或重新入表", async () => {
  const c = setup()
  const pending = outcome(c.kernels.执行(sid, "python", "print('must not run')"))
  await vi.waitFor(() => expect(c.gates).toHaveLength(1))
  let done = false
  const closing = c.kernels.收(sid).then(result => { done = true; return result })
  await new Promise(resolve => setImmediate(resolve))
  const premature = done
  c.gates[0]!()
  const closed = await closing
  expect(premature).toBe(false)
  expect(closed).toEqual({ 收了: ["python"], 没收掉: [] })
  expect((await pending).error?.message).toMatch(/清理|收掉|停止/)
  expect(c.runtime.stop).toHaveBeenCalledWith("c::python")
  expect(c.runtime.write).not.toHaveBeenCalled()
  expect(c.kernels.列(sid)).toEqual([])
  expect(c.changed.mock.calls.some(([, v]) => v.起来了)).toBe(false)
})

it("解释器还在读取时清理，晚到后不启动进程", async () => {
  let release!: (path: string) => void
  const gate = new Promise<string>(resolve => { release = resolve })
  const start = vi.fn()
  const kernels = new 对话内核({ runtime: { start } as never, workspaceOf: () => "/work", interpreterOf: () => gate, sessionDirOf: () => "/session" })
  const pending = outcome(kernels.拿(sid, "python"))
  const closing = kernels.收(sid)
  release("/python")
  await closing
  expect(start).not.toHaveBeenCalled()
  expect((await pending).error?.message).toMatch(/清理|收掉|停止/)
})

it("收全部与退出存活判断包括正在启动的两门语言", async () => {
  const c = setup()
  const requests = [outcome(c.kernels.拿(sid, "python")), outcome(c.kernels.拿(sid, "R"))]
  await vi.waitFor(() => expect(c.gates).toHaveLength(2))
  const hadResources = c.kernels.有活内核()
  const closing = c.kernels.收全部()
  c.gates.forEach(release => release())
  await closing
  expect(hadResources).toBe(true)
  expect(c.runtime.stop).toHaveBeenCalledTimes(2)
  expect(c.kernels.有活内核()).toBe(false)
  expect((await Promise.all(requests)).every(r => r.error)).toBe(true)
})

it("清理期间拒绝新请求，重复清理共享回收，清完可明确重开", async () => {
  const c = setup()
  const old = outcome(c.kernels.拿(sid, "python"))
  await vi.waitFor(() => expect(c.gates).toHaveLength(1))
  const a = c.kernels.收(sid), b = c.kernels.收(sid)
  const during = outcome(c.kernels.拿(sid, "python"))
  c.gates[0]!()
  await Promise.all([a, b, old])
  expect((await during).error?.message).toMatch(/清理|收掉|停止/)
  expect(c.runtime.stop).toHaveBeenCalledTimes(1)
  const fresh = c.kernels.拿(sid, "python")
  await vi.waitFor(() => expect(c.gates).toHaveLength(2))
  c.gates[1]!()
  await fresh
  expect(c.kernels.列(sid)).toEqual(["python"])
  await c.kernels.收(sid)
})

it("晚到实例回收失败按语言报告，其余继续回收", async () => {
  const c = setup()
  c.runtime.stop.mockImplementation(async (...args: unknown[]) => { if (args[0] === "c::python") throw new Error("stop failed") })
  const requests = [outcome(c.kernels.拿(sid, "python")), outcome(c.kernels.拿(sid, "R"))]
  await vi.waitFor(() => expect(c.gates).toHaveLength(2))
  const closing = c.kernels.收(sid)
  c.gates.forEach(release => release())
  const result = await closing
  await Promise.all(requests)
  expect(result).toEqual({ 收了: ["R"], 没收掉: [{ 语言: "python", 原因: "stop failed" }] })
  expect(c.kernels.列(sid)).toEqual([])
})

it("全局清理保留不同对话晚到实例的回收所有权", async () => {
  const c = setup()
  const requests = [outcome(c.kernels.拿(sid, "python")), outcome(c.kernels.拿("other", "R"))]
  await vi.waitFor(() => expect(c.gates).toHaveLength(2))
  const closing = c.kernels.收全部()
  c.gates.forEach(release => release())
  await closing
  await Promise.all(requests)
  expect(c.runtime.stop).toHaveBeenCalledTimes(2)
  expect(c.kernels.有活内核()).toBe(false)
})

it("清理正在运行的一台不等待另一门语言启动完成，旧排队代码不执行", async () => {
  const c = setup()
  const starting = c.kernels.拿(sid, "python")
  await vi.waitFor(() => expect(c.gates).toHaveLength(1))
  c.gates[0]!()
  await starting
  const first = outcome(c.kernels.执行(sid, "python", "first()"))
  await vi.waitFor(() => expect(c.runtime.write).toHaveBeenCalledTimes(1))
  const queued = outcome(c.kernels.执行(sid, "python", "must_not_run()"))
  const second = outcome(c.kernels.拿(sid, "R"))
  await vi.waitFor(() => expect(c.gates).toHaveLength(2))
  const closing = c.kernels.收(sid)
  await new Promise(resolve => setImmediate(resolve))
  const stoppedBeforeR = c.runtime.stop.mock.calls.length
  c.gates[1]!()
  await closing
  expect(stoppedBeforeR).toBe(1)
  expect((await Promise.all([first, queued, second])).every(result => result.error)).toBe(true)
  expect(c.runtime.write).toHaveBeenCalledTimes(1)
})

it("起来通知中立即清理，不再挂上晚到转发监听", async () => {
  let listeners = 0
  let closing: Promise<unknown> | undefined
  const runtime = {
    start: async (spec: { sessionId: string }) => ({ sessionId: spec.sessionId, pid: 1 }),
    stop: async () => {},
    attach: () => { listeners++; let active = true; return () => { if (active) { listeners--; active = false } } },
  }
  const kernels = new 对话内核({ runtime: runtime as never, workspaceOf: () => "/work", interpreterOf: () => "/python", sessionDirOf: () => "/session", 转发: () => {},
    状态变了: (_sid, v) => { if (v.起来了) closing = kernels.收(sid) } })
  const result = await outcome(kernels.拿(sid, "python"))
  await closing
  expect(result.error).toBeDefined()
  expect(listeners).toBe(0)
})
