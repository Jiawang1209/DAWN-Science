/**
 * 技能：**pi 认得我们指的那两个目录**（S20，2026-08-15）。
 *
 * pi 自带 Agent Skills 的全套（发现、按 agentskills.io 的 XML 注入系统提示、
 * `/skill:名` 展开、诊断），**这一层我们不写**（路线图 S20 的原话）。
 * 我们只负责告诉它去哪儿找——而它默认的两个位置在我们这儿都不好使：
 *
 *   · `<agentDir>/skills`：我们的 agentDir 是**每会话一个**，
 *     放那儿等于每段会话各要放一份，也就是**等于不存在**
 *   · `<cwd>/.pi/skills`：我们自己的约定是 `.dawn/`
 *
 * 所以这一组盯的是那句接线。**直接调 pi 的 `loadSkills` 验的是 pi，
 * 摘掉接线照样绿**——本仓库为这个形状栽过三次（门、内核、MCP）。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadSkills } from "@earendil-works/pi-coding-agent"

let 根: string

beforeEach(() => {
  根 = mkdtempSync(join(tmpdir(), "dawn-skill-"))
})
afterEach(() => rmSync(根, { recursive: true, force: true }))

/** 按 Agent Skills 标准写一个：**一个文件夹 + SKILL.md** */
function 放一个(目录: string, 名: string, 说明 = "探针用") {
  mkdirSync(join(目录, 名), { recursive: true })
  writeFileSync(
    join(目录, 名, "SKILL.md"),
    `---\nname: ${名}\ndescription: ${说明}\n---\n\n# ${名}\n\n正文。\n`,
  )
}

describe("Agent Skills · 我们指的位置", () => {
  /**
   * **名字只能用小写字母、数字、连字符**——pi 的诊断里明写着。
   * 这条与今天那个「中文服务器名让整段对话 400」是同一类：
   * **名字要出境，形状由接收方定**。
   */
  it("pi 认 `<全局目录>` 与 `<工作区>/.dawn/skills`", () => {
    const 全局 = join(根, "DAWN", "skills")
    const 工作区 = join(根, "proj")
    放一个(全局, "global-one")
    放一个(join(工作区, ".dawn", "skills"), "project-one")

    const r = loadSkills({
      cwd: 工作区,
      agentDir: join(根, "agent"),
      // 装配传给 pi 的正是这两条
      skillPaths: [全局, join(工作区, ".dawn", "skills")],
      includeDefaults: false,
    })
    expect(r.skills.map((s) => s.name).sort()).toEqual(["global-one", "project-one"])
  })

  /** **正文进得了系统提示**——技能的全部作用就在这一步 */
  it("技能会被写进给模型的那段提示里", async () => {
    const 全局 = join(根, "DAWN", "skills")
    放一个(全局, "soil-eda", "土壤数据的探索性分析怎么做")
    const { formatSkillsForPrompt } = await import("@earendil-works/pi-coding-agent")
    const 提示 = formatSkillsForPrompt(
      loadSkills({ cwd: 根, agentDir: join(根, "a"), skillPaths: [全局], includeDefaults: false })
        .skills,
    )
    expect(提示).toContain("soil-eda")
    expect(提示, "只有名字没有说明，模型没法判断什么时候该用它").toContain("土壤数据")
  })

  /**
   * **写坏了要有诊断**，不是静静不出现。
   * 人写完一个技能发现它没生效、而屏幕上什么都没有，
   * 与 `.dawn/agents/` 那一屏当年的困惑是同一种（那屏为此专门端出 `problems`）。
   */
  it("frontmatter 缺 description 时给出诊断", () => {
    const 全局 = join(根, "DAWN", "skills")
    mkdirSync(join(全局, "broken"), { recursive: true })
    writeFileSync(join(全局, "broken", "SKILL.md"), `---\nname: broken\n---\n\n# 没有说明\n`)
    const r = loadSkills({
      cwd: 根,
      agentDir: join(根, "a"),
      skillPaths: [全局],
      includeDefaults: false,
    })
    expect(r.diagnostics.length, "写坏了却一声不吭").toBeGreaterThan(0)
  })
})

/**
 * **同名时谁赢**（2026-08-15 实测定的）。
 *
 * pi 按名字去重、**先到先得**——这不是我猜的，是拿同一份技能分别放前放后
 * 各跑一次量出来的（放前的赢）。所以我们给的顺序就是优先级：
 *
 *   项目级 > 全局 > 自带
 *
 * **自带的必须排最后**：否则你在 `~/DAWN/skills` 里写一个同名的却不生效，
 * 而屏幕上什么都看不出来——那种谜最难查。
 */
describe("同名时谁赢", () => {
  it("**靠前的赢** —— 这是 pi 的规则，我们的顺序据此排", () => {
    const 用户 = join(根, "user")
    const 自带 = join(根, "builtin")
    放一个(用户, "same-name", "你自己写的")
    放一个(自带, "same-name", "我们发的")

    const 赢的 = (paths: string[]) =>
      loadSkills({ cwd: 根, agentDir: join(根, "a"), skillPaths: paths, includeDefaults: false })
        .skills.find((s) => s.name === "same-name")?.description

    expect(赢的([用户, 自带]), "用户的排在前面却没赢").toBe("你自己写的")
    expect(赢的([自带, 用户]), "先到先得这条规则变了").toBe("我们发的")
  })
})
