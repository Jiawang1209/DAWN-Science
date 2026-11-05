# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: composer-layout.spec.ts >> 终端跟随强调色，上下文平时透明悬停有反馈，菜单跟随主题色
- Location: e2e/composer-layout.spec.ts:220:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 32
Received: 31.999053955078125
```

# Page snapshot

```yaml
- generic [ref=f3e1]:
  - generic [ref=f3e3]:
    - generic [ref=f3e4]:
      - generic [ref=f3e5]:
        - button "DAWN Science" [ref=f3e7] [cursor=pointer]
        - button "收起侧边栏" [expanded] [ref=f3e10] [cursor=pointer]
        - button "快捷键速查" [ref=f3e13] [cursor=pointer]
      - generic [ref=f3e17]:
        - tablist "同一处的会话" [ref=f3e21]:
          - generic [ref=f3e22]:
            - tab "上下文配色检查" [selected] [ref=f3e23] [cursor=pointer]
            - button "关掉「上下文配色检查」（收进归档）" [ref=f3e26] [cursor=pointer]
          - button "在这里再开一段" [ref=f3e29] [cursor=pointer]
        - generic:
          - banner
      - button "面板" [ref=f3e33] [cursor=pointer]
    - generic [ref=f3e34]:
      - complementary [ref=f3e35]:
        - button "新建任务" [ref=f3e37] [cursor=pointer]
        - separator [ref=f3e42]
        - generic [ref=f3e43]:
          - generic [ref=f3e44]: 工作区
          - generic [ref=f3e45]:
            - button "搜索" [ref=f3e46] [cursor=pointer]
            - button "添加工作区文件夹" [ref=f3e49] [cursor=pointer]
        - generic [ref=f3e53]:
          - paragraph [ref=f3e54]:
            - button "项目 1" [expanded] [ref=f3e55] [cursor=pointer]:
              - generic [ref=f3e60]: 项目
              - generic [ref=f3e61]: "1"
            - button "多选项目" [ref=f3e62] [cursor=pointer]: 多选
          - list [ref=f3e63]:
            - listitem [ref=f3e64]:
              - generic [ref=f3e65]:
                - button "workspace" [ref=f3e66] [cursor=pointer]
                - generic [ref=f3e75]:
                  - button "在「workspace」里开一段新对话" [ref=f3e76] [cursor=pointer]
                  - button "项目操作：workspace" [ref=f3e80] [cursor=pointer]: ⋯
              - list [ref=f3e81]:
                - listitem [ref=f3e82]:
                  - button "上下文配色检查 刚刚" [ref=f3e83]:
                    - generic [ref=f3e84]: 上下文配色检查
                    - generic [ref=f3e88]: 刚刚
                  - button "会话操作：上下文配色检查" [ref=f3e90] [cursor=pointer]: ⋯
          - region "服务器" [ref=f3e91]:
            - generic [ref=f3e92]:
              - button "服务器" [expanded] [ref=f3e93] [cursor=pointer]
              - button "添加服务器" [ref=f3e102] [cursor=pointer]
            - paragraph [ref=f3e105]: 还没有服务器
        - generic [ref=f3e106]:
          - button "定时" [ref=f3e107] [cursor=pointer]
          - button "设置" [ref=f3e112] [cursor=pointer]
      - separator "调整侧栏宽度" [ref=f3e116]
      - main [ref=f3e117]:
        - generic [ref=f3e118]:
          - toolbar "会话工具栏" [ref=f3e119]:
            - group "会话操作：上下文配色检查" [ref=f3e121]:
              - button "查找当前对话" [ref=f3e123] [cursor=pointer]
              - button "导出对话" [ref=f3e127] [cursor=pointer]
          - generic [ref=f3e132]:
            - generic [ref=f3e133]:
              - generic [ref=f3e134]: 你
              - generic [ref=f3e136]:
                - paragraph [ref=f3e140]: 上下文配色检查
                - generic [ref=f3e141]:
                  - time [ref=f3e142]: 2026-11-06 00:11
                  - button "复制我说的这段" [ref=f3e143] [cursor=pointer]
                  - button "修改" [ref=f3e149] [cursor=pointer]
                  - button "回到这句之前" [ref=f3e153] [cursor=pointer]
            - generic [ref=f3e157]:
              - generic [ref=f3e158]:
                - generic [ref=f3e159]: D
                - generic [ref=f3e160]: DeepSeek
              - generic [ref=f3e161]:
                - paragraph [ref=f3e165]: 假模型已应答：DAWN 的整条链路是通的。
                - generic [ref=f3e166]:
                  - button "复制这段回答" [ref=f3e167] [cursor=pointer]
                  - paragraph [ref=f3e173]: 输入 12 · 输出 8 · 缓存 0 token
          - generic [ref=f3e174]:
            - generic [ref=f3e175]:
              - generic [ref=f3e176]:
                - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-EbQ2w8/workspace" [expanded] [ref=f3e178] [cursor=pointer]:
                  - generic [ref=f3e181]: workspace
                - generic [ref=f3e184]: 本机
              - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f3e190]: 检查数据
              - generic [ref=f3e191]:
                - generic [ref=f3e192]:
                  - button "添加内容" [ref=f3e194] [cursor=pointer]
                  - button "终端面板" [ref=f3e197] [cursor=pointer]
                  - button "完全访问" [ref=f3e201] [cursor=pointer]
                - generic [ref=f3e206]:
                  - button "上下文 <1%" [ref=f3e208] [cursor=pointer]: <1%
                  - button "当前模型：deepseek-flash。点击切换" [ref=f3e213] [cursor=pointer]:
                    - generic [ref=f3e217]: deepseek-flash
                  - button "发送" [ref=f3e220] [cursor=pointer]
            - generic "这一整段对话累计" [ref=f3e225]: 1 轮 · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
    - contentinfo "应用状态" [ref=f3e226]:
      - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e228] [cursor=pointer]
      - generic [ref=f3e229]:
        - generic [ref=f3e230]:
          - button "当前模型：deepseek-flash" [ref=f3e231] [cursor=pointer]:
            - generic [ref=f3e235]: deepseek-flash
          - button "R：未配置" [ref=f3e236] [cursor=pointer]:
            - generic [ref=f3e238]: R
            - generic [ref=f3e239]: 未配置
          - button "Python：未配置" [ref=f3e240] [cursor=pointer]:
            - generic [ref=f3e242]: Python
            - generic [ref=f3e243]: 未配置
        - generic [ref=f3e244]:
          - generic [ref=f3e245]:
            - button "插件 8" [ref=f3e246] [cursor=pointer]:
              - generic [ref=f3e249]: 插件
              - generic [ref=f3e250]: "8"
            - button "Skills 9" [ref=f3e251] [cursor=pointer]:
              - generic [ref=f3e255]: Skills
              - generic [ref=f3e256]: "9"
            - button "MCP 0" [ref=f3e257] [cursor=pointer]:
              - generic [ref=f3e260]: MCP
              - generic [ref=f3e261]: "0"
            - button "子 Agent 22" [ref=f3e262] [cursor=pointer]:
              - generic [ref=f3e265]: 子 Agent
              - generic [ref=f3e266]: "22"
          - button "版本 v0.0.44" [ref=f3e267] [cursor=pointer]: v0.0.44
  - dialog "工作目录" [ref=f3e268]:
    - searchbox "搜索工作目录" [active] [ref=f3e272]
    - menu "选择工作目录" [ref=f3e273]:
      - group "最近工作目录" [ref=f3e274]:
        - menuitemradio "/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-EbQ2w8/workspace" [checked] [ref=f3e275] [cursor=pointer]:
          - generic [ref=f3e278]: workspace
      - group [ref=f3e282]:
        - menuitem "另选文件夹…" [ref=f3e283] [cursor=pointer]
        - menuitemradio "默认工作目录" [ref=f3e287] [cursor=pointer]
```

# Test source

```ts
  195 |     await expect(side.getByPlaceholder(/输入问题/)).toHaveValue("侧边草稿")
  196 |     await side.locator(".model-trigger").click()
  197 |     await expect(side.locator(".model-menu")).toBeVisible()
  198 |     await page.keyboard.press("Escape")
  199 |     await side.getByRole("button", { name: /^上下文 / }).click()
  200 |     const context = side.getByRole("dialog", { name: "上下文", exact: true })
  201 |     const popup = (await context.boundingBox())!
  202 |     const card = (await side.locator(".composer-card").boundingBox())!
  203 |     expect(popup.x).toBeGreaterThanOrEqual(card.x - 1)
  204 |     expect(popup.x + popup.width).toBeLessThanOrEqual(card.x + card.width + 1)
  205 |     await page.screenshot({ path: `${shots}/side-context-${width}.png`, animations: "disabled" })
  206 |     await page.keyboard.press("Escape")
  207 |     await side.locator(".composer textarea").focus()
  208 |     await expect(context).toHaveCount(0)
  209 |     await side.locator(".perm-pill-trigger").click()
  210 |     const permissions = side.getByRole("menu", { name: "工具权限", exact: true })
  211 |     const permissionBox = (await permissions.boundingBox())!
  212 |     expect(permissionBox.x).toBeGreaterThanOrEqual(card.x - 1)
  213 |     expect(permissionBox.x + permissionBox.width).toBeLessThanOrEqual(card.x + card.width + 1)
  214 |     await expect(permissions.getByRole("menuitemradio", { name: /完全访问权限/ })).toBeVisible()
  215 |     await page.keyboard.press("Escape")
  216 |     await page.screenshot({ path: `${shots}/side-toolbar-${width}.png`, animations: "disabled" })
  217 |   }
  218 | })
  219 | 
  220 | test("终端跟随强调色，上下文平时透明悬停有反馈，菜单跟随主题色", async ({ dawn }) => {
  221 |   const { page } = dawn
  222 |   mkdirSync(shots, { recursive: true })
  223 |   await 在项目里开会话(page)
  224 |   await page.getByPlaceholder(/输入问题/).fill("上下文配色检查")
  225 |   await page.getByPlaceholder(/输入问题/).press("Enter")
  226 |   await expect(page.locator(".turns")).toContainText(CANNED_REPLY)
  227 |   const environment = page.locator(".composer-environment")
  228 |   const inputBackground = await page.locator(".composer-box").evaluate(el => getComputedStyle(el).backgroundColor)
  229 |   await expect(environment).toHaveCSS("background-color", inputBackground)
  230 |   await expect(environment).toHaveCSS("border-bottom-width", "0px")
  231 |   expect(await page.locator(".composer-footer").evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(inputBackground)
  232 |   for (const theme of ["亮色", "暗色"]) {
  233 |     await 进设置(page, "外观")
  234 |     await page.getByRole("radio", { name: theme, exact: true }).click()
  235 |     const color = page.getByRole("textbox", { name: "颜色值，可输入 HEX 或 RGB", exact: true })
  236 |     await color.fill("#7564b1")
  237 |     await color.press("Enter")
  238 |     await page.getByRole("button", { name: "返回", exact: true }).click()
  239 |     await page.getByPlaceholder(/输入问题/).fill("检查数据")
  240 |     const colors = await page.locator(".composer-box").evaluate(el => {
  241 |       const probe = document.createElement("span")
  242 |       probe.style.color = "var(--dawn-accent)"
  243 |       probe.style.backgroundColor = "var(--dawn-accent-soft)"
  244 |       el.appendChild(probe)
  245 |       const style = getComputedStyle(probe)
  246 |       const result = { accent: style.color, background: style.backgroundColor, hover: "" }
  247 |       probe.style.backgroundColor = "var(--dawn-control-hover)"
  248 |       result.hover = getComputedStyle(probe).backgroundColor
  249 |       probe.remove()
  250 |       return result
  251 |     })
  252 |     const terminal = page.locator(".composer-tools .dock-toggle")
  253 |     await expect(terminal.locator("svg")).toHaveCSS("color", colors.accent)
  254 |     await expect(page.locator(".composer-tools .attach-trigger svg")).toHaveCSS("color", colors.accent)
  255 |     const meter = page.locator(".composer-controls .ctx-meter-trigger")
  256 |     await expect(meter).toHaveCSS("color", colors.accent)
  257 |     await expect(meter).toHaveCSS("font-size", "14px")
  258 |     await expect(meter).toHaveCSS("font-weight", "600")
  259 |     await expect(meter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  260 |     await meter.hover()
  261 |     await expect(meter).toHaveCSS("background-color", colors.hover)
  262 |     await meter.click()
  263 |     await expect(page.getByRole("dialog", { name: "上下文", exact: true })).toBeVisible()
  264 |     await expect(meter).toHaveCSS("background-color", colors.hover)
  265 |     await page.mouse.move(0, 0)
  266 |     await expect(meter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  267 |     await page.screenshot({ path: `${shots}/toolbar-accent-${theme}.png`, animations: "disabled", scale: "css" })
  268 |     await page.keyboard.press("Escape")
  269 |     await page.getByRole("button", { name: "添加内容", exact: true }).click()
  270 |     const upload = page.getByRole("menuitem", { name: "上传文件", exact: true })
  271 |     await upload.hover()
  272 |     await expect(upload).toHaveCSS("background-color", colors.background)
  273 |     await expect(upload.locator("svg")).toHaveCSS("color", colors.accent)
  274 |     const optimize = page.getByRole("menuitem", { name: "优化输入", exact: true })
  275 |     await optimize.hover()
  276 |     const expert = page.getByRole("menuitemradio", { name: /专家/ })
  277 |     await expert.hover()
  278 |     await expect(expert).toHaveCSS("background-color", colors.background)
  279 |     await expect(expert).toHaveCSS("color", colors.accent)
  280 |     await expect(optimize).toHaveCSS("background-color", colors.background)
  281 |     await page.screenshot({ path: `${shots}/accent-hover-${theme}.png`, animations: "disabled", scale: "css" })
  282 |     await page.keyboard.press("Escape")
  283 |     await page.keyboard.press("Escape")
  284 |     await page.locator(".composer-environment .ws-chip").click()
  285 |     const directories = page.getByRole("dialog", { name: "工作目录", exact: true })
  286 |     await expect(directories).toBeVisible()
  287 |     await expect.poll(async () => Math.round((await directories.boundingBox())!.width)).toBe(360)
  288 |     const search = directories.getByRole("searchbox")
  289 |     await expect(search).toBeFocused()
  290 |     await expect(search).toHaveCSS("outline-style", "none")
  291 |     const directoryTrigger = page.locator(".composer-environment .ws-chip")
  292 |     const triggerSize = await directoryTrigger.evaluate(el => ({ font: getComputedStyle(el).fontSize, height: el.getBoundingClientRect().height, icon: getComputedStyle(el.querySelector("svg")!).width }))
  293 |     const rows = directories.locator(".btn-menu-row")
  294 |     for (const row of await rows.all()) {
> 295 |       expect((await row.boundingBox())!.height).toBe(triggerSize.height)
      |                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  296 |       await expect(row).toHaveCSS("font-size", triggerSize.font)
  297 |       await expect(row.locator("svg").first()).toHaveCSS("width", triggerSize.icon)
  298 |       await expect(row.locator("svg").first()).toHaveCSS("color", colors.accent)
  299 |     }
  300 |     const selectedDirectory = directories.locator('[aria-checked="true"]')
  301 |     await expect(selectedDirectory.locator("svg").first()).toHaveAttribute("fill", "currentColor")
  302 |     await expect(directoryTrigger.locator("svg").first()).toHaveAttribute("fill", "currentColor")
  303 |     await expect(directories.locator('[aria-checked="false"] svg').first()).toHaveAttribute("fill", "none")
  304 |     await expect(selectedDirectory).toHaveCSS("background-color", colors.background)
  305 |     await directories.locator(".workspace-menu-browse").hover()
  306 |     await expect(directories.locator(".workspace-menu-browse")).toHaveCSS("background-color", colors.background)
  307 |     await expect(directories.locator(".workspace-menu-browse")).toHaveCSS("color", colors.accent)
  308 |     await directories.screenshot({ path: `${shots}/workspace-roomy-${theme}.png`, animations: "disabled", scale: "css" })
  309 |     await page.keyboard.press("Escape")
  310 |   }
  311 | })
  312 | 
```