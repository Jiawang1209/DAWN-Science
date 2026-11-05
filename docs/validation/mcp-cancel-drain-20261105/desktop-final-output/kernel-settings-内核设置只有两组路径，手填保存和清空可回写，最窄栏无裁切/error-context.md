# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: kernel-settings.spec.ts >> 内核设置只有两组路径，手填保存和清空可回写，最窄栏无裁切
- Location: e2e/kernel-settings.spec.ts:5:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
          - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f2e104]
          - generic [ref=f2e105]:
            - generic [ref=f2e106]:
              - button "添加内容" [ref=f2e108] [cursor=pointer]
              - button "终端面板" [ref=f2e111] [cursor=pointer]
              - button "完全访问" [ref=f2e115] [cursor=pointer]
            - generic [ref=f2e120]:
              - button "DeepSeek" [ref=f2e122] [cursor=pointer]
              - button "发送" [ref=f2e128] [cursor=pointer]
    - complementary "设置" [ref=f2e131]:
      - separator "调整面板宽度" [active] [ref=f2e132]
      - generic [ref=f2e133]:
        - button "回到清单" [ref=f2e134] [cursor=pointer]
        - heading "内核" [level=2] [ref=f2e137]
        - generic [ref=f2e138]:
          - button "展开" [ref=f2e139] [cursor=pointer]
          - button "关闭面板" [ref=f2e140] [cursor=pointer]
      - generic [ref=f2e145]:
        - generic [ref=f2e146]:
          - text: 内核型 agent 使用以下解释器。
          - emphasis [ref=f2e147]: 没有配置就不能用。
        - generic [ref=f2e148]:
          - group "Python 解释器" [ref=f2e149]:
            - generic [ref=f2e150]:
              - generic [ref=f2e151]: Python
              - generic [ref=f2e152]: 还没配置
              - button "检测 Python 解释器" [ref=f2e153] [cursor=pointer]: 检测本机解释器
            - generic [ref=f2e154]:
              - textbox "Python 解释器" [ref=f2e155]:
                - /placeholder: 输入解释器的完整路径
              - button "保存" [disabled] [ref=f2e156]
            - paragraph [ref=f2e157]: 需已安装 ipykernel。
          - group "R 解释器" [ref=f2e158]:
            - generic [ref=f2e159]:
              - generic [ref=f2e160]: R
              - generic [ref=f2e161]: 还没配置
              - button "检测 R 解释器" [ref=f2e162] [cursor=pointer]: 检测本机解释器
            - generic [ref=f2e163]:
              - textbox "R 解释器" [ref=f2e164]:
                - /placeholder: 输入解释器的完整路径
              - button "保存" [disabled] [ref=f2e165]
            - paragraph [ref=f2e166]: 需已安装 IRkernel。
          - group [ref=f2e167]:
            - generic "参考：本机注册过的 Jupyter 内核（1）" [ref=f2e168] [cursor=pointer]
  - contentinfo "应用状态" [ref=f2e169]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e171] [cursor=pointer]
    - generic [ref=f2e172]:
      - generic [ref=f2e173]:
        - button "当前模型：deepseek-flash" [ref=f2e174] [cursor=pointer]:
          - generic [ref=f2e178]: deepseek-flash
        - button "R：未配置" [ref=f2e179] [cursor=pointer]:
          - generic [ref=f2e181]: R
          - generic [ref=f2e182]: 未配置
        - button "Python：未配置" [ref=f2e183] [cursor=pointer]:
          - generic [ref=f2e185]: Python
          - generic [ref=f2e186]: 未配置
      - generic [ref=f2e187]:
        - generic [ref=f2e188]:
          - button "插件 8" [ref=f2e189] [cursor=pointer]:
            - generic [ref=f2e192]: 插件
            - generic [ref=f2e193]: "8"
          - button "Skills 9" [ref=f2e194] [cursor=pointer]:
            - generic [ref=f2e198]: Skills
            - generic [ref=f2e199]: "9"
          - button "MCP 0" [ref=f2e200] [cursor=pointer]:
            - generic [ref=f2e203]: MCP
            - generic [ref=f2e204]: "0"
          - button "子 Agent 22" [ref=f2e205] [cursor=pointer]:
            - generic [ref=f2e208]: 子 Agent
            - generic [ref=f2e209]: "22"
        - button "版本 v0.0.44" [ref=f2e210] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import { test, expect, 进设置 } from "./fixtures.js"
  2  | import { writeFile } from "node:fs/promises"
  3  | import { join } from "node:path"
  4  | 
  5  | test("内核设置只有两组路径，手填保存和清空可回写，最窄栏无裁切", async ({ dawn }, info) => {
  6  |   const { page, app } = dawn
  7  |   // 保存只做路径存在性检查；这个标记文件不作为程序执行。
  8  |   const path = join(dawn.dir, "interpreter-qa-marker")
  9  |   await writeFile(path, "QA path marker; never executed\n")
  10 |   await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 900))
  11 |   await 进设置(page, "内核")
  12 |   const python = page.getByRole("group", { name: "Python 解释器", exact: true })
  13 |   const r = page.getByRole("group", { name: "R 解释器", exact: true })
  14 |   await expect(python.getByRole("textbox")).toHaveCount(1)
  15 |   await expect(r.getByRole("textbox")).toHaveCount(1)
  16 |   await expect(page.getByRole("button", { name: "手动填写路径", exact: true })).toHaveCount(0)
  17 |   const save = python.getByRole("button", { name: "保存", exact: true })
  18 |   await expect(save).toBeDisabled()
  19 |   await python.getByRole("textbox").fill(path)
  20 |   await expect(python).toContainText("尚未保存")
  21 |   await save.click()
  22 |   await expect(python).toContainText("已配置")
  23 |   await expect(save).toBeDisabled()
  24 |   await expect.poll(() => page.evaluate(async () => (await (window as any).dawn.invoke("getInterpreters", {})).data.python)).toBe(path)
  25 |   await page.screenshot({ path: info.outputPath("kernel-wide-saved.png") })
  26 |   await python.getByRole("textbox").fill("")
  27 |   await save.click()
  28 |   await expect(python).toContainText("还没配置")
  29 |   await expect(save).toBeDisabled()
  30 |   await expect.poll(() => page.evaluate(async () => (await (window as any).dawn.invoke("getInterpreters", {})).data.python)).toBeUndefined()
  31 |   await page.getByRole("button", { name: "收回", exact: true }).click()
  32 |   const sash = page.getByRole("separator", { name: "调整面板宽度", exact: true })
  33 |   await sash.focus()
  34 |   const min = Number(await sash.getAttribute("aria-valuemin"))
  35 |   for (let width = Number(await sash.getAttribute("aria-valuenow")); width > min; width -= 16) {
  36 |     await sash.press("ArrowRight")
  37 |     await expect(sash).toHaveAttribute("aria-valuenow", String(Math.max(min, width - 16)))
  38 |   }
  39 |   for (const group of [python, r]) {
  40 |     await expect(group.getByRole("textbox")).toBeVisible()
  41 |     await expect(group.getByRole("button", { name: "保存", exact: true })).toBeVisible()
> 42 |     expect(await group.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
     |                                                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  43 |   }
  44 |   await page.screenshot({ path: info.outputPath("kernel-narrow-light.png") })
  45 |   await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  46 |   await page.screenshot({ path: info.outputPath("kernel-narrow-dark.png") })
  47 | })
  48 | 
```