/**
 * pi 扩展一律不加载（2026-09-28 审查）：`<工作区>/.pi/extensions` 与 `<会话目录>/pi/extensions` 里的代码
 * 会在建会话时被 pi 原样 import——它注册的工具不经过方案期门、也不经过权限门，还能 `setActiveTools` 把 pi 没套门的内置工具启用。
 * DAWN 自己的工具全走 `customTools`，一件扩展都不用；所以主会话与子 agent 都是 `noExtensions: true`。
 */
import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { SessionSpec } from "../../src/runtime/types.js"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"

const fakeCredentials = (): CredentialStore => ({
  async read(providerId): Promise<Credential | undefined> {
    return providerId === "deepseek" ? { type: "api_key", key: "sk-offline" } : undefined
  },
  async list(): Promise<readonly CredentialInfo[]> {
    return [{ providerId: "deepseek", type: "api_key" }]
  },
  async modify() {
    return undefined
  },
  async delete() {},
})

/** 一份被 import 就留下标记、还注册一件工具的扩展 */
const 扩展 = (标记: string) =>
  `import { writeFileSync } from "node:fs"\n` +
  `writeFileSync(${JSON.stringify(标记)}, "loaded")\n` +
  `export default function (pi) {\n` +
  `  writeFileSync(${JSON.stringify(标记)}, "factory")\n` +
  `  pi.registerTool({ name: "evil_ext", label: "evil", description: "x", parameters: { type: "object", properties: {} }, async execute() { return { content: [] } } })\n` +
  `}\n`

describe("pi 扩展不加载", () => {
  it("工作区 .pi/extensions 与会话目录 pi/extensions 里的扩展都不 import、它的工具不进会话", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dawn-noext-"))
    const sessionDir = join(dir, ".dawn")
    const 标记一 = join(dir, "ws-ext-loaded")
    const 标记二 = join(dir, "agent-ext-loaded")
    mkdirSync(join(dir, ".pi", "extensions"), { recursive: true })
    writeFileSync(join(dir, ".pi", "extensions", "evil.js"), 扩展(标记一))
    mkdirSync(join(sessionDir, "pi", "extensions"), { recursive: true })
    writeFileSync(join(sessionDir, "pi", "extensions", "evil2.js"), 扩展(标记二))

    const spec: SessionSpec = { sessionId: "x1", workspace: dir, sessionDir, native: { provider: "deepseek", model: "deepseek-flash" } }
    const rt = new NativeRuntime({ credentials: fakeCredentials() })
    rt.attach("x1", () => {})
    await rt.start(spec)
    const s = (rt as unknown as { sessions: Map<string, { session: { getAllTools(): { name: string }[] } }> }).sessions.get("x1")!.session
    expect(s.getAllTools().map((t) => t.name)).not.toContain("evil_ext")
    expect(existsSync(标记一)).toBe(false)
    expect(existsSync(标记二)).toBe(false)
    await rt.stop("x1")
  })
})
