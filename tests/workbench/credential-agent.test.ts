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

function 起一套(available: (providerId: string) => Promise<string[]>) {
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
    models: { available },
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
