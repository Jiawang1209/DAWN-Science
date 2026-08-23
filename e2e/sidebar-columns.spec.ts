/**
 * 侧栏的三条竖线（2026-08-22，作者四次点名，给过图）：
 * ① 右边收尾那一列——会话行的「⋯」、项目行的「＋ / 删」——**同一条右缘**；
 * ③ 分区标题的计数（最近 / 项目 / 服务器 / 会话）紧跟标题、自成一列、**靠左**（作者先说靠右 18px，随即更正为靠左）；
 * ② 数字那一列——「多选」也在这一列（作者第四次点名）——「Skills N」「子 Agent N」「远端服务器 N」「已归档 N」、服务器那台机器标题上的 N、
 *    「最近 N」之外的所有 `.side-count`——与会话行的时间**同一条右缘**。
 * 三个右缘各差十几像素，一眼就是歪的；量出来才算对齐，不量就只是「看着差不多」。
 *
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
  // 2026-08-22 作者改：项目行的「＋ / 删」右缘落到「多选」那条线（188）上；会话行的 ⋯ 仍在收尾线（216）
  expect([...new Set([...项目动作, ...多选])], `项目行的删除键不在「多选」那条线上：${项目动作} vs ${多选}`).toHaveLength(1)
  expect([...new Set(会话动作)], "会话行 ⋯ 的右缘不止一条").toHaveLength(1)

  // ③ 分区计数：紧跟标题、左缘一列（「服务器」比「项目」宽一个字，标题不定宽的话它们对不上）
  const 左缘 = (s: string) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().left)), s)
  const 分区数 = await 左缘(".side-section-count")
  expect(分区数.length, "最近 / 项目 / 服务器 的计数没找全（「会话」那段已归档，那一列不在）").toBeGreaterThanOrEqual(3)
  expect([...new Set(分区数)], `分区计数的左缘不在一列：${分区数}`).toHaveLength(1)

  const 固定入口 = await 右缘(".side-action .side-count")
  // 「远端服务器」那一行：数字在 188 那条线上，三角到数字 10、三角到侧栏右边 10——作者定的三个数，
  // 侧栏默认宽度 224 就是这么来的（188 + 10 + 16 + 10）
  const 远端几何 = await page.evaluate(() => {
    const c = document.querySelector(".remote-head .side-count")!.getBoundingClientRect()
    const k = document.querySelector(".remote-head .caret")!.getBoundingClientRect()
    const s = document.querySelector(".sidebar")!.getBoundingClientRect()
    return { 数字到三角: Math.round(k.left - c.right), 三角到侧栏右边: Math.round(s.right - k.right) }
  })
  expect(远端几何).toEqual({ 数字到三角: 10, 三角到侧栏右边: 10 })
  const 远端 = await 右缘(".remote-head .side-count")
  const 机器 = await 右缘(".side-subhead .side-count")
  const 时间 = await 右缘(".sess-when")
  // 2026-08-23 技能 / 子 Agent 并进了设置，固定入口上带数的只剩「已归档」
  expect(固定入口.length, "已归档 的数没找到").toBeGreaterThanOrEqual(1)
  expect(机器.length).toBeGreaterThan(0)
  expect(时间.length).toBeGreaterThan(1)
  const 数字列 = new Set([...固定入口, ...远端, ...机器, ...时间, ...多选])
  expect([...数字列], `数字那一列的右缘不止一条：入口 ${固定入口} · 远端 ${远端} · 机器 ${机器} · 时间 ${时间} · 多选 ${多选}`).toHaveLength(1)

  // ④ 所有会话行（最近 / 项目底下 / 机器底下 / 散的）**同一条左缘**（2026-08-22 作者要的：都按机器底下的那一列对齐）
  await page.getByRole("button", { name: /^最近/ }).click()
  const 会话文字左 = await page.evaluate(() => [...new Set([...document.querySelectorAll(".sess-item .sess-title")].map((el) => { const r = document.createRange(); r.selectNodeContents(el); return Math.round(r.getBoundingClientRect().left) }))])
  expect(会话文字左, `会话行的左缘不止一条：${会话文字左}`).toHaveLength(1)
})
