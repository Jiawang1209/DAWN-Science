/**
 * 侧栏的两条竖线（2026-08-22，作者三次点名，最后一次给了图）：
 * ① 右边收尾那一列——「多选」、会话行的「⋯」、项目行的「＋ / 删」——**同一条右缘**；
 * ② 数字那一列——「Skills N」「子 Agent N」「远端服务器 N」「已归档 N」、服务器那台机器标题上的 N、
 *    「最近 N」之外的所有 `.side-count`——与会话行的时间**同一条右缘**。
 * 三个右缘各差十几像素，一眼就是歪的；量出来才算对齐，不量就只是「看着差不多」。
 *
 * 分区标题里跟在字后面的那个数（「项目 1」「服务器 2」「最近 5」）不在这一列里——它贴着标题走，作者的图里也没框它。
 */
import { test, expect, 开一段临时会话, 在项目里开会话 } from "./fixtures.js"

test.use({ dawnOptions: { fakeSsh: true } })

test("**收尾那一列与数字那一列，各自只有一条右缘**（含服务器收纳与已归档）", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "散的")
  await 在项目里开会话(page)
  // 一台服务器 + 它底下一段会话：服务器收纳的标题行也有一个数
  const head = page.getByRole("button", { name: /远端服务器/ })
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
  await page.getByRole("button", { name: /添加服务器/ }).click()
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-label").fill("假机器")
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".side-server")).toHaveCount(1)
  // 归一段进归档，「已归档 N」那一行才出现
  await page.locator(".session-list .sess-item").filter({ hasText: "散的" }).locator(".row-more").click()
  await page.getByRole("menuitem", { name: "收进归档" }).click()
  await expect(page.getByRole("button", { name: /已归档/ })).toBeVisible()

  const 右缘 = (s: string) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().right)), s)

  const 多选 = await 右缘(".side-bulk")
  const 项目动作 = await 右缘(".proj-head .row-actions")
  const 会话动作 = await 右缘(".sess-item .row-actions")
  expect(多选.length).toBeGreaterThan(0)
  expect(项目动作.length).toBeGreaterThan(0)
  expect([...new Set([...多选, ...项目动作, ...会话动作])], "收尾那一列的右缘不止一条").toHaveLength(1)

  const 固定入口 = await 右缘(".side-action .side-count")
  const 远端 = await 右缘(".remote-head .side-count")
  const 机器 = await 右缘(".side-subhead .side-count")
  const 时间 = await 右缘(".sess-when")
  expect(固定入口.length, "Skills / 子 Agent / 已归档 的数没找到").toBeGreaterThanOrEqual(3)
  expect(远端.length).toBeGreaterThan(0)
  expect(机器.length).toBeGreaterThan(0)
  expect(时间.length).toBeGreaterThan(1)
  const 数字列 = new Set([...固定入口, ...远端, ...机器, ...时间])
  expect([...数字列], `数字那一列的右缘不止一条：入口 ${固定入口} · 远端 ${远端} · 机器 ${机器} · 时间 ${时间}`).toHaveLength(1)
})
