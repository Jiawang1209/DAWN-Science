/**
 * codex-polish（2026-08-22，学自 dsh-codex-ui）五件小事：
 * ① 轮次导航——三轮起右侧出一排刻度，点一格跳到那一轮；
 * ② 会话菜单补五项——在新会话中继续 / 在访达中打开工作目录 / 复制工作目录 / 复制标题 / 复制会话 ID；
 * ③ 会话统计条——头部那一行写「N 轮」与用量；
 * ④ 导出对话为 markdown——真的落一个文件在隔离的下载目录里；
 * ⑤ 未读圆点——不在看的那段来了回复就亮一粒，点开就灭。
 */
import { test, expect, CANNED_REPLY, 开一段临时会话 } from "./fixtures.js"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const 输入框 = /今天帮你做些什么/

async function 说(page: import("@playwright/test").Page, 话: string): Promise<void> {
  await page.getByPlaceholder(输入框).fill(话)
  await page.keyboard.press("Enter")
  await expect(page.locator(".turns").getByText(话, { exact: true })).toBeVisible()
  await expect(page.locator(".turns .turn.agent").last()).toContainText(CANNED_REPLY, { timeout: 30_000 })
}

test("**③ 统计条**：头部写轮数；**④ 导出**：下载目录里多一个 .md，内容有每一轮", async ({ dawn }) => {
  const { page, dir } = dawn
  await 开一段临时会话(page)
  await 说(page, "第一句话")
  await 说(page, "第二句话")
  const 头 = page.locator(".conv-head")
  await expect(头.locator(".session-usage")).toContainText("2 轮")

  const 下载 = join(dir, "downloads")
  await 头.getByRole("button", { name: "导出对话" }).click()
  await expect(头.locator(".conv-export-note")).toContainText("已导出 2 轮")
  await expect.poll(() => existsSync(下载) && readdirSync(下载).some((f) => f.endsWith(".md"))).toBe(true)
  const 文件 = readdirSync(下载).find((f) => f.endsWith(".md"))!
  const 内容 = readFileSync(join(下载, 文件), "utf8")
  expect(内容).toContain("## 第 1 轮")
  expect(内容).toContain("第二句话")
  expect(内容).toContain(CANNED_REPLY)
})

test("**① 轮次导航**：三轮起出现，点第一格滚到第一轮", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 说(page, "甲")
  await 说(page, "乙")
  await expect(page.locator(".turn-nav")).toHaveCount(0)
  await 说(page, "丙")
  const 导航 = page.locator(".turn-nav")
  await expect(导航).toBeVisible()
  await expect(导航.locator(".turn-tick")).toHaveCount(3)
  // 把第一轮顶出视口再点回去
  // 真正滚的是 .turns 里那层无类名的容器（use-stick-to-bottom 自己套的）
  const 滚动层 = page.locator(".turns > div").first()
  await 滚动层.evaluate((el) => { el.scrollTop = el.scrollHeight })
  await expect.poll(() => 滚动层.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(导航.locator(".turn-tick.current")).toHaveAttribute("aria-label", /第 3 轮/)
  await 导航.locator(".turn-tick").first().click()
  await expect.poll(() => 滚动层.evaluate((el) => el.scrollTop)).toBeLessThan(10)
  await expect(导航.locator(".turn-tick.current")).toHaveAttribute("aria-label", /第 1 轮/)
})

test("**② 菜单五项**：复制三项走剪贴板并出声；「在新会话中继续」带着上一轮回复起新一段", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "这段要复制")
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  const 行 = page.locator(".sess-item.current")
  for (const [项, 提示] of [
    ["复制标题", "已复制标题"],
    ["复制会话 ID", "已复制会话 ID"],
    ["复制工作目录", "已复制工作目录"],
  ] as const) {
    await 行.locator(".row-more").click()
    await page.getByRole("menuitem", { name: 项, exact: true }).click()
    await expect(page.locator(".hint").filter({ hasText: 提示 }).last()).toBeVisible()
  }
  const 剪 = await page.evaluate(() => navigator.clipboard.readText())
  expect(剪.length).toBeGreaterThan(0)

  await 说(page, "说点什么")
  await 行.locator(".row-more").click()
  await page.getByRole("menuitem", { name: "在新会话中继续", exact: true }).click()
  await expect(page.locator(".session-list > li")).toHaveCount(2)
  // 新的那段成了当前，草稿里带着上一段的回复
  await expect(page.getByPlaceholder(输入框)).toHaveValue(new RegExp(CANNED_REPLY.slice(0, 8)))
})

test.describe("⑤ 未读圆点", () => {
  // 假模型答得太快：不拖一下，回复在切走之前就到了，那就不算「不在看」
  test.use({ dawnOptions: { firstChunkDelayMs: 1500 } })

test("**⑤ 未读圆点**：不在看的那段来了回复就亮，点开就灭", async ({ dawn }) => {
  const { page } = dawn
  // 夹具只等自己那句出现、不等回复；回复拖了 1.5s，不等完就开下一段会把两段的事搅在一起
  await 开一段临时会话(page, "甲段")
  await expect(page.locator(".turns .turn.agent").last()).toContainText(CANNED_REPLY, { timeout: 30_000 })
  await 开一段临时会话(page, "乙段")
  await expect(page.locator(".turns .turn.agent").last()).toContainText(CANNED_REPLY, { timeout: 30_000 })
  const 甲 = page.locator(".sess-item").filter({ hasText: "甲段" })
  const 乙 = page.locator(".sess-item").filter({ hasText: "乙段" })
  await expect(page.locator(".sess-unread")).toHaveCount(0)
  // 在乙段说话，立刻切去甲段，乙段的回复到了就该亮
  await page.getByPlaceholder(输入框).fill("乙的问题")
  await page.keyboard.press("Enter")
  await 甲.locator(".name").click()
  await expect(page.locator(".conv-title")).toContainText("甲段")
  await expect(乙.locator(".sess-unread")).toBeVisible({ timeout: 30_000 })
  await expect(甲.locator(".sess-unread")).toHaveCount(0)
  await 乙.locator(".name").click()
  await expect(page.locator(".sess-unread")).toHaveCount(0)
  // 手动标未读
  await 甲.locator(".row-more").click()
  await page.getByRole("menuitem", { name: "标为未读", exact: true }).click()
  await expect(甲.locator(".sess-unread")).toBeVisible()
})
})
