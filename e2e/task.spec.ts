/**
 * 新建任务（T2/T3，**2026-08-12 重定义**）。**跑真实构建产物。**
 *
 * 作者定的最终形态：
 *
 * > *「现在打开 DAWN Science 的时候，这个页面需要加上文件夹的选择，以及 LLM 的选择。
 * > 然后我一旦直接开始对话，其实就算是一个普通的会话了，这时候要收录到会话里面去。
 * > 当然，我点击新建任务之后，依旧也是这个画面，然后我可以选择文件夹，
 * > 一旦选择文件夹了，那么就是一个项目。」*
 *
 * 两句话合起来是一件事：**「打开应用」与「新建任务」是同一个画面**，
 * 而**真正建出来的那一刻是第一次开口**——那时才知道要不要带工作目录。
 *
 * 副作用是个好的：**点一下不再冒出一行「新任务」**。
 * 一段还没说过话的对话本来就不该占据侧栏的一行。
 */
import { test, expect } from "./fixtures.js"

test("**点「新建任务」回到初始画面，不建任何东西**", async ({ dawn }) => {
  const { page } = dawn

  // 先聊一段，好让侧栏上有东西、主区在对话里
  await page.getByPlaceholder(/今天帮你做些什么/).fill("第一段")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns").getByText("第一段")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)

  await page.getByRole("button", { name: "新建任务" }).click()

  // 回到那个画面：起手卡片 + 能直接打字的输入卡
  await expect(page.locator(".welcome")).toBeVisible()
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
  // **一条都没多**：还没开口，就还没有这段对话
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)
})

test("**直接开口 → 归「会话」栏**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByPlaceholder(/今天帮你做些什么/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns").getByText("你好")).toBeVisible({ timeout: 30_000 })

  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)
  const 分区 = await page.locator(".sidebar .side-section").allTextContents()
  expect(分区.some((t) => t.startsWith("会话"))).toBe(true)
  expect(分区.some((t) => t.startsWith("项目"))).toBe(false)
  // 写权那条路也要通——它此前在四个地方各写了一遍，漏一个就是「点了没反应」
  await expect(page.getByText(/写入被拒/)).toHaveCount(0)
})

/**
 * **应用名点一下也回初始画面**（作者提）。
 *
 * 与侧栏那颗「新建任务」是**同一个动作**——
 * 一个动作可以有多个入口，但它们调用同一份实现、同一份状态。
 */
test("**点应用名回初始画面**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByPlaceholder(/今天帮你做些什么/).fill("先说一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns").getByText("先说一句")).toBeVisible({ timeout: 30_000 })

  await page.getByRole("button", { name: "DAWN Science" }).click()
  await expect(page.locator(".welcome")).toBeVisible()
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)
})
