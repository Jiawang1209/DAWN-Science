import { afterEach, describe, expect, it } from "vitest"
import { WorkbenchClientError, createClient, type RawResponse } from "../../src/ui/client.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"
import { $lang } from "../../src/ui/i18n/index.js"

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

/**
 * 后端错误的双语（B15，2026-09-01）。翻译在 `WorkbenchClientError` 的构造里做，
 * 于是几十处读 `e.message` 的 catch 一处不改就都拿到当前语言。
 */
describe("客户端 · 错误按当前语言显示", () => {
  const 抓 = async (p: Promise<unknown>): Promise<WorkbenchClientError> => {
    try {
      await p
    } catch (e) {
      return e as WorkbenchClientError
    }
    throw new Error("没抛")
  }
  const 带i18n = (): RawResponse => ({
    ok: false,
    workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
    error: { code: "not_found", message: "没有这个项目：p9", retryable: false, details: { i18n: { msgid: "没有这个项目：{0}", args: ["p9"] } } },
  })
  afterEach(() => $lang.set("zh"))

  it("英文界面：message 是英文，原文保留后端那句中文（日志要对得上后端）", async () => {
    $lang.set("en")
    const c = createClient(async () => 带i18n())
    const e = await 抓(c.get("getProject", { projectId: "p9" }))
    expect(e).toBeInstanceOf(WorkbenchClientError)
    expect(e.message).toBe("No such project: p9")
    expect(e.原文).toBe("没有这个项目：p9")
    expect(e.code).toBe("not_found")
  })

  it("中文界面：message 与后端渲染的那句逐字节相同", async () => {
    $lang.set("zh")
    const c = createClient(async () => 带i18n())
    const e = await 抓(c.get("getProject", { projectId: "p9" }))
    expect(e.message).toBe("没有这个项目：p9")
    expect(e.原文).toBe("没有这个项目：p9")
  })

  it("没有 details.i18n（原样透传的、internal_error 的、老后端的）→ message 原样，哪种语言都一样", async () => {
    $lang.set("en")
    const c = createClient(async () => err("conflict", "All configured authentication methods failed"))
    const e = await 抓(c.get("getProject", { projectId: "x" }))
    expect(e.message).toBe("All configured authentication methods failed")
  })

  it("details 长得不像 i18n（比如请求校验的 issues 数组）→ 不炸，message 原样", async () => {
    $lang.set("en")
    const c = createClient(async () => ({
      ok: false,
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      error: { code: "invalid_request", message: "请求不合契约", retryable: false, details: [{ path: ["agentId"] }] },
    }))
    const e = await 抓(c.get("getProject", { projectId: "x" }))
    expect(e.message).toBe("请求不合契约")
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
    /**
     * **写一个「一定比当前更高」的 minor**，而不是钉死某个数字。
     *
     * 2026-08-10 栽过：这里原来写死 `2.9`，而界面升到 `2.10` 之后
     * 服务端反倒更低了，这条测试于是在验一件与它标题相反的事。
     *
     * 顺带一提：**它红得对**。如果版本比较用的是字符串，
     * `"2.10" < "2.9"` 会让这条**意外通过**——那才是真正危险的绿。
     */
    const [maj, min] = WORKBENCH_PROTOCOL_VERSION.split(".").map(Number)
    const c = createClient(async () => caps(`${maj}.${min! + 1}`))
    await expect(c.handshake()).resolves.toBeDefined()
  })

  it("major 不同时立即失败 —— 不静默降级", async () => {
    /**
     * **同样从常量推**。2026-08-10 第二次栽在这里：这里原本写死 `"3.0"`，
     * 而界面升到 3.0 之后它就变成了「与自己相同的版本」，
     * 这条用例于是在验「相同 major 会失败」——一件与它标题相反的事。
     */
    const 大版本 = Number(WORKBENCH_PROTOCOL_VERSION.split(".")[0])
    const c = createClient(async () => caps(`${大版本 + 1}.0`))
    await expect(c.handshake()).rejects.toMatchObject({ code: "version_mismatch" })
  })

  it("界面比服务端新时失败 —— 它会去读服务端不返回的字段", async () => {
    // 界面现在是 1.1；服务端 1.0 缺少凭证那三个操作，握过手也用不了
    const older = createClient(async () => caps("1.0"))
    await expect(older.handshake()).rejects.toMatchObject({ code: "version_mismatch" })
  })

  it("畸形版本号一律判不兼容，而不是放行", async () => {
    const bad = createClient(async () => caps("abc"))
    await expect(bad.handshake()).rejects.toMatchObject({ code: "version_mismatch" })
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
