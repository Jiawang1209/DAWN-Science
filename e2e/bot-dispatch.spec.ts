import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

test("slash Bot target dispatches without a captain prompt and exposes its member conversation", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进坞(page, "Bot")
  const dock = page.locator("aside.right-dock")
  await dock.getByRole("button", { name: "创建 Bot", exact: true }).click()
  await dock.getByLabel("名称", { exact: true }).fill("数据助手")
  await dock.getByLabel("专业职责", { exact: true }).fill("检查数据")
  await dock.getByLabel("工作指令", { exact: true }).fill("检查数据质量。")
  await dock.getByRole("button", { name: "保存", exact: true }).click()
  const box = page.locator("main.main").getByPlaceholder(/今天帮你做些什么/)
  await box.fill("/数据")
  await page.locator("main.main").getByRole("option").filter({ hasText: "数据助手" }).click()
  await expect(box).toHaveValue(/^\/bot:[^\s]+ /)
  const command = await box.inputValue()
  await box.fill(command + "独立检查")
  await box.press("Enter")
  const card = page.locator("main.main .bot-team-summary")
  await expect(card).toBeVisible()
  await expect.poll(() => dawn.requests.some(request => (request as { body?: { messages?: { role?: string; content?: unknown }[] } }).body?.messages?.some(message => message.role === "user" && JSON.stringify(message.content).includes("[bot-result:")))).toBe(true)
  await expect(page.locator("main.main .turns")).toContainText("已收到 Bot 任务结果并汇总")
  await card.getByRole("button",{name:"查看团队",exact:true}).click()
  await dock.getByRole("button",{name:"查看数据助手的结果",exact:true}).click()
  await dock.getByRole("button", { name: "打开任务：独立检查", exact: true }).click()
  await expect(dock.locator(".bot-chat-title h2")).toHaveText("数据助手")
  await expect(dock.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
  await expect(dock.locator(".turns")).not.toContainText(command.trim())
})

test("accepted dispatch with a lost response restores the draft and retries the same request", async ({ dawn }) => {
  const { page, app } = dawn
  await 在项目里开会话(page)
  await 进坞(page, "Bot")
  const dock = page.locator("aside.right-dock")
  await dock.getByRole("button", { name: "创建 Bot", exact: true }).click()
  await dock.getByLabel("名称", { exact: true }).fill("重试助手")
  await dock.getByLabel("专业职责", { exact: true }).fill("核验派单")
  await dock.getByLabel("工作指令", { exact: true }).fill("完成检查。")
  await dock.getByRole("button", { name: "保存", exact: true }).click()
  const box = page.locator("main.main").getByPlaceholder(/今天帮你做些什么/)
  await box.fill("/重试")
  await page.locator("main.main").getByRole("option").filter({ hasText: "重试助手" }).click()
  const command = (await box.inputValue()) + "一次检查"
  await app.evaluate(({ ipcMain }) => {
    // Wrap the actual IPC handler: the contextBridge renderer API is intentionally frozen.
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => Promise<unknown>> })._invokeHandlers
    const channel = "dawn:workbench:invoke"
    const original = handlers.get(channel)!
    const captured: string[] = []
    ;(globalThis as unknown as { botDispatchRequests: string[] }).botDispatchRequests = captured
    let lose = true
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (...args: unknown[]) => {
      const result = await original(...args)
      if (args[1] === "dispatchBotTask") {
        captured.push((args[2] as { requestId: string }).requestId)
        if (lose) { lose = false; throw Error("模拟派单响应丢失") }
      }
      return result
    })
  })
  await box.fill(command)
  await box.press("Enter")
  await expect(box).toHaveValue(command)
  await expect(page.locator("main.main .composer")).toContainText("模拟派单响应丢失")
  await box.press("Enter")
  await expect(box).toHaveValue("")
  const requests = await app.evaluate(() => (globalThis as unknown as { botDispatchRequests: string[] }).botDispatchRequests)
  expect(requests).toHaveLength(2)
  expect(requests[0]).toBe(requests[1])
  const card = page.locator("main.main .bot-team-summary")
  await expect(card).toHaveCount(1)
  await expect(card).toHaveAttribute("data-returned", "1")
  await expect(page.locator("main.main .turns")).toContainText("已收到 Bot 任务结果并汇总")
})

test("Bot slash dispatch can start an empty native main without sending raw commands to the model", async ({ dawn }) => {
  const { page } = dawn
  await 进坞(page, "Bot")
  const dock = page.locator("aside.right-dock")
  await dock.getByRole("button", { name: "创建 Bot", exact: true }).click()
  await dock.getByLabel("名称", { exact: true }).fill("开场助手")
  await dock.getByLabel("专业职责", { exact: true }).fill("开场检查")
  await dock.getByLabel("工作指令", { exact: true }).fill("完成检查。")
  await dock.getByRole("button", { name: "保存", exact: true }).click()
  const box = page.locator("main.main").getByPlaceholder(/今天帮你做些什么/)
  await box.fill("/开场")
  await page.locator("main.main").getByRole("option").filter({ hasText: "开场助手" }).click()
  const command = (await box.inputValue()) + "首次派单"
  await box.fill(`/plan ${command}`)
  await box.press("Enter")
  await expect(box).toHaveValue(`/plan ${command}`)
  await expect(page.locator("main.main .empty-conv")).toContainText("请先退出生成方案，再调遣 Bot")
  await expect(page.locator("main.main .bot-team-summary")).toHaveCount(0)
  expect(dawn.requests).toHaveLength(0)
  await page.locator("main.main").getByRole("button", { name: "生成方案", exact: true }).click()
  await box.fill(command)
  await box.press("Enter")
  await expect(page.locator("main.main .bot-team-summary")).toHaveCount(1)
  await expect(page.locator("main.main .turns")).toContainText("已收到 Bot 任务结果并汇总")
  expect(dawn.requests.some(request => (request as { body?: { messages?: { role?: string; content?: unknown }[] } }).body?.messages?.some(message => message.role === "user" && JSON.stringify(message.content).includes(command)))).toBe(false)
})
