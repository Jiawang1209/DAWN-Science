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
