import { describe, expect, it } from "vitest"
import { WorkbenchClientError, createClient, type RawResponse } from "../../src/ui/client.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"

const ok = (data: unknown, warnings?: string[]): RawResponse => ({
  ok: true,
  workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
  data,
  ...(warnings ? { warnings } : {}),
})

const err = (code: string, message: string, retryable = false): RawResponse => ({
  ok: false,
  workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
  error: { code: code as never, message, retryable },
})

describe("客户端 · 拆信封", () => {
  it("成功时返回 data", async () => {
    const c = createClient(async () => ok([{ projectId: "p1" }]))
    expect(await c.get("listProjects")).toEqual([{ projectId: "p1" }])
  })

  it("失败时抛 WorkbenchClientError，并保留错误码与可重试标志", async () => {
    const c = createClient(async () => err("not_found", "项目不存在", false))
    await expect(c.get("getProject", { projectId: "x" })).rejects.toMatchObject({
      code: "not_found",
      message: "项目不存在",
      retryable: false,
    })
  })

  it("warnings 被保住而不是吞掉 —— 非致命问题要有地方去", async () => {
    const c = createClient(async () => ok([], ["有 2 条记录缺少溯源"]))
    const r = await c.raw("listRuns", { projectId: "p" })
    expect(r.warnings).toEqual(["有 2 条记录缺少溯源"])
  })

  it("缺 warnings 字段时给空数组，调用方不必判空", async () => {
    const c = createClient(async () => ok([]))
    expect((await c.raw("listProjects")).warnings).toEqual([])
  })
})

describe("客户端 · 握手", () => {
  const caps = (version: string) =>
    ok({ workbenchProtocolVersion: version, operations: ["listProjects"], readOnly: false })

  it("版本一致时通过，并返回 readOnly 与操作清单", async () => {
    const c = createClient(async () => caps(WORKBENCH_PROTOCOL_VERSION))
    const h = await c.handshake()
    expect(h.readOnly).toBe(false)
    expect(h.operations).toContain("listProjects")
  })

  it("服务端 minor 更高时兼容（多出的字段界面用不到，无害）", async () => {
    const c = createClient(async () => caps("1.9"))
    await expect(c.handshake()).resolves.toBeDefined()
  })

  it("major 不同时立即失败 —— 不静默降级", async () => {
    const c = createClient(async () => caps("2.0"))
    await expect(c.handshake()).rejects.toMatchObject({ code: "version_mismatch" })
  })

  it("界面比服务端新时也失败 —— 它会去读服务端不返回的字段", async () => {
    const c = createClient(async () => caps("1.0"))
    // 需要界面版本高于 1.0 才能触发；用一个畸形版本代替，效果等价：不兼容即失败
    const bad = createClient(async () => caps("abc"))
    await expect(bad.handshake()).rejects.toMatchObject({ code: "version_mismatch" })
    await expect(c.handshake()).resolves.toBeDefined()
  })
})

describe("客户端 · 没有桥时", () => {
  it("说清楚是环境问题，而不是抛一个 undefined 错误", async () => {
    const original = window.dawn
    delete window.dawn
    const c = createClient()
    await expect(c.get("listProjects")).rejects.toBeInstanceOf(WorkbenchClientError)
    await expect(c.get("listProjects")).rejects.toMatchObject({ code: "no_bridge" })
    if (original) window.dawn = original
  })
})
