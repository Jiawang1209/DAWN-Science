/**
 * 对话区顶上的会话分栏（2026-08-23 作者要的，照他给的截图）：同一个项目 / 同一台服务器下的会话横着排一行，
 * 点哪个切哪个，末尾「＋」在同一处再开一段。散的会话没有这一条。
 */
import { test, expect, 在项目里开会话, 开一段临时会话 } from "./fixtures.js"

test("**同一个项目下的会话横着排；点了切过去；＋ 在同一处再开一段；散的会话没有这一条**", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("第一段的话")
  await page.keyboard.press("Enter")
  await expect(page.getByText("假模型已应答").last()).toBeVisible({ timeout: 30_000 })
  await 在项目里开会话(page)

  const 栏 = page.getByRole("tablist", { name: "同一处的会话" })
  await expect(栏.getByRole("tab")).toHaveCount(2)
  await expect(栏.getByRole("tab", { selected: true })).toContainText("新会话")
  await 栏.getByRole("tab", { name: /第一段的话/ }).click()
  await expect(page.locator(".conv-title")).toHaveText("第一段的话")
  await expect(栏.getByRole("tab", { selected: true })).toContainText("第一段的话")
  // 侧栏那一列跟着亮——同一份状态，两个入口
  await expect(page.locator(".proj-session-list .sess-item.current")).toContainText("第一段的话")

  await 栏.getByRole("button", { name: "在这里再开一段" }).click()
  await expect(栏.getByRole("tab")).toHaveCount(3)
  await expect(page.locator(".proj-session-list .sess-item")).toHaveCount(3)

  // 散的会话：没有「同一处」
  await 开一段临时会话(page, "散的一段")
  await expect(page.getByRole("tablist", { name: "同一处的会话" })).toHaveCount(0)
})

test("**`@` 菜单与输入卡同宽**，不比它宽（2026-08-23 作者报的）", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("看 @")
  const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })
  await expect(菜单).toBeVisible()
  const 卡 = (await page.locator(".composer-box").boundingBox())!
  const 菜 = (await 菜单.boundingBox())!
  expect(Math.round(菜.x)).toBe(Math.round(卡.x))
  expect(Math.round(菜.width)).toBe(Math.round(卡.width))
})
