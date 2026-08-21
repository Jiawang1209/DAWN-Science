/**
 * 技能管理三个操作（7.17，skills-manage）：守卫、写文件、落账、进废纸篓。
 * 学自 dsh-skills-manager 的测试口径：目录穿越名拒、只读根拒、改完的文件只动那两行。
 */
import { describe, expect, it, afterEach } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
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

const 技能 = (root: string, name: string) => {
  mkdirSync(join(root, name), { recursive: true })
  const f = join(root, name, "SKILL.md")
  writeFileSync(f, `---\nname: ${name}\ndescription: 说明 ${name}\n# 注释\n---\n正文\n`)
  return f
}

function 起一套() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-skill-ops-"))
  dirs.push(dir)
  const 全局 = join(dir, "global-skills")
  const 自带 = join(dir, "builtin-skills")
  技能(全局, "mine")
  技能(自带, "shipped")
  const registry: ProviderRegistry = { agents: { a: { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
  const db = new Database(":memory:")
  migrate(db)
  const projectStore = new ProjectStore(db)
  const sessionStore = new SessionStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: new FakeRuntime(), pty: new FakeRuntime() }, workspaceRoot: tmpdir() })
  const runs = new RunStore(db)
  const 扔了: string[] = []
  const 账: string[] = []
  const backend = createWorkbenchBackend({
    projects: new ProjectManager({ projects: projectStore, sessions: sessionStore, runs, registry }),
    projectStore,
    runs,
    sessions,
    credentials: memoryCredentials(),
    registry,
    events: new SessionTranscripts({ terminalMaxChars: 10_000 }),
    tasks: new TaskStore(db),
    scratchRoot: mkdtempSync(join(tmpdir(), "dawn-scratch-")),
    skills: { 全局目录: 全局, 自带目录: 自带, 项目目录名: ".dawn/skills" },
    trashItem: async (p) => {
      扔了.push(p)
      rmSync(p, { recursive: true, force: true })
    },
    记一次技能: (event, 路径, 详情) => 账.push(`${event}:${路径}${详情 ? `:${详情}` : ""}`),
  })
  return { backend, 全局, 自带, dir, 扔了, 账 }
}

describe("技能管理", () => {
  it("列表带三档与 mutable；改档只动那两行；落账", async () => {
    const { backend, 全局, 账 } = 起一套()
    const 文件 = join(全局, "mine", "SKILL.md")
    type 行 = { name: string; invocation: string; mutable: boolean; manualOnly: boolean }
    const 列 = async () => ((await backend.listAgentSkills({})) as { skills: 行[] }).skills
    expect((await 列()).find((s) => s.name === "mine")).toMatchObject({ invocation: "model", mutable: true })
    expect((await 列()).find((s) => s.name === "shipped")).toMatchObject({ mutable: false })

    await backend.setSkillInvocation({ filePath: 文件, mode: "off" })
    expect(readFileSync(文件, "utf8")).toBe(`---\nname: mine\ndescription: 说明 mine\n# 注释\ndisable-model-invocation: true\nuser-invocable: false\n---\n正文\n`)
    expect((await 列()).find((s) => s.name === "mine")).toMatchObject({ invocation: "off", manualOnly: true })
    await backend.setSkillInvocation({ filePath: 文件, mode: "model" })
    expect(readFileSync(文件, "utf8")).toBe(`---\nname: mine\ndescription: 说明 mine\n# 注释\n---\n正文\n`)
    expect(账).toEqual([`invocation:${文件}:off`, `invocation:${文件}:model`])
  })

  it("自带的拒改、拒删，并说清是自带的；别处的路径也拒", async () => {
    const { backend, 自带, dir } = 起一套()
    await expect(backend.setSkillInvocation({ filePath: join(自带, "shipped", "SKILL.md"), mode: "off" })).rejects.toThrow(/自带/)
    await expect(backend.deleteSkill({ filePath: join(自带, "shipped", "SKILL.md") })).rejects.toThrow(/自带/)
    writeFileSync(join(dir, "SKILL.md"), "---\nname: x\n---\n")
    await expect(backend.setSkillInvocation({ filePath: join(dir, "SKILL.md"), mode: "off" })).rejects.toThrow(/不在任何一个可改/)
    // 穿越：全局目录里更深一层的不算技能
    await expect(backend.setSkillInvocation({ filePath: join(自带, "..", "global-skills", "mine", "deep", "SKILL.md"), mode: "off" })).rejects.toThrow()
  })

  it("删除：整个目录进废纸篓、落账", async () => {
    const { backend, 全局, 扔了, 账 } = 起一套()
    await backend.deleteSkill({ filePath: join(全局, "mine", "SKILL.md") })
    expect(扔了).toEqual([join(全局, "mine")])
    expect(existsSync(join(全局, "mine"))).toBe(false)
    expect(账).toEqual([`delete:${join(全局, "mine")}`])
  })

  it("导入：预检报冲突、正式导入按开关；导进项目要 projectId", async () => {
    const { backend, 全局, dir, 账 } = 起一套()
    const 来源 = join(dir, "来源")
    技能(来源, "Fresh One")
    技能(来源, "mine")
    type 回 = { imported: { name: string; dest: string }[]; skipped: { name: string }[] }
    const 检 = await backend.importSkill({ source: 来源, to: "global", dryRun: true })
    expect(检).toMatchObject({ kind: "batch", pending: [{ name: "fresh-one" }], conflicts: [{ name: "mine" }], imported: [], failed: [] })
    const 导 = (await backend.importSkill({ source: 来源, to: "global", overwrite: false })) as 回
    expect(导.imported.map((x) => x.name)).toEqual(["fresh-one"])
    expect(导.skipped.map((x) => x.name)).toEqual(["mine"])
    expect(existsSync(join(全局, "fresh-one", "SKILL.md"))).toBe(true)
    expect(账).toEqual([`import:${join(全局, "fresh-one")}:${来源}`])

    await expect(backend.importSkill({ source: 来源, to: "project" })).rejects.toThrow(/哪个项目/)
    const 工作区 = join(dir, "proj")
    mkdirSync(工作区)
    const p = (await backend.openProject({ workspace: 工作区 })) as { projectId: string }
    const 进项目 = (await backend.importSkill({ source: join(来源, "mine"), to: "project", projectId: p.projectId })) as 回
    expect(进项目.imported[0]?.dest).toBe(join(工作区, ".dawn/skills", "mine"))
  })
})
