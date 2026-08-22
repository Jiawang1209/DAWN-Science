/**
 * 侧栏的两条竖线（2026-08-22，作者两次点名）：
 * ① 右边收尾那一列——「多选」、会话行的「⋯」、项目行的「＋ / 删」——**同一条右缘**；
 * ② 数字那一列——「Skills N」「子 Agent N」与会话行的时间——**同一条右缘**。
 * 三个右缘各差十几像素，一眼就是歪的；量出来才算对齐，不量就只是「看着差不多」。
 */
import { test, expect, 开一段临时会话, 在项目里开会话 } from "./fixtures.js"

test("**收尾那一列与数字那一列，各自只有一条右缘**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "散的")
  await 在项目里开会话(page)
  const 右缘 = (s: string) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().right)), s)
  const 多选 = await 右缘(".side-bulk")
  const 项目动作 = await 右缘(".proj-head .row-actions")
  const 会话动作 = await 右缘(".sess-item .row-actions")
  expect(多选.length).toBeGreaterThan(0)
  expect(项目动作.length).toBeGreaterThan(0)
  const 收尾 = new Set([...多选, ...项目动作, ...会话动作])
  expect([...收尾], "收尾那一列的右缘不止一条").toHaveLength(1)

  const 计数 = await 右缘(".side-action .side-count")
  const 时间 = await 右缘(".sess-when")
  expect(计数.length).toBeGreaterThan(0)
  const 数字列 = new Set([...计数, ...时间])
  expect([...数字列], "数字那一列的右缘不止一条").toHaveLength(1)
})
