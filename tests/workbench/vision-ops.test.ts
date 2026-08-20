/**
 * 视觉服务的三个协议操作（协议 7.12，2026-08-20）。
 * 盯的是：**密钥只进钥匙串、响应里永不回显**；「缺失不等于能用」的 ready 判定；
 * 保存后**当场生效**（同一个 registry 对象被原地更新）。
 */
import { describe, expect, it, afterEach } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function 起一套() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-vision-ops-"))
  dirs.push(dir)
  const configPath = join(dir, "providers.yaml")
  writeFileSync(configPath, "agents:\n  ds-chat:\n    kind: native\n    provider: deepseek\n    model: m\n    capabilities: [chat]\n", "utf8")

  const registry: ProviderRegistry = {
    agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } },
  }
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessions = new SessionManager({
    store: new SessionStore(db),
    registry,
    runtimes: { native: new FakeRuntime(), pty: new FakeRuntime() },
    workspaceRoot: tmpdir(),
  })
  const runs = new RunStore(db)
  const credentials = memoryCredentials()
  const backend = createWorkbenchBackend({
    projects: new ProjectManager({ projects: projectStore, sessions: new SessionStore(db), runs, registry }),
    projectStore,
    runs,
    sessions,
    credentials,
    registry,
    events: new SessionTranscripts({ terminalMaxChars: 10_000 }),
    tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    configPath,
  })
  /** 后端接口的响应按设计是 `unknown`（server.ts）——这里补回具体形状 */
  const 取 = () =>
    backend.getVision({}) as Promise<{ enabled: boolean; api: string; baseUrl?: string; model?: string; hasSecret: boolean; ready: boolean }>
  const 存 = (v: { enabled: boolean; baseUrl?: string; model?: string; secret?: string }) =>
    backend.saveVision(v) as Promise<{ ready: boolean }>
  const 试 = () => backend.testVision({}) as Promise<{ ok: boolean; text: string }>
  return { backend, registry, credentials, configPath, 取, 存, 试 }
}

describe("视觉服务的操作", () => {
  it("没配过：enabled false、ready false、hasSecret false", async () => {
    const { 取 } = 起一套()
    expect(await 取()).toEqual({
      enabled: false, api: "openai-completions", hasSecret: false, ready: false,
    })
  })

  it("**缺失不等于能用**：勾了但没密钥，ready 仍是 false", async () => {
    const { 存, 取 } = 起一套()
    const r = await 存({ enabled: true, baseUrl: "https://v.example/v1", model: "qwen-vl" })
    expect(r.ready).toBe(false)
    const 态 = await 取()
    expect(态.enabled).toBe(true)
    expect(态.ready).toBe(false)
  })

  it("三样齐了才 ready；**密钥只进钥匙串**，文件与响应里都没有", async () => {
    const { 存, 取, credentials, configPath, registry } = 起一套()
    const r = await 存({ enabled: true, baseUrl: "https://v.example/v1", model: "qwen-vl", secret: "sk-秘密" })
    expect(r.ready).toBe(true)
    expect(credentials.get("vision:apiKey")).toBe("sk-秘密")
    expect(readFileSync(configPath, "utf8")).not.toContain("sk-秘密")
    const 态 = await 取()
    expect(态.hasSecret).toBe(true)
    expect(JSON.stringify(态)).not.toContain("sk-秘密")
    // **当场生效**：同一个 registry 对象被原地更新（native 那头的 getter 读的就是它）
    expect(registry.vision?.model).toBe("qwen-vl")
  })

  it("**留空 = 不改动已存的那份**（作者截图上那句占位语的语义）", async () => {
    const { 存, credentials } = 起一套()
    await 存({ enabled: true, baseUrl: "https://v.example/v1", model: "m", secret: "第一份" })
    await 存({ enabled: true, baseUrl: "https://v.example/v1", model: "m2" })
    expect(credentials.get("vision:apiKey")).toBe("第一份")
  })

  it("testVision：没就绪时不出网，直说缺什么", async () => {
    const { 存, 试 } = 起一套()
    await 存({ enabled: true, model: "m" })
    const r = await 试()
    expect(r.ok).toBe(false)
    expect(r.text).toMatch(/API 地址.*API 密钥|缺/)
  })
})
