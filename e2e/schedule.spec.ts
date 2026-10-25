/**
 * 定时任务（schedule，2026-08-22，学自 dsh-automation）。真构建 + 假模型：
 * 建一条每天的 → 列表上有它、有下一次 → 「立即跑一次」→ 记录先「跑着」再「成功」、摘要是假模型那句 →
 * 点记录打开那段全新会话（标题带任务名）→ 暂停 → 删除（记录留着）。常驻那句「DAWN 关着的时候不跑」要在。
 */
import { test, expect, CANNED_REPLY, 在项目里开会话 } from "./fixtures.js"

test("**建一条、立即跑一次、记录成功、会话留在项目里；暂停与删除**", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByRole("button", { name: "定时", exact: true }).click()
  const 屏 = page.locator(".schedule-page")
  await expect(屏).toContainText("DAWN 关着的时候不跑")
  await expect(屏).toContainText("还没有定时任务")

  await 屏.getByRole("button", { name: "新建定时任务" }).click()
  const 表 = 屏.getByRole("form", { name: "新建定时任务" })
  await 表.getByLabel("名字").fill("早报")
  await 表.getByLabel("任务说明").fill("看看昨晚的数据")
  await 表.getByRole("radio", { name: "每天" }).click()
  await 表.getByLabel("几点").fill("09:00")
  await 表.getByRole("button", { name: "建好" }).click()

  const 行 = 屏.locator(".skill-row", { hasText: "早报" }).first()
  await expect(行).toBeVisible()
  await expect(行).toContainText("每天 09:00")
  await expect(行).toContainText("下一次")
  await expect(屏.locator('[role="status"]')).toContainText("「早报」建好了")

  // 立即跑一次：记录出现、然后成功，摘要是假模型那句
  await 行.getByRole("button", { name: "定时任务操作：早报" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "立即跑一次" }).click()
  const 记录 = 屏.locator(".schedule-runs .skill-row").first()
  await expect(记录).toBeVisible()
  await expect(记录).toContainText("成功", { timeout: 30_000 })
  await expect(记录).toContainText(CANNED_REPLY)
  await expect(记录).toContainText("手动")
  await expect(行).toContainText("上次成功")

  // 点记录 = 打开那段会话；它是项目里一段全新会话，标题带任务名
  await 记录.getByRole("button").first().click()
  await expect(page.locator(".conv-title")).toContainText("早报 ·")
  await expect(page.locator(".conv-title")).toContainText(/早报 · \d{4}/)

  // 回去：暂停 → 标签「暂停中」、下一次没了；删除 → 列表空、记录还在
  await page.getByRole("button", { name: "定时", exact: true }).click()
  await 屏.locator(".skill-row", { hasText: "早报" }).first().getByRole("button", { name: "暂停" }).click()
  await expect(屏.locator(".skill-row", { hasText: "早报" }).first()).toContainText("暂停中")
  await expect(屏.locator(".skill-row", { hasText: "早报" }).first()).toContainText("不会再跑")
  await 屏.locator(".skill-row", { hasText: "早报" }).first().getByRole("button", { name: "定时任务操作：早报" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "删除" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "删掉它" }).click()
  await expect(屏).toContainText("还没有定时任务")
  await expect(屏.locator(".schedule-runs .skill-row")).toHaveCount(1)
})

test("**坏输入当场说**：没填说明、每周一天没选", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByRole("button", { name: "定时", exact: true }).click()
  const 屏 = page.locator(".schedule-page")
  await 屏.getByRole("button", { name: "新建定时任务" }).click()
  const 表 = 屏.getByRole("form", { name: "新建定时任务" })
  await 表.getByLabel("名字").fill("x")
  await 表.getByRole("button", { name: "建好" }).click()
  await expect(屏.locator('[role="status"]')).toContainText("名字和任务说明都要填")
  await 表.getByLabel("任务说明").fill("y")
  await 表.getByRole("radio", { name: "每周" }).click()
  await 表.getByRole("button", { name: "一", exact: true }).click() // 取消默认勾的周一
  await 表.getByRole("button", { name: "建好" }).click()
  await expect(屏.locator('[role="status"]')).toContainText("每周至少选一天")
})

/**
 * 第二档：**对话里说一句就建**（经真的 MCP 网关，假 ACP 调 `dawn_schedule_create`）。
 * 当前会话是「拦危险的」档 → 建出来是**暂停**的，回话里让 agent 把这一点告诉人；「定时」里能看见它、按恢复就活了。
 */
import { resolve } from "node:path"
import { 用某个agent开一段, 等进了对话, 进设置 } from "./fixtures.js"
const 假ACP = resolve("scripts/fake-acp-agent.mjs")
const ACP_PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
`
test.describe("对话里建", () => {
  test.use({ dawnOptions: { providersYaml: ACP_PROVIDERS, gitInit: true, env: { FAKE_ACP_CALL_MCP: "1", FAKE_ACP_SCHEDULE: "对话建的早报" } } })

  test("**agent 调 dawn_schedule_create → 建成暂停的、回话说清 → 「定时」里按恢复**", async ({ dawn }) => {
    const { page } = dawn
    // 先把全局档切到「拦下危险操作」——这就是建成暂停的那条路
    await page.locator(".perm-pill-trigger").first().click()
    await page.getByRole("menuitemradio", { name: /^自动拦截/ }).click()
    await expect(page.locator(".perm-pill-trigger").first()).toHaveText(/^自动拦截/)
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)
    await page.getByPlaceholder(/输入问题/).fill("每天早上九点帮我看看数据")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    const 结果 = page.getByText(/【MCP 结果】/).last()
    await expect(结果).toBeVisible({ timeout: 30_000 })
    await expect(结果).toContainText("建好了「对话建的早报」")
    await expect(结果).toContainText("暂停")

    await page.getByRole("button", { name: "定时", exact: true }).click()
    const 行 = page.locator(".schedule-page .skill-row", { hasText: "对话建的早报" }).first()
    await expect(行).toBeVisible()
    await expect(行).toContainText("暂停中")
    await expect(行).toContainText("每天 09:00")
    await 行.getByRole("button", { name: "恢复" }).click()
    await expect(行).not.toContainText("暂停中")
    await expect(行).toContainText("下一次")
  })
})

test("**第二档的计划与筛**：每月、每 N 天、权限档标签、记录按状态筛", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.getByRole("button", { name: "定时", exact: true }).click()
  const 屏 = page.locator(".schedule-page")
  await 屏.getByRole("button", { name: "新建定时任务" }).click()
  const 表 = 屏.getByRole("form", { name: "新建定时任务" })
  await 表.getByLabel("名字").fill("月报")
  await 表.getByLabel("任务说明").fill("汇总这个月")
  await 表.getByRole("radio", { name: "每月" }).click()
  await 表.getByLabel("每月几号").fill("1")
  await 表.getByRole("radio", { name: "完全访问" }).click()
  await 表.getByRole("button", { name: "建好" }).click()
  const 行 = 屏.locator(".skill-row", { hasText: "月报" }).first()
  await expect(行).toContainText("每月 1 号 09:00")
  await expect(行).toContainText("完全访问")

  await 屏.getByRole("button", { name: "新建定时任务" }).click()
  const 表2 = 屏.getByRole("form", { name: "新建定时任务" })
  await 表2.getByLabel("名字").fill("隔日")
  await 表2.getByLabel("任务说明").fill("隔一天看看")
  await 表2.getByRole("radio", { name: "每 N 天" }).click()
  await 表2.getByLabel("每几天").fill("2")
  await 表2.getByRole("button", { name: "建好" }).click()
  await expect(屏.locator(".skill-row", { hasText: "隔日" }).first()).toContainText(/每 2 天 09:00（从 \d{4}-\d{2}-\d{2} 起）/)

  // 跑一次，然后按状态筛：选「失败」看不到它，选「成功」看得到
  await 行.getByRole("button", { name: "定时任务操作：月报" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "立即跑一次" }).click()
  const 记录区 = 屏.locator(".schedule-runs")
  await expect(记录区.locator(".skill-row").first()).toContainText("成功", { timeout: 30_000 })
  await 记录区.getByLabel("状态").selectOption("failed")
  await expect(记录区).toContainText("这个筛法下没有记录")
  await 记录区.getByLabel("状态").selectOption("succeeded")
  await expect(记录区.locator(".skill-row")).toHaveCount(1)
})

/** 真实 pi 多轮工具链：中间回复不能终结定时运行。 */
test.describe("完整回合结算", () => {
  test.use({ dawnOptions: {
    toolCall: { toolName: "bash", args: { command: "printf 'SCHEDULE_TOOL_STEP'" }, say: "中间回复：还在检查数据", repeat: 2 },
    firstChunkDelayMs: 1200,
    reply: "最终回复：分析请求已完整结束",
  } })

  for (const outcome of ["succeeded", "failed", "cancelled"] as const) {
    const failed = outcome === "failed"
    const cancelled = outcome === "cancelled"
    test(failed ? "工具后的模型失败记为失败，中间回复不提前报成功" : cancelled ? "在定时会话停止后记录取消，不能报成功" : "两次模型迭代后才报成功，摘要使用最终回复", async ({ dawn }) => {
      const { page, requests } = dawn
      const prompt = failed ? "定时整轮失败验收" : "定时整轮成功验收"
      const task = await page.evaluate(async ({ workspace, prompt }) => {
        const call = async (op: string, input: unknown) => {
          const response = await window.dawn!.invoke(op, input)
          if (!response.ok) throw new Error(JSON.stringify(response.error))
          return response.data as any
        }
        const { agents } = await call("getProviders", {})
        const agentId = agents.find((agent: { kind: string }) => agent.kind === "native")?.agentId
        if (!agentId) throw new Error("缺少验收用 native agent")
        const definition = await call("createSchedule", { name: "整轮结算验收", prompt, agentId, workspace, permission: "allow-all", schedule: { kind: "daily", time: "09:00", timeZone: "Asia/Shanghai" } })
        const run = await call("runScheduleNow", { id: definition.id })
        return { definitionId: definition.id, runId: run.id }
      }, { workspace: dawn.workspace, prompt })
      await page.getByRole("button", { name: "定时", exact: true }).click()
      // 第二次请求已带工具结果：前一条中间发言已经 final，整轮尚未结束。
      await expect.poll(() => requests.some(request => (request as { body?: { messages?: { role: string }[] } }).body?.messages?.at(-1)?.role === "tool")).toBe(true)
      const runRow = page.locator(".schedule-runs .skill-row").first()
      await expect(runRow).toContainText("跑着")
      await expect(runRow).not.toContainText("成功")
      if (cancelled) {
        await page.evaluate(async () => {
          // sessionId 在调度器结算时才写入运行记录；运行中从真实任务取会话。
          const result = await window.dawn!.invoke("listTasks", {})
          if (!result.ok) throw new Error(JSON.stringify(result.error))
          const tasks = result.data as { sessionId?: string }[]
          const sessionId = tasks.find(task => task.sessionId)?.sessionId
          if (!sessionId) throw new Error("缺少运行中的定时会话")
          const stopped = await window.dawn!.invoke("abortSession", { sessionId })
          if (!stopped.ok) throw new Error(JSON.stringify(stopped.error))
        })
      }
      await expect(runRow).toContainText(failed ? "失败" : cancelled ? "取消了" : "成功", { timeout: 30_000 })
      await expect(runRow).toContainText(failed ? "定时工具之后模型失败" : cancelled ? "用户已停止本次定时运行" : "最终回复：分析请求已完整结束")
      const recorded = await page.evaluate(async id => {
        const result = await window.dawn!.invoke("listScheduleRuns", { id, limit: 10 })
        if (!result.ok) throw new Error(JSON.stringify(result.error))
        return result.data as { runs: { id: string; status: string; summary?: string; error?: { code: string } }[] }
      }, task.definitionId)
      const run = recorded.runs.find(run => run.id === task.runId)
      expect(run?.status).toBe(outcome)
      if (failed || cancelled) expect(run?.error?.code).toBe(failed ? "agent_error" : "cancelled")
      else expect(run?.summary).toBe("最终回复：分析请求已完整结束")
    })
  }
})
