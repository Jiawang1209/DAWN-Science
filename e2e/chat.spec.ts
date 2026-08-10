/**
 * 说一句话，看见回复。
 *
 * **这是 G2′ 判据的核心那一半**，也是本项目至今唯一没被机器验证过的一段：
 * 前几版都是作者打开、由作者告诉我哪里不对。
 *
 * 整条链路都是真的——Electron、IPC、协议、pi 的 agent loop、SQLite、渲染，
 * **只有模型回复是确定的**（由本地假推理服务器给出）。
 */
import { test, expect, CANNED_REPLY, readRuns } from "./fixtures.js"

/** 开一个会话，并等到能打字 */
async function startSession(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /新建会话/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
}

/**
 * 对话区。**断言要限定在这里**——2026-08-10 会话有了标题之后，
 * 第一句话同时出现在侧栏上，全页 `getByText` 会同时命中两处：
 * 「A 的话不在 B 的对话里」这条断言的意图从来是**对话区**，
 * 不是「这几个字在整个窗口里都不出现」。
 */
test("说一句话 → 界面上出现回复 → 账本上留下记录", async ({ dawn }) => {
  const { page, dbPath, requests } = dawn
  await startSession(page)

  await page.getByPlaceholder(/回车发送/).fill("你好")
  await page.keyboard.press("Enter")

  // ① 自己说的话要出现——**它来自事件流，不是本地乐观追加**
  await expect(page.locator(".turns").getByText("你好")).toBeVisible()

  // ② agent 的回复要出现在界面上。暗号由 mock server 写死，
  //    出现即证明整条链路通到了 DOM
  await expect(page.getByText(CANNED_REPLY, { exact: false })).toBeVisible({ timeout: 30_000 })

  // ③ **反空转**：假服务器必须真的被调用过
  expect(requests.length).toBeGreaterThan(0)

  // ④ 账本上也得有。界面说发生了，`runs` 表里就该有一条
  const runs = await readRuns(dbPath)
  expect(runs.some((r) => r.request_type === "agent_turn")).toBe(true)
})

test("回复是 markdown 而不是一坨纯文本", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)
  await page.getByPlaceholder(/回车发送/).fill("讲讲")
  await page.keyboard.press("Enter")
  await expect(page.getByText(CANNED_REPLY, { exact: false })).toBeVisible({ timeout: 30_000 })
  // agent 那条走 .md 容器；用户那条走 <pre>（人打的字原样显示）
  await expect(page.locator(".turn.agent .md")).toHaveCount(1)
  await expect(page.locator(".turn.user pre")).toHaveCount(1)
})

test("空白内容不发送 —— 不往账本上记一条什么都没有的回合", async ({ dawn }) => {
  const { page, dbPath } = dawn
  await startSession(page)
  await page.getByPlaceholder(/回车发送/).fill("   ")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(800)
  const runs = await readRuns(dbPath)
  expect(runs.filter((r) => r.request_type === "agent_turn")).toHaveLength(0)
})
