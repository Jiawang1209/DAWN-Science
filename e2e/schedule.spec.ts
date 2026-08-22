/**
 * 定时任务（schedule，2026-08-22，学自 dsh-automation）。真构建 + 假模型：
 * 建一条每天的 → 列表上有它、有下一次 → 「立即跑一次」→ 记录先「跑着」再「成功」、摘要是假模型那句 →
 * 点记录打开那段全新会话（标题带任务名）→ 暂停 → 删除（记录留着）。常驻那句「DAWN 关着的时候不跑」要在。
 */
import { test, expect, 在项目里开会话 } from "./fixtures.js"
import { CANNED_REPLY } from "../scripts/mock-inference-server.mjs"

test("**建一条、立即跑一次、记录成功、会话留在项目里；暂停与删除**", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByRole("button", { name: "定时", exact: true }).click()
  const 屏 = page.locator(".schedule-page")
  await expect(屏).toContainText("DAWN 关着的时候不跑")
  await expect(屏).toContainText("还没有定时任务")

  await 屏.getByRole("button", { name: "新建定时任务" }).click()
  const 表 = 屏.getByRole("form", { name: "新建定时任务" })
  await 表.getByLabel("名字").fill("早报")
  await 表.getByLabel("任务说明").fill("看看昨晚的数据")
  await 表.getByRole("radio", { name: "每天" }).click()
  await 表.getByLabel("几点").fill("09:00")
  await 表.getByRole("button", { name: "建好" }).click()

  const 行 = 屏.locator(".skill-row", { hasText: "早报" }).first()
  await expect(行).toBeVisible()
  await expect(行).toContainText("每天 09:00")
  await expect(行).toContainText("下一次")
  await expect(屏.locator('[role="status"]')).toContainText("「早报」建好了")

  // 立即跑一次：记录出现、然后成功，摘要是假模型那句
  await 行.getByRole("button", { name: "定时任务操作：早报" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "立即跑一次" }).click()
  const 记录 = 屏.locator(".schedule-runs .skill-row").first()
  await expect(记录).toBeVisible()
  await expect(记录).toContainText("成功", { timeout: 30_000 })
  await expect(记录).toContainText(CANNED_REPLY)
  await expect(记录).toContainText("手动")
  await expect(行).toContainText("上次成功")

  // 点记录 = 打开那段会话；它是项目里一段全新会话，标题带任务名
  await 记录.getByRole("button").first().click()
  await expect(page.locator(".conv-title")).toContainText("早报 ·")
  await expect(page.locator(".conv-title")).toContainText(/早报 · \d{4}/)

  // 回去：暂停 → 标签「暂停中」、下一次没了；删除 → 列表空、记录还在
  await page.getByRole("button", { name: "定时", exact: true }).click()
  await 屏.locator(".skill-row", { hasText: "早报" }).first().getByRole("button", { name: "暂停" }).click()
  await expect(屏.locator(".skill-row", { hasText: "早报" }).first()).toContainText("暂停中")
  await expect(屏.locator(".skill-row", { hasText: "早报" }).first()).toContainText("不会再跑")
  await 屏.locator(".skill-row", { hasText: "早报" }).first().getByRole("button", { name: "定时任务操作：早报" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "删除" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "删掉它" }).click()
  await expect(屏).toContainText("还没有定时任务")
  await expect(屏.locator(".schedule-runs .skill-row")).toHaveCount(1)
})

test("**坏输入当场说**：没填说明、每周一天没选", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByRole("button", { name: "定时", exact: true }).click()
  const 屏 = page.locator(".schedule-page")
  await 屏.getByRole("button", { name: "新建定时任务" }).click()
  const 表 = 屏.getByRole("form", { name: "新建定时任务" })
  await 表.getByLabel("名字").fill("x")
  await 表.getByRole("button", { name: "建好" }).click()
  await expect(屏.locator('[role="status"]')).toContainText("名字和任务说明都要填")
  await 表.getByLabel("任务说明").fill("y")
  await 表.getByRole("radio", { name: "每周" }).click()
  await 表.getByRole("button", { name: "一", exact: true }).click() // 取消默认勾的周一
  await 表.getByRole("button", { name: "建好" }).click()
  await expect(屏.locator('[role="status"]')).toContainText("每周至少选一天")
})
