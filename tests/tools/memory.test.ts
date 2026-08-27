/**
 * 记忆插件(2026-08-25,规格 specs/2026-08-25-记忆-design.md):
 * 名册第三条 / 开关 / propose 进队列不落盘 / skill_propose 校验。
 */
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { memory工具定义, memoryTools, type Memory开关 } from "../../src/tools/memory/index.js"
import { 插件册 } from "../../src/tools/plugins.js"
import { SuggestionQueue } from "../../src/memory/queue.js"

const 造依赖 = () => ({
  memoriesDir: mkdtempSync(join(tmpdir(), "mt-")),
  skillsDir: mkdtempSync(join(tmpdir(), "sk-")),
})

describe("记忆插件", () => {
  it("三工具三族;off 全关;插件册第三条", () => {
    const d = 造依赖()
    const 族们 = memory工具定义("/ws", d)
    expect(族们.map((f) => `${f.族}:${f.工具.length}`)).toEqual(["propose:1", "read:1", "skill:1"])
    const 全开: Memory开关 = { off: false, propose: true, read: true, skill: true }
    expect(memoryTools("/ws", 全开, d)).toHaveLength(3)
    expect(memoryTools("/ws", { ...全开, skill: false }, d)).toHaveLength(2)
    expect(memoryTools("/ws", { ...全开, off: true }, d)).toEqual([])
    expect(插件册.map((p) => p.id)).toEqual(["office", "browser", "memory"])
    expect(插件册[2]!.键).toBe("plugin.memory")
    expect(插件册[2]!.族们().reduce((n, f) => n + f.tools.length, 0)).toBe(3)
  })

  it("memory_propose 进队列不落盘;回执写明等确认", async () => {
    const d = 造依赖()
    const 工具 = memory工具定义("/ws", d).flatMap((f) => f.工具)
    const propose = 工具.find((t) => t.name === "memory_propose")!
    const r = await propose.execute({ target: "key", content: "端口 8080" })
    expect(r.content).toContain("确认")
    const q = new SuggestionQueue(join(d.memoriesDir, "SUGGESTIONS.jsonl"))
    expect(q.list()).toHaveLength(1)
    expect(q.list()[0]!.workspace).toBe("/ws")
  })

  it("memory_list 列存量;key 轨按 branch 参数过滤", async () => {
    const d = 造依赖()
    const ws = mkdtempSync(join(tmpdir(), "ws-"))
    const { MemoryStore } = await import("../../src/memory/store.js")
    const s = new MemoryStore(d.memoriesDir)
    s.add("key", "只在 dev", { workspace: ws, branches: ["dev"] })
    s.add("key", "全分支", { workspace: ws })
    const 工具 = memory工具定义(ws, d).flatMap((f) => f.工具)
    const list = 工具.find((t) => t.name === "memory_list")!
    const 全 = await list.execute({ target: "key" })
    expect(全.content).toContain("只在 dev")
    const 滤 = await list.execute({ target: "key", branch: "main" })
    expect(滤.content).not.toContain("只在 dev")
    expect(滤.content).toContain("全分支")
  })

  it("skill_propose 坏 frontmatter 响亮拒;好的进待确认", async () => {
    const d = 造依赖()
    const 工具 = memory工具定义("/ws", d).flatMap((f) => f.工具)
    const sp = 工具.find((t) => t.name === "skill_propose")!
    const 坏 = await sp.execute({ name: "x-y", body: "没有 frontmatter" })
    expect(坏.content).toMatch(/frontmatter|格式/)
    const 好 = await sp.execute({ name: "x-y", body: "---\nname: x-y\ndescription: 试\n---\n步骤" })
    expect(好.content).toContain("待确认")
  })
})


/** 技能沉淀指引（2026-08-27）：模型得知道**什么时候**问；只在装了 skill_propose 时追加进系统提示 */
describe("技能沉淀指引", () => {
  it("说清触发条件、先问再提、小事不问", async () => {
    const { 技能沉淀指引 } = await import("../../src/tools/memory/index.js")
    expect(技能沉淀指引).toContain("skill_propose")
    expect(技能沉淀指引).toContain("问用户")
    expect(技能沉淀指引).toContain("不要不问就提")
  })
  it("native 运行时只在 skill 族开着时追加（源码扫描）", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync(new URL("../../src/runtime/native.ts", import.meta.url), "utf8")
    expect(src).toContain("this.opts.memoryEnable?.().skill && !this.opts.memoryEnable().off ? [技能沉淀指引] : []")
  })
})
