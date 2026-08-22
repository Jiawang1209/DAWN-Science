/**
 * 团队（team-board，2026-08-22，学自 NanmiCoder/dsh-agent-teams）。
 * 假模型被安排第一句就调 `team_create`：两个成员（项目里定义的两个子 agent）、两项任务（t2 依赖 t1）。
 * 成员是真的子进程，它们问的也是假模型（答一句暗号）。验的是：任务按依赖先后跑完、结果落进任务、
 * 坞里「团队」那一格把成员 / 任务 / 结果画出来、对话流里有子 agent 的 chip。
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

const 人设 = (name: string) => `---
name: ${name}
description: ${name}
---
你是 ${name}。用一句话回答。
`

test.describe("组一支团队", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: {
        toolName: "team_create",
        args: {
          name: "审稿小队",
          goal: "把这个仓库审一遍",
          members: [
            { name: "踏勘", agent: "scout", role: "先看一眼" },
            // 作者 2026-08-22 要的：成员各自的模型。审稿用另一个模型，踏勘跟队长
            { name: "审稿", agent: "reviewer", role: "挑毛病", model: "deepseek/deepseek-v4-deep" },
          ],
          tasks: [
            { id: "t1", subject: "看看仓库里有什么", assignee: "踏勘" },
            { id: "t2", subject: "基于 {t1} 挑三个问题", dependencies: ["t1"], assignee: "审稿" },
          ],
        },
        once: true,
      },
    },
  })

  test("**任务按依赖跑完，结果落进任务；坞里那一格与对话流都看得见**", async ({ dawn }) => {
    const { page, workspace } = dawn
    mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
    writeFileSync(join(workspace, ".dawn", "agents", "scout.md"), 人设("scout"))
    writeFileSync(join(workspace, ".dawn", "agents", "reviewer.md"), 人设("reviewer"))

    await expect(page.locator(".app-shell")).toBeVisible()
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("/team 审一遍这个仓库")
    await page.keyboard.press("Enter")

    // 工具行：team_create 成功
    const 工具 = page.locator(".tool").filter({ hasText: "team_create" }).first()
    await expect(工具).toHaveAttribute("data-status", "ok", { timeout: 60_000 })

    // 坞里「团队」那一格
    await 进坞(page, "团队")
    const 格 = page.locator(".team-panel")
    await expect(格).toBeVisible()
    await expect(格.locator(".team-name")).toHaveText("审稿小队")
    // 按层次：两个成员组，各自底下一项任务
    await expect(格.locator(".team-group")).toHaveCount(2)
    await expect(格.locator(".team-task")).toHaveCount(2)
    await expect(格.locator('.team-group[data-member="踏勘"] .team-task[data-task="t1"]')).toHaveCount(1)
    await expect(格.locator('.team-group[data-member="审稿"] .team-task[data-task="t2"]')).toHaveCount(1)
    // t2 先等着（t1 没完成不能领）
    await expect(格.locator('.team-task[data-task="t2"]')).toContainText("依赖 t1")
    // 两项都完成（成员是真子进程、问假模型）
    await expect(格.locator('.team-task[data-task="t1"]')).toHaveAttribute("data-status", "completed", { timeout: 90_000 })
    await expect(格.locator('.team-task[data-task="t2"]')).toHaveAttribute("data-status", "completed", { timeout: 90_000 })
    await expect(格.locator(".team-progress")).toContainText("2 / 2 完成")
    // 点开 t2 看结果：假模型的暗号
    await 格.locator('.team-task[data-task="t2"] .team-task-head').click()
    await expect(格.locator('.team-task[data-task="t2"] .team-task-output')).toContainText("假模型已应答")
    // 成员空闲、各跑了一轮；审稿那一行写着它自己的模型，踏勘没写（跟队长）
    await expect(格.locator('.team-group[data-member="踏勘"] .team-group-head')).toContainText("1 轮")
    await expect(格.locator('.team-group[data-member="审稿"] .team-group-head')).toContainText("deepseek-v4-deep")
    await expect(格.locator('.team-group[data-member="踏勘"] .team-group-head')).not.toContainText("deepseek-v4")

    // 对话流里的 chip 组：两轮
    await expect(page.locator(".subagents .chip")).toHaveCount(2, { timeout: 30_000 })

    // 磁盘真相：会话目录下 teams/<id>/team.json 与每个成员的会话目录
    const sessions = join(workspace, ".dawn", "sessions")
    const sid = readdirSync(sessions)[0]!
    const teams = join(sessions, sid, "teams")
    const id = readFileSync(join(teams, "current"), "utf8").trim()
    const team = JSON.parse(readFileSync(join(teams, id, "team.json"), "utf8")) as { tasks: { id: string; status: string; attempt: number }[] }
    expect(team.tasks.map((t) => [t.id, t.status, t.attempt])).toEqual([["t1", "completed", 1], ["t2", "completed", 1]])
    expect(existsSync(join(teams, id, "members", "踏勘"))).toBe(true)
  })
})

test("**没有团队时那一格说清楚**；`/` 菜单里第一项是「组一支团队」，选了把草稿换成 /team", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, "团队")
  await expect(page.locator(".team-empty")).toContainText("这段会话没有团队")
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("/")
  await expect(page.locator(".slash-menu .slash-item").first()).toContainText("组一支团队")
  await page.keyboard.press("Enter")
  await expect(框).toHaveValue("/team ")
})

test.describe("成员指了一个目录里没有的模型", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: {
        toolName: "team_create",
        args: { name: "x", goal: "g", members: [{ name: "甲", agent: "scout", model: "deepseek/不存在的模型" }], tasks: [] },
        once: true,
      },
    },
  })
  test("**建队时就拒**，并说清有哪些模型——不让它跑起来才报", async ({ dawn }) => {
    const { page, workspace } = dawn
    mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
    writeFileSync(join(workspace, ".dawn", "agents", "scout.md"), 人设("scout"))
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("/team 随便")
    await page.keyboard.press("Enter")
    const 工具 = page.locator(".tool").filter({ hasText: "team_create" }).first()
    await expect(工具).toHaveAttribute("data-status", "error", { timeout: 60_000 })
    await 工具.locator(".tool-head").click()
    await expect(工具.locator(".tool-result")).toContainText("没有模型「不存在的模型」")
    await expect(工具.locator(".tool-result")).toContainText("deepseek-v4-flash")
  })
})
