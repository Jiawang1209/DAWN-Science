/**
 * 「填了 key 就够了」的另一半（B8，2026-09-01）：**挑不出模型时不许静默跳过**。
 *
 * 此前 `确保配过key的都能用` 对「目录里没这家的模型」与「目录读炸了」一视同仁地 `continue`——
 * 全新用户填了一个好 key，向导亮起「已填」，点「开始使用」进去却一个 agent 都没有，
 * 哪儿都没有一句解释。这份用例盯的是：**理由要被记下来、从 `getProviders` 端出去**。
 */
import { describe, expect, it, vi } from "vitest"
import { createWorkbenchBackend, type CredentialsPort } from "../../src/workbench/backend.js"

function 假钥匙串(...有的: string[]): CredentialsPort {
  const 里面 = new Map(有的.map((id) => [id, "sk-测试"]))
  return {
    get: (id) => 里面.get(id),
    set: (id, s) => void 里面.set(id, s),
    delete: (id) => void 里面.delete(id),
    configured: () => [...里面.keys()],
    isEncrypted: () => true,
  }
}

type 返回 = {
  agents: { agentId: string; kind: string }[]
  unusable?: { providerId: string; reason: string }[]
}

function 起一套(available: (providerId: string) => Promise<string[]>, names?: () => Promise<Record<string, string>>) {
  const registry = { agents: {}, providers: {} }
  const backend = createWorkbenchBackend({
    // 只碰 getProviders，其余端口给到能构造出来即可（与 connections.test 同一做法）
    projects: {} as never,
    projectStore: {} as never,
    runs: {} as never,
    sessions: {} as never,
    registry: registry as never,
    events: {} as never,
    credentials: 假钥匙串("deepseek"),
    models: { available, ...(names ? { names } : {}) },
  })
  return { backend, registry, 取: () => backend.getProviders({}) as Promise<返回> }
}

describe("填了 key 但目录里挑不出模型（B8）", () => {
  it("目录里没这家的模型 → 不造 agent，且 unusable 里说清是哪家、为什么", async () => {
    const { 取 } = 起一套(async () => [])
    const r = await 取()
    expect(r.agents).toEqual([])
    expect(r.unusable).toHaveLength(1)
    expect(r.unusable![0]!.providerId).toBe("deepseek")
    expect(r.unusable![0]!.reason).toMatch(/deepseek/)
    expect(r.unusable![0]!.reason).toMatch(/没有.*模型/)
  })

  it("目录读炸了 → 原话进 reason（不再被 `.catch(() => [])` 吞成「没有模型」），并且出声到日志", async () => {
    const 吼 = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { 取 } = 起一套(async () => {
        throw new Error("models.json 解析失败")
      })
      const r = await 取()
      expect(r.agents).toEqual([])
      expect(r.unusable).toEqual([{ providerId: "deepseek", reason: expect.stringContaining("models.json 解析失败") }])
      expect(吼.mock.calls.some((c) => String(c[0]).includes("models.json 解析失败"))).toBe(true)
    } finally {
      吼.mockRestore()
    }
  })

  it("目录后来有了 → agent 造出来，理由随之撤掉（不留一条过期的红字）", async () => {
    let 目录: string[] = []
    const { 取 } = 起一套(async () => 目录)
    expect((await 取()).unusable).toHaveLength(1)
    目录 = ["deepseek-chat"]
    const r = await 取()
    expect(r.agents.map((a) => a.agentId)).toEqual(["deepseek"])
    expect(r.unusable).toEqual([])
  })
})

/**
 * 两次 `getProviders` 叠着跑（2026-09-01 终审抓的）。
 *
 * 界面里这是常态：挂载时问一次（`App.tsx` 的 `loadProviders`），填完 key
 * `Promise.all([loadCredentials, loadProviders])` 又问一次，前一次往往还卡在
 * `models.available` 上。此前理由存在一张**共用的** Map 里、每次重算先 `clear()`：
 * 先起的那次记完理由、正等着显示名，后起的那次进来一清——先起的那次醒来端出去的是
 * `unusable: []`。它要是最后一个落地，向导的门就开了、也没人再问一次——B8 又回来了，只是变成偶发。
 */
describe("两次 getProviders 叠着跑（B8 的偶发版）", () => {
  /** 每次调用挂一个 deferred，测试按自己定的顺序一个个放行 */
  function 闸() {
    const 等着的: ((v: never) => void)[] = []
    return {
      开: <T,>() => new Promise<T>((r) => 等着的.push(r as (v: never) => void)),
      放行: (第几个: number, v: unknown) => 等着的[第几个]!(v as never),
      个数: () => 等着的.length,
    }
  }
  const 喘口气 = () => new Promise((r) => setTimeout(r, 0))

  it("先起的那次卡在显示名上时后起的那次进来了 ⇒ 两次端出去的都带理由，没有一次是空的", async () => {
    const 目录闸 = 闸()
    const 显示名闸 = 闸()
    const { 取 } = 起一套(
      () => 目录闸.开<string[]>(),
      () => 显示名闸.开<Record<string, string>>(),
    )
    // A：记完理由，停在「等显示名」
    const A = 取()
    await 喘口气()
    expect(目录闸.个数()).toBe(1)
    目录闸.放行(0, [])
    await 喘口气()
    expect(显示名闸.个数()).toBe(1)
    // B 进来：此前这一步会把 A 刚记的理由清掉
    const B = 取()
    await 喘口气()
    expect(目录闸.个数()).toBe(2)
    // A 先落地
    显示名闸.放行(0, {})
    const a = await A
    // 再放 B
    目录闸.放行(1, [])
    await 喘口气()
    显示名闸.放行(1, {})
    const b = await B
    expect(a.unusable, "先起的那次").toEqual([{ providerId: "deepseek", reason: expect.stringContaining("deepseek") }])
    expect(b.unusable, "后起的那次").toEqual([{ providerId: "deepseek", reason: expect.stringContaining("deepseek") }])
  })
})
