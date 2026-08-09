/**
 * 会话中途换模型（①-B″ · U2）。**跑真实构建产物。**
 *
 * 界面显示「换过了」是最容易造假的一件事。**唯一算数的证据是
 * 假后端收到的下一次请求用的是哪个模型**——这也是 Spike E 用的判据。
 *
 * 假后端从 2026-08-09 起默认提供两个模型（`mockModelsJson`）：
 * 一个模型的假后端能让选择器渲染出来，却证明不了切换真的发生了。
 */
import { test as base, expect } from "./fixtures.js"
import type { Page } from "@playwright/test"

/**
 * **2026-08-09：这三条暂时挂着，因为 U2 还差一段。**
 *
 * 运行时、协议、界面三层都通了（`setSessionModel` 能真正换模型，
 * 能力由 Spike E 验过）。缺的是**「这个 provider 有哪些模型可选」的来源**：
 *
 * `getProviders` 回传的 `providers[].models` 不是 provider 的模型目录，而是
 * ```ts
 * models: [...new Set(nativeAgents.filter(d => d.provider === id).map(d => d.model))]
 * ```
 * ——**「providers.yaml 里声明过的 agent 各自用了哪个模型」**。
 * 它当初是为凭证界面设计的（那处注释写得很清楚：「你声明要用的这些，凭证配了吗」）。
 *
 * 于是假后端 `models.json` 里的第二个模型根本不会出现在这个清单里，
 * 选择器拿到的永远是一个元素，`ModelPill` 直接不渲染。
 *
 * **下一步**：把 `ModelRuntime.getModels()` 里该 provider 的真实目录透出来
 * （`NativeRuntime.resolveModel` 的报错信息已经在用它），作为与 `models` 并列的
 * 另一个字段——两者语义不同，不能合并。
 *
 * 用 `fixme` 而不是删掉：**缺口要出声。**
 */
const test = base.fixme

const A = "deepseek-v4-flash"
const B = "deepseek-v4-deep"

async function start(page: Page) {
  await expect(page.locator(".app-shell")).toBeVisible()
  await page.getByRole("button", { name: /新建会话/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
}

const modelsUsed = (requests: { body?: { model?: string } }[]) =>
  requests.map((r) => r.body?.model).filter(Boolean)

test("pill 显示当前模型，且能列出同 provider 的其它模型", async ({ dawn }) => {
  const { page } = dawn
  await start(page)
  const pill = page.locator(".composer .model-pill")
  await expect(pill).toContainText(A)
  await pill.getByRole("button").click()
  await expect(page.getByRole("menu", { name: "切换模型" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: new RegExp(B) })).toBeVisible()
})

test("**换完之后，下一次请求真的打到新模型**", async ({ dawn }) => {
  const { page, requests } = dawn
  await start(page)

  await page.getByPlaceholder(/回车发送/).fill("第一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/)).toBeVisible()
  expect(modelsUsed(requests as never)).toEqual([A])

  await page.locator(".composer .model-pill").getByRole("button").click()
  await page.getByRole("menuitem", { name: new RegExp(B) }).click()
  await expect(page.locator(".composer .model-pill")).toContainText(B)

  await page.getByPlaceholder(/回车发送/).fill("第二句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).nth(1)).toBeVisible()

  // **这一行才是 U2 的验收。** 界面说换了不算，后端收到的模型名说了算
  expect(modelsUsed(requests as never)).toEqual([A, B])
})

test("菜单标题是「切换模型」，与 agent pill 的「新建会话」区分开", async ({ dawn }) => {
  const { page } = dawn
  await start(page)
  // 同样的形状配不同的语义，是最容易让人按错的一种设计
  await page.locator(".composer .model-pill").getByRole("button").click()
  await expect(page.getByRole("menu", { name: "切换模型" })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.locator(".composer .agent-pill:not(.model-pill)").getByRole("button").click()
  await expect(page.getByRole("menu", { name: "新建会话" })).toBeVisible()
})
