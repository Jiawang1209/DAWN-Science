# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: side-session.spec.ts >> 侧边对话 · 团队 chip >> **点坞里的团队 chip → 团队格是坞里那段的队，并写明来源；从标签栏进回到主区那段**
- Location: e2e/side-session.spec.ts:309:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('aside.right-dock').locator('.team-panel')
Expected: visible
Received: hidden
Timeout:  30000ms

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for locator('aside.right-dock').locator('.team-panel')
    62 × locator resolved to <div data-finished="0" class="team-panel" data-team="team-mw5oc9c9">…</div>
       - unexpected value "hidden"

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- tablist "同一处的会话":
  - tab "/team 审一遍这个仓库 坞"
  - button "关掉「/team 审一遍这个仓库」（收进归档）"
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
          - button "/team 审一遍这个仓库 刚刚"
          - button "会话操作：/team 审一遍这个仓库": ⋯
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
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-LfVUIK/workspace": workspace
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
  - paragraph: 坞里那段对话的团队
  - region "运行总览":
    - text: 对话协作台
    - heading "协作" [level=3]
    - button "刷新运行记录"
    - button "展开流程工作台"
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - strong: 1 项任务
    - text: 0 项验收通过 0 项活跃
    - heading "任务板" [level=4]
    - button "看看仓库里有什么"
    - button "scout" [pressed]:
      - strong: scout
      - text: 执行完成 团队成员 累计结算 0.5 秒
    - strong: scout
    - text: 类型 team · 执行代次 1
    - tablist "任务详情":
      - tab "过程" [selected]
      - tab "交接"
      - tab "产物"
      - tab "记录"
    - tabpanel "过程":
      - paragraph: 执行完成
      - paragraph: 普通委派任务
      - paragraph: 暂无宿主验收回执
      - group: 关键执行历史
    - group: 查看额度
    - group: 会话完整执行记录
  - group: 团队管理与原始记录
- contentinfo "应用状态":
  - button "还没有填任何 API key，暂时不能对话——点这里填一个"
  - button "当前模型：deepseek-flash": deepseek-flash
  - button "R：未配置": R 未配置
  - button "Python：未配置": Python 未配置
  - button "插件 8"
  - button "Skills 9"
  - button "MCP 0"
  - button "子 Agent 23"
  - button "版本 v0.0.44": v0.0.44
```

# Test source

```ts
  225 |     await expect(另开).toBeVisible()
  226 |     expect(await 另开.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  227 |     await expect(坞(page).getByText("这段对话不属于任何项目，坞里没法另开", { exact: true })).toHaveCount(0)
  228 | 
  229 |     await 另开.click()
  230 |     await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
  231 |     await 框(坞(page)).waitFor({ timeout: 30_000 })
  232 | 
  233 |     await 说(坞(page), "坞里开的头")
  234 |     await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
  235 |     /** 主区还是原来那段：标题没换、坞里那句没串过去 */
  236 |     await expect(page.locator(".topbar .conv-title")).toContainText("起个头")
  237 |     await expect(主区(page).locator(".turns")).not.toContainText("坞里开的头")
  238 |     /** 新那段是一段临时会话：落进侧栏「会话」那一组，不是哪个项目底下 */
  239 |     await expect(page.locator(".session-list > li")).toHaveCount(2, { timeout: 30_000 })
  240 |     await expect(page.locator(".session-list .sess .name").filter({ hasText: "坞里开的头" })).toBeVisible({ timeout: 30_000 })
  241 |   })
  242 | })
  243 | 
  244 | const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")
  245 | 
  246 | test.describe("侧边对话 · ACP", () => {
  247 |   test.use({
  248 |     dawnOptions: {
  249 |       providersYaml: `agents:
  250 |   ds-chat:
  251 |     kind: native
  252 |     provider: deepseek
  253 |     model: deepseek-flash
  254 |     capabilities: [chat, exec]
  255 |   claude-acp:
  256 |     kind: acp
  257 |     command: node
  258 |     args: ["${假ACP}"]
  259 |     capabilities: [chat, exec]
  260 | `,
  261 |     },
  262 |   })
  263 | 
  264 |   test("**ACP 那段挂进坞，直说它看不见主对话**", async ({ dawn }) => {
  265 |     const { page } = dawn
  266 |     /** 先在项目里建一段 ACP 会话，再由夹具建一段 ds-chat 并切过去（最新的排最前） */
  267 |     await page.locator(".app-shell").waitFor({ timeout: 60_000 })
  268 |     await page.evaluate(async () => {
  269 |       const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
  270 |       const r = (await w.dawn.invoke("listProjects", {})) as { data?: { workspace: string }[] }
  271 |       await w.dawn.invoke("createTask", { agentId: "claude-acp", workspace: r.data?.[0]?.workspace })
  272 |     })
  273 |     await 在项目里开会话(page)
  274 |     /** 前提：主区是 native 那段——它有模型 pill，ACP 会话没有（acp-agent.spec.ts 盯着那条） */
  275 |     await expect(主区(page).locator(".composer-card .model-pill")).toHaveCount(1)
  276 | 
  277 |     await 进坞(page, "对话")
  278 |     const 挑 = 坞(page).locator(".side-chat-pick")
  279 |     await expect(挑).toHaveCount(1)
  280 |     await 挑.click()
  281 |     await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
  282 |     await expect(坞(page).getByText("这个 agent 看不见主对话", { exact: true })).toBeVisible()
  283 |   })
  284 | })
  285 | 
  286 | /**
  287 |  * **坞里那段对话的团队 chip 打开的是它自己的团队**（2026-09-29）。此前 `$团队` 只载主区那段：
  288 |  * 主区没组队时点坞里的 chip，团队格说「这段会话没有团队」。从标签栏进团队格仍看主区那段（行为照旧）。
  289 |  */
  290 | test.describe("侧边对话 · 团队 chip", () => {
  291 |   test.use({
  292 |     dawnOptions: {
  293 |       gitInit: true,
  294 |       toolCall: [
  295 |         {
  296 |           toolName: "team_create",
  297 |           when: "审一遍这个仓库",
  298 |           args: {
  299 |             name: "审稿小队",
  300 |             goal: "把这个仓库审一遍",
  301 |             members: [{ name: "踏勘", agent: "scout", role: "先看一眼" }],
  302 |             tasks: [{ id: "t1", subject: "看看仓库里有什么", assignee: "踏勘" }],
  303 |           },
  304 |         },
  305 |       ],
  306 |     },
  307 |   })
  308 | 
  309 |   test("**点坞里的团队 chip → 团队格是坞里那段的队，并写明来源；从标签栏进回到主区那段**", async ({ dawn }) => {
  310 |     const { page, workspace } = dawn
  311 |     mkdirSync(join(workspace, ".dawn", "agents"), { recursive: true })
  312 |     writeFileSync(
  313 |       join(workspace, ".dawn", "agents", "scout.md"),
  314 |       "---\nname: scout\ndescription: scout\n---\n你是 scout。用一句话回答。\n",
  315 |     )
  316 |     await 在项目里开会话(page)
  317 |     await 坞里另开一段(page)
  318 |     await 说(坞(page), "/team 审一遍这个仓库")
  319 |     await expect(坞(page).locator(".tool").filter({ hasText: "team_create" }).first()).toHaveAttribute("data-status", "ok", {
  320 |       timeout: 60_000,
  321 |     })
  322 | 
  323 |     await 坞(page).locator(".side-chat .chip-group .chip").first().click()
  324 |     const 格 = 坞(page).locator(".team-panel")
> 325 |     await expect(格).toBeVisible({ timeout: 30_000 })
      |                     ^ Error: expect(locator).toBeVisible() failed
  326 |     await expect(格.locator(".team-name")).toHaveText("审稿小队")
  327 |     await expect(格.locator('[data-team-source="side"]')).toBeVisible()
  328 | 
  329 |     await 进坞(page, "对话")
  330 |     await 进坞(page, "团队")
  331 |     // 空态不在 `.team-panel` 里（`.team-empty-wrap`）——按坞整格判
  332 |     await expect(坞(page)).toContainText("这段会话没有团队")
  333 |     await expect(坞(page).locator('[data-team-source="side"]')).toHaveCount(0)
  334 |   })
  335 | })
  336 | 
  337 | /**
  338 |  * **新建任务那一屏打开坞里的对话 → 另开的是普通对话**（2026-09-29 作者报的）：
  339 |  * 此前主区没会话时坞退到「当前项目」（人上一次待过的那个），没选文件夹，坞里那段却建在那个文件夹里。
  340 |  * 夹具自带一个项目，正好是那个「上一次待过的」。
  341 |  */
  342 | test("**新建任务那一屏：坞里另开一段是普通对话，不带文件夹**", async ({ dawn }) => {
  343 |   const { page } = dawn
  344 |   await 主区(page).locator(".composer-card").waitFor({ timeout: 30_000 })
  345 |   await 坞里另开一段(page)
  346 |   // 坞里那段落在侧栏「会话」那一组，不在「项目」下
  347 |   const 分区 = await page.locator(".sidebar .side-section").allTextContents()
  348 |   expect(分区.some((t) => t.startsWith("会话"))).toBe(true)
  349 |   await expect(page.locator(".proj-list .proj-item")).toHaveCount(0)
  350 |   // 坞里输入卡上没有文件夹名
  351 |   await expect(坞(page).locator(".composer-card .ws-chip-label")).toHaveCount(0)
  352 | })
  353 | 
  354 | /**
  355 |  * **坞里的输入卡与主区同高、底边对齐**（2026-09-29，作者选的「底边对齐 + 同高」）。
  356 |  * 笔记本屏（坞开着）主区附栏折两行，坞里也两行；大屏主区一行放得下，坞里跟着排成一行（「上传文件」只留图标）。
  357 |  * 两种宽度都量：只量一种的话，另一种会悄悄错开一行（实测 1920 下 203 vs 176）。
  358 |  */
  359 | for (const [宽, 高] of [[1280, 900], [1920, 1080]] as const) {
  360 |   test(`**${宽} 宽：窄栏工具可分行，输入正文同高、底边对齐**`, async ({ dawn }) => {
  361 |     const { page, app } = dawn
  362 |     await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [宽, 高])
  363 |     await 开一段临时会话(page, "你好")
  364 |     await 坞里另开一段(page)
  365 |     const 量 = async () => {
  366 |       const measure = (area: import("@playwright/test").Locator) => area.locator(".composer-card").evaluate(el => {const card=el.getBoundingClientRect(),footer=el.querySelector(".composer-footer")!.getBoundingClientRect();return {height:card.height-footer.height,bottom:card.bottom}})
  367 |       const [主,侧] = await Promise.all([measure(主区(page)),measure(坞(page))])
  368 |       return 主 && 侧 ? { 高差: Math.round(Math.abs(主.height - 侧.height)), 底差: Math.round(Math.abs(主.bottom - 侧.bottom)) } : undefined
  369 |     }
  370 |     await expect.poll(量, { timeout: 10_000 }).toEqual({ 高差: 0, 底差: 0 })
  371 |     // 空占位文字不撑高；真实内容仍能增高，清空后收回。
  372 |     const input = 框(坞(page))
  373 |     const 空高 = await input.evaluate(el => el.getBoundingClientRect().height)
  374 |     const 一行高度 = await input.evaluate(el => {
  375 |       const s = getComputedStyle(el)
  376 |       return Math.max(44, parseFloat(s.lineHeight) + parseFloat(s.paddingTop) + parseFloat(s.paddingBottom))
  377 |     })
  378 |     expect(空高).toBeCloseTo(一行高度, 1)
  379 |     expect(await input.evaluate(el => el.scrollHeight)).toBeLessThanOrEqual(
  380 |       await input.evaluate(el => el.clientHeight + 1),
  381 |     )
  382 |     await input.fill("第一行\n第二行\n第三行")
  383 |     await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(空高)
  384 |     await input.fill("")
  385 |     await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBe(空高)
  386 |     await expect.poll(量).toEqual({ 高差: 0, 底差: 0 })
  387 |     await test.info().attach("aligned-composers", { body: await page.screenshot(), contentType: "image/png" })
  388 |   })
  389 | }
  390 | 
```