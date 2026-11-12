import { expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CredentialStore } from "@earendil-works/pi-ai"
import { NativeRuntime } from "../../src/runtime/native.js"

it.each(["deepseek-flash", "missing-model"])("cancelled startup rejects every concurrent caller and allows a clean retry (%s)", async initialModel => {
  const root = mkdtempSync(join(tmpdir(), "dawn-start-cancel-"))
  const credentials: CredentialStore = {
    read: async () => ({ type: "api_key", key: "offline-only" }),
    list: async () => [], modify: async () => undefined, delete: async () => {},
  }
  const runtime = new NativeRuntime({ credentials })
  const spec = { sessionId: "starting", workspace: root, sessionDir: join(root, "session"), native: { provider: "deepseek", model: "deepseek-flash" } }
  try {
    const starts = Promise.allSettled([runtime.start({ ...spec, native: { ...spec.native, model: initialModel } }), runtime.start({ ...spec, native: { ...spec.native, model: initialModel } })])
    await runtime.stop(spec.sessionId)
    const results = await starts
    expect(results.map(result => result.status)).toEqual(["rejected", "rejected"])
    if (initialModel === "deepseek-flash") for (const result of results) if (result.status === "rejected") expect(String(result.reason)).toMatch(/停止/)
    expect(() => runtime.write(spec.sessionId, "must not be sent")).toThrow()
    await expect(runtime.start(spec)).resolves.toMatchObject({ sessionId: spec.sessionId })
  } finally {
    await runtime.stop(spec.sessionId)
    rmSync(root, { recursive: true, force: true })
  }
})
