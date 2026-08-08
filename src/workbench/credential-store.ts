/**
 * DAWN 的凭证库 → pi 的 `CredentialStore`（返工 R2/R3）。
 *
 * pi 的 `ModelRuntime.create({ credentials })` 接受任何实现了这个接口的对象，
 * 于是**加密仍由我们（Electron `safeStorage`）负责，凭证语义则与 pi 一致**。
 *
 * ## 为什么必须带缓存
 *
 * Spike A-2 实测：**单次会话里 pi 调用 `read()` 202 次**——它遍历全部 39 个
 * 内置 provider 探测可用性，且不止一轮。
 *
 * 一个直接透传的实现会因此触发 202 次 keychain 解密：不只是慢，
 * macOS 还可能弹权限提示。**缓存不是优化，是可用性前提。**
 *
 * 「没有」也要缓存——未配置的 provider 同样会被反复探测，而且占了这 202 次里的大多数。
 */
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"
import type { CredentialsPort } from "./backend.js"

/** 缓存里的一格。`undefined` 与「没缓存过」不同，故用包装对象区分。 */
interface Slot {
  value: Credential | undefined
}

export interface PiCredentialStore extends CredentialStore {
  /**
   * 丢弃缓存。改动凭证后必须调用，否则界面里刚填的 key 不会生效。
   * @param providerId 省略则清空全部
   */
  invalidate(providerId?: string): void
}

export function createPiCredentialStore(port: CredentialsPort): PiCredentialStore {
  const cache = new Map<string, Slot>()

  const load = (providerId: string): Credential | undefined => {
    const hit = cache.get(providerId)
    if (hit) return hit.value
    // **抛错不缓存**——一次瞬时故障（keychain 暂时不可用）不该被永久记住
    const secret = port.get(providerId)
    const value: Credential | undefined = secret ? { type: "api_key", key: secret } : undefined
    cache.set(providerId, { value })
    return value
  }

  return {
    async read(providerId) {
      return load(providerId)
    },

    /** **只报 id 与类型，绝不含密钥**——`list` 的语义就是「不暴露 secret」 */
    async list(): Promise<readonly CredentialInfo[]> {
      return port.configured().map((providerId) => ({ providerId, type: "api_key" as const }))
    },

    async modify(providerId, fn) {
      const next = await fn(load(providerId))
      // 返回 undefined 表示「不改动」，不是「删除」——删除走 delete()
      if (next === undefined) return load(providerId)
      if (next.type !== "api_key" || !next.key) {
        // DAWN 的凭证库只存 api_key。OAuth 一类凭证需要刷新流程，
        // **不支持就明说，不要静默存成别的东西**（规格 7.5）
        throw new Error(
          `DAWN 的凭证库只支持带 key 的 api_key 凭证，收到 "${next.type}"`,
        )
      }
      port.set(providerId, next.key)
      cache.set(providerId, { value: next })
      return next
    },

    async delete(providerId) {
      port.delete(providerId)
      cache.set(providerId, { value: undefined })
    },

    invalidate(providerId) {
      if (providerId === undefined) cache.clear()
      else cache.delete(providerId)
    },
  }
}
