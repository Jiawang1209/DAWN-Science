/**
 * 技能：**自带的那几个真的到了模型手上**（S20，2026-08-15）。**跑真实构建产物。**
 *
 * 作者要的是对标 Hermes / Codex 那套 skills。查下来 **pi 已经把标准实现完了**
 * （Agent Skills：发现、按 agentskills.io 的 XML 注入系统提示、`/skill:名` 展开、诊断），
 * 我们只做三件事：告诉它去哪儿找、带几个能用的、在屏上看得见。
 *
 * ## 为什么这条只能在真实产物上跑
 *
 * 中间隔着四层：构建有没有把 `skills/` 拷进 `dist` → `main.ts` 算的路径对不对 →
 * `wiring` 传没传 → 运行时 `extendResources` 在 `reload()` 之前还是之后。
 * **单元测试每一层都验过了，但它们证明不了这四层接在一起**——
 * 而本项目栽的三次（门、内核、MCP 装配）全是「每层都对，接线断了」。
 *
 * 判据挑**物证**：让假模型把系统提示里的技能名回显出来。
 * 屏幕上「看起来知道」是不算数的。
 */
import { test, expect, 开一段临时会话, 进设置 } from "./fixtures.js"

test.describe("自带技能", () => {
  /**
   * 让假模型**把它收到的系统提示原样回一句**。
   *
   * 假服务器会把整个请求体记下来（`requests`），所以这里不需要模型配合——
   * 直接翻它收到的东西即可。
   */
  test("**自带技能出现在发给模型的请求里**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("随便说一句")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    const 全部 = JSON.stringify(dawn.requests)
    /** 两个自带技能的名字都该在系统提示里 */
    expect(全部, "自带技能没进系统提示——四层接线断了一层").toContain("dataset-first-look")
    expect(全部).toContain("reproducible-analysis")
    /**
     * **教它怎么写技能的那一个**（2026-08-15 作者提的）。
     *
     * 作者：*「新建技能这个事儿应该不用单独去做吧？cursor、codex、hermes
     * 好像直接自然语言就可以新建一个技能。」*——他是对的：agent 本来就有
     * `write`，缺的不是能力是知识。所以不做按钮，做成一个技能来教它。
     */
    expect(全部, "教它写技能的那一个没进去").toContain("writing-skills")
    /**
     * **不只是名字，说明也要在**：只有名字的话，
     * 模型没法判断什么时候该用它——那等于没给。
     */
    expect(全部, "只给了名字没给说明").toMatch(/没见过的数据集|拿到一份/)
  })
})

/**
 * **两屏分开，名字按生态走**（2026-08-15 作者定的）。
 *
 * 此前「技能」一个词同时指两种东西：
 *   · Agent Skill = 写给模型读的说明书（模型自己判断何时用）
 *   · 子 agent   = 派一个分身去干活
 *
 * **两个不同的东西共用一个名字**，正是这个仓库最忌讳的含混。
 *
 * 判据挑「自带那两个真的列在屏上」——**空屏与「装配断了」长得一样**，
 * 只断言标题在的话，这条永远不会红。
 */
test.describe("两屏", () => {
  test("**Agent Skills 那屏列出了自带的那几个，并说清它们从哪儿来**", async ({ dawn }) => {
    const { page } = dawn
    await 进设置(page, "Skills")

    const 屏 = page.locator(".skills-page")
    await expect(屏).toContainText("dataset-first-look")
    await expect(屏).toContainText("reproducible-analysis")
    await expect(屏).toContainText("writing-skills")
    /** **来处要标出来**：自带的与你写的不是一回事 */
    await expect(屏).toContainText("自带")
    /** 说明也要在——只有名字的话，人看不出这个技能是干什么的 */
    await expect(屏).toContainText(/没见过的数据集|拿到一份/)
  })

  test("**「往哪儿放」说清三个目录与优先级**", async ({ dawn }) => {
    const { page } = dawn
    await 进设置(page, "Skills")
    await page.getByText("往哪儿放？").click()
    await expect(page.locator(".mcp-how")).toContainText(/越靠上的那一份赢/)
    // **名字的形状要说**——它与今天那个「中文名让整段对话 400」是同一类
    await expect(page.locator(".mcp-how")).toContainText(/小写字母/)
  })

  test("**子 Agent 是另一屏**，两者不再共用一个词", async ({ dawn }) => {
    const { page } = dawn
    await 进设置(page, "子 Agent")
    const 屏 = page.locator(".skills-page")
    await expect(屏).toContainText("子 Agent")
    /** 它说的是 `.dawn/agents/`，不是 skills */
    await expect(屏).toContainText(".dawn/agents")
    /** **两个入口都在设置的「扩展」一组里**（2026-08-23 从侧栏并进来的），而且名字互不为子串 */
    await expect(page.getByRole("button", { name: "Skills", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "子 Agent", exact: true })).toBeVisible()
    await expect(page.locator(".settings-nav-group")).toContainText("扩展")
  })
})

/**
 * **技能管理**（skills-manage，2026-08-21，学自 dsh-skills-manager）：三档开关写进 SKILL.md、
 * 导入（预检 → 撞名问覆盖 → 复制到位）、删除进废纸篓。全局技能目录由夹具隔离到临时目录。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const 技能文件 = (root: string, name: string, 正文 = "正文\n") => {
  mkdirSync(join(root, name), { recursive: true })
  writeFileSync(join(root, name, "SKILL.md"), `---\nname: ${name}\ndescription: 说明 ${name}\n# 注释\n---\n${正文}`)
}

test.describe("管理", () => {
  test("**三档开关写进 SKILL.md 的 frontmatter，别的一字不动；自带的没有开关**", async ({ dawn }) => {
    const { page, dir } = dawn
    const 全局 = join(dir, "skills")
    技能文件(全局, "my-skill")
    await 进设置(page, "Skills")
    const 屏 = page.locator(".skills-page")
    const 行 = 屏.locator(".skill-row", { hasText: "my-skill" })
    await expect(行).toBeVisible()
    await expect(行).toContainText("已启用")
    const 选 = async (档: string) => {
      await 行.getByRole("button", { name: "技能操作：my-skill" }).click()
      await page.getByRole("menu").getByRole("menuitemradio", { name: new RegExp(`${档}$`) }).click()
    }

    await 选("只手动")
    await expect(屏.locator('[role="status"]')).toContainText("改为只手动")
    await expect(行).toContainText("只能手动调用")
    expect(readFileSync(join(全局, "my-skill", "SKILL.md"), "utf8")).toBe("---\nname: my-skill\ndescription: 说明 my-skill\n# 注释\ndisable-model-invocation: true\n---\n正文\n")

    await 选("关")
    await expect(行).toContainText("已关")
    expect(readFileSync(join(全局, "my-skill", "SKILL.md"), "utf8")).toContain("user-invocable: false")

    await 选("开")
    await expect(行).toContainText("已启用")
    expect(readFileSync(join(全局, "my-skill", "SKILL.md"), "utf8")).toBe("---\nname: my-skill\ndescription: 说明 my-skill\n# 注释\n---\n正文\n")

    // 自带的：有「⋯」能换档、**没有「删除」**（文件在应用包里）；档位落在设置里，文件一字不动（2026-08-23 作者要的）
    const 自带行 = 屏.locator(".skill-row", { hasText: "writing-skills" })
    await expect(自带行).toBeVisible()
    await 自带行.getByRole("button", { name: /技能操作/ }).click()
    const 自带菜单 = page.getByRole("menu", { name: /技能操作/ })
    await expect(自带菜单.getByRole("menuitem", { name: "删除" })).toHaveCount(0)
    await 自带菜单.getByRole("menuitemradio", { name: /关$/ }).click()
    await expect(自带行).toContainText("关")
    // 切走再回来：存下去了
    await 进设置(page, "子 Agent")
    await 进设置(page, "Skills")
    await expect(屏.locator(".skill-row", { hasText: "writing-skills" })).toContainText("关")
    await 屏.locator(".skill-row", { hasText: "writing-skills" }).getByRole("button", { name: /技能操作/ }).click()
    await page.getByRole("menu", { name: /技能操作/ }).getByRole("menuitemradio", { name: /开$/ }).click()
    // 项目还没建 .dawn/skills 不算「读不进来」
    await expect(屏).not.toContainText("skill path does not exist")
  })

})

/** 导入：系统目录选择器是模态框，路径由夹具的 `pickDirectory` 注入——被替掉的只有「路径从哪来」这一步 */
const 来源 = mkdtempSync(join(tmpdir(), "dawn-skill-src-"))
技能文件(来源, "Fresh Skill")
技能文件(来源, "old-one", "新\n")
test.describe("导入", () => {
  test.use({ dawnOptions: { pickDirectory: 来源 } })

  test("**撞名先问，覆盖就换、不覆盖就跳过；说清导了几个**", async ({ dawn }) => {
    const { page, dir } = dawn
    const 全局 = join(dir, "skills")
    技能文件(全局, "old-one", "旧\n")
    await 进设置(page, "Skills")
    await page.getByRole("button", { name: "导入到你写的…" }).click()

    const 框 = page.getByRole("dialog")
    await expect(框).toContainText("已经有同名的技能：old-one")
    await 框.getByRole("button", { name: "只导没撞名的" }).click()
    const 状态 = page.locator(".skills-page [role=\"status\"]")
    await expect(状态).toContainText("导了 1 个：fresh-skill")
    await expect(状态).toContainText("跳过 1 个同名的")
    expect(existsSync(join(全局, "fresh-skill", "SKILL.md"))).toBe(true)
    expect(readFileSync(join(全局, "old-one", "SKILL.md"), "utf8")).toContain("旧")
    await expect(page.locator(".skills-page")).toContainText("fresh-skill")

    // 再来一次选「覆盖」
    await page.getByRole("button", { name: "导入到你写的…" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "覆盖", exact: true }).click()
    await expect(状态).toContainText("old-one（覆盖）")
    expect(readFileSync(join(全局, "old-one", "SKILL.md"), "utf8")).toContain("新")
  })
})

test.describe("删除", () => {
  test("**删除：确认后整个目录进废纸篓，列表里没了**", async ({ dawn }) => {
    const { page, dir } = dawn
    const 全局 = join(dir, "skills")
    技能文件(全局, "doomed")
    await 进设置(page, "Skills")
    const 行 = page.locator(".skills-page .skill-row", { hasText: "doomed" })
    await 行.getByRole("button", { name: "技能操作：doomed" }).click()
    await page.getByRole("menu").getByRole("menuitem", { name: "删除" }).click()
    const 框 = page.getByRole("dialog")
    await expect(框).toContainText("删掉技能「doomed」？")
    await 框.getByRole("button", { name: "移到废纸篓" }).click()
    await expect(page.locator(".skills-page [role=\"status\"]")).toContainText("已移到废纸篓")
    await expect(page.locator(".skills-page .skill-row", { hasText: "doomed" })).toHaveCount(0)
    await expect.poll(() => existsSync(join(全局, "doomed"))).toBe(false)
  })
})
