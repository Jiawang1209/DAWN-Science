/**
 * 侧栏的形状：**两段，各自「一个动作 + 它管的那一列」**（2026-08-11）。
 * **跑真实构建产物。**
 *
 * 作者：*「新建的项目，就在左侧的新建项目的下面，新建的会话，就在左侧的
 * 新建会话下面。然后新建完的项目，里面可以有多个会话。
 * 这一个完全仿制 claude code app 和 codex app。」*
 *
 * 此前项目是一个下拉框——那是「一个值」的形状：
 * 你看不见有几个项目，更看不见哪个项目里有多少会话。
 */
import { test, expect } from "./fixtures.js"

test("**项目是一列，每一行说出它装着几个会话**", async ({ dawn }) => {
  const { page } = dawn
  const 项目 = page.locator(".proj-list .proj-item")
  await expect(项目).toHaveCount(1)
  await expect(项目.first()).toContainText("0 个会话")

  // 开一段对话，那个数字要跟着涨——**它是真的从后端来的**
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await expect(项目.first()).toContainText("1 个会话", { timeout: 30_000 })
})

test("**顺序就是作者说的那个**：新建会话领着会话，新建项目领着项目", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.locator(".session-list .sess")).toHaveCount(1)

  const 侧栏 = page.locator(".sidebar")
  const 顺序 = await 侧栏.evaluate((el) => {
    const 点 = [...el.querySelectorAll(".side-action, .session-list, .proj-list")]
    // **不取 className 的第一段**：Button primitive 把 `btn` 排在前面
    return 点.map((x) =>
      x.classList.contains("side-action")
        ? "side-action"
        : x.classList.contains("session-list")
          ? "session-list"
          : "proj-list",
    )
  })
  // 新建会话 → 会话列表 → 新建项目 → 项目列表
  expect(顺序).toEqual(["side-action", "session-list", "side-action", "proj-list"])
})

test("**下拉框没了** —— 它装不下「一列项目，每个里面还有会话」", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.getByLabel("当前项目")).toHaveCount(0)
})
