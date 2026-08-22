/**
 * 子 agent 名册（agents-roster，2026-08-22，学自 dsh-agency-agents）：三层、同名优先级、停用、分组；
 * 自带那 22 份都读得进来、名字是安全标识符、每份都有分组。
 */
import { describe, expect, it, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { loadSubagentsFrom } from "../../src/subagent/definitions.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const 写 = (dir: string, name: string, 头 = "") => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\ndescription: 说明 ${name}\n${头}---\n正文\n`)
}

describe("loadSubagentsFrom", () => {
  it("三层一起读、各带来源；同名项目 > 全局 > 自带，跨层同名不算问题", () => {
    const 箱 = mkdtempSync(join(tmpdir(), "dawn-roster-"))
    dirs.push(箱)
    写(join(箱, "builtin"), "a")
    写(join(箱, "builtin"), "b")
    写(join(箱, "global"), "b", "group: 写作\n")
    写(join(箱, "project"), "a")
    const r = loadSubagentsFrom([
      { dir: join(箱, "project"), from: "project" },
      { dir: join(箱, "global"), from: "global" },
      { dir: join(箱, "builtin"), from: "builtin" },
    ])
    expect(r.problems).toEqual([])
    expect(r.agents.map((x) => [x.name, x.from])).toEqual([["a", "project"], ["b", "global"]])
    expect(r.agents[1]?.group).toBe("写作")
  })
  it("同一层同名才是重复；目录不存在不是错误", () => {
    const 箱 = mkdtempSync(join(tmpdir(), "dawn-roster-"))
    dirs.push(箱)
    写(join(箱, "g"), "x")
    writeFileSync(join(箱, "g", "y.md"), "---\nname: x\ndescription: 又一个\n---\n正文\n")
    const r = loadSubagentsFrom([{ dir: join(箱, "g"), from: "global" }, { dir: join(箱, "没有"), from: "builtin" }])
    expect(r.agents).toHaveLength(1)
    expect(r.problems[0]?.reason).toContain("重复")
  })
  it("disabled: true 读出来带 disabled；tools 逗号分隔", () => {
    const 箱 = mkdtempSync(join(tmpdir(), "dawn-roster-"))
    dirs.push(箱)
    写(join(箱, "g"), "x", "disabled: true\ntools: read, grep\n")
    const r = loadSubagentsFrom([{ dir: join(箱, "g"), from: "global" }])
    expect(r.agents[0]).toMatchObject({ disabled: true, tools: ["read", "grep"] })
  })
})

describe("自带的 22 份", () => {
  it("全读得进来、没有问题、每份有分组、名字与文件名一致", () => {
    const r = loadSubagentsFrom([{ dir: resolve("agents"), from: "builtin" }])
    expect(r.problems).toEqual([])
    expect(r.agents).toHaveLength(22)
    for (const a of r.agents) {
      expect(a.group, a.name).toBeTruthy()
      expect(a.filePath.endsWith(`/${a.name}.md`), a.filePath).toBe(true)
      expect(a.systemPrompt).toContain("data/raw")
      expect(a.disabled).toBeUndefined()
    }
    expect(new Set(r.agents.map((a) => a.group)).size).toBeGreaterThanOrEqual(6)
  })
})
