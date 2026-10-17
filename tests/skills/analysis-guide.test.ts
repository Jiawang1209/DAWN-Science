import { describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join, resolve, relative } from "node:path"
import { loadSkills, formatSkillsForPrompt } from "@earendil-works/pi-coding-agent"
import { 读调用策略 } from "../../src/skills/invocation.js"

const root = resolve(import.meta.dirname, "../../skills/analyze-like-case")
const text = () => readFileSync(join(root, "SKILL.md"), "utf8")

describe("科研分析技能的发现与资源合同", () => {
  it("保留原调用标识和自动发现，描述能够匹配综合需求与单项案例需求", () => {
    const loaded = loadSkills({ cwd: root, agentDir: root, includeDefaults: false, skillPaths: [root] })
    expect(loaded.diagnostics).toEqual([])
    expect(loaded.skills.map((s) => s.name)).toEqual(["analyze-like-case"])
    expect(读调用策略(text())).toBe("model")
    const prompt = formatSkillsForPrompt(loaded.skills)
    expect(prompt).toMatch(/综合分析需求|完整分析路线/)
    expect(prompt).toMatch(/单项分析|具体分析/)
  })

  it("入口显式引用综合需求参考，引用的资源真实存在且位于该技能目录内", () => {
    const refs = [...text().matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((m) => m[1]!)
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      const path = resolve(root, ref)
      expect(relative(root, path)).not.toMatch(/^\.\./)
      expect(existsSync(path), ref).toBe(true)
      expect(readFileSync(path, "utf8").trim().length).toBeGreaterThan(0)
    }
  })

  it("不再把固定案例数量或 verified 静态状态承诺成当前环境运行验证", () => {
    expect(text()).not.toMatch(/\d+\s*篇都是跑过|全部.*(?:跑过|运行通过)/)
  })

  it("旧版选择前一律禁止 get_case 的规则不再与候选只读核对冲突", () => {
    expect(text()).not.toMatch(/不许顺手\s*[`]?get_case/)
  })
})
