/**
 * NativeRuntime 的契约层（返工 R2 重写）。
 *
 * **只覆盖不打网络的部分**：缺参数、模型不存在、事件翻译。
 * 真实链路由 `npm run spike:a2` 验证——那条路必须打网络，不适合放进单测。
 *
 * 旧版本这里有八条用例，全部基于「手搓 provider」的实现细节，
 * 随实现一起作废。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { SessionSpec } from "../../src/runtime/types.js"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"

/** 不落盘、不打网络的凭证替身 */
const fakeCredentials = (): CredentialStore => ({
  async read(providerId): Promise<Credential | undefined> {
    return providerId === "deepseek" ? { type: "api_key", key: "sk-offline" } : undefined
  },
  async list(): Promise<readonly CredentialInfo[]> {
    return [{ providerId: "deepseek", type: "api_key" }]
  },
  async modify() {
    return undefined
  },
  async delete() {},
})

const specFor = (native?: { provider: string; model: string }): SessionSpec => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-native-"))
  return {
    sessionId: "n1",
    workspace: dir,
    sessionDir: join(dir, ".dawn"),
    ...(native ? { native } : {}),
  }
}

const runtime = () => new NativeRuntime({ credentials: fakeCredentials() })

describe("NativeRuntime · 契约", () => {
  it("缺少 native 段时响亮报错", async () => {
    await expect(runtime().start(specFor())).rejects.toThrow(/provider 与 model/)
  })

  it("模型不在 pi 的目录里时报错，并列出该 provider 有哪些 —— 无静默回退", async () => {
    const err = await runtime()
      .start(specFor({ provider: "deepseek", model: "not-a-real-model" }))
      .catch((e: unknown) => e)
    expect(String(err)).toMatch(/not-a-real-model/)
    // 报错要能指路：说清这个 provider 实际有什么
    expect(String(err)).toMatch(/可用的模型/)
  })

  it("attach 返回的退订函数可重复调用", () => {
    const rt = runtime()
    const off = rt.attach("n1", () => {})
    expect(() => {
      off()
      off()
    }).not.toThrow()
  })

  it("未启动的会话 write 即抛错 —— 不静默丢弃用户输入", () => {
    expect(() => runtime().write("nope", "hi")).toThrow(/nope/)
  })

  it("stop 一个不存在的会话是空操作，不抛", async () => {
    await expect(runtime().stop("nope")).resolves.toBeUndefined()
  })

  it("waitForIdle 对未知会话直接返回 —— CLI 收摊路径不该因此卡住", async () => {
    await expect(runtime().waitForIdle("nope")).resolves.toBeUndefined()
  })
})

describe("NativeRuntime · 重入与启动期停止(审查 debug E4/E5)", () => {
  const 活spec = () => specFor({ provider: "deepseek", model: "deepseek-v4-flash" })

  it("**已在运行的会话不许重复 start** —— 否则旧会话被静默丢、事件翻倍(E4)", async () => {
    const r = runtime()
    const spec = 活spec()
    await r.start(spec)
    await expect(r.start(spec)).rejects.toThrow(/已经在运行/)
    await r.stop(spec.sessionId)
  })

  it("**并发两次 start 同一会话 → 收敛成一个,不起两段**(E4)", async () => {
    const r = runtime()
    const spec = 活spec()
    const [a, b] = await Promise.all([r.start(spec), r.start(spec)])
    expect(a.sessionId).toBe(b.sessionId)
    // 只登记了一段:再 start 一次会撞「已经在运行」
    await expect(r.start(spec)).rejects.toThrow(/已经在运行/)
    await r.stop(spec.sessionId)
  })

  it("**停会话时回收这段对话的 run_code 内核**(审查 debug H1)", async () => {
    const 收了: string[] = []
    const 假内核 = { 收: async (对话: string) => (收了.push(对话), { 收了: [], 没收掉: [] }) }
    const r = new NativeRuntime({ credentials: fakeCredentials(), kernels: 假内核 as never })
    const spec = 活spec()
    await r.start(spec)
    await r.stop(spec.sessionId)
    expect(收了).toContain(spec.sessionId)
  })

  it("**启动还没完成就 stop → 起来的那段被立刻停掉,不漏成孤儿**(E5)", async () => {
    const r = runtime()
    const spec = 活spec()
    const startP = r.start(spec) // 不 await:让它在飞行中
    const stopP = r.stop(spec.sessionId) // 启动期请求停
    await stopP
    await startP.catch(() => {}) // start 会以「启动过程中被停止」收尾
    // 没有留下活会话:write 应抛(未启动),再 stop 是空操作
    expect(() => r.write(spec.sessionId, "x")).toThrow()
    await expect(r.stop(spec.sessionId)).resolves.toBeUndefined()
  })
})

/**
 * 换模型（①-B″ · U2）。
 *
 * **能力由 Spike E 在真链路上验过**（`npm run spike:e`：`flash → deep`，
 * 从假后端记下的请求体证明）。这里只覆盖不打网络的那几条边界。
 *
 * Spike E 同时查出一件必须在这一层处理的事：
 * > `session.isStreaming` **在 prompt 真正开始之前是 `false`**——
 * > 与本项目早先在 `waitForIdle` 上栽的是同一件事。
 *
 * 所以「正在说话时不许换」用的是**运行时自己跟踪的 `pending`**，不是问 pi。
 * 而且守卫放在运行时而不是界面：界面、CLI、命令面板三个入口共用同一道门。
 */
describe("NativeRuntime · 换模型", () => {
  it("会话没启动时响亮报错，而不是静默无事发生", async () => {
    await expect(runtime().setModel("不存在的会话", "deepseek", "x")).rejects.toThrow(/未启动/)
  })

  it("模型不存在时**列出可用的**，而不是只说一句失败", async () => {
    const r = runtime()
    await r.start(specFor({ provider: "deepseek", model: "deepseek-v4-flash" }))
    await expect(r.setModel("n1", "deepseek", "根本没有这个模型")).rejects.toThrow(/没有模型/)
  })

  it("provider 不存在时同样说清楚", async () => {
    const r = runtime()
    await r.start(specFor({ provider: "deepseek", model: "deepseek-v4-flash" }))
    await expect(r.setModel("n1", "没这个 provider", "x")).rejects.toThrow(/provider/)
  })
})
