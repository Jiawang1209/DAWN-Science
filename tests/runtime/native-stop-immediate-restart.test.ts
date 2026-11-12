import { expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CredentialStore } from "@earendil-works/pi-ai"
import { NativeRuntime } from "../../src/runtime/native.js"

it.each(["deepseek-flash", "missing-model"])("stop completion permits an immediate new generation without waiting for old start callers (%s)", async initialModel => {
  const root = mkdtempSync(join(tmpdir(), "dawn-stop-restart-"))
  const credentials: CredentialStore = {
    read: async () => ({ type: "api_key", key: "offline-only" }),
    list: async () => [], modify: async () => undefined, delete: async () => {},
  }
  const runtime = new NativeRuntime({ credentials })
  const spec = { sessionId: "restarting", workspace: root, sessionDir: join(root, "session"), native: { provider: "deepseek", model: "deepseek-flash" } }
  const original = Promise.allSettled([runtime.start({ ...spec, native: { ...spec.native, model: initialModel } })])
  try {
    await runtime.stop(spec.sessionId)
    await expect(runtime.start(spec)).resolves.toMatchObject({ sessionId: spec.sessionId })
    await expect(runtime.start(spec)).rejects.toThrow(/已经在运行/)
    expect((await original)[0]!.status).toBe("rejected")
  } finally {
    await original
    await runtime.stop(spec.sessionId)
    rmSync(root, { recursive: true, force: true })
  }
})
