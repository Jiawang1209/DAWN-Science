import { describe, expect, it, vi } from "vitest"
import { createPiCredentialStore } from "../../src/workbench/credential-store.js"
import type { CredentialsPort } from "../../src/workbench/backend.js"

function port(entries: Record<string, string> = {}): CredentialsPort & { getCalls: string[] } {
  const getCalls: string[] = []
  const store = { ...entries }
  return {
    getCalls,
    get(id) {
      getCalls.push(id)
      return store[id]
    },
    set(id, secret) {
      store[id] = secret
    },
    delete(id) {
      delete store[id]
    },
    configured() {
      return Object.keys(store)
    },
    isEncrypted() {
      return true
    },
  }
}

describe("pi 凭证适配器 · 基本语义", () => {
  it("已配置的 provider 返回 api_key 凭证", async () => {
    const s = createPiCredentialStore(port({ deepseek: "sk-x" }))
    expect(await s.read("deepseek")).toEqual({ type: "api_key", key: "sk-x" })
  })

  it("未配置的返回 undefined —— 不是空 key", async () => {
    // 返回 `{key: ""}` 会让 pi 以为配好了，错误延后到 401 才暴露且信息量为零
    const s = createPiCredentialStore(port())
    expect(await s.read("deepseek")).toBeUndefined()
  })

  it("list 只报 id 与类型，不含密钥", async () => {
    const s = createPiCredentialStore(port({ deepseek: "sk-x", openai: "sk-y" }))
    const list = await s.list()
    expect(list.map((e) => e.providerId).sort()).toEqual(["deepseek", "openai"])
    expect(JSON.stringify(list)).not.toContain("sk-")
  })

  it("delete 落到底层并清掉缓存", async () => {
    const p = port({ deepseek: "sk-x" })
    const s = createPiCredentialStore(p)
    await s.read("deepseek")
    await s.delete("deepseek")
    expect(await s.read("deepseek")).toBeUndefined()
  })

  it("modify 写回底层，并让后续 read 看到新值", async () => {
    const p = port({ deepseek: "sk-old" })
    const s = createPiCredentialStore(p)
    await s.read("deepseek")
    await s.modify("deepseek", async () => ({ type: "api_key", key: "sk-new" }))
    expect(await s.read("deepseek")).toEqual({ type: "api_key", key: "sk-new" })
  })

  it("modify 返回 undefined 表示不改动", async () => {
    const p = port({ deepseek: "sk-x" })
    const s = createPiCredentialStore(p)
    await s.modify("deepseek", async () => undefined)
    expect(await s.read("deepseek")).toEqual({ type: "api_key", key: "sk-x" })
  })
})

describe("pi 凭证适配器 · 没核验之前不碰底层（2026-08-29 更新演练：pi 建目录时读每家凭证，读就是进钥匙串）", () => {
  it("**verified 为 false 时答「没有」、不穿透、不缓存**；核验过之后照常读", async () => {
    const p = port({ deepseek: "sk-x" })
    let verified = false
    const s = createPiCredentialStore({ ...p, verified: () => verified })
    expect(await s.read("deepseek")).toBeUndefined()
    expect(p.getCalls).toEqual([])
    verified = true
    expect(await s.read("deepseek")).toEqual({ type: "api_key", key: "sk-x" })
    expect(p.getCalls).toEqual(["deepseek"])
  })
})

describe("pi 凭证适配器 · 缓存（Spike A-2 的 202 次发现）", () => {
  it("重复 read 只穿透一次 —— 否则一次会话会触发上百次 keychain 解密", async () => {
    // Spike A-2 实测：pi 会遍历全部 39 个内置 provider 探测可用性，且不止一轮，
    // 单次会话共 202 次 read()。naive 实现会让 macOS 弹权限提示或明显卡顿。
    const p = port({ deepseek: "sk-x" })
    const s = createPiCredentialStore(p)
    for (let i = 0; i < 50; i++) await s.read("deepseek")
    expect(p.getCalls.length).toBe(1)
  })

  it("「没有」也要缓存 —— 未配置的 provider 同样会被反复探测", async () => {
    const p = port()
    const s = createPiCredentialStore(p)
    for (let i = 0; i < 50; i++) await s.read("anthropic")
    expect(p.getCalls.length).toBe(1)
  })

  it("set 之后缓存失效，能读到新值", async () => {
    const p = port()
    const s = createPiCredentialStore(p)
    expect(await s.read("deepseek")).toBeUndefined()
    p.set("deepseek", "sk-later")
    s.invalidate("deepseek")
    expect(await s.read("deepseek")).toEqual({ type: "api_key", key: "sk-later" })
  })

  it("invalidate 不带参数时清空全部", async () => {
    const p = port({ a: "1", b: "2" })
    const s = createPiCredentialStore(p)
    await s.read("a")
    await s.read("b")
    s.invalidate()
    await s.read("a")
    await s.read("b")
    expect(p.getCalls.length).toBe(4)
  })

  it("底层抛错时不缓存 —— 否则一次瞬时故障会被永久记住", async () => {
    let fail = true
    const p: CredentialsPort = {
      get: vi.fn(() => {
        if (fail) throw new Error("keychain 暂时不可用")
        return "sk-ok"
      }),
      set: () => {},
      delete: () => {},
      configured: () => [],
      isEncrypted: () => true,
    }
    const s = createPiCredentialStore(p)
    await expect(s.read("deepseek")).rejects.toThrow(/keychain/)
    fail = false
    expect(await s.read("deepseek")).toEqual({ type: "api_key", key: "sk-ok" })
  })
})
