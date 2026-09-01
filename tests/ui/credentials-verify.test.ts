/**
 * `loadCredentials` 的核验追问（审查 2026-08-29）。
 *
 * 有加密文件时，后端在钥匙串预热之前答不出哪些 key 解得开，回 `verified: false`；
 * 预热完没有人来推——凭证没有事件流——所以这边过几秒再问，直到答案核验过。
 * 追问有界，别无限打 IPC。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadCredentials } from "../../src/ui/state/sync.js"
import { $credentials, setCredentials } from "../../src/ui/state/catalog.js"

beforeEach(() => {
  vi.useFakeTimers()
  setCredentials({ configured: [] })
})
afterEach(() => vi.useRealTimers())

describe("loadCredentials —— verified: false 就过几秒再问", () => {
  it("**没核验的答案先用着，核验过的答案来了就换**；核验过之后不再问", async () => {
    let 核验过 = false
    const get = vi.fn(async () =>
      核验过
        ? { configured: [], broken: ["deepseek"], verified: true, encrypted: true }
        : { configured: ["deepseek"], broken: [], verified: false, encrypted: true },
    )
    await loadCredentials({ get } as never)
    expect($credentials.get().configured).toEqual(["deepseek"])
    expect(get).toHaveBeenCalledTimes(1)

    核验过 = true
    await vi.advanceTimersByTimeAsync(3_000)
    expect(get).toHaveBeenCalledTimes(2)
    expect($credentials.get().broken).toEqual(["deepseek"])
    expect($credentials.get().configured).toEqual([])

    await vi.advanceTimersByTimeAsync(60_000)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("**一直核验不了也有个头**：最多追 10 次", async () => {
    const get = vi.fn(async () => ({ configured: ["deepseek"], broken: [], verified: false }))
    await loadCredentials({ get } as never)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(get).toHaveBeenCalledTimes(11)
  })

  it("老后端不给 verified 字段 = 核验过，一次就完", async () => {
    const get = vi.fn(async () => ({ configured: ["deepseek"], encrypted: true }))
    await loadCredentials({ get } as never)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(get).toHaveBeenCalledTimes(1)
  })
})

/**
 * 追问的预算按**轮**算，不按整个进程算（审查 2026-09-01）。
 *
 * 四处调用点（启动、存 key、删 key、打开设置）各自都是一轮新的问；共用一个进程级计数器的话，
 * 启动那轮把 10 次用光之后，用户再打开设置看到的永远是预热前的答案——界面看着正常，那是最难查的一种坏。
 */
describe("loadCredentials —— 追问预算按轮算、同时只有一条链、抖一下不死", () => {
  it("(a) 一轮用光预算之后，**再来一问仍然会追**——预算属于这一轮，不属于整个进程", async () => {
    const get = vi.fn(async () => ({ configured: ["deepseek"], broken: [], verified: false }))
    await loadCredentials({ get } as never)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(get).toHaveBeenCalledTimes(11)

    // 用户打开设置：这是新的一轮，必须还能追
    await loadCredentials({ get } as never)
    expect(get).toHaveBeenCalledTimes(12)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(get).toHaveBeenCalledTimes(13)
  })

  it("(b) 两问同时在飞，**只留一条追问链**——不然两条链分一份预算，30 秒窗口塌成 15 秒", async () => {
    const get = vi.fn(async () => ({ configured: ["deepseek"], broken: [], verified: false }))
    await Promise.all([loadCredentials({ get } as never), loadCredentials({ get } as never)])
    expect(get).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_000)
    // 一条链一次追问：2 + 1，不是 2 + 2
    expect(get).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
    // 整个窗口仍是 10 次追问，不是两条链各 5 次就散
    await vi.advanceTimersByTimeAsync(120_000)
    expect(get).toHaveBeenCalledTimes(12)
  })

  it("(c1) 第一问就失败，出声；之后再问照样能追", async () => {
    let 坏 = true
    const get = vi.fn(async () => {
      if (坏) throw new Error("ipc 抖了一下")
      return { configured: ["deepseek"], broken: [], verified: false }
    })
    await loadCredentials({ get } as never)
    expect(get).toHaveBeenCalledTimes(1)

    坏 = false
    await loadCredentials({ get } as never)
    expect(get).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it("(c2) 追问途中抖一次，**链不能就此死掉**——屏上还是预热前的答案，核验过的答案得等得到", async () => {
    let 第几次 = 0
    const get = vi.fn(async () => {
      第几次 += 1
      if (第几次 === 2) throw new Error("ipc 抖了一下")
      if (第几次 >= 3) return { configured: [], broken: ["deepseek"], verified: true }
      return { configured: ["deepseek"], broken: [], verified: false }
    })
    await loadCredentials({ get } as never)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(get).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(get).toHaveBeenCalledTimes(3)
    expect($credentials.get().broken).toEqual(["deepseek"])
    // 核验过就停
    await vi.advanceTimersByTimeAsync(60_000)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it("(c2·有界) 一直失败也有个头：追问途中的失败一样吃这一轮的预算", async () => {
    let 第几次 = 0
    const get = vi.fn(async () => {
      第几次 += 1
      if (第几次 >= 2) throw new Error("一直坏")
      return { configured: ["deepseek"], broken: [], verified: false }
    })
    await loadCredentials({ get } as never)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(get).toHaveBeenCalledTimes(11)
  })
})
