/** 子 agent 名册的操作（7.20）：三层列表、停用写 frontmatter、自带拒、导入两阶段、删进废纸篓 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
const 写 = (dir: string, name: string) => {
  mkdirSync(dir, { recursive: true })
  const f = join(dir, `${name}.md`)
  writeFileSync(f, `---\nname: ${name}\ndescription: 说明 ${name}\n# 注释\n---\n正文\n`)
  return f
}

function 起一套() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-agent-ops-"))
  dirs.push(dir)
  const 全局 = join(dir, "agents")
  const 自带 = join(dir, "builtin")
  写(全局, "mine")
  写(自带, "shipped")
  const registry: ProviderRegistry = { agents: { a: { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: new FakeRuntime(), pty: new FakeRuntime() }, workspaceRoot: tmpdir() })
  const runs = new RunStore(db)
  const 扔了: string[] = []
  const backend = createWorkbenchBackend({
    projects: new ProjectManager({ projects: projectStore, sessions: sessionStore, runs, registry }),
    projectStore, runs, sessions, credentials: memoryCredentials(), registry,
    events: new SessionTranscripts({ terminalMaxChars: 10_000 }), tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    subagents: { 全局目录: 全局, 自带目录: 自带 },
    trashItem: async (p) => { 扔了.push(p); rmSync(p, { force: true }) },
  })
  return { backend, 全局, 自带, dir, 扔了 }
}

describe("子 agent 名册", () => {
  it("没项目也能列：自带 + 你写的，带来源、mutable；停用写进 frontmatter 只动那一行；启用删掉那一行", async () => {
    const { backend, 全局 } = 起一套()
    type 行 = { name: string; from: string; mutable: boolean; disabled: boolean }
    const 列 = async () => ((await backend.listSubagents({})) as { agents: 行[]; dirs: Record<string, string> }).agents
    expect((await 列()).map((a) => [a.name, a.from, a.mutable])).toEqual([["mine", "global", true], ["shipped", "builtin", false]])
    const 文件 = join(全局, "mine.md")
    await backend.setSubagentEnabled({ filePath: 文件, enabled: false })
    expect(readFileSync(文件, "utf8")).toBe(`---\nname: mine\ndescription: 说明 mine\n# 注释\ndisabled: true\n---\n正文\n`)
    expect((await 列()).find((a) => a.name === "mine")?.disabled).toBe(true)
    await backend.setSubagentEnabled({ filePath: 文件, enabled: true })
    expect(readFileSync(文件, "utf8")).toBe(`---\nname: mine\ndescription: 说明 mine\n# 注释\n---\n正文\n`)
  })
  it("自带的拒改、拒删", async () => {
    const { backend, 自带 } = 起一套()
    await expect(backend.setSubagentEnabled({ filePath: join(自带, "shipped.md"), enabled: false })).rejects.toThrow(/自带/)
    await expect(backend.deleteSubagent({ filePath: join(自带, "shipped.md") })).rejects.toThrow(/自带/)
  })
  it("导入：预检报冲突；不覆盖跳过、覆盖换新；删进废纸篓", async () => {
    const { backend, 全局, dir, 扔了 } = 起一套()
    const 来源 = join(dir, "来源")
    写(来源, "fresh")
    const 冲 = 写(来源, "mine")
    writeFileSync(冲, 冲 && `---\nname: mine\ndescription: 新的\n---\n新正文\n`)
    const 检 = await backend.importSubagents({ source: 来源, to: "global", dryRun: true })
    expect(检).toMatchObject({ pending: [{ name: "fresh" }], conflicts: [{ name: "mine" }], failed: [] })
    const 导 = (await backend.importSubagents({ source: 来源, to: "global", overwrite: false })) as { imported: { name: string }[]; skipped: { name: string }[] }
    expect(导.imported.map((x) => x.name)).toEqual(["fresh"])
    expect(导.skipped.map((x) => x.name)).toEqual(["mine"])
    const 覆 = (await backend.importSubagents({ source: 来源, to: "global", overwrite: true })) as { imported: { name: string; overwritten: boolean }[] }
    expect(覆.imported.find((x) => x.name === "mine")?.overwritten).toBe(true)
    expect(readFileSync(join(全局, "mine.md"), "utf8")).toContain("新正文")
    await backend.deleteSubagent({ filePath: join(全局, "fresh.md") })
    expect(扔了).toEqual([join(全局, "fresh.md")])
    expect(existsSync(join(全局, "fresh.md"))).toBe(false)
  })
})
