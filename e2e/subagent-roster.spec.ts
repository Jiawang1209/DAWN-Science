/**
 * 子 agent 名册（agents-roster，2026-08-22，学自 dsh-agency-agents）：
 * ① 自带 22 份在「子 Agent」屏上，按组筛、搜；自带的没有「⋯」；
 * ② 你写的那份能停用（写进 frontmatter）、再启用；
 * ③ 命令面板里有「派子 agent」「按规矩聊」，选中往草稿写开头；
 * ④ **一份两用**：`/skill:名` 真的把人设送进了模型（假模型收到的请求里有那段正文）。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

test("**名册：22 份自带、分组与搜索、停用写进文件**", async ({ dawn }) => {
  const { page, dir } = dawn
  const 全局 = join(dir, "agents")
  mkdirSync(全局, { recursive: true })
  writeFileSync(join(全局, "my-helper.md"), "---\nname: my-helper\ndescription: 我自己写的帮手\ngroup: 写作与审查\n---\n你是帮手。\n")

  await expect(page.getByRole("button", { name: /^子 Agent/ })).toContainText("23")
  await page.getByRole("button", { name: /^子 Agent/ }).click()
  const 屏 = page.locator(".skills-page")
  await expect(屏).toContainText("23 个，23 个开着")
  await expect(屏.locator(".skill-row", { hasText: "stat-consultant" })).toContainText("自带")
  await expect(屏.locator(".skill-row", { hasText: "stat-consultant" })).toContainText("统计顾问")
  await expect(屏.locator(".skill-row", { hasText: "stat-consultant" }).getByRole("button", { name: /子 agent 操作/ })).toHaveCount(0)

  // 按组筛
  await 屏.getByRole("radio", { name: /^地理信息/ }).click()
  await expect(屏.locator(".skill-row")).toHaveCount(2)
  await 屏.getByRole("radio", { name: /^全部/ }).click()
  await 屏.getByLabel("搜子 agent").fill("帮手")
  await expect(屏.locator(".skill-row")).toHaveCount(1)
  await 屏.getByLabel("搜子 agent").fill("")

  // 停用你写的那份 → 文件里多一行；再启用 → 删掉那一行
  const 行 = 屏.locator(".skill-row", { hasText: "my-helper" })
  await 行.getByRole("button", { name: "子 agent 操作：my-helper" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "停用" }).click()
  await expect(行).toContainText("已停用")
  expect(readFileSync(join(全局, "my-helper.md"), "utf8")).toContain("disabled: true")
  await expect(屏).toContainText("23 个，22 个开着")
  // 侧栏的数跟着动（停用一个 → 22），不用等轮询
  await expect(page.getByRole("button", { name: /^子 Agent/ })).toContainText("22")
  await 行.getByRole("button", { name: "子 agent 操作：my-helper" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "启用" }).click()
  await expect(行).toContainText("已启用")
  expect(readFileSync(join(全局, "my-helper.md"), "utf8")).not.toContain("disabled")
  await expect(page.getByRole("button", { name: /^子 Agent/ })).toContainText("23")
})

test("**输入框按 `/`：只有技能与子 agent 的菜单，边打边筛；/skill:名 真把人设送进了模型**", async ({ dawn }) => {
  const { page, requests } = dawn
  await 开一段临时会话(page, "先说一句")
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("/")
  const 菜 = page.getByRole("listbox", { name: "技能与子 agent" })
  await expect(菜).toBeVisible()
  // 技能与子 agent 都在；命令面板那些（打开设置之类）不在
  await expect(菜.getByRole("option", { name: /writing-skills/ })).toBeVisible()
  await expect(菜.getByRole("option", { name: /统计顾问/ })).toBeVisible()
  await expect(菜).not.toContainText("打开设置")
  await expect(page.getByRole("dialog", { name: "命令面板" })).toHaveCount(0)

  // 边打边筛；回车选中第一条：子 agent → 草稿换成「用子 agent「…」来做：」
  await 框.fill("/统计顾问")
  await expect(菜.getByRole("option")).toHaveCount(1)
  await 框.press("Enter")
  await expect(框).toHaveValue("用子 agent「stat-consultant」来做：")
  await expect(菜).toHaveCount(0)

  // 技能那一条点了写 /skill:名
  await 框.fill("/writ")
  await 菜.getByRole("option", { name: /writing-skills/ }).click()
  await expect(框).toHaveValue("/skill:writing-skills ")

  await 框.fill("/skill:stat-consultant 我的数据是计数，该用什么模型")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => JSON.stringify(requests).includes("应用统计顾问"), { timeout: 30_000 }).toBe(true)
})
