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
