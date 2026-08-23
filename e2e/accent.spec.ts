/**
 * 主题色（2026-08-23 作者要的）：外观里一键换色，整屏跟着变；「活着」跟着它，「对错」不跟；重载还在。
 */
import { test, expect, 在项目里开会话, 进设置 } from "./fixtures.js"

const 读令牌 = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

test("**选一颗预置色，强调色与「活着」跟着变，「成功」仍是绿；重载还在**", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")

  const 原 = await 读令牌(page, "--dawn-accent")
  const 成功 = await 读令牌(page, "--dawn-success")
  // 默认那颗标着选中
  await expect(page.getByRole("radio", { name: "绿" })).toHaveAttribute("aria-checked", "true")

  await page.getByRole("radio", { name: "蓝" }).click()
  await expect(page.getByRole("radio", { name: "蓝" })).toHaveAttribute("aria-checked", "true")
  expect(await 读令牌(page, "--dawn-accent")).not.toBe(原)
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#2f6feb")
  // 活着跟主题色；对错不跟
  expect(await 读令牌(page, "--dawn-live")).toBe(await 读令牌(page, "--dawn-accent"))
  expect(await 读令牌(page, "--dawn-success")).toBe(成功)
  // 主按钮真的跟着变（不只是变量变了）：选中的「中文」那颗是蓝底
  const 键色 = (el: import("@playwright/test").Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor)
  const 蓝底 = await 键色(page.getByRole("radio", { name: "中文" }))
  await page.getByRole("radio", { name: "绿" }).click()
  expect(await 键色(page.getByRole("radio", { name: "中文" }))).not.toBe(蓝底)
  await page.getByRole("radio", { name: "蓝" }).click()

  await page.reload()
  await expect(page.getByRole("button", { name: "设置", exact: true })).toBeVisible()
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#2f6feb")
})

test("**浅色主题色**：按钮上的字自动换成深色", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  const 框 = page.getByLabel("颜色值，可输入 HEX 或 RGB")
  await 框.fill("#ffd240")
  await 框.press("Enter")
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#ffd240")
  expect(await 读令牌(page, "--dawn-on-accent")).toBe("#0d0d0d")
})

test("**颜色值只有一格**：能输 HEX 或 RGB，悬停冒提示，图标复制，Shift 切格式", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "蓝" }).click()
  const 框 = page.getByLabel("颜色值，可输入 HEX 或 RGB")
  await expect(框).toHaveValue("#2f6feb")
  // 悬上去立刻有提示，说清三件事
  await 框.hover()
  await expect(page.locator(".accent-tip")).toContainText("Shift")
  await page.keyboard.press("Shift")
  await expect(框).toHaveValue("rgb(47, 111, 235)")
  // 输 RGB 回车生效，预置里对上的那颗标为当前
  await 框.fill("214, 51, 108")
  await 框.press("Enter")
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#d6336c")
  await expect(page.getByRole("radio", { name: "粉" })).toHaveAttribute("aria-checked", "true")
  // 输 HEX 也收
  await 框.fill("#e0701a")
  await 框.press("Enter")
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#e0701a")
  // 坏值留红框、不吞
  await 框.fill("orange")
  await 框.press("Enter")
  await expect(框).toHaveAttribute("aria-invalid", "true")
  expect(await 读令牌(page, "--theme-user-accent")).toBe("#e0701a")
  await 框.press("Escape")
  // 图标复制（此刻是 RGB 格式）
  await page.getByRole("button", { name: "复制颜色值" }).click()
  await expect(page.locator(".accent-tip")).toHaveText("已复制")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("rgb(224, 112, 26)")
})

test("**取色器**：放大镜跟着鼠标，值实时变，C 复制，Shift 切格式，点击定为主题色", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  await page.getByRole("button", { name: "取色器", exact: true }).click()
  const 罩 = page.getByRole("dialog", { name: "取色器" })
  await expect(罩).toBeVisible()
  // 等截图就绪（起手提示换成「移动鼠标取色」）再动鼠标
  await expect(罩.locator(".dropper-start")).toContainText("移动鼠标取色")
  // 挪到「粉」色块正中：读出来的就该是那个粉
  const 粉 = (await page.getByRole("radio", { name: "粉" }).boundingBox())!
  const x = Math.round(粉.x + 粉.width / 2)
  const y = Math.round(粉.y + 粉.height / 2)
  await page.mouse.move(x, y)
  await page.mouse.move(x, y) // 第一动只是长出面板，第二动确保采到样
  const 面板 = 罩.locator(".dropper-panel")
  await expect(面板).toBeVisible()
  await expect(罩.locator(".dropper-xy")).toContainText(`(${x}`)
  // 默认 RGB 格式（作者截图上就是三元组）
  await expect(罩.locator(".dropper-val code")).toHaveText("214, 51, 108")
  await page.keyboard.press("Shift")
  await expect(罩.locator(".dropper-val code")).toHaveText("#d6336c")
  await page.keyboard.press("c")
  await expect(罩.locator(".dropper-val code")).toHaveText("已复制")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("#d6336c")
  // 点击选定：主题色变粉，覆盖层收掉
  await page.mouse.click(x, y)
  await expect(罩).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--theme-user-accent").trim())).toBe("#d6336c")
  // Esc 能退（再开一次直接退）
  await page.getByRole("button", { name: "取色器", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "取色器" })).toHaveCount(0)
})

test("**自绘色盘**：点方块定色、拖色相条变色，C 复制、Shift 切格式、Esc 关", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  await page.getByRole("button", { name: "色盘", exact: true }).click()
  const 盘 = page.getByRole("dialog", { name: "色盘" })
  await expect(盘).toBeVisible()
  await expect(盘).toContainText("按 C 复制颜色值")
  await expect(盘).toContainText("按 Shift 切换 RGB/HEX")
  // 点明度方块右上角 = 纯色相（默认绿的色相），主题色立即跟着定
  const 方 = (await 盘.locator(".cpanel-sv").boundingBox())!
  await page.mouse.click(方.x + 方.width - 1, 方.y + 1)
  const 定的 = await 读令牌(page, "--theme-user-accent")
  expect(定的).not.toBe("")
  await expect(盘.locator("code")).toHaveText(定的)
  // 拖色相条到最左（0° = 红系）：值再变
  const 条 = (await 盘.locator(".cpanel-hue").boundingBox())!
  await page.mouse.click(条.x + 1, 条.y + 条.height / 2)
  const 红的 = await 读令牌(page, "--theme-user-accent")
  expect(红的).not.toBe(定的)
  // Shift 切 RGB、C 复制
  await page.keyboard.press("Shift")
  await expect(盘.locator("code")).toHaveText(/^rgb\(/)
  await page.keyboard.press("c")
  await expect(盘.locator("code")).toHaveText("已复制")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^rgb\(/)
  // 面板里的吸管捷径 → 屏幕取色
  await 盘.getByRole("button", { name: "屏幕取色" }).click()
  await expect(page.getByRole("dialog", { name: "取色器" })).toBeVisible()
  await page.keyboard.press("Escape")
  // Esc 关色盘
  await page.getByRole("button", { name: "色盘", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "色盘" })).toHaveCount(0)
})

test("**窗口矮时色盘钳进视口**，整个面板都看得见，不用滚动", async ({ dawn }) => {
  const { page } = dawn
  await page.setViewportSize({ width: 1100, height: 480 })
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  await page.getByRole("button", { name: "色盘", exact: true }).click()
  const 盘 = page.getByRole("dialog", { name: "色盘" })
  await expect(盘).toBeVisible()
  const r = (await 盘.boundingBox())!
  const 高 = await page.evaluate(() => window.innerHeight)
  expect(r.y, "面板顶出了视口").toBeGreaterThanOrEqual(0)
  expect(r.y + r.height, "面板底出了视口——还得滚动才看得全").toBeLessThanOrEqual(高)
})

test("**极矮窗口**（320 高）色盘也整个在视口里", async ({ dawn }) => {
  const { page } = dawn
  await page.setViewportSize({ width: 1100, height: 320 })
  await 在项目里开会话(page)
  await 进设置(page, "外观")
  await page.getByRole("button", { name: "色盘", exact: true }).scrollIntoViewIfNeeded()
  await page.getByRole("button", { name: "色盘", exact: true }).click()
  const 盘 = page.getByRole("dialog", { name: "色盘" })
  await expect(盘).toBeVisible()
  await page.waitForTimeout(200)
  const r = (await 盘.boundingBox())!
  const 高 = await page.evaluate(() => window.innerHeight)
  expect(r.y + r.height, "面板底出了视口").toBeLessThanOrEqual(高)
})
