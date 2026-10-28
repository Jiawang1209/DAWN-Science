import { test, expect, 在项目里开会话 } from "./fixtures.js"

test("输入区随内容增高，达到上限才滚动，清空后收回", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const input = page.locator(".composer-box textarea").first()
  const measure = () => input.evaluate((el: HTMLTextAreaElement) => ({
    height: el.clientHeight,
    scrollHeight: el.scrollHeight,
    maxHeight: parseFloat(getComputedStyle(el).maxHeight),
  }))
  await input.fill("一句话")
  const short = await measure()
  await input.fill(Array(3).fill("这是测试用的一行文字").join("\n"))
  const medium = await measure()
  expect(medium.height).toBeGreaterThan(short.height)
  expect(medium.scrollHeight).toBeLessThanOrEqual(medium.height + 1)
  await input.fill(Array(40).fill("这是测试用的一行文字").join("\n"))
  const long = await measure()
  expect(long.height).toBeLessThanOrEqual(121)
  expect(long.height).toBeLessThanOrEqual(long.maxHeight + 1)
  expect(long.scrollHeight).toBeGreaterThan(long.height)
  await input.fill("")
  expect((await measure()).height).toBe(short.height)
  const boxHeight = await page.locator(".composer-box").first().evaluate(el => el.clientHeight)
  expect(boxHeight).toBeLessThan(136)
})

test("换行在输入、发送请求和用户气泡里都保留", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const input = page.locator(".composer-box textarea").first()
  await input.fill("换行测试第一行")
  await input.press("Shift+Enter")
  await input.pressSequentially("换行测试第二行")
  await input.press("Shift+Enter")
  await input.press("Shift+Enter")
  await input.pressSequentially("换行测试第三段")
  const text = "换行测试第一行\n换行测试第二行\n\n换行测试第三段"
  await expect(input).toHaveValue(text)
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  expect(JSON.stringify(dawn.requests)).toContain(JSON.stringify(text).slice(1, -1))
  const rendered = await page.locator(".turn.user .text").last().innerText()
  expect(rendered).toContain("换行测试第一行\n换行测试第二行")
  expect(rendered).toContain("换行测试第三段")
})

test("主区与窄侧边：顶部环境、底栏工具与发送不溢出，添加菜单留在窗口内", async ({ dawn }) => {
  const { page } = dawn
  const { 进坞 } = await import("./fixtures.js")
  const { mkdirSync } = await import("node:fs")
  await 在项目里开会话(page)
  await page.setViewportSize({ width: 1920, height: 900 })
  await 进坞(page, "对话")
  const side = page.locator(".right-dock")
  await side.getByRole("button", { name: "另开一段", exact: true }).click()
  await expect(side.locator(".side-chat-head")).toBeVisible()
  for (const width of [1920, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const area of [page.locator("main.main"), side]) {
      const card = (await area.locator(".composer-card").boundingBox())!
      await expect(area.locator(".composer-tools .perm-pill")).toBeVisible()
      await expect(area.locator(".composer-environment .ws-chip")).toBeVisible()
      await expect(area.locator(".composer-environment .composer-location")).toHaveText("本机")
      expect(await area.locator(".composer-footer").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      const controls = area.locator(".composer-environment .ws-chip, .composer-footer .attach-trigger, .composer-footer .perm-pill-trigger, .composer-footer .composer-controls")
      for (const control of await controls.all()) {
        await expect(control).toBeVisible()
        const box = (await control.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(card.x)
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1)
        expect(box.y).toBeGreaterThanOrEqual(card.y)
        expect(box.y + box.height).toBeLessThanOrEqual(card.y + card.height + 1)
      }
      const upload = (await area.locator(".attach-trigger").boundingBox())!
      const send = (await area.locator(".send-btn").boundingBox())!
      expect(send.y).toBeGreaterThanOrEqual(upload.y - 2)
      expect(send.x).toBeGreaterThanOrEqual(upload.x + upload.width)
      await area.getByRole("button", { name: "添加内容", exact: true }).click()
      const menu = page.getByRole("menu", { name: "添加内容" })
      await expect(menu).toBeVisible()
      const bounds = (await menu.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(900)
      await page.keyboard.press("Escape")
      await expect(menu).toHaveCount(0)
    }
  }
  mkdirSync("tmp/ui-refresh-verification/after", { recursive: true })
  await page.screenshot({ path: "tmp/ui-refresh-verification/after/narrow-side-chat.png", animations: "disabled", caret: "hide" })
})
