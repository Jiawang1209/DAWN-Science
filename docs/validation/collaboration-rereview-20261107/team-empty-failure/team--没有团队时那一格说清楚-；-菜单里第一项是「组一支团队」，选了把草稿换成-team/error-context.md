# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: team.spec.ts >> **没有团队时那一格说清楚**；`/` 菜单里第一项是「组一支团队」，选了把草稿换成 /team
- Location: e2e/team.spec.ts:96:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.team-empty')
Expected substring: "这段会话没有团队"
Timeout: 25000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for locator('.team-empty')

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- tablist "同一处的会话":
  - tab "新会话" [selected]
  - button "关掉「新会话」（收进归档）"
  - button "在这里再开一段"
- banner
- button "面板：团队" [expanded]
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
          - button "新会话 刚刚"
          - button "会话操作：新会话": ⋯
  - region "服务器":
    - button "服务器" [expanded]
    - button "添加服务器"
    - paragraph: 还没有服务器
  - button "定时"
  - button "设置"
- separator "调整侧栏宽度"
- main:
  - toolbar "会话工具栏":
    - group "会话操作：新对话":
      - button "查找当前对话"
  - paragraph: 还没有对话
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-kk0eMI/workspace": workspace
  - text: 本机
  - textbox "输入问题，@ 引用文件，/ 使用指令"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 —": —
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
- complementary "团队":
  - separator "调整面板宽度"
  - tablist "面板":
    - tab "文件"
    - tab "产物"
    - tab "笔记本"
    - tab "路线"
    - tab "审阅"
    - tab "团队" [selected]
    - tab "Bot"
  - button "更多面板": ⋯
  - button "关闭面板"
  - region "运行总览":
    - text: 对话协作台
    - heading "协作" [level=3]
    - button "刷新运行记录"
    - button "展开流程工作台"
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - paragraph: 这段会话暂无子任务运行记录
    - group: 查看额度
    - group: 会话完整执行记录
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
  1   | /**
  2   |  * 团队（team-board，2026-08-22，学自 NanmiCoder/dsh-agent-teams）。
  3   |  * 假模型被安排第一句就调 `team_create`：两个成员（项目里定义的两个子 agent）、两项任务（t2 依赖 t1）。
  4   |  * 成员是真的子进程，它们问的也是假模型（答一句暗号）。验的是：任务按依赖先后跑完、结果落进任务、
  5   |  * 坞里「团队」那一格把成员 / 任务 / 结果画出来、对话流里有子 agent 的 chip。
  6   |  */
  7   | import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs"
  8   | import { join } from "node:path"
  9   | import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"
  10  | 
  11  | const 人设 = (name: string) => `---
  12  | name: ${name}
  13  | description: ${name}
  14  | ---
  15  | 你是 ${name}。用一句话回答。
  16  | `
  17  | 
  18  | test.describe("组一支团队", () => {
  19  |   test.use({
  20  |     dawnOptions: {
  21  |       gitInit: true,
  22  |       toolCall: {
  23  |         toolName: "team_create",
  24  |         args: {
  25  |           name: "审稿小队",
  26  |           goal: "把这个仓库审一遍",
  27  |           members: [
  28  |             { name: "踏勘", agent: "scout", role: "先看一眼" },
  29  |             // 作者 2026-08-22 要的：成员各自的模型。审稿用另一个模型，踏勘跟队长
  30  |             { name: "审稿", agent: "reviewer", role: "挑毛病", model: "deepseek/deepseek-v4-deep" },
  31  |           ],
  32  |           tasks: [
  33  |             { id: "t1", subject: "看看仓库里有什么", assignee: "踏勘" },
  34  |             { id: "t2", subject: "基于 {t1} 挑三个问题", dependencies: ["t1"], assignee: "审稿" },
  35  |           ],
  36  |         },
  37  |         once: true,
  38  |       },
  39  |     },
  40  |   })
  41  | 
  42  |   test("**任务按依赖跑完，结果落进任务；坞里那一格与对话流都看得见**", async ({ dawn }) => {
  43  |     const { page, workspace } = dawn
  44  |     mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
  45  |     writeFileSync(join(workspace, ".dawn", "agents", "scout.md"), 人设("scout"))
  46  |     writeFileSync(join(workspace, ".dawn", "agents", "reviewer.md"), 人设("reviewer"))
  47  | 
  48  |     await expect(page.locator(".app-shell")).toBeVisible()
  49  |     await 在项目里开会话(page)
  50  |     await page.getByPlaceholder(/输入问题/).fill("/team 审一遍这个仓库")
  51  |     await page.keyboard.press("Enter")
  52  | 
  53  |     // 工具行：team_create 成功
  54  |     const 工具 = page.locator(".tool").filter({ hasText: "team_create" }).first()
  55  |     await expect(工具).toHaveAttribute("data-status", "ok", { timeout: 60_000 })
  56  | 
  57  |     // 坞里「团队」那一格
  58  |     await 进坞(page, "团队")
  59  |     const 格 = page.locator(".team-panel")
  60  |     await expect(格).toBeVisible()
  61  |     await expect(格.locator(".team-name")).toHaveText("审稿小队")
  62  |     // 按层次：两个成员组，各自底下一项任务（2026-08-23 起成员默认收起，点开才看任务——照 dsh-agent-teams 那张图）
  63  |     await expect(格.locator(".team-group")).toHaveCount(2)
  64  |     for (const 名 of ["踏勘", "审稿"]) await 格.locator(`.team-group[data-member="${名}"] .team-group-head`).click()
  65  |     await expect(格.locator(".team-task")).toHaveCount(2)
  66  |     await expect(格.locator('.team-group[data-member="踏勘"] .team-task[data-task="t1"]')).toHaveCount(1)
  67  |     await expect(格.locator('.team-group[data-member="审稿"] .team-task[data-task="t2"]')).toHaveCount(1)
  68  |     // t2 先等着（t1 没完成不能领）
  69  |     await expect(格.locator('.team-task[data-task="t2"]')).toContainText("依赖 t1")
  70  |     // 两项都完成（成员是真子进程、问假模型）
  71  |     await expect(格.locator('.team-task[data-task="t1"]')).toHaveAttribute("data-status", "completed", { timeout: 90_000 })
  72  |     await expect(格.locator('.team-task[data-task="t2"]')).toHaveAttribute("data-status", "completed", { timeout: 90_000 })
  73  |     await expect(格.locator(".team-progress")).toContainText("2 / 2 完成")
  74  |     // 点开 t2 看结果：假模型的暗号
  75  |     await 格.locator('.team-task[data-task="t2"] .team-task-head').click()
  76  |     await expect(格.locator('.team-task[data-task="t2"] .team-task-output')).toContainText("假模型已应答")
  77  |     // 成员空闲、各跑了一轮；审稿那一行写着它自己的模型，踏勘没写（跟队长）
  78  |     await expect(格.locator('.team-group[data-member="踏勘"] .team-group-body')).toContainText("1 轮")
  79  |     await expect(格.locator('.team-group[data-member="审稿"] .team-group-head')).toContainText("deepseek-v4-deep")
  80  |     await expect(格.locator('.team-group[data-member="踏勘"] .team-group-head')).not.toContainText("deepseek-v4")
  81  | 
  82  |     // 对话流里的 chip 组：两轮
  83  |     await expect(page.locator(".subagents .chip")).toHaveCount(2, { timeout: 30_000 })
  84  | 
  85  |     // 磁盘真相：会话目录下 teams/<id>/team.json 与每个成员的会话目录
  86  |     const sessions = join(workspace, ".dawn", "sessions")
  87  |     const sid = readdirSync(sessions)[0]!
  88  |     const teams = join(sessions, sid, "teams")
  89  |     const id = readFileSync(join(teams, "current"), "utf8").trim()
  90  |     const team = JSON.parse(readFileSync(join(teams, id, "team.json"), "utf8")) as { tasks: { id: string; status: string; attempt: number }[] }
  91  |     expect(team.tasks.map((t) => [t.id, t.status, t.attempt])).toEqual([["t1", "completed", 1], ["t2", "completed", 1]])
  92  |     expect(existsSync(join(teams, id, "members", "踏勘"))).toBe(true)
  93  |   })
  94  | })
  95  | 
  96  | test("**没有团队时那一格说清楚**；`/` 菜单里第一项是「组一支团队」，选了把草稿换成 /team", async ({ dawn }) => {
  97  |   const { page } = dawn
  98  |   await 在项目里开会话(page)
  99  |   await 进坞(page, "团队")
> 100 |   await expect(page.locator(".team-empty")).toContainText("这段会话没有团队")
      |                                             ^ Error: expect(locator).toContainText(expected) failed
  101 |   const 框 = page.getByPlaceholder(/输入问题/)
  102 |   await 框.fill("/")
  103 |   await expect(page.locator(".slash-menu .slash-item").first()).toContainText("组一支团队")
  104 |   await page.keyboard.press("Enter")
  105 |   await expect(框).toHaveValue("/team ")
  106 | })
  107 | 
  108 | test.describe("成员指了一个目录里没有的模型", () => {
  109 |   test.use({
  110 |     dawnOptions: {
  111 |       gitInit: true,
  112 |       toolCall: {
  113 |         toolName: "team_create",
  114 |         args: { name: "x", goal: "g", members: [{ name: "甲", agent: "scout", model: "deepseek/不存在的模型" }], tasks: [] },
  115 |         once: true,
  116 |       },
  117 |     },
  118 |   })
  119 |   test("**建队时就拒**，并说清有哪些模型——不让它跑起来才报", async ({ dawn }) => {
  120 |     const { page, workspace } = dawn
  121 |     mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
  122 |     writeFileSync(join(workspace, ".dawn", "agents", "scout.md"), 人设("scout"))
  123 |     await 在项目里开会话(page)
  124 |     await page.getByPlaceholder(/输入问题/).fill("/team 随便")
  125 |     await page.keyboard.press("Enter")
  126 |     const 工具 = page.locator(".tool").filter({ hasText: "team_create" }).first()
  127 |     await expect(工具).toHaveAttribute("data-status", "error", { timeout: 60_000 })
  128 |     // 失败的那条**自己会展开**（2026-09-15 修好的；此前从没展开过，这里靠点一下才看得到）——不再去点，点了反而收起
  129 |     await expect(工具.locator(".tool-head")).toHaveAttribute("aria-expanded", "true")
  130 |     await expect(工具.locator(".tool-result")).toContainText("没有模型「不存在的模型」")
  131 |     await expect(工具.locator(".tool-result")).toContainText("deepseek-flash")
  132 |   })
  133 | })
  134 | 
```