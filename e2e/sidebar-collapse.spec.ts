/**
 * 侧栏折叠：**内容被裁掉，不是被压扁**（2026-08-15 作者报的）。**跑真实构建产物。**
 *
 * 作者：*「折叠的动画效果太差了，很明显看到里面文字是挤压了。」*
 *
 * 根因是折叠动的是**网格列宽**（`--dawn-sidebar-w` → `0px`），
 * 而里面的内容跟着列宽走——于是那 0.25 秒里，每一行文字都在被压窄、重排。
 * 好的收合是**内容保持原宽、整体滑出去被裁掉**。
 *
 * ## 判据挑「动画中途内容还有多宽」
 *
 * 这是「被裁」与「被压」唯一分得开的地方：
 *   · 被裁：内容宽度不变，只是露出来的部分越来越少
 *   · 被压：内容宽度跟着容器一起缩
 *
 * 只看最终态是分不出来的——两种做法收完都是看不见。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**收起的过程中，里面的内容不被压窄**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("量一下折叠的动画")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 一行 = page.locator(".session-list li .row").first()
  const 宽 = async () => Math.round((await 一行.boundingBox())!.width)

  const 收起前 = await 宽()
  expect(收起前, "侧栏本来就是空的，这条用例测不到东西").toBeGreaterThan(100)

  await page.getByRole("button", { name: "收起侧边栏" }).click()
  /**
   * **动画途中量一次**（那条 transition 是 0.25s）。
   * 120ms 落在中间：这时侧栏已经窄了一半，而内容宽度应当纹丝不动。
   */
  await page.waitForTimeout(120)
  const 收起中 = await 宽()

  expect(收起中, `内容在被压窄（${收起前} → ${收起中}），应当是被裁掉`).toBe(收起前)
})

test("**展开的过程中同样不被压**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("量一下展开的动画")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 一行 = page.locator(".session-list li .row").first()
  const 展开时 = Math.round((await 一行.boundingBox())!.width)

  await page.getByRole("button", { name: "收起侧边栏" }).click()
  await page.waitForTimeout(400) // 收完
  await page.getByRole("button", { name: "展开侧边栏" }).click()
  await page.waitForTimeout(120)

  const 展开中 = Math.round((await 一行.boundingBox())!.width)
  expect(展开中, `展开途中内容被压窄了（${展开时} → ${展开中}）`).toBe(展开时)
})

/** **收完就是收完**：还看得见一条的话，那条动画就白做了 */
test("收完之后侧栏一点都不占地方", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "收起侧边栏" }).click()
  await page.waitForTimeout(400)
  const 宽 = (await page.locator(".sidebar").boundingBox())?.width ?? 0
  expect(Math.round(宽), "收完还剩一条").toBeLessThanOrEqual(1)
})
