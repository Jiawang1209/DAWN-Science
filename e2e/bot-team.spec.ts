import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

type StoredTeam = {
  captainSessionId: string
  members: { name: string; botId: string; sessionId: string }[]
  tasks: { id: string; status: string; dependencies: string[]; attempt: number; output?: string }[]
}

test("native captain selects configured Bots and delivers executed dependency results", async ({ dawn }, testInfo) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "input.csv"), "x,y\n1,3\n2,5\n3,7\n4,9\n5,11\n")
  await 在项目里开会话(page)
  const ids = await page.evaluate(async () => {
    const bots = []
    for (const [name, role, sentinel] of [["数据验收", "数据检查", "DATA"], ["统计验收", "统计建模", "STATS"], ["绘图验收", "绘图交付", "PLOT"]]) {
      const r = await window.dawn!.invoke("createBot", { name, role, instructions: `BOT_ACCEPT_${sentinel}：执行真实工具并保留脚本与结果。` }) as { data: { bot: { id: string } } }
      bots.push(r.data.bot.id)
    }
    return bots
  })
  // Registry refresh follows the same Bot dock path used after management changes.
  await 进坞(page, "Bot")
  await expect(page.locator("aside.right-dock .bot-list li")).toHaveCount(3)
  const main = page.locator("main.main")
  const composer = main.getByPlaceholder(/输入问题/)
  await composer.fill("Bot协作验收：请根据已有 Bot 的职责组队，检查 input.csv，执行回归并交付脚本、说明和图表。")
  await composer.press("Enter")
  await expect(main.getByRole("button", { name: /调用了.*bot_list.*team_create/ })).toBeVisible()
  await expect(main.locator(".bot-team-summary")).toBeVisible()
  await expect(main.locator('.bot-team-summary[data-returned="3"]')).toBeVisible({ timeout: 45_000 })

  const sessions = join(workspace, ".dawn", "sessions")
  const owner = readdirSync(sessions).find(id => existsSync(join(sessions, id, "teams", "current")))!
  expect(owner).toBeTruthy()
  const teams = join(sessions, owner, "teams")
  const teamId = readFileSync(join(teams, "current"), "utf8").trim()
  const team = JSON.parse(readFileSync(join(teams, teamId, "team.json"), "utf8")) as StoredTeam
  expect(team.captainSessionId).toBe(owner)
  expect(team.members.map(m => m.botId).sort()).toEqual([...ids].sort())
  expect(new Set(team.members.map(m => m.sessionId)).size).toBe(3)
  expect(team.tasks.map(t => [t.id, t.status, t.dependencies, t.attempt])).toEqual([
    ["t1", "completed", [], 1], ["t2", "completed", ["t1"], 1], ["t3", "completed", ["t2"], 1],
  ])
  for (const task of team.tasks) expect(task.output).toBeTruthy()
  const quality = JSON.parse(readFileSync(join(workspace, "results/quality.json"), "utf8"))
  const model = JSON.parse(readFileSync(join(workspace, "results/model.json"), "utf8"))
  expect(quality).toEqual({ n: 5, missing: 0 })
  expect(model).toEqual({ n: 5, slope: 2, intercept: 1 })
  expect(readFileSync(join(workspace, "results/model.csv"), "utf8").trim().split(/\r?\n/)).toEqual(["n,slope,intercept", "5,2.0,1.0"])
  for (const artifact of ["scripts/model.py", "scripts/plot.py", "results/model.csv", "notes/data.md", "notes/method.md", "figures/regression.svg"]) {
    expect(readFileSync(join(workspace, artifact), "utf8").length).toBeGreaterThan(20)
  }
  expect(readFileSync(join(workspace, "figures/regression.svg"), "utf8")).toContain("y = 2.0x + 1.0; n=5")
  await expect.poll(() => dawn.requests.some(request => {
    const messages = (request as { body?: { messages?: { role?: string; content?: unknown }[] } }).body?.messages ?? []
    return messages.some(m => m.role === "tool" && ids.every(id => JSON.stringify(m.content).includes(id)))
  })).toBe(true)
  await expect(main.locator(".turns")).toContainText("已收到 Bot 任务结果并汇总")
  await main.getByRole("button",{name:/查看交付/}).click()
  const dock=page.locator("aside.right-dock")
  await dock.getByRole("button", { name: "查看产物：model.py", exact: true }).click()
  const preview = dock.locator(".bot-overview-scroll .bot-artifact-preview")
  await expect(preview).toContainText("model.py")
  await expect(preview).toContainText("Ordinary least squares")
  await main.screenshot({ path: testInfo.outputPath("bot-team-delivered.png") })
  await main.getByRole("button", { name: "查看团队", exact: true }).click()
  await dock.getByRole("button", { name: "查看统计验收的结果",exact:true }).click()
  await dock.getByRole("button", { name: "打开任务：统计分析", exact: true }).click()
  await expect(page.locator("aside.right-dock .bot-chat-title h2")).toHaveText("统计验收")
  await expect(page.locator("aside.right-dock .turns")).toContainText("已执行统计")
})
