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

  await page.getByRole("button", { name: "子 Agent" }).click()
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
  await 行.getByRole("button", { name: "子 agent 操作：my-helper" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "启用" }).click()
  await expect(行).toContainText("已启用")
  expect(readFileSync(join(全局, "my-helper.md"), "utf8")).not.toContain("disabled")
})

test("**命令面板里派与聊；/skill:名 真把人设送进了模型**", async ({ dawn }) => {
  const { page, requests } = dawn
  await 开一段临时会话(page, "先说一句")
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("")
  await 框.press("/")
  const 面板 = page.getByRole("dialog", { name: "命令面板" })
  await page.getByRole("combobox", { name: "搜索命令" }).fill("统计顾问")
  await expect(面板.getByRole("option", { name: /派子 agent「统计顾问」/ })).toBeVisible()
  await 面板.getByRole("option", { name: /按「统计顾问」的规矩聊/ }).click()
  await expect(框).toHaveValue("/skill:stat-consultant ")

  await 框.fill("/skill:stat-consultant 我的数据是计数，该用什么模型")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => JSON.stringify(requests).includes("应用统计顾问"), { timeout: 30_000 }).toBe(true)
})
