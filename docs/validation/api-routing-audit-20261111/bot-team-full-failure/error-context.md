# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bot-team.spec.ts >> native captain selects configured Bots and delivers executed dependency results
- Location: e2e/bot-team.spec.ts:11:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('main.main').locator('.bot-team-summary[data-returned="3"]')
Expected: visible
Timeout: 45000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 45000ms
  - waiting for locator('main.main').locator('.bot-team-summary[data-returned="3"]')

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- tablist "同一处的会话":
  - tab "新会话"
  - button "关掉「新会话」（收进归档）"
  - tab "Bot协作验收：请根据已有 Bot 的职" [selected]
  - button "关掉「Bot协作验收：请根据已有 Bot 的职」（收进归档）"
  - button "在这里再开一段"
- banner
- button "面板：Bot" [expanded]
- complementary:
  - button "新建任务"
  - separator
  - text: 工作区
  - button "搜索"
  - button "添加工作区文件夹"
  - paragraph:
    - button "项目 1" [expanded]
    - button "多选项目": 多选
  - list:
    - listitem:
      - button "workspace"
      - button "在「workspace」里开一段新对话"
      - button "项目操作：workspace": ⋯
      - list:
        - listitem:
          - button "Bot协作验收：请根据已有 Bot 的职 刚刚"
          - button "会话操作：Bot协作验收：请根据已有 Bot 的职": ⋯
  - region "服务器":
    - button "服务器" [expanded]
    - button "添加服务器"
    - paragraph: 还没有服务器
  - button "定时"
  - button "设置"
- separator "调整侧栏宽度"
- main:
  - region "Bot 团队进展":
    - strong: Bot 科研验收
    - text: 任务已返回 2/3 · 处理中 0 · 等待 0
    - paragraph: 绘图验收 · 已取消
    - button "查看团队"
    - button "查看交付 · 5 个文件"
  - button "打开协作：3 项任务 · 0 项验收通过":
    - strong: 协作
    - text: 协作已取消 3 项任务 · 0 项验收通过
  - toolbar "会话工具栏":
    - group "会话操作：Bot协作验收：请根据已有 Bot 的职":
      - button "查找当前对话"
      - button "导出对话"
  - text: 你
  - paragraph: Bot协作验收：请根据已有 Bot 的职责组队，检查 input.csv，执行回归并交付脚本、说明和图表。
  - time: 2026-11-11 03:08
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - button "已完成 用时 0.5 秒 7 步" [expanded]
  - button "✓ 调用了 1 次 bot_list、调用了 1 次 team_create"
  - text: 子 agent 3/3
  - button "✓ data · t1 完成"
  - button "✓ stats · t2 完成"
  - button "✗ plot · t3 失败"
  - paragraph: Bot 执行已停止。
  - button "✓ 调用了 5 次 team_wait"
  - status "这一轮没做成":
    - paragraph:
      - strong: 这一轮没做成
      - text: 检测到重复调用：最近 16 批里，同一组工具调用（team_wait）以完全相同的参数出现了 5 次，没有产生新进展，已中断以免继续消耗额度。通常是模型退化——可以换更强的模型，或换一种问法再试。
  - text: DeepSeek
  - paragraph: 已收到 Bot 任务结果并汇总：Bot Team 任务结果已返回。根据实际状态汇总交付；失败或取消不能说全部完成，尚未核验的产物请先核验。 [bot-result:team-mwb2cpqz:t1:4660f06d-f9fb-41ad-aa16-1c6ade3f92bf] Bot 45d3a793-7d32-46a3-bf49-bfc910886b2e / team-mwb2cpqz / t1 / completed 已检查数据：质量报告 [blocked] 检查说明 [blocked]
  - paragraph: 产物：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-jlaBbv/workspace/results/quality.json、/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-jlaBbv/workspace/notes/data.md
  - paragraph: "[bot-result:team-mwb2cpqz:t2:9d8c8f4a-b5f4-49a1-94cf-fd394e41da54] Bot cc8cdefc-c6f8-471d-b807-8e8ed05d5584 / team-mwb2cpqz / t2 / completed 已执行统计：分析脚本 [blocked] 系数表 [blocked] 方法说明 [blocked]"
  - paragraph: 产物：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-jlaBbv/workspace/scripts/model.py、/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-jlaBbv/workspace/results/model.csv、/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-jlaBbv/workspace/notes/method.md
  - paragraph: "[bot-result:team-mwb2cpqz:t3:cancelled] Bot a4323ce0-c8fa-4a0d-b1c7-b7c71c56056d / team-mwb2cpqz / t3 / cancelled 任务已取消；不采用取消后到达的结果。 产物：未提供已核验产物"
  - note: 本轮产出未知 远端会话或非 git 工作区，探针没跑
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-jlaBbv/workspace": workspace
  - text: 本机
  - textbox "输入问题，@ 引用文件，/ 使用指令"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 <1%": <1%
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
  - text: 1 轮 · 工具 7 次 517 ms · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
- complementary "Bot":
  - separator "调整面板宽度"
  - tablist "面板":
    - tab "文件"
    - tab "产物"
    - tab "笔记本"
    - tab "路线"
    - tab "Bot" [selected]
  - button "更多面板": ⋯
  - button "关闭面板"
  - heading "Bot" [level=2]
  - button "创建 Bot"
  - tablist "Bot 视图":
    - tab "助手"
    - tab "团队对话" [selected]
  - region "团队对话":
    - strong: 团队协作
    - button "完整讨论 · 5"
    - region "团队进展摘要":
      - strong: Bot 科研验收
      - text: 3 位成员
      - paragraph: 检查 input.csv、实际执行回归并交付脚本和图表
      - text: 任务已返回 2/3 处理中 0 等待 0
      - button "查看交付 · 5 个文件"
    - region "需要关注":
      - strong: 需要关注
      - button "绘图验收 · 已取消"
    - group "团队成员":
      - img "数据验收的头像"
      - strong: 数据验收
      - text: 任务已返回
      - paragraph: 检查数据
      - text: 2 个文件 · 可接新任务
      - button "查看数据验收的结果": 查看结果
      - button "向数据验收发言": 发言
      - img "统计验收的头像"
      - strong: 统计验收
      - text: 任务已返回
      - paragraph: 统计分析
      - text: 3 个文件 · 可接新任务
      - button "查看统计验收的结果": 查看结果
      - button "向统计验收发言": 发言
      - img "绘图验收的头像"
      - strong: 绘图验收
      - text: 已取消
      - paragraph: 绘制回归图
      - text: 0 个文件 · 可接新任务
      - button "查看绘图验收的结果": 查看任务
      - button "向绘图验收发言": 发言
    - textbox "给团队发消息":
      - /placeholder: 补充要求，或向队友提问…
    - combobox "发言对象":
      - option "整个团队" [selected]
      - option "数据验收"
      - option "统计验收"
      - option "绘图验收"
    - button "发表到团队" [disabled]: 发表消息
    - paragraph: 忙碌的队友会在下一轮收到消息
- contentinfo "应用状态":
  - button "还没有填任何 API key，暂时不能对话——点这里填一个"
  - button "当前模型：deepseek-flash": deepseek-flash
  - button "R：未配置": R 未配置
  - button "Python：未配置": Python 未配置
  - button "插件 8"
  - button "Skills 9"
  - button "MCP 0"
  - button "子 Agent 22"
  - button "版本 v0.0.44": v0.0.44
```

# Test source

```ts
  1  | import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
  2  | import { join } from "node:path"
  3  | import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"
  4  | 
  5  | type StoredTeam = {
  6  |   captainSessionId: string
  7  |   members: { name: string; botId: string; sessionId: string }[]
  8  |   tasks: { id: string; status: string; dependencies: string[]; attempt: number; output?: string }[]
  9  | }
  10 | 
  11 | test("native captain selects configured Bots and delivers executed dependency results", async ({ dawn }, testInfo) => {
  12 |   const { page, workspace } = dawn
  13 |   writeFileSync(join(workspace, "input.csv"), "x,y\n1,3\n2,5\n3,7\n4,9\n5,11\n")
  14 |   await 在项目里开会话(page)
  15 |   const ids = await page.evaluate(async () => {
  16 |     const bots = []
  17 |     for (const [name, role, sentinel] of [["数据验收", "数据检查", "DATA"], ["统计验收", "统计建模", "STATS"], ["绘图验收", "绘图交付", "PLOT"]]) {
  18 |       const r = await window.dawn!.invoke("createBot", { name, role, instructions: `BOT_ACCEPT_${sentinel}：执行真实工具并保留脚本与结果。` }) as { data: { bot: { id: string } } }
  19 |       bots.push(r.data.bot.id)
  20 |     }
  21 |     return bots
  22 |   })
  23 |   // Registry refresh follows the same Bot dock path used after management changes.
  24 |   await 进坞(page, "Bot")
  25 |   await expect(page.locator("aside.right-dock .bot-list li")).toHaveCount(3)
  26 |   const main = page.locator("main.main")
  27 |   const composer = main.getByPlaceholder(/输入问题/)
  28 |   await composer.fill("Bot协作验收：请根据已有 Bot 的职责组队，检查 input.csv，执行回归并交付脚本、说明和图表。")
  29 |   await composer.press("Enter")
  30 |   await expect(main.getByRole("button", { name: /调用了.*bot_list.*team_create/ })).toBeVisible()
  31 |   await expect(main.locator(".bot-team-summary")).toBeVisible()
> 32 |   await expect(main.locator('.bot-team-summary[data-returned="3"]')).toBeVisible({ timeout: 45_000 })
     |                                                                      ^ Error: expect(locator).toBeVisible() failed
  33 | 
  34 |   const sessions = join(workspace, ".dawn", "sessions")
  35 |   const owner = readdirSync(sessions).find(id => existsSync(join(sessions, id, "teams", "current")))!
  36 |   expect(owner).toBeTruthy()
  37 |   const teams = join(sessions, owner, "teams")
  38 |   const teamId = readFileSync(join(teams, "current"), "utf8").trim()
  39 |   const team = JSON.parse(readFileSync(join(teams, teamId, "team.json"), "utf8")) as StoredTeam
  40 |   expect(team.captainSessionId).toBe(owner)
  41 |   expect(team.members.map(m => m.botId).sort()).toEqual([...ids].sort())
  42 |   expect(new Set(team.members.map(m => m.sessionId)).size).toBe(3)
  43 |   expect(team.tasks.map(t => [t.id, t.status, t.dependencies, t.attempt])).toEqual([
  44 |     ["t1", "completed", [], 1], ["t2", "completed", ["t1"], 1], ["t3", "completed", ["t2"], 1],
  45 |   ])
  46 |   for (const task of team.tasks) expect(task.output).toBeTruthy()
  47 |   const quality = JSON.parse(readFileSync(join(workspace, "results/quality.json"), "utf8"))
  48 |   const model = JSON.parse(readFileSync(join(workspace, "results/model.json"), "utf8"))
  49 |   expect(quality).toEqual({ n: 5, missing: 0 })
  50 |   expect(model).toEqual({ n: 5, slope: 2, intercept: 1 })
  51 |   expect(readFileSync(join(workspace, "results/model.csv"), "utf8").trim().split(/\r?\n/)).toEqual(["n,slope,intercept", "5,2.0,1.0"])
  52 |   for (const artifact of ["scripts/model.py", "scripts/plot.py", "results/model.csv", "notes/data.md", "notes/method.md", "figures/regression.svg"]) {
  53 |     expect(readFileSync(join(workspace, artifact), "utf8").length).toBeGreaterThan(20)
  54 |   }
  55 |   expect(readFileSync(join(workspace, "figures/regression.svg"), "utf8")).toContain("y = 2.0x + 1.0; n=5")
  56 |   await expect.poll(() => dawn.requests.some(request => {
  57 |     const messages = (request as { body?: { messages?: { role?: string; content?: unknown }[] } }).body?.messages ?? []
  58 |     return messages.some(m => m.role === "tool" && ids.every(id => JSON.stringify(m.content).includes(id)))
  59 |   })).toBe(true)
  60 |   await expect(main.locator(".turns")).toContainText("已收到 Bot 任务结果并汇总")
  61 |   await main.getByRole("button",{name:/查看交付/}).click()
  62 |   const dock=page.locator("aside.right-dock")
  63 |   await dock.getByRole("button", { name: "查看产物：model.py", exact: true }).click()
  64 |   const preview = dock.locator(".bot-overview-scroll .bot-artifact-preview")
  65 |   await expect(preview).toContainText("model.py")
  66 |   await expect(preview).toContainText("Ordinary least squares")
  67 |   await main.screenshot({ path: testInfo.outputPath("bot-team-delivered.png") })
  68 |   await main.getByRole("button", { name: "查看团队", exact: true }).click()
  69 |   await dock.getByRole("button", { name: "查看统计验收的结果",exact:true }).click()
  70 |   await dock.getByRole("button", { name: "打开任务：统计分析", exact: true }).click()
  71 |   await expect(page.locator("aside.right-dock .bot-chat-title h2")).toHaveText("统计验收")
  72 |   await expect(page.locator("aside.right-dock .turns")).toContainText("已执行统计")
  73 | })
  74 | 
```