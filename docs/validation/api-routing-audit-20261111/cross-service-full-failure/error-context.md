# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cross-service-switch.spec.ts >> **换到另一家，对话不断**
- Location: e2e/cross-service-switch.spec.ts:27:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('contentinfo', { name: '应用状态' }).getByRole('button', { name: '当前模型：deepseek-flash', exact: true })
Expected: visible
Timeout: 25000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 25000ms
  - waiting for getByRole('contentinfo', { name: '应用状态' }).getByRole('button', { name: '当前模型：deepseek-flash', exact: true })

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- banner:
  - heading "新对话" [level=1]
- button "面板"
- complementary:
  - button "新建任务"
  - separator
  - text: 工作区
  - button "搜索"
  - button "添加工作区文件夹"
  - region "服务器":
    - button "服务器" [expanded]
    - button "添加服务器"
    - paragraph: 还没有服务器
  - paragraph:
    - button "会话 1" [expanded]
    - button "多选会话": 多选
  - list:
    - listitem:
      - button "新会话 刚刚"
      - button "会话操作：新会话": ⋯
  - button "定时"
  - button "设置"
- separator "调整侧栏宽度"
- main:
  - toolbar "会话工具栏":
    - group "会话操作：新对话":
      - button "查找当前对话"
  - paragraph: 还没有对话
  - button "工作目录：默认工作目录": 默认工作目录
  - text: 本机
  - textbox "输入问题，@ 引用文件，/ 使用指令"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 —": —
  - button "当前模型：other-9b。点击切换": other-9b
  - button "发送"
- contentinfo "应用状态":
  - button "当前模型：other-9b": other-9b
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
  2   |  * **同一段对话里换另一家**（2026-08-11）。**跑真实构建产物。**
  3   |  *
  4   |  * 作者：*「同一个对话，比如 DeepSeek 的对话，我切换到 Kimi 的时候，
  5   |  * 直接就重新新建对话了。这不是我所期待的。一个对话之间，可以切换不同的 API。」*
  6   |  *
  7   |  * ## 他点的是哪颗，为什么会那样
  8   |  *
  9   |  * 他点的是 **agent pill**——那颗的语义一直是「新建会话，用：」。
  10  |  * 而**在同一段里换一家**运行时早就支持（`setSessionModel` 收 provider + model），
  11  |  * **只是模型选择器里只列当前 provider 的模型**，于是「换到 Kimi」
  12  |  * 在那颗里根本无从点起，人只能去点旁边那颗会新建会话的。
  13  |  *
  14  |  * 所以这条用例验的是三件事，缺一件这个功能就不成立：
  15  |  *   1. 模型菜单里**列得出别家**
  16  |  *   2. 换完**还是同一段对话**（会话数不变、之前说过的话还在）
  17  |  *   3. **下一次请求真的打到新模型**——界面说换了不算
  18  |  */
  19  | import { test, expect, CANNED_REPLY, 开一段临时会话, 等进了对话 , 进设置 } from "./fixtures.js"
  20  | 
  21  | const 本来的 = "deepseek-flash"
  22  | const 另一家的 = "other-9b"
  23  | 
  24  | const modelsUsed = (requests: { body?: { model?: string } }[]) =>
  25  |   requests.map((r) => r.body?.model).filter(Boolean)
  26  | 
  27  | test("**换到另一家，对话不断**", async ({ dawn }) => {
  28  |   const { page, mockUrl, requests } = dawn
  29  | 
  30  |   // 先加一家：地址指向同一个假服务器，但**模型 id 是它独有的**——
  31  |   // 这样「请求用了哪个模型」就能唯一指认是哪一家在答
  32  |   await 进设置(page, "模型服务")
  33  |   await page.getByRole("button", { name: /添加模型服务/ }).click()
  34  |   await page.getByRole("radio", { name: "自定义端点" }).click()
  35  |   await page.getByLabel("新服务的名字").fill("other")
  36  |   await page.getByLabel("新服务的端点地址").fill(mockUrl)
  37  |   await page.getByLabel("新服务的模型清单").fill(另一家的)
  38  |   await page.getByLabel("新服务的 API key").fill("local")
  39  |   await page.getByRole("button", { name: "加进来" }).click()
  40  |   await expect(page.locator(".svc").filter({ hasText: "other" })).toHaveCount(1)
  41  |   await page.getByRole("button", { name: "返回" }).click()
  42  | 
  43  |   // 开一段 DeepSeek 的对话，先说一句
  44  |   await 开一段临时会话(page)
  45  |   await 等进了对话(page)
  46  |   const statusbar = page.getByRole("contentinfo", { name: "应用状态" })
> 47  |   await expect(statusbar.getByRole("button", { name: `当前模型：${本来的}`, exact: true })).toBeVisible()
      |                                                                                     ^ Error: expect(locator).toBeVisible() failed
  48  |   await expect(statusbar.locator('[data-service-mark="deepseek"]')).toBeVisible()
  49  |   await page.getByPlaceholder(/输入问题/).fill("第一句")
  50  |   await page.getByRole("button", { name: "发送", exact: true }).click()
  51  |   await expect(page.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 60_000 })
  52  |   expect(modelsUsed(requests as never)).toEqual([本来的])
  53  | 
  54  |   const 会话数 = await page.locator(".session-list > li").count()
  55  | 
  56  |   /**
  57  |    * **在同一段里换到另一家**（2026-08-12 换了入口）。
  58  |    *
  59  |    * 2026-08-11 起换家走「厂家那颗 pill」，模型那颗只列当前这一家。
  60  |    * 现在两颗**并成了一颗**（作者要求，实测 WorkBuddy 就是一颗）——
  61  |    * 清单里列的是「所有配好的服务 × 各自的模型」，**按服务分组**，
  62  |    * 点另一组里的一条就是「换服务 + 换模型」。
  63  |    *
  64  |    * **这条用例的验收一个字没动**：下一次请求真的打到另一家的模型上。
  65  |    * 换的只是「从哪儿点过去」。
  66  |    */
  67  |   await page.locator(".model-pill .model-trigger").click()
  68  |   const 模型菜单 = page.getByRole("menu", { name: "切换模型" })
  69  |   await expect(模型菜单.locator(".model-group-head").filter({ hasText: "other" })).toBeVisible()
  70  |   await 模型菜单.getByRole("menuitem", { name: new RegExp(另一家的) }).click()
  71  | 
  72  |   // 换完，那颗 pill 自己就对上了
  73  |   await expect(page.locator(".composer .model-pill")).toContainText(另一家的)
  74  |   const currentModel = statusbar.getByRole("button", { name: `当前模型：${另一家的}`, exact: true })
  75  |   await expect(currentModel).toBeVisible()
  76  |   await currentModel.click()
  77  |   await expect(page.getByRole("dialog", { name: "当前模型", exact: true })).toContainText("other")
  78  |   await page.keyboard.press("Escape")
  79  | 
  80  |   // ① 还是同一段：会话没多，前面说过的话还在
  81  |   expect(await page.locator(".session-list > li").count()).toBe(会话数)
  82  |   await expect(page.locator(".turns")).toContainText("第一句")
  83  |   // ② 记录里留了一条，往回翻的人知道是从哪里开始换的家
  84  |   await expect(page.locator(".turns")).toContainText("已换到")
  85  | 
  86  |   await page.getByPlaceholder(/输入问题/).fill("第二句")
  87  |   await page.getByRole("button", { name: "发送", exact: true }).click()
  88  |   await expect(page.locator(".turns").getByText(CANNED_REPLY).nth(1)).toBeVisible({
  89  |     timeout: 60_000,
  90  |   })
  91  | 
  92  |   // ③ **这一行才是验收**：下一次请求真的打到另一家的模型上
  93  |   expect(modelsUsed(requests as never)).toEqual([本来的, 另一家的])
  94  | })
  95  | 
  96  | test("**一颗 pill 里两家都在**，厂家写在组头上", async ({ dawn }) => {
  97  |   const { page, mockUrl } = dawn
  98  | 
  99  |   await 进设置(page, "模型服务")
  100 |   await page.getByRole("button", { name: /添加模型服务/ }).click()
  101 |   await page.getByRole("radio", { name: "自定义端点" }).click()
  102 |   await page.getByLabel("新服务的名字").fill("other")
  103 |   await page.getByLabel("新服务的端点地址").fill(mockUrl)
  104 |   await page.getByLabel("新服务的模型清单").fill(另一家的)
  105 |   await page.getByLabel("新服务的 API key").fill("local")
  106 |   await page.getByRole("button", { name: "加进来" }).click()
  107 |   await page.getByRole("button", { name: "返回" }).click()
  108 | 
  109 |   await 开一段临时会话(page)
  110 |   await 等进了对话(page)
  111 |   /**
  112 |    * **一颗 pill 里两家都在**（2026-08-12 换的主语）。
  113 |    *
  114 |    * 上一版这里查的是「厂家那颗菜单里两家都列得出，而模型那颗只管这一家」。
  115 |    * 两颗并成一颗之后，**分组标题就是「哪家」**：两家各领一组。
  116 |    */
  117 |   await page.locator(".model-pill .model-trigger").click()
  118 |   const 模型菜单 = page.getByRole("menu", { name: "切换模型" })
  119 |   const 组头 = 模型菜单.locator(".model-group-head")
  120 |   await expect(组头.filter({ hasText: /DeepSeek/ })).toBeVisible()
  121 |   await expect(组头.filter({ hasText: "other" })).toBeVisible()
  122 |   await page.keyboard.press("Escape")
  123 | 
  124 |   /**
  125 |    * **两家的模型都在同一个列表里**（2026-08-12 反转）。
  126 |    *
  127 |    * 上一版这里断言「模型菜单里没有另一家的」——那时厂家由旁边那颗选，
  128 |    * 这颗只回答「这一家里用哪个」。**旁边那颗已经没有了**，
  129 |    * 再收窄就等于换服务从 composer 上消失。
  130 |    *
  131 |    * 现在按服务分组：`DeepSeek` 一组、`other` 一组，各自列各自的模型。
  132 |    * 「不用重复写厂家」那条意图仍然守着——**厂家写在组头上，不写在每一行里**。
  133 |    */
  134 |   await expect(模型菜单).toContainText(本来的)
  135 |   await expect(模型菜单).toContainText(另一家的)
  136 |   // 行里只有模型名，厂家在组头上：`other-9b` 那一行不该再写一遍「other」
  137 |   const 行文本 = await 模型菜单
  138 |     .getByRole("menuitem", { name: new RegExp(另一家的) })
  139 |     .textContent()
  140 |   expect(行文本?.replace(另一家的, "")).not.toContain("other")
  141 | })
  142 | 
```