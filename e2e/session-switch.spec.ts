/**
 * 切会话是**换个家，不是重启**。
 *
 * Hermes：*"…only the gateway-bound view is cleared and repopulated, and
 * **the previous context must not leak into the next one**."*
 *
 * 这条 spec 验的正是 Task 3.8 那个缺陷的真实形态：草稿曾经会跟着切过去。
 * 单元测试能抓到它，但**只有这里能证明真实点击流下也是对的**。
 */
import { test, expect, CANNED_REPLY } from "./fixtures.js"

type Page = import("@playwright/test").Page

async function newSession(page: Page) {
  await page.getByRole("button", { name: /新建会话/ }).click()
  await page.getByRole("button", { name: "ds-chat", exact: true }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
}

const rows = (page: Page) => page.locator(".session-list .row")

/**
 * **会话列表是「最新在前」**（`listByProject` 用 `ORDER BY created_at DESC`）。
 *
 * 第一版 spec 想当然地拿 `.first()` 当「先建的那个」，于是点到的正是当前
 * 已激活的会话——**根本没切走**，测试却报「草稿跟着切过去了」。
 * 实现是对的，是断言的假设错了。这两个别名把顺序写明，免得再猜。
 */
const newest = (page: Page) => rows(page).nth(0)
const oldest = (page: Page) => rows(page).nth(1)

test("切会话不丢历史", async ({ dawn }) => {
  const { page } = dawn

  // 会话 A：说一句，等回复
  await newSession(page)
  await page.getByPlaceholder(/回车发送/).fill("我是 A 的问题")
  await page.keyboard.press("Enter")
  await expect(page.getByText(CANNED_REPLY, { exact: false })).toBeVisible({ timeout: 30_000 })

  // 会话 B
  await newSession(page)
  await expect(rows(page)).toHaveCount(2)
  // B 是新的，不该有 A 的内容
  await expect(page.getByText("我是 A 的问题")).toHaveCount(0)

  // 切回 A（先建的那个 = 列表里靠后的）：历史必须完整
  await oldest(page).click()
  await expect(page.getByText("我是 A 的问题")).toBeVisible()
  await expect(page.getByText(CANNED_REPLY, { exact: false })).toBeVisible()
})

test("**草稿不跟着切过去**，切回来又还在", async ({ dawn }) => {
  const { page } = dawn
  await newSession(page)
  await newSession(page)
  await expect(rows(page)).toHaveCount(2)

  const box = page.getByPlaceholder(/回车发送/)

  // 在当前会话（第二个）里打一半
  await box.fill("这句话是给第二个会话的")
  await expect(box).toHaveValue("这句话是给第二个会话的")

  // 切到先建的那个：输入框必须是空的
  await oldest(page).click()
  await expect(box).toHaveValue("")

  // 在它里面打点别的
  await box.fill("先建那个会话的半句话")

  // 切回后建的：它自己的草稿还在
  await newest(page).click()
  await expect(box).toHaveValue("这句话是给第二个会话的")
})

test("切会话不重启 shell —— 侧栏与顶栏一直在", async ({ dawn }) => {
  const { page } = dawn
  await newSession(page)
  await newSession(page)
  await oldest(page).click()
  // re-home 不是 reboot：外壳自始至终没被换掉
  await expect(page.locator(".brand")).toHaveText("DAWN Science")
  await expect(page.locator(".sidebar")).toBeVisible()
  await expect(page.locator(".boot-overlay")).toHaveCount(0)
})
