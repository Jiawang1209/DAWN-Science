import { describe, expect, it } from "vitest"
import { LeaseManager } from "../../src/session/lease.js"

const T0 = new Date("2026-08-06T00:00:00Z")
const at = (secs: number) => new Date(T0.getTime() + secs * 1000)

describe("LeaseManager · 获取与抢占", () => {
  it("首次获取成功，持有者与过期时间正确", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    const lease = lm.acquire("s1", "engine", T0)
    expect(lease.holder).toBe("engine")
    expect(lease.expiresAt).toBe(at(60).toISOString())
    expect(lease.fingerprint).toMatch(/^[0-9a-f]{16}$/)
  })

  it("engine 不能抢占 user 持有的租约", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "user", T0)
    expect(() => lm.acquire("s1", "engine", at(1))).toThrow(/user/)
  })

  it("user 可以抢占 engine 持有的租约", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "engine", T0)
    const taken = lm.acquire("s1", "user", at(1))
    expect(taken.holder).toBe("user")
  })

  it("抢占被拒时，原租约不受影响", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    const original = lm.acquire("s1", "user", T0)
    expect(() => lm.acquire("s1", "engine", at(1))).toThrow()
    const still = lm.current("s1", at(2))
    expect(still?.holder).toBe("user")
    expect(still?.fingerprint).toBe(original.fingerprint)
  })

  it("同一持有者再次获取是续期，不算 takeover", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "engine", T0)
    const renewed = lm.acquire("s1", "engine", at(10))
    expect(renewed.expiresAt).toBe(at(70).toISOString())
    expect(lm.audit("s1").map((e) => e.action)).toEqual(["acquire", "acquire"])
  })

  it("过期后任何一方都可获取", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "user", T0)
    const lease = lm.acquire("s1", "engine", at(61))
    expect(lease.holder).toBe("engine")
  })

  it("过期后 current 返回 undefined", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "user", T0)
    expect(lm.current("s1", at(59))).toBeDefined()
    expect(lm.current("s1", at(61))).toBeUndefined()
  })

  it("时间戳不可回退", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "engine", at(10))
    expect(() => lm.acquire("s1", "user", at(5))).toThrow(/回退/)
  })
})

describe("LeaseManager · 预览", () => {
  it("夺权前可预览：告知当前持有者与是否会发生抢占", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "engine", T0)
    expect(lm.previewTakeover("s1", "user", at(1))).toEqual({
      sessionId: "s1",
      currentHolder: "engine",
      requester: "user",
      wouldPreempt: true,
      allowed: true,
    })
  })

  it("预览 engine 抢占 user：allowed 为 false", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "user", T0)
    expect(lm.previewTakeover("s1", "engine", at(1))).toMatchObject({
      currentHolder: "user",
      wouldPreempt: true,
      allowed: false,
    })
  })

  it("无人持有时预览：不抢占且允许", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    expect(lm.previewTakeover("s1", "engine", T0)).toEqual({
      sessionId: "s1",
      currentHolder: null,
      requester: "engine",
      wouldPreempt: false,
      allowed: true,
    })
  })

  it("预览不改变状态，也不写审计、不推进时间戳", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "engine", T0)
    lm.previewTakeover("s1", "user", at(100))
    expect(lm.current("s1", at(1))?.holder).toBe("engine")
    expect(lm.audit("s1")).toHaveLength(1)
    // 预览用了 at(100) 却不该推进时间戳，故 at(2) 仍然合法
    expect(() => lm.acquire("s1", "user", at(2))).not.toThrow()
  })
})

describe("LeaseManager · 审计", () => {
  it("每次转移都留审计事件", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "engine", T0)
    lm.acquire("s1", "user", at(1))
    lm.release("s1", at(2))
    expect(lm.audit("s1").map((e) => e.action)).toEqual(["acquire", "takeover", "release"])
  })

  it("过期也留审计：下次获取时补记 expire", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "user", T0)
    lm.acquire("s1", "engine", at(61))
    const actions = lm.audit("s1").map((e) => e.action)
    expect(actions).toEqual(["acquire", "expire", "acquire"])
    // expire 记的是失去写权的那一方
    expect(lm.audit("s1")[1]!.holder).toBe("user")
  })

  it("审计事件带指纹，且不同持有者指纹不同", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "engine", T0)
    lm.acquire("s1", "user", at(1))
    const [a, b] = lm.audit("s1")
    expect(a!.fingerprint).not.toBe(b!.fingerprint)
  })

  it("释放不存在的租约不报错也不留痕", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    expect(() => lm.release("s1", T0)).not.toThrow()
    expect(lm.audit("s1")).toEqual([])
  })

  it("release 后 current 为 undefined", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire("s1", "user", T0)
    lm.release("s1", at(1))
    expect(lm.current("s1", at(2))).toBeUndefined()
  })
})

describe("LeaseManager · 观察者", () => {
  it("观察者注册与控制权无关，多个观察者可共存", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.observe("s1", "client-a")
    lm.observe("s1", "client-b")
    expect(lm.observers("s1").sort()).toEqual(["client-a", "client-b"])
    expect(lm.current("s1")).toBeUndefined()
  })

  it("观察者退订生效，且不影响其他观察者", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    const off = lm.observe("s1", "client-a")
    lm.observe("s1", "client-b")
    off()
    expect(lm.observers("s1")).toEqual(["client-b"])
  })

  it("会话间的观察者互不串台", () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.observe("s1", "a")
    lm.observe("s2", "b")
    expect(lm.observers("s1")).toEqual(["a"])
    expect(lm.observers("s2")).toEqual(["b"])
  })
})
