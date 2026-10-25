/**
 * 侧栏列对齐（2026-10-16现行规范，替代早期右置计数与服务器三角间距）：
 * 标题/归档计数同左缘，多选同末尾列，项目与机器操作同列，会话时间/操作各自对齐。
 * 使用真实服务器添加/连接/会话及归档路径，覆盖四个分组。
 */
import { test, expect, 开一段临时会话, 在项目里开会话 } from "./fixtures.js"

test.use({ dawnOptions: { fakeSsh: true } })

test("**收尾那一列与数字那一列，各自只有一条右缘**（含服务器收纳与已归档）", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "散的")
  await 在项目里开会话(page)
  // 一台服务器 + 它底下一段会话：服务器收纳的标题行也有一个数
  await page.getByRole("button", { name: /添加服务器/ }).click()
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-label").fill("假机器")
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存并连接", exact: true }).click()
  await expect(page.locator(".remote-row").first()).toHaveAttribute("data-state", "ready")
  await page.locator(".remote-row").first().getByRole("button", { name: "新建远端任务", exact: true }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".server-session-list .sess-item")).toHaveCount(1)
  // 归一段进归档，「已归档 N」那一行才出现
  await page.locator(".session-list .sess-item").filter({ hasText: "散的" }).locator(".row-more").click()
  await page.getByRole("menuitem", { name: "收进归档" }).click()
  await expect(page.getByRole("button", { name: /^已归档 \d+$/ })).toBeVisible()
  await 开一段临时会话(page, "会话分区对齐")
  // 让“会话”标题留在布局里，但收起新建的会话行，沿用之前几何测试的侧栏高度。
  await page.locator(".side-section-toggle").filter({ hasText: "会话" }).click()

  const 量列 = (s: string, edge: "left" | "right") => page.locator(s).evaluateAll((els, edge) => els.filter(el => el.getClientRects().length).map(el => Math.round(el.getBoundingClientRect()[edge])), edge)
  const 同列 = async (sel: string, edge: "left" | "right", 至少: number) => {
    const values = await 量列(sel, edge)
    expect(values.length, sel).toBeGreaterThanOrEqual(至少)
    expect(Math.max(...values) - Math.min(...values), `${sel}: ${values}`).toBeLessThanOrEqual(1)
  }
  // 2026-10-16：四组标题和归档计数共用左侧固定列，多选统一在末尾。
  await 同列(".side-section-title", "left", 4)
  await 同列(".side-section-count, .side-action-archive .side-count", "left", 5)
  await 同列(".side-section .side-bulk, .side-section .server-bulk", "right", 3)
  await 同列(".sess-item .row-actions", "right", 2)
  await 同列(".sess-when", "right", 2)
  // 项目/机器共用主要入口和管理列；会话使用自己的末尾操作列。
  await 同列(".proj-head > .row-actions, .side-subhead-row > .server-menu-anchor", "right", 2)
  const order = await page.evaluate(() => {
    const add = document.querySelector(".server-add")!.getBoundingClientRect()
    const bulk = document.querySelector(".server-bulk")!.getBoundingClientRect()
    return add.right <= bulk.left
  })
  expect(order, "添加服务器应在多选左侧").toBe(true)

  // ④ 项目 / 服务器 / 最近 / 散的会话保持同一条左缘。
  await page.getByRole("button", { name: /^最近/ }).click()
  const 会话文字左 = await page.evaluate(() => [...new Set([...document.querySelectorAll(".session-list .sess-title, .proj-session-list .sess-title, .server-session-list .sess-title")].map((el) => { const r = document.createRange(); r.selectNodeContents(el); return Math.round(r.getBoundingClientRect().left) }))])
  expect(会话文字左.length).toBeGreaterThan(0)
  expect(会话文字左, `会话行的左缘不止一条：${会话文字左}`).toHaveLength(1)
  await test.info().attach("sidebar-columns", { body: await page.screenshot(), contentType: "image/png" })
})
