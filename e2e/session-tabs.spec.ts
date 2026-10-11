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
  // 普通/已读页签也有常驻圆点，不能仅保留 DOM 却用 display:none 隐藏。
  for (const dot of await 栏.locator(".session-tab-dot").all()) {
    await expect(dot).toBeVisible({ timeout: 2_000 })
    const bounds = (await dot.boundingBox())!
    expect(bounds.width).toBe(6)
    expect(bounds.height).toBe(6)
    expect(await dot.evaluate(el => getComputedStyle(el).opacity)).toBe("1")
  }

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

test("主区页签可拖动排序，顺序重启后仍由会话列表保存", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("页签排序第一段")
  await page.keyboard.press("Enter")
  await expect(page.getByText("假模型已应答").last()).toBeVisible({ timeout: 30_000 })
  await 在项目里开会话(page)

  const 栏 = page.getByRole("tablist", { name: "同一处的会话" })
  const 顺序 = () => 栏.locator(".session-tab-title").allTextContents()
  const 拖动前 = await 顺序()
  await 栏.locator(".session-tab-wrap").nth(1).dragTo(栏.locator(".session-tab-wrap").nth(0))
  await expect.poll(顺序).not.toEqual(拖动前)
  const 拖动后 = await 顺序()

  // 重载会回到初始页；重新从项目列表选中会话后，再检查服务端保存的顺序。
  await page.reload()
  const 项目 = page.locator(".proj-list .proj-item").first()
  await expect(项目).toBeVisible()
  if ((await 项目.locator(".proj-session-list").count()) === 0) await 项目.locator(".row").first().click()
  await 项目.locator(".proj-session-list .sess-item .row").first().click()
  const 重开后的栏 = page.getByRole("tablist", { name: "同一处的会话" })
  await expect.poll(() => 重开后的栏.locator(".session-tab-title").allTextContents()).toEqual(拖动后)
})

test("项目文件夹内拖动会话，与顶部页签同步且重开后保留顺序", async ({ dawn }) => {
  let page = dawn.page
  await 在项目里开会话(page)
  const tabs = () => page.getByRole("tablist", { name: "同一处的会话" })
  await page.getByPlaceholder(/今天帮你做些什么/).fill("项目排序甲")
  await page.getByPlaceholder(/今天帮你做些什么/).press("Enter")
  await expect(page.getByText("假模型已应答").last()).toBeVisible()
  for (const count of [2, 3]) {
    await tabs().getByRole("button", { name: "在这里再开一段", exact: true }).click()
    await expect(tabs().getByRole("tab")).toHaveCount(count)
    await expect(page.locator(".proj-session-list .sess-item")).toHaveCount(count)
  }
  const rows = () => page.locator(".proj-session-list .sess-item")
  const order = () => rows().locator(".sess-title").allTextContents()
  const before = await order()
  expect(before).toHaveLength(3)
  const expected = [before[2], before[0], before[1]]
  await rows().nth(2).dragTo(rows().nth(0))
  await expect.poll(order, { timeout: 5_000 }).toEqual(expected)
  await expect.poll(() => tabs().locator(".session-tab-title").allTextContents()).toEqual(expected)

  page = await dawn.重开()
  const project = page.locator(".proj-list .proj-item").first()
  await expect(project).toBeVisible()
  if (await project.locator(".proj-session-list").count() === 0) await project.locator(".row").first().click()
  await project.locator(".proj-session-list .sess-item .row").first().click()
  await expect.poll(order).toEqual(expected)
  await expect.poll(() => tabs().locator(".session-tab-title").allTextContents()).toEqual(expected)
})

test("**`@` 菜单与输入卡同宽**，不比它宽（2026-08-23 作者报的）", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("看 @")
  const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })
  await expect(菜单).toBeVisible()
  // 浮层有 120ms 的弹出缩放——动画没播完量到的是缩小的那一帧（2026-08-23 偶发红过一次：x 差 2px）
  await 菜单.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const 卡 = (await page.locator(".composer-box").boundingBox())!
  const 菜 = (await 菜单.boundingBox())!
  expect(Math.round(菜.x)).toBe(Math.round(卡.x))
  expect(Math.round(菜.width)).toBe(Math.round(卡.width))
})

test.describe("页签圆点状态", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 2_500 } })

  test("普通圆点常驻，后台运行与未读状态继续由真实会话驱动", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    const tabs = page.getByRole("tablist", { name: "同一处的会话" })
    await tabs.getByRole("button", { name: "在这里再开一段", exact: true }).click()
    await expect(tabs.getByRole("tab")).toHaveCount(2)
    const active = tabs.locator(".session-tab-wrap.current")
    const id = await active.locator(".session-tab").getAttribute("data-session")
    const target = tabs.locator(".session-tab-wrap").filter({ has: page.locator(`[data-session="${id}"]`) })
    const dot = target.locator(".session-tab-dot")
    const tokenColor = (token: string) => page.evaluate(name => {
      const probe = document.createElement("span")
      probe.style.color = `var(${name})`
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }, token)

    await expect(dot).toHaveCSS("background-color", await tokenColor("--dawn-accent"))
    await expect(tabs.locator(".session-tab-wrap:not(.current) .session-tab-dot")).toHaveCSS("background-color", await tokenColor("--dawn-text-4"))
    await page.getByPlaceholder(/今天帮你做些什么/).fill("圆点状态检查")
    await page.getByPlaceholder(/今天帮你做些什么/).press("Enter")
    await expect(target).toHaveAttribute("data-running", "1")
    await expect(dot).toBeVisible()
    await expect(dot).toHaveCSS("background-color", await tokenColor("--dawn-live"))
    await tabs.locator(`[role="tab"]:not([data-session="${id}"])`).first().click()
    await expect(target.getByRole("tab")).toHaveAttribute("aria-selected", "false")
    await expect(target).toHaveAttribute("data-unread", "1", { timeout: 30_000 })
    await expect(target).not.toHaveAttribute("data-running", "1")
    await expect(dot).toBeVisible()
    await expect(dot).toHaveCSS("background-color", await tokenColor("--dawn-accent"))
    await target.getByRole("tab").click()
    await expect(target).not.toHaveAttribute("data-unread", "1")
    await expect(dot).toBeVisible()
    await expect(dot).toHaveCSS("background-color", await tokenColor("--dawn-accent"))
  })
})
