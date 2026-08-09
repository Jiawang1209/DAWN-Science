/**
 * 子 agent 定义的加载（①-B″ · S1 第一片）。
 *
 * 定义住在 `<project>/.dawn/agents/*.md`，markdown + YAML frontmatter。
 *
 * ## 与 pi 示例的一处**刻意不同**：不静默跳过
 *
 * pi 的 `agents.ts` 在 frontmatter 缺 `name` 或 `description` 时直接 `continue`——
 * 文件就这么消失了，没人知道。我们的规格 7.5 写着**失败必须出声**，
 * 所以读不进来的文件连同原因一起返回，由上层决定怎么呈现。
 *
 * 这条差别不是洁癖：agent 定义是**用户手写的 markdown**，写错 frontmatter
 * 是常态。静默跳过的表现是「我明明建了这个 agent，它却不在列表里」，
 * 而没有任何地方能查为什么。
 */
import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadSubagentDefinitions } from "../../src/subagent/definitions.js"

/** 建一个带 `.dawn/agents/` 的项目目录 */
function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "dawn-subagent-"))
  const dir = join(root, ".dawn", "agents")
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
  return root
}

const SCOUT = `---
name: scout
description: 快速踏勘代码库，返回压缩后的上下文
tools: read, grep, find, ls
model: deepseek-v4-flash
---

你是踏勘员。只读不写，返回要点。
`

describe("读得出定义", () => {
  it("name / description / systemPrompt 都读得到", () => {
    const root = project({ "scout.md": SCOUT })
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(problems).toEqual([])
    expect(agents).toHaveLength(1)
    expect(agents[0]!.name).toBe("scout")
    expect(agents[0]!.description).toContain("踏勘")
    expect(agents[0]!.systemPrompt.trim()).toBe("你是踏勘员。只读不写，返回要点。")
    expect(agents[0]!.model).toBe("deepseek-v4-flash")
    rmSync(root, { recursive: true, force: true })
  })

  it("tools 逗号分隔，切成数组", () => {
    const root = project({ "scout.md": SCOUT })
    expect(loadSubagentDefinitions(root).agents[0]!.tools).toEqual(["read", "grep", "find", "ls"])
    rmSync(root, { recursive: true, force: true })
  })

  it("**没写 tools 就是缺省，不是空数组** —— 缺失不等于「一个工具都不给」", () => {
    const root = project({
      "w.md": "---\nname: worker\ndescription: 通用\n---\n干活。\n",
    })
    expect(loadSubagentDefinitions(root).agents[0]!.tools).toBeUndefined()
    rmSync(root, { recursive: true, force: true })
  })

  it("非 .md 文件不参与", () => {
    const root = project({ "scout.md": SCOUT, "笔记.txt": "不是定义" })
    expect(loadSubagentDefinitions(root).agents).toHaveLength(1)
    rmSync(root, { recursive: true, force: true })
  })

  it("**顺序确定** —— 按文件名排序，不看文件系统的心情", () => {
    const mk = (n: string) => `---\nname: ${n}\ndescription: d\n---\nb\n`
    const root = project({ "c.md": mk("c"), "a.md": mk("a"), "b.md": mk("b") })
    expect(loadSubagentDefinitions(root).agents.map((a) => a.name)).toEqual(["a", "b", "c"])
    rmSync(root, { recursive: true, force: true })
  })
})

describe("读不出来的必须出声", () => {
  it("**缺 name 不静默跳过** —— pi 的示例在这里直接 continue，我们不", () => {
    const root = project({ "坏的.md": "---\ndescription: 没有名字\n---\n正文\n" })
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(agents).toEqual([])
    expect(problems).toHaveLength(1)
    expect(problems[0]!.filePath).toContain("坏的.md")
    expect(problems[0]!.reason).toContain("name")
    rmSync(root, { recursive: true, force: true })
  })

  it("缺 description 同样出声 —— 它是给模型看的选择依据，不是装饰", () => {
    const root = project({ "无描述.md": "---\nname: x\n---\n正文\n" })
    const { problems } = loadSubagentDefinitions(root)
    expect(problems).toHaveLength(1)
    expect(problems[0]!.reason).toContain("description")
    rmSync(root, { recursive: true, force: true })
  })

  it("**正文为空也出声** —— 空的 system prompt 会让子 agent 无所适从", () => {
    const root = project({ "空的.md": "---\nname: x\ndescription: d\n---\n\n" })
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(agents).toEqual([])
    expect(problems[0]!.reason).toMatch(/正文|system prompt/)
    rmSync(root, { recursive: true, force: true })
  })

  it("**重名出声，且保留先读到的那个** —— 静默覆盖会让人改错文件", () => {
    const mk = (d: string) => `---\nname: dup\ndescription: ${d}\n---\n正文\n`
    const root = project({ "a.md": mk("先"), "z.md": mk("后") })
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(agents).toHaveLength(1)
    expect(agents[0]!.description).toBe("先")
    expect(problems).toHaveLength(1)
    expect(problems[0]!.filePath).toContain("z.md")
    expect(problems[0]!.reason).toContain("dup")
    rmSync(root, { recursive: true, force: true })
  })

  /**
   * **这条是补写的：第一版正则把 `-` 一并排掉了，而 `code-reviewer` 是最常见的命名。**
   * 上面那些用例的名字全是单词（scout / dup / x），所以一个都没红。
   * 「合法的要放行」和「非法的要拦住」是两条规则，只测后者会漏掉这一半。
   */
  it("**连字符、下划线、中文名字都要放行** —— 只测「拦得住」会漏掉「放得过」", () => {
    const mk = (n: string) => `---\nname: ${n}\ndescription: d\n---\n正文\n`
    const root = project({
      "a.md": mk("code-reviewer"),
      "b.md": mk("数据_清洗"),
      "c.md": mk("踏勘员"),
    })
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(problems).toEqual([])
    expect(agents.map((a) => a.name).sort()).toEqual(["code-reviewer", "数据_清洗", "踏勘员"].sort())
    rmSync(root, { recursive: true, force: true })
  })

  it("名字里有空格要拒掉 —— 它要进进程参数与账本", () => {
    const root = project({ "空格.md": "---\nname: 有 空格\ndescription: d\n---\n正文\n" })
    expect(loadSubagentDefinitions(root).problems).toHaveLength(1)
    rmSync(root, { recursive: true, force: true })
  })

  it("**名字里带路径分隔符要拒掉** —— 它后面要进日志、进界面、进账本", () => {
    const root = project({ "坏名.md": "---\nname: ../跑出去\ndescription: d\n---\n正文\n" })
    const { agents, problems } = loadSubagentDefinitions(root)
    expect(agents).toEqual([])
    expect(problems).toHaveLength(1)
    rmSync(root, { recursive: true, force: true })
  })
})

describe("没有定义不是错误", () => {
  it("目录不存在 —— 空表，且**不报问题**", () => {
    const root = mkdtempSync(join(tmpdir(), "dawn-subagent-none-"))
    expect(loadSubagentDefinitions(root)).toEqual({ agents: [], problems: [] })
    rmSync(root, { recursive: true, force: true })
  })

  it("目录空着 —— 同样是空表", () => {
    const root = project()
    expect(loadSubagentDefinitions(root)).toEqual({ agents: [], problems: [] })
    rmSync(root, { recursive: true, force: true })
  })
})
