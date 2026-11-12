import { expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CredentialStore } from "@earendil-works/pi-ai"
import { NativeRuntime } from "../../src/runtime/native.js"

it("a synchronous cleanup callback joins the existing stop instead of starting a second cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "dawn-reentrant-stop-"))
  const credentials: CredentialStore = { read: async () => ({ type: "api_key", key: "offline-only" }), list: async () => [], modify: async () => undefined, delete: async () => {} }
  let runtime: NativeRuntime
  let nested: Promise<void> | undefined
  let collections = 0
  const kernels = { 收: () => {
    if (++collections === 1) nested = runtime.stop("reentrant")
    return Promise.resolve({ 收了: [], 没收掉: [] })
  } }
  runtime = new NativeRuntime({ credentials, kernels: kernels as never })
  const spec = { sessionId: "reentrant", workspace: root, sessionDir: join(root, "session"), native: { provider: "deepseek", model: "deepseek-flash" } }
  try {
    await runtime.start(spec)
    const outer = runtime.stop(spec.sessionId)
    expect(nested).toBe(outer)
    await outer
    expect(collections).toBe(1)
    await expect(runtime.start(spec)).resolves.toMatchObject({ sessionId: spec.sessionId })
    await expect(runtime.start(spec)).rejects.toThrow(/已经在运行/)
  } finally {
    await nested
    await runtime.stop(spec.sessionId)
    rmSync(root, { recursive: true, force: true })
  }
})

it.each([false, true])("duplicate stop and restart stay behind blocked cleanup (already running=%s)", async running => {
  const root = mkdtempSync(join(tmpdir(), "dawn-stop-barrier-"))
  const credentials: CredentialStore = { read: async () => ({ type: "api_key", key: "offline-only" }), list: async () => [], modify: async () => undefined, delete: async () => {} }
  const release = Promise.withResolvers<void>()
  let collections = 0
  const kernels = { 收: async () => { collections++; await release.promise; return { 收了: [], 没收掉: [] } } }
  const runtime = new NativeRuntime({ credentials, kernels: kernels as never })
  const spec = { sessionId: "blocked", workspace: root, sessionDir: join(root, "session"), native: { provider: "deepseek", model: "deepseek-flash" } }
  const original = Promise.allSettled([runtime.start(spec)])
  try {
    if (running) await original
    const stopped = runtime.stop(spec.sessionId)
    expect(collections).toBe(1)
    expect(runtime.stop(spec.sessionId)).toBe(stopped)
    let finished = false
    void stopped.then(() => { finished = true })
    await expect(runtime.start(spec)).rejects.toThrow(/正在停止/)
    expect(finished).toBe(false)
    release.resolve()
    await stopped
    expect((await original)[0]!.status).toBe(running ? "fulfilled" : "rejected")
    await expect(runtime.start(spec)).resolves.toMatchObject({ sessionId: spec.sessionId })
    await expect(runtime.start(spec)).rejects.toThrow(/已经在运行/)
  } finally {
    release.resolve()
    await original
    await runtime.stop(spec.sessionId)
    rmSync(root, { recursive: true, force: true })
  }
})
