import { expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CredentialStore } from "@earendil-works/pi-ai"
import { NativeRuntime } from "../../src/runtime/native.js"

it.each(["snapshot", "started"] as const)("stop requested from the %s startup callback drains before a new generation", async phase => {
  const root = mkdtempSync(join(tmpdir(), "dawn-start-callback-"))
  const credentials: CredentialStore = { read: async () => ({ type: "api_key", key: "offline-only" }), list: async () => [], modify: async () => undefined, delete: async () => {} }
  const spec = { sessionId: "callback", workspace: root, sessionDir: join(root, "session"), native: { provider: "deepseek", model: "deepseek-flash" } }
  let stopping: Promise<void> | undefined
  const runtime = new NativeRuntime({ credentials, memorySnapshot: () => {
    if (phase === "snapshot" && !stopping) stopping = runtime.stop(spec.sessionId)
    return ""
  } })
  runtime.attach(spec.sessionId, event => {
    if (phase === "started" && event.kind === "started" && !stopping) stopping = runtime.stop(spec.sessionId)
  })
  const original = Promise.allSettled([runtime.start(spec)])
  try {
    const result = (await original)[0]!
    expect(stopping).toBeDefined()
    await stopping
    expect(result.status).toBe(phase === "snapshot" ? "rejected" : "fulfilled")
    const renewed = await runtime.start(spec)
    if (result.status === "fulfilled") expect(renewed.pid).not.toBe(result.value.pid)
    await expect(runtime.start(spec)).rejects.toThrow(/已经在运行/)
  } finally {
    await original
    await stopping
    await runtime.stop(spec.sessionId)
    rmSync(root, { recursive: true, force: true })
  }
})
