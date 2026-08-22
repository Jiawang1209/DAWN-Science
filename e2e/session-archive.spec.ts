/**
 * 会话归档（session-archive，2026-08-22，学自 dsh-archive-manager）。
 *
 * 藏，不是删：①「⋯ → 收进归档」之后那一行从侧栏消失、侧栏多一行「已归档 1」（没归档过时没有这一行）；
 * ②「已归档」那一屏按项目列、「放回去」回原位置；③ 删会话**真的把会话目录送进废纸篓**
 * （此前只删数据库那一行、界面却说「删掉对话记录」）。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

const 名字 = ".session-list .sess .name"

test("**收进归档：侧栏那一行消失、「已归档」入口出现；放回去就回来**", async ({ dawn }) => {
  const { page } = dawn
  // 没归档过：侧栏没有这一行
  await expect(page.getByRole("button", { name: "已归档" })).toHaveCount(0)

  await 开一段临时会话(page, "要归档的那段")
  await 开一段临时会话(page, "留着的那段")
  await expect(page.locator(".session-list > li")).toHaveCount(2)

  // 第二段是当前的，先归档第一段（下面那行）
  await page.locator(".sess-item").filter({ hasText: "要归档的那段" }).locator(".row-more").click()
  await page.getByRole("menuitem", { name: "收进归档" }).click()

  await expect(page.locator(名字).filter({ hasText: "要归档的那段" })).toHaveCount(0)
  await expect(page.locator(".session-list > li")).toHaveCount(1)
  const 入口 = page.getByRole("button", { name: /已归档/ })
  await expect(入口).toBeVisible()
  await expect(入口).toContainText("1")

  // 已归档那一屏：按项目分组，行上有「放回去」
  await 入口.click()
  const 屏 = page.locator(".archived-page")
  await expect(屏).toContainText("要归档的那段")
  await expect(屏.locator(".archived-group")).toHaveCount(1)
  await 屏.getByRole("button", { name: "放回去" }).click()
  await expect(屏.locator('[role="status"]')).toContainText("回到了")
  await expect(page.locator(名字).filter({ hasText: "要归档的那段" })).toBeVisible()
  // 空了之后入口也没了
  await expect(page.getByRole("button", { name: /已归档/ })).toHaveCount(0)
})

test("**归档当前正在看的那段**：选中清掉、不留一个指向空的选中；点「已归档」里那一行 = 放回去并打开", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "正看着的")
  await page.locator(".sess-item.current .row-more").click()
  await page.getByRole("menuitem", { name: "收进归档" }).click()
  await expect(page.locator(".session-list > li")).toHaveCount(0)
  await expect(page.locator(".conv-title")).toHaveCount(0)

  await page.getByRole("button", { name: /已归档/ }).click()
  await page.locator(".archived-page .archived-row-main").first().click()
  await expect(page.locator(".conv-title")).toContainText("正看着的")
  await expect(page.locator(".sess-item.current")).toContainText("正看着的")
})

test("**删会话把会话目录送进废纸篓**，侧栏与「已归档」里删都一样", async ({ dawn }) => {
  const { page, dbPath } = dawn
  await 开一段临时会话(page, "要删的")
  // 会话目录：<workspace>/.dawn/sessions/<id>，工作区是临时会话自己的目录。从库里查
  const Database = (await import("better-sqlite3")).default
  const db = new Database(dbPath, { readonly: true })
  const rec = db.prepare(`SELECT session_dir FROM sessions LIMIT 1`).get() as { session_dir: string }
  db.close()
  await expect.poll(() => existsSync(rec.session_dir), { timeout: 15_000 }).toBe(true)
  expect(readdirSync(rec.session_dir).length).toBeGreaterThan(0)

  await page.locator(".sess-item.current .row-more").click()
  await page.getByRole("menuitem", { name: "删除" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "删除会话" }).click()
  await expect(page.locator(".session-list > li")).toHaveCount(0)
  await expect.poll(() => existsSync(rec.session_dir), { timeout: 15_000 }).toBe(false)
  // 父目录还在（只删这段的）
  expect(existsSync(join(rec.session_dir, ".."))).toBe(true)
})

test("**多选也能收进归档**；「清空归档」先问，问完把归档的全删了", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "甲")
  await 开一段临时会话(page, "乙")
  await page.getByRole("button", { name: "多选会话", exact: true }).click()
  await page.getByRole("button", { name: "全选" }).click()
  await page.getByRole("button", { name: "收进归档" }).click()
  await expect(page.locator(".session-list > li")).toHaveCount(0)
  const 入口 = page.getByRole("button", { name: /已归档/ })
  await expect(入口).toContainText("2")

  await 入口.click()
  await page.getByRole("button", { name: "清空归档" }).click()
  const 框 = page.getByRole("dialog")
  await expect(框).toContainText("删掉全部 2 段")
  await 框.getByRole("button", { name: "删掉 2 段" }).click()
  await expect(page.locator(".archived-page [role=\"status\"]")).toContainText("删了 2 段")
  await expect(page.locator(".archived-page")).toContainText("没有归档的会话")
})
