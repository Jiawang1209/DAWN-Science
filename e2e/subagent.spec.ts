/**
 * 子 agent 端到端（①-B″ · S1）。**跑真实构建产物。**
 *
 * 这条把 S1 的四片串起来验一次：
 *
 * ```
 * 假模型调 subagent 工具 → 定义从 .dawn/agents/ 读出来 → 执行器起独立进程
 *   → 子进程里一个真的 pi 会话 → 结果回给父模型 → 账本上留下三层链
 * ```
 *
 * **中间没有一处是 mock 的，只有模型是确定的。**
 *
 * ## 为什么非要有这一条
 *
 * S1 的四片各有单元测试，且都绿。但这一片最可能坏的地方全在接缝上：
 * 工具没被注册进 pi、子侧入口路径算错、账本的 `parent_run_id` 没挂上。
 * 三样单元测试一个都碰不到——而上一轮的教训就摆在那里：
 * **三个面板各自的测试全绿，接线断了却没人知道。**
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect } from "./fixtures.js"

/** 子 agent 的定义。假模型会被要求调用名叫 scout 的这个 */
const SCOUT = `---
name: scout
description: 踏勘员，只读不写
---
你是踏勘员。用一句话回答。
`

test.describe("子 agent 真的在独立进程里跑了一次", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      // 让假模型第一次就调 subagent 工具
      toolCall: {
        toolName: "subagent",
        args: { agent: "scout", task: "看看这个仓库是干什么的" },
      },
    },
  })

  test("结果回到对话里，账本上留下三层链", async ({ dawn }) => {
    const { page, workspace, dbPath } = dawn

    // 定义文件要在会话开始前就位——工具描述是建会话时读的
    mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
    writeFileSync(join(workspace, ".dawn", "agents", "scout.md"), SCOUT)

    await expect(page.locator(".app-shell")).toBeVisible()
    await page.getByRole("button", { name: /新建会话/ }).click()
    await page.getByPlaceholder(/回车发送/).fill("找个子 agent 看看这个仓库")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    /**
     * **断在工具结果上，不是断在模型那句回复上。**
     *
     * 第一版断的是「假模型已应答」，结果撞上 Playwright 的严格模式冲突：
     * 那句话同时出现在**工具结果**与**父模型的最终回复**里。
     * 冲突本身是好消息——它恰好证明子 agent 的输出真的回到了对话——
     * 但也说明那条断言指的不是我要的东西。
     *
     * `## [1] scout：完成` 才是要的：它由父侧的 `render()` 生成，
     * **只有子进程真的跑完并给出结果才会出现**。
     */
    await expect(page.locator(".tool-result")).toContainText("[1] scout：完成", {
      timeout: 60_000,
    })
    // 子进程里那个真的 pi 会话确实发过请求——假模型的暗号在它的输出里
    await expect(page.locator(".tool-result")).toContainText("假模型已应答")

    /**
     * **chip 组要在对话里出现**（①-B″ · S1 界面）。
     *
     * 它不是工具结果的一部分——工具结果是一段文本，chip 是**执行中的状态**。
     * 这条守的是数据通路：运行时发 `subagent_start/end` → 事件中枢并成
     * `subagents` 条目 → 界面画 chip。**三段里断哪一段，表现都是「什么都没有」。**
     */
    const chips = page.locator(".chip-group .chip")
    await expect(chips).toHaveCount(1)
    await expect(chips.first()).toContainText("scout")
    await expect(chips.first()).toHaveAttribute("data-status", "ok")
    await expect(page.locator(".subagents-summary")).toContainText("1/1")

    // 点开才有任务全文——默认铺开就成了日志
    await expect(page.locator(".chip-task")).toHaveCount(0)
    await chips.first().click()
    await expect(page.locator(".chip-task")).toContainText("看看这个仓库")

    /**
     * 账本上必须是完整三层：
     * `agent_turn` → `tool_call:subagent` → `subagent:scout`
     *
     * 这是计划 §6 那条「现在就做，不等阶段 ④」的验收点。
     */
    const { default: Database } = await import("better-sqlite3")
    const db = new Database(dbPath, { readonly: true })
    const rows = db
      .prepare("SELECT id, parent_run_id, request_type, status FROM runs")
      .all() as { id: string; parent_run_id: string | null; request_type: string; status: string }[]
    db.close()

    const turn = rows.find((r) => r.request_type === "agent_turn")
    const tool = rows.find((r) => r.request_type === "tool_call:subagent")
    const sub = rows.find((r) => r.request_type === "subagent:scout")

    expect(turn, `账本里没有 agent_turn。全部：${JSON.stringify(rows)}`).toBeDefined()
    expect(tool, `账本里没有 tool_call:subagent。全部：${JSON.stringify(rows)}`).toBeDefined()
    expect(sub, `账本里没有 subagent:scout。全部：${JSON.stringify(rows)}`).toBeDefined()
    expect(sub!.parent_run_id).toBe(tool!.id)
    expect(tool!.parent_run_id).toBe(turn!.id)
    // **跑完了要收口**，不能停在 running（那比没有记录更坏）
    expect(sub!.status).toBe("completed")
  })
})

test.describe("定义写错时不会静静地消失", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: { toolName: "subagent", args: { agent: "并不存在", task: "t" } },
    },
  })

  test("**点名一个不存在的子 agent** —— 账本记 failed 并带原因", async ({ dawn }) => {
    const { page, workspace, dbPath } = dawn
    mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
    writeFileSync(join(workspace, ".dawn", "agents", "scout.md"), SCOUT)

    await expect(page.locator(".app-shell")).toBeVisible()
    await page.getByRole("button", { name: /新建会话/ }).click()
    await page.getByPlaceholder(/回车发送/).fill("随便找一个")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    // 失败也会回到对话里——**失败要如实说**，这一句就是那条纪律的可见面
    await expect(page.locator(".tool-result")).toContainText("并不存在", { timeout: 60_000 })
    // 而 chip 上的失败原因**不用点开就看得见**（规格 7.5）
    await expect(page.locator(".chip")).toHaveAttribute("data-status", "error")
    await expect(page.locator(".chip-error")).toContainText("并不存在")

    const { default: Database } = await import("better-sqlite3")
    const db = new Database(dbPath, { readonly: true })
    const sub = db
      .prepare("SELECT request_type, status, terminal_reason FROM runs WHERE request_type LIKE 'subagent:%'")
      .get() as { request_type: string; status: string; terminal_reason: string | null } | undefined
    db.close()

    expect(sub, "点名不存在的 agent 也要留下一条 Run").toBeDefined()
    expect(sub!.status).toBe("failed")
    // 原因要说清，且要提到有哪些可选
    expect(sub!.terminal_reason).toContain("scout")
  })
})
