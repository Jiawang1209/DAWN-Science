import type { CredentialsPort } from "../../src/workbench/backend.js"

/** 测试用的内存凭证库。不落盘、不加密——测试要验的是行为，不是存储介质。 */
export function memoryCredentials(initial: Record<string, string> = {}): CredentialsPort {
  const store = new Map(Object.entries(initial))
  return {
    get: (id) => store.get(id),
    set: (id, secret) => void store.set(id, secret),
    delete: (id) => void store.delete(id),
    configured: () => [...store.keys()],
    isEncrypted: () => false,
  }
}
