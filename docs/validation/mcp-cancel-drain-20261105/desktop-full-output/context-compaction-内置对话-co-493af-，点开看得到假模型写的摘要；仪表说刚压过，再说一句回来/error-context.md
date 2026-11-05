# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: context-compaction.spec.ts >> 内置对话 >> **/compact**：不当一句话发；先出「正在压缩」，再收成压完的标记，写「你让压的」，点开看得到假模型写的摘要；仪表说刚压过，再说一句回来
- Location: e2e/context-compaction.spec.ts:85:3

# Error details

```
TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('main.main').getByPlaceholder(/输入问题/)

```

# Page snapshot

```yaml
- generic [ref=f3e3]:
  - generic [ref=f3e4]:
    - generic [ref=f3e5]:
      - button "DAWN Science" [ref=f3e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f3e10] [cursor=pointer]
      - button "快捷键速查" [ref=f3e13] [cursor=pointer]
    - banner [ref=f3e19]:
      - heading "第一句" [level=1] [ref=f3e23]
    - button "面板" [ref=f3e25] [cursor=pointer]
  - generic [ref=f3e26]:
    - complementary [ref=f3e27]:
      - button "新建任务" [ref=f3e29] [cursor=pointer]
      - separator [ref=f3e34]
      - generic [ref=f3e35]:
        - generic [ref=f3e36]: 工作区
        - generic [ref=f3e37]:
          - button "搜索" [ref=f3e38] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f3e41] [cursor=pointer]
      - generic [ref=f3e45]:
        - region "服务器" [ref=f3e46]:
          - generic [ref=f3e47]:
            - button "服务器" [expanded] [ref=f3e48] [cursor=pointer]
            - button "添加服务器" [ref=f3e57] [cursor=pointer]
          - paragraph [ref=f3e60]: 还没有服务器
        - paragraph [ref=f3e61]:
          - button "会话 1" [expanded] [ref=f3e62] [cursor=pointer]:
            - generic [ref=f3e67]: 会话
            - generic [ref=f3e68]: "1"
          - button "多选会话" [ref=f3e69] [cursor=pointer]: 多选
        - list [ref=f3e70]:
          - listitem [ref=f3e71]:
            - button "第一句 刚刚" [ref=f3e72]:
              - generic [ref=f3e73]: 第一句
              - generic [ref=f3e77]: 刚刚
            - button "会话操作：第一句" [ref=f3e79] [cursor=pointer]: ⋯
      - generic [ref=f3e80]:
        - button "定时" [ref=f3e81] [cursor=pointer]
        - button "设置" [ref=f3e86] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f3e90]
    - main [ref=f3e91]:
      - generic [ref=f3e92]:
        - toolbar "会话工具栏" [ref=f3e93]:
          - group "会话操作：第一句" [ref=f3e95]:
            - button "查找当前对话" [ref=f3e97] [cursor=pointer]
            - button "导出对话" [ref=f3e101] [cursor=pointer]
        - generic [ref=f3e106]:
          - generic [ref=f3e107]:
            - generic [ref=f3e108]: 你
            - generic [ref=f3e110]:
              - paragraph [ref=f3e114]: 第一句
              - generic [ref=f3e115]:
                - time [ref=f3e116]: 2026-11-05 22:33
                - button "复制我说的这段" [ref=f3e117] [cursor=pointer]
                - button "修改" [ref=f3e123] [cursor=pointer]
                - button "回到这句之前" [ref=f3e127] [cursor=pointer]
          - generic [ref=f3e131]:
            - generic [ref=f3e132]:
              - generic [ref=f3e133]: D
              - generic [ref=f3e134]: DeepSeek
            - generic [ref=f3e135]:
              - paragraph [ref=f3e139]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e140]:
                - button "复制这段回答" [ref=f3e141] [cursor=pointer]
                - paragraph [ref=f3e147]: 输入 12 · 输出 8 · 缓存 0 token
          - generic [ref=f3e148]:
            - generic [ref=f3e149]: 你
            - generic [ref=f3e151]:
              - paragraph [ref=f3e155]: 第二句
              - generic [ref=f3e156]:
                - time [ref=f3e157]: 2026-11-05 22:33
                - button "复制我说的这段" [ref=f3e158] [cursor=pointer]
                - button "修改" [ref=f3e164] [cursor=pointer]
                - button "回到这句之前" [ref=f3e168] [cursor=pointer]
          - generic [ref=f3e172]:
            - generic [ref=f3e173]:
              - generic [ref=f3e174]: D
              - generic [ref=f3e175]: DeepSeek
            - generic [ref=f3e176]:
              - paragraph [ref=f3e180]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e181]:
                - button "复制这段回答" [ref=f3e182] [cursor=pointer]
                - paragraph [ref=f3e188]: 输入 12 · 输出 8 · 缓存 0 token
          - generic [ref=f3e189]:
            - paragraph [ref=f3e190]:
              - generic [ref=f3e191]: 已压缩上下文
              - generic [ref=f3e192]: 你让压的
              - generic [ref=f3e193]: 20 → 约 47 tokens
              - button "这次的摘要" [expanded] [active] [ref=f3e194] [cursor=pointer]
            - paragraph [ref=f3e195]: 早先的对话换成了一段摘要交给模型；上面的记录都还在，模型现在读的是摘要。
            - paragraph [ref=f3e196]: 压缩本身用了 输入 24 · 输出 16
            - generic [ref=f3e197]: "## Goal 假摘要：用户在试压缩。 ## Progress - 说过几句话 ## Next Steps - 接着聊 --- **Turn Context (split turn):** ## Goal 假摘要：用户在试压缩。 ## Progress - 说过几句话 ## Next Steps - 接着聊"
        - generic [ref=f3e198]:
          - generic [ref=f3e199]:
            - generic [ref=f3e200]:
              - button "工作目录：默认工作目录" [ref=f3e202] [cursor=pointer]:
                - generic [ref=f3e205]: 默认工作目录
              - generic [ref=f3e208]: 本机
            - textbox "检查缺失值并说明处理方法" [ref=f3e214]
            - generic [ref=f3e215]:
              - generic [ref=f3e216]:
                - button "添加内容" [ref=f3e218] [cursor=pointer]
                - button "终端面板" [ref=f3e221] [cursor=pointer]
                - button "完全访问" [ref=f3e225] [cursor=pointer]
              - generic [ref=f3e230]:
                - button "上下文 已压缩" [ref=f3e232] [cursor=pointer]: 已压缩
                - button "当前模型：deepseek-flash。点击切换" [ref=f3e237] [cursor=pointer]:
                  - generic [ref=f3e241]: deepseek-flash
                - button "发送" [ref=f3e244] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f3e249]: 2 轮 · 输入 24 · 输出 16 · 缓存 0 · 命中 0%
  - contentinfo "应用状态" [ref=f3e250]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e252] [cursor=pointer]
    - generic [ref=f3e253]:
      - generic [ref=f3e254]:
        - button "当前模型：deepseek-flash" [ref=f3e255] [cursor=pointer]:
          - generic [ref=f3e259]: deepseek-flash
        - button "R：未配置" [ref=f3e260] [cursor=pointer]:
          - generic [ref=f3e262]: R
          - generic [ref=f3e263]: 未配置
        - button "Python：未配置" [ref=f3e264] [cursor=pointer]:
          - generic [ref=f3e266]: Python
          - generic [ref=f3e267]: 未配置
      - generic [ref=f3e268]:
        - generic [ref=f3e269]:
          - button "插件 8" [ref=f3e270] [cursor=pointer]:
            - generic [ref=f3e273]: 插件
            - generic [ref=f3e274]: "8"
          - button "Skills 9" [ref=f3e275] [cursor=pointer]:
            - generic [ref=f3e279]: Skills
            - generic [ref=f3e280]: "9"
          - button "MCP 0" [ref=f3e281] [cursor=pointer]:
            - generic [ref=f3e284]: MCP
            - generic [ref=f3e285]: "0"
          - button "子 Agent 22" [ref=f3e286] [cursor=pointer]:
            - generic [ref=f3e289]: 子 Agent
            - generic [ref=f3e290]: "22"
        - button "版本 v0.0.44" [ref=f3e291] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1   | /**
  2   |  * 上下文用量与压缩（2026-09-27，spec `2026-09-27-上下文用量与压缩-design.md` §7）。**跑真实构建产物。**
  3   |  *
  4   |  * 假模型两支（准入规则 1，dev:mock 同一份）：pi 的摘要请求回 `假摘要`；带「塞满上下文」的一句报 12 万输入 token。
  5   |  * `compactKeepRecentTokens: 1`：pi 默认要保留最近 2 万 token，两三句话的对话「没有可压缩的」。
  6   |  *
  7   |  * **等待条件挑只有目标状态才有的东西**：压缩标记按 `data-status` 找，不按「压缩」两个字（仪表弹层与命令面板里也有这两个字）。
  8   |  *
  9   |  * 「正在压缩」那一态很短（假模型的摘要一来一回就完），等它可见是跟模型赛跑。
  10  |  * 改在触发之前挂一个 `MutationObserver`，记下「出现过 `data-status="running"` 的标记、写着什么」——
  11  |  * 作者 2026-09-27 要的是「一开始压就马上看得到」，判据是**它出现过**，不是它停留多久。
  12  |  */
  13  | import type { Locator, Page } from "@playwright/test"
  14  | import { resolve } from "node:path"
  15  | import { test, expect, CANNED_REPLY, 开一段临时会话, 等进了对话, 用某个agent开一段, 在项目里开会话, 进坞 } from "./fixtures.js"
  16  | 
  17  | const 主区 = (page: Page) => page.locator("main.main")
  18  | const 框 = (区: Locator) => 区.getByPlaceholder(/输入问题/)
  19  | const 仪表 = (区: Locator) => 区.locator(".ctx-meter-trigger")
  20  | const 标记 = (区: Locator, status: string) => 区.locator(`.compaction-mark[data-status="${status}"]`)
  21  | 
  22  | async function 说(区: Locator, 话: string) {
> 23  |   await 框(区).fill(话)
      |              ^ TimeoutError: locator.fill: Timeout 30000ms exceeded.
  24  |   await 框(区).press("Enter")
  25  | }
  26  | /** 说一句并等假模型答完（数回复条数，不数「任何一处出现暗号」——前面几轮早就出现过了） */
  27  | async function 说完(区: Locator, 话: string) {
  28  |   const 前 = await 区.getByText(CANNED_REPLY).count()
  29  |   await 说(区, 话)
  30  |   await expect(区.getByText(CANNED_REPLY)).toHaveCount(前 + 1, { timeout: 30_000 })
  31  | }
  32  | 
  33  | /** 触发压缩之前挂上：之后任何时刻出现过的 running 标记，文字都记进 `window.__压缩中见过` */
  34  | async function 盯正在压缩(page: Page) {
  35  |   await page.evaluate(() => {
  36  |     const w = window as unknown as { __压缩中见过: string[] }
  37  |     w.__压缩中见过 = []
  38  |     const 看 = () => {
  39  |       for (const el of document.querySelectorAll('.compaction-mark[data-status="running"]')) {
  40  |         w.__压缩中见过.push(el.textContent ?? "")
  41  |       }
  42  |     }
  43  |     new MutationObserver(看).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-status"] })
  44  |   })
  45  | }
  46  | const 见过的正在压缩 = (page: Page) => page.evaluate(() => (window as unknown as { __压缩中见过: string[] }).__压缩中见过)
  47  | 
  48  | /** 叫出命令面板并搜一个词（与 `palette.spec.ts` 同一个快捷键） */
  49  | async function 面板搜(page: Page, 词: string) {
  50  |   await page.keyboard.press("ControlOrMeta+k")
  51  |   const 面板 = page.getByRole("dialog", { name: "命令面板" })
  52  |   await expect(面板).toBeVisible()
  53  |   await page.getByRole("combobox", { name: "搜索命令" }).fill(词)
  54  |   return 面板
  55  | }
  56  | 
  57  | test.describe("内置对话", () => {
  58  |   test.use({ dawnOptions: { compactKeepRecentTokens: 1 } })
  59  | 
  60  |   test("**仪表常驻**：说过一句之后写着比例（不是悬停才出现）；悬停看得到真数与自动压缩线，移开就收，点一下钉住", async ({ dawn }) => {
  61  |     const { page } = dawn
  62  |     await 开一段临时会话(page)
  63  |     await 等进了对话(page)
  64  |     await 说完(主区(page), "你好")
  65  |     const 钮 = 仪表(主区(page))
  66  |     await expect(钮).toBeVisible()
  67  |     // `toBeVisible()` 对 opacity: 0 仍然算可见——直接量
  68  |     expect(await 钮.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  69  |     // 2026-09-28 起只写环 + 数；名字仍是全句
  70  |     await expect(钮).toHaveText("<1%")
  71  |     await expect(钮).toHaveAccessibleName("上下文 <1%")
  72  |     // 作者 2026-09-27：悬停就看得到用量
  73  |     await 钮.hover()
  74  |     const 层 = 主区(page).locator(".ctx-meter-pop")
  75  |     await expect(层).toContainText("20 / 128k tokens")
  76  |     await expect(层).toContainText("到 111.6k tokens 会自动压缩")
  77  |     // 移开就收；点一下钉住
  78  |     await page.mouse.move(0, 0)
  79  |     await expect(层).toHaveCount(0)
  80  |     await 钮.click()
  81  |     await page.mouse.move(0, 0)
  82  |     await expect(层).toBeVisible()
  83  |   })
  84  | 
  85  |   test("**/compact**：不当一句话发；先出「正在压缩」，再收成压完的标记，写「你让压的」，点开看得到假模型写的摘要；仪表说刚压过，再说一句回来", async ({ dawn }) => {
  86  |     const { page } = dawn
  87  |     await 开一段临时会话(page)
  88  |     await 等进了对话(page)
  89  |     await 说完(主区(page), "第一句")
  90  |     await 说完(主区(page), "第二句")
  91  |     await 盯正在压缩(page)
  92  |     await 说(主区(page), "/compact 保留暗号")
  93  |     const 条 = 标记(主区(page), "done")
  94  |     await expect(条).toBeVisible({ timeout: 30_000 })
  95  |     // 一开始压就有一条「正在压缩上下文…」（作者 2026-09-27），之后同一条收成「已压缩」——不是两条
  96  |     expect((await 见过的正在压缩(page)).some((x) => x.includes("正在压缩上下文…"))).toBe(true)
  97  |     await expect(主区(page).locator(".compaction-mark")).toHaveCount(1)
  98  |     await expect(条).toContainText("已压缩上下文")
  99  |     await expect(条).toContainText("你让压的")
  100 |     await expect(主区(page).locator(".turns")).not.toContainText("/compact 保留暗号")
  101 |     await 条.getByRole("button", { name: "这次的摘要" }).click()
  102 |     await expect(条.locator(".compaction-summary")).toContainText("假摘要：用户在试压缩")
  103 |     await expect(仪表(主区(page))).toHaveText(/已压缩/)
  104 |     await 说完(主区(page), "第三句")
  105 |     await expect(仪表(主区(page))).toHaveText("<1%")
  106 |     await expect(仪表(主区(page))).toHaveAccessibleName("上下文 <1%")
  107 |   })
  108 | 
  109 |   test("**⌘K「压缩上下文」**：内置对话里可用，按下去同样出一条「你让压的」标记", async ({ dawn }) => {
  110 |     const { page } = dawn
  111 |     await 开一段临时会话(page)
  112 |     await 等进了对话(page)
  113 |     await 说完(主区(page), "第一句")
  114 |     await 说完(主区(page), "第二句")
  115 |     const 面板 = await 面板搜(page, "压缩上下文")
  116 |     const 项 = 面板.getByRole("option", { name: /压缩上下文/ })
  117 |     await expect(项).toHaveAttribute("aria-disabled", "false")
  118 |     await 项.click()
  119 |     const 条 = 标记(主区(page), "done")
  120 |     await expect(条).toBeVisible({ timeout: 30_000 })
  121 |     await expect(条).toContainText("你让压的")
  122 |   })
  123 | 
```