/**
 * 填了 key 之后能就地建 agent（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「我其实配置了 kimi-coding 的 API，但是我配置完，在对话里面无法选择 kimi 呢？」*
 *
 * 因为**填 key 只是「连得上」，能不能建会话看的是配置里有没有声明 agent**。
 * 那句解释此前躺在一个**默认折叠**的说明里——等于不存在。
 *
 * 这份用例盯两件事：
 *   1. 那一行**把话说全**了（「已配置」太容易被读成「可以用了」）
 *   2. 建完**不用重启**就能在对话里选到——否则「就地建」只完成了一半
 */
import { test, expect } from "./fixtures.js"

/** 配置里没有它、但 pi 认识它的一个 provider */
const 陌生 = "kimi-coding"

/**
 * **填过 key 的会跳到置顶那一组**（我们自己定的规则：在用的与配过的置顶）。
 * 所以保存之后要去上面找它，不是继续在折叠里找。
 */
const 置顶行 = (page: import("@playwright/test").Page) =>
  page.locator(".set-section > .set-rows > .set-row").filter({ hasText: 陌生 })

async function 进设置(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.locator(".more-providers summary").click()
  await page.getByLabel("筛选 provider").fill(陌生)
  await expect(page.locator(".more-providers .set-row")).toHaveCount(1)
}

test("**填了 key 却没人用它时，那一行要说出来**", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page)

  const 行 = page.locator(".more-providers .set-row")
  // 还没填 key
  await expect(行).toContainText("未配置")

  await 行.getByLabel(`${陌生} 的 API key`).fill("sk-假的")
  await 行.getByRole("button", { name: "保存" }).click()

  /**
   * **这一句是这次修复的全部意义。** 只写「已配置」的话，
   * 人会回到对话里去找，然后找不到——那正是作者遇到的。
   */
  await expect(置顶行(page).locator(".cred-idle")).toContainText("还没有 agent 在用它")
})

test("**建完不用重启就能选到** —— 否则「就地建」只完成了一半", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page)

  const 行 = page.locator(".more-providers .set-row")
  await 行.getByLabel(`${陌生} 的 API key`).fill("sk-假的")
  await 行.getByRole("button", { name: "保存" }).click()

  const 顶 = 置顶行(page)
  await 顶.getByRole("button", { name: "建一个 agent" }).click()
  await 顶.getByLabel("agent 名字").fill("kimi")
  await 顶.getByRole("button", { name: "建好" }).click()

  // 那一行的说法跟着变：现在有人用它了
  await expect(顶).toContainText("kimi 在用")

  // **回到对话，选择器里真的有它**——没重启
  await page.getByRole("button", { name: "返回" }).click()
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
  await page.locator(".agent-pill").click()
  await expect(page.getByRole("menu").or(page.locator(".palette, .row-menu, .menu"))).toContainText(
    "kimi",
  )
})
