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
import { test, expect, 开一段临时会话 } from "./fixtures.js"

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
    await page.getByRole("button", { name: "Agent Skills" }).click()

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
    await page.getByRole("button", { name: "Agent Skills" }).click()
    await page.getByText("往哪儿放？").click()
    await expect(page.locator(".mcp-how")).toContainText(/越靠上的那一份赢/)
    // **名字的形状要说**——它与今天那个「中文名让整段对话 400」是同一类
    await expect(page.locator(".mcp-how")).toContainText(/小写字母/)
  })

  test("**子 Agent 是另一屏**，两者不再共用一个词", async ({ dawn }) => {
    const { page } = dawn
    await page.getByRole("button", { name: "子 Agent" }).click()
    const 屏 = page.locator(".skills-page")
    await expect(屏).toContainText("子 Agent")
    /** 它说的是 `.dawn/agents/`，不是 skills */
    await expect(屏).toContainText(".dawn/agents")
    /** **两个入口都在侧栏上**，而且名字互不为子串 */
    await expect(page.getByRole("button", { name: "Agent Skills" })).toBeVisible()
    await expect(page.getByRole("button", { name: "子 Agent" })).toBeVisible()
  })
})
