import { afterEach, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
const dirs: string[] = []
afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })) })

it.each([false, true])("Native stop 同步开始并等待内核清理，active=%s", async active => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const cleanup = vi.fn(() => gate)
  const rt = new NativeRuntime({ kernels: { 能起远端: () => false, 收: cleanup } as never, provenance: false, checkpoints: false,
    credentials: { read: async () => ({ type: "api_key", key: "offline" }), list: async () => [], modify: async () => undefined, delete: async () => {} } })
  if (active) {
    const dir = mkdtempSync(join(tmpdir(), "dawn-native-cleanup-")); dirs.push(dir)
    await rt.start({ sessionId: "s", workspace: dir, sessionDir: join(dir, ".dawn"), native: { provider: "deepseek", model: "deepseek-flash" } })
  }
  let stopped = false
  const closing = rt.stop("s").then(() => { stopped = true })
  try {
    expect(cleanup).toHaveBeenCalledWith("s")
    await new Promise(resolve => setImmediate(resolve))
    expect(stopped).toBe(false)
  } finally { release(); await closing }
})
