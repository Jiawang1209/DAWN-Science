# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: late-endpoint.spec.ts >> 启动时一个 provider 覆盖都没有 >> **中途加一个自定义端点，当场就能选到、能对话** —— 不用重启
- Location: e2e/late-endpoint.spec.ts:29:3

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /切换服务|选择 agent|ds-chat|DeepSeek/ })

```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - generic [ref=f2e4]:
    - generic [ref=f2e5]:
      - button "DAWN Science" [ref=f2e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f2e10] [cursor=pointer]
      - button "快捷键速查" [ref=f2e13] [cursor=pointer]
    - button "面板" [ref=f2e18] [cursor=pointer]
  - generic [ref=f2e19]:
    - complementary [ref=f2e20]:
      - button "新建任务" [ref=f2e22] [cursor=pointer]
      - separator [ref=f2e27]
      - generic [ref=f2e28]:
        - generic [ref=f2e29]: 工作区
        - generic [ref=f2e30]:
          - button "搜索" [ref=f2e31] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f2e34] [cursor=pointer]
      - region "服务器" [ref=f2e39]:
        - generic [ref=f2e40]:
          - button "服务器" [expanded] [ref=f2e41] [cursor=pointer]
          - button "添加服务器" [ref=f2e50] [cursor=pointer]
        - paragraph [ref=f2e53]: 还没有服务器
      - generic [ref=f2e54]:
        - button "定时" [ref=f2e55] [cursor=pointer]
        - button "设置" [ref=f2e60] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f2e64]
    - main [ref=f2e65]:
      - generic [ref=f2e67]:
        - heading "今天想分析什么？" [level=2] [ref=f2e69]
        - paragraph [ref=f2e70]: 直接输入问题，按需选择本机文件夹。
        - list [ref=f2e71]:
          - listitem [ref=f2e72]:
            - button "看看这里有什么 先摸清工作区" [ref=f2e73] [cursor=pointer]:
              - generic [ref=f2e74]: 看看这里有什么
              - generic [ref=f2e75]: 先摸清工作区
          - listitem [ref=f2e76]:
            - button "读一份数据 字段、规模、缺失" [ref=f2e77] [cursor=pointer]:
              - generic [ref=f2e78]: 读一份数据
              - generic [ref=f2e79]: 字段、规模、缺失
          - listitem [ref=f2e80]:
            - button "做一次探索性分析 分布与异常" [ref=f2e81] [cursor=pointer]:
              - generic [ref=f2e82]: 做一次探索性分析
              - generic [ref=f2e83]: 分布与异常
          - listitem [ref=f2e84]:
            - button "把结果写成说明 给人看的那一版" [ref=f2e85] [cursor=pointer]:
              - generic [ref=f2e86]: 把结果写成说明
              - generic [ref=f2e87]: 给人看的那一版
        - generic [ref=f2e89]:
          - generic [ref=f2e90]:
            - button "工作目录：默认工作目录" [ref=f2e92] [cursor=pointer]:
              - generic [ref=f2e95]: 默认工作目录
            - generic [ref=f2e98]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [active] [ref=f2e104]
          - generic [ref=f2e105]:
            - generic [ref=f2e106]:
              - button "添加内容" [ref=f2e108] [cursor=pointer]
              - button "终端面板" [ref=f2e111] [cursor=pointer]
              - button "完全访问" [ref=f2e115] [cursor=pointer]
            - generic [ref=f2e120]:
              - button "late" [ref=f2e122] [cursor=pointer]:
                - generic [ref=f2e123]: L
                - text: late
              - button "发送" [ref=f2e126] [cursor=pointer]
  - contentinfo "应用状态" [ref=f2e129]:
    - generic [ref=f2e130]:
      - generic [ref=f2e131]:
        - button "当前模型：late-7b" [ref=f2e132] [cursor=pointer]:
          - generic [ref=f2e133]: L
          - generic [ref=f2e134]: late-7b
        - button "R：未配置" [ref=f2e135] [cursor=pointer]:
          - generic [ref=f2e137]: R
          - generic [ref=f2e138]: 未配置
        - button "Python：未配置" [ref=f2e139] [cursor=pointer]:
          - generic [ref=f2e141]: Python
          - generic [ref=f2e142]: 未配置
      - generic [ref=f2e143]:
        - generic [ref=f2e144]:
          - button "插件 8" [ref=f2e145] [cursor=pointer]:
            - generic [ref=f2e148]: 插件
            - generic [ref=f2e149]: "8"
          - button "Skills 9" [ref=f2e150] [cursor=pointer]:
            - generic [ref=f2e154]: Skills
            - generic [ref=f2e155]: "9"
          - button "MCP 0" [ref=f2e156] [cursor=pointer]:
            - generic [ref=f2e159]: MCP
            - generic [ref=f2e160]: "0"
          - button "子 Agent 22" [ref=f2e161] [cursor=pointer]:
            - generic [ref=f2e164]: 子 Agent
            - generic [ref=f2e165]: "22"
        - button "版本 v0.0.44" [ref=f2e166] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | /**
  2  |  * **中途加的端点，不用重启就能用**（2026-08-11 修的那个缺陷）。**跑真实构建产物。**
  3  |  *
  4  |  * ## 作者报的症状
  5  |  *
  6  |  * *「我在现在的版本，重新设置了 kimi-k3，地址写的是 https://api.moonshot.cn/v1，
  7  |  * 填写了正确的 API，设置成功后，我点击对话，发现模型选择的地方没有 kimi-k3。」*
  8  |  *
  9  |  * 查下来磁盘上三样全对——`providers.yaml`、`models.generated.json`、钥匙串里的 key。
  10 |  * 断的是下一环：**pi 从来没读过那份文件**。
  11 |  * `modelsPath` 此前是构造时钉死的，而启动那一刻配置里还没有任何 `providers:`，
  12 |  * `writeModelsJson` 于是返回 undefined，运行时拿到「不落盘」。
  13 |  * 之后重置多少次目录都一样——它每次都从 `null` 重新读。
  14 |  *
  15 |  * ## 为什么原来那批 e2e 没抓住
  16 |  *
  17 |  * **假服务器总会给一份基底 `models.json`**（`DAWN_MODELS_JSON`），
  18 |  * 于是 e2e 那条路上 `modelsPath` 从来都不是空的。
  19 |  * **测试环境比生产环境多一样东西，而那一样东西正好盖住了缺陷。**
  20 |  *
  21 |  * 所以这条用例的要害不在断言，在 `noModelsBase: true`——
  22 |  * 它把起点调回和真实安装一样。
  23 |  */
  24 | import { test, expect, CANNED_REPLY, 等进了对话 , 进设置 } from "./fixtures.js"
  25 | 
  26 | test.describe("启动时一个 provider 覆盖都没有", () => {
  27 |   test.use({ dawnOptions: { noModelsBase: true } })
  28 | 
  29 |   test("**中途加一个自定义端点，当场就能选到、能对话** —— 不用重启", async ({ dawn }) => {
  30 |     const { page, mockUrl, requests } = dawn
  31 | 
  32 |     await 进设置(page, "模型服务")
  33 |     await page.getByRole("button", { name: /添加模型服务/ }).click()
  34 |     await page.getByRole("radio", { name: "自定义端点" }).click()
  35 |     await page.getByLabel("新服务的名字").fill("late")
  36 |     await page.getByLabel("新服务的端点地址").fill(mockUrl)
  37 |     await page.getByLabel("新服务的模型清单").fill("late-7b")
  38 |     await page.getByLabel("新服务的 API key").fill("local")
  39 |     await page.getByRole("button", { name: "加进来" }).click()
  40 | 
  41 |     /**
  42 |      * **摘要上那个「1 个模型」就是本用例的第一现场。**
  43 |      *
  44 |      * 它来自 pi 的模型目录，不是我们刚填的表单——所以它显示「⚠ 没有模型」
  45 |      * 就说明目录没读到那份文件，也就是作者撞上的那一刻。
  46 |      */
  47 |     const 行 = page.locator(".svc").filter({ hasText: "late" })
  48 |     await expect(行.locator(".svc-sum")).toContainText("1 个模型", { timeout: 20_000 })
  49 | 
  50 |     await page.getByRole("button", { name: "返回" }).click()
  51 | 
  52 |     /**
  53 |      * **从空态里挑它开第一个会话。**
  54 |      *
  55 |      * 不走「新建会话」：那个按钮用的是列表里的第一个 agent（`ds-chat`／deepseek），
  56 |      * 而这个用例刻意没有基底目录、也没给 deepseek 填过 key——
  57 |      * 拿它开会话本来就该失败。**要验的是 `late` 这一条路。**
  58 |      */
  59 |     // 2026-08-11：这颗从「换一个 agent」改叫「换一个 LLM」——DAWN 自己才是那个 agent
> 60 |     await page.getByRole("button", { name: /切换服务|选择 agent|ds-chat|DeepSeek/ }).click()
     |                                                                                ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  61 |     await page.getByRole("menuitem", { name: "late" }).click()
  62 |     await 等进了对话(page)
  63 |     // **模型选择的地方有它**——作者说的正是这一句
  64 |     await expect(page.locator(".composer")).toContainText("late-7b", { timeout: 20_000 })
  65 | 
  66 |     await page.getByPlaceholder(/输入问题/).fill("你好")
  67 |     await page.getByRole("button", { name: "发送", exact: true }).click()
  68 |     await expect(page.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 60_000 })
  69 | 
  70 |     // **反空转**：请求真的打到了刚填的那个地址上
  71 |     expect(JSON.stringify(requests)).toContain("late-7b")
  72 |   })
  73 | })
  74 | 
```