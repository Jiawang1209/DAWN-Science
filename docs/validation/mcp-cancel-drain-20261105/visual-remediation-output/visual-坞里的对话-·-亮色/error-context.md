# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> 坞里的对话 · 亮色
- Location: e2e/visual.spec.ts:289:5

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  17773 pixels (ratio 0.02 of all image pixels) are different.

  Snapshot: 坞里的对话-亮色.png

Call log:
  - Expect "toHaveScreenshot(坞里的对话-亮色.png)" with timeout 25000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 17773 pixels (ratio 0.02 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 17773 pixels (ratio 0.02 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=f4e3]:
  - generic [ref=f4e4]:
    - generic [ref=f4e5]:
      - button "DAWN Science" [ref=f4e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f4e10] [cursor=pointer]
      - button "快捷键速查" [ref=f4e13] [cursor=pointer]
    - generic [ref=f4e17]:
      - tablist "同一处的会话" [ref=f4e21]:
        - generic [ref=f4e22]:
          - tab "你好 坞" [ref=f4e23] [cursor=pointer]:
            - generic "你好" [ref=f4e25]
            - generic [ref=f4e26]: 坞
          - button "关掉「你好」（收进归档）" [ref=f4e27] [cursor=pointer]
        - generic [ref=f4e30]:
          - tab "请说一句话" [selected] [ref=f4e31] [cursor=pointer]
          - button "关掉「请说一句话」（收进归档）" [ref=f4e34] [cursor=pointer]
        - button "在这里再开一段" [ref=f4e37] [cursor=pointer]
      - generic:
        - banner
    - button "面板：对话" [expanded] [ref=f4e41] [cursor=pointer]
  - generic [ref=f4e42]:
    - complementary [ref=f4e43]:
      - button "新建任务" [ref=f4e45] [cursor=pointer]
      - separator [ref=f4e50]
      - generic [ref=f4e51]:
        - generic [ref=f4e52]: 工作区
        - generic [ref=f4e53]:
          - button "搜索" [ref=f4e54] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f4e57] [cursor=pointer]
      - generic [ref=f4e61]:
        - paragraph [ref=f4e62]:
          - button "项目 1" [expanded] [ref=f4e63] [cursor=pointer]:
            - generic [ref=f4e68]: 项目
            - generic [ref=f4e69]: "1"
          - button "多选项目" [ref=f4e70] [cursor=pointer]: 多选
        - list [ref=f4e71]:
          - listitem [ref=f4e72]:
            - generic [ref=f4e73]:
              - button "workspace" [ref=f4e74] [cursor=pointer]
              - generic [ref=f4e83]:
                - button "在「workspace」里开一段新对话" [ref=f4e84] [cursor=pointer]
                - button "项目操作：workspace" [ref=f4e88] [cursor=pointer]: ⋯
            - list [ref=f4e89]:
              - listitem [ref=f4e90]:
                - button "你好 刚刚" [ref=f4e91]:
                  - generic [ref=f4e92]: 你好
                  - generic [ref=f4e96]: 刚刚
                - button "会话操作：你好" [ref=f4e98] [cursor=pointer]: ⋯
              - listitem [ref=f4e99]:
                - button "请说一句话 刚刚" [ref=f4e100]:
                  - generic [ref=f4e101]: 请说一句话
                  - generic [ref=f4e105]: 刚刚
                - button "会话操作：请说一句话" [ref=f4e107] [cursor=pointer]: ⋯
        - region "服务器" [ref=f4e108]:
          - generic [ref=f4e109]:
            - button "服务器" [expanded] [ref=f4e110] [cursor=pointer]
            - button "添加服务器" [ref=f4e119] [cursor=pointer]
          - paragraph [ref=f4e122]: 还没有服务器
      - generic [ref=f4e123]:
        - button "定时" [ref=f4e124] [cursor=pointer]
        - button "设置" [ref=f4e129] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f4e133]
    - main [ref=f4e134]:
      - generic [ref=f4e135]:
        - toolbar "会话工具栏" [ref=f4e136]:
          - group "会话操作：请说一句话" [ref=f4e138]:
            - button "查找当前对话" [ref=f4e140] [cursor=pointer]
            - button "导出对话" [ref=f4e144] [cursor=pointer]
        - generic [ref=f4e149]:
          - generic [ref=f4e150]:
            - generic [ref=f4e151]: 你
            - generic [ref=f4e153]:
              - paragraph [ref=f4e157]: 请说一句话
              - generic [ref=f4e158]:
                - time [ref=f4e159]: 2026-11-06 01:13
                - button "复制我说的这段" [ref=f4e160] [cursor=pointer]
                - button "修改" [ref=f4e166] [cursor=pointer]
                - button "回到这句之前" [ref=f4e170] [cursor=pointer]
          - generic [ref=f4e173]:
            - generic [ref=f4e174]:
              - generic [ref=f4e175]: D
              - generic [ref=f4e176]: DeepSeek
            - generic [ref=f4e177]:
              - paragraph [ref=f4e181]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f4e182]:
                - button "复制这段回答" [ref=f4e183] [cursor=pointer]
                - paragraph [ref=f4e189]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f4e190]:
          - generic [ref=f4e191]:
            - generic [ref=f4e192]:
              - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-d3ic8v/workspace" [ref=f4e194] [cursor=pointer]:
                - generic [ref=f4e197]: workspace
              - generic [ref=f4e200]: 本机
            - textbox "检查缺失值并说明处理方法" [ref=f4e206]
            - generic [ref=f4e207]:
              - generic [ref=f4e208]:
                - button "添加内容" [ref=f4e210] [cursor=pointer]
                - button "终端面板" [ref=f4e213] [cursor=pointer]
                - button "完全访问" [ref=f4e217] [cursor=pointer]
              - generic [ref=f4e222]:
                - button "上下文 <1%" [ref=f4e224] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f4e229] [cursor=pointer]:
                  - generic [ref=f4e233]: deepseek-flash
                - button "发送" [ref=f4e236] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f4e241]: 1 轮 · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
    - complementary "对话" [ref=f4e242]:
      - separator "调整面板宽度" [ref=f4e243]
      - generic [ref=f4e244]:
        - tablist "面板" [ref=f4e245]:
          - tab "文件" [ref=f4e246] [cursor=pointer]
          - tab "产物" [ref=f4e247] [cursor=pointer]
          - tab "笔记本" [ref=f4e248] [cursor=pointer]
          - tab "路线" [ref=f4e249] [cursor=pointer]
          - tab "审阅" [ref=f4e250] [cursor=pointer]
          - tab "对话" [selected] [ref=f4e251] [cursor=pointer]
          - tab "Bot" [ref=f4e252] [cursor=pointer]
        - button "更多面板" [ref=f4e254] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f4e255] [cursor=pointer]
      - generic [ref=f4e260]:
        - generic [ref=f4e261]:
          - heading "你好" [level=2] [ref=f4e265]
          - button "查找内容" [ref=f4e266] [cursor=pointer]
          - button "导出对话" [ref=f4e268] [cursor=pointer]
          - button "换到主区" [ref=f4e269] [cursor=pointer]
          - button "从坞里拿下" [ref=f4e270] [cursor=pointer]: ×
        - generic [ref=f4e273]:
          - generic [ref=f4e274]:
            - generic [ref=f4e275]: 你
            - generic [ref=f4e277]:
              - paragraph [ref=f4e281]: 你好
              - generic [ref=f4e282]:
                - time [ref=f4e283]: 2026-11-06 01:14
                - button "复制我说的这段" [ref=f4e284] [cursor=pointer]
                - button "修改" [ref=f4e290] [cursor=pointer]
                - button "回到这句之前" [ref=f4e294] [cursor=pointer]
          - generic [ref=f4e297]:
            - generic [ref=f4e298]:
              - generic [ref=f4e299]: D
              - generic [ref=f4e300]: DeepSeek
            - generic [ref=f4e301]:
              - paragraph [ref=f4e305]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f4e306]:
                - button "复制这段回答" [ref=f4e307] [cursor=pointer]
                - paragraph [ref=f4e313]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f4e314]:
          - generic [ref=f4e315]:
            - generic [ref=f4e316]:
              - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-d3ic8v/workspace" [ref=f4e318] [cursor=pointer]:
                - generic [ref=f4e321]: workspace
              - generic [ref=f4e324]: 本机
            - textbox "检查缺失值并说明处理方法" [active] [ref=f4e330]
            - generic [ref=f4e331]:
              - generic [ref=f4e332]:
                - button "添加内容" [ref=f4e334] [cursor=pointer]
                - button "完全访问" [ref=f4e338] [cursor=pointer]
              - generic [ref=f4e343]:
                - button "上下文 <1%" [ref=f4e345] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f4e350] [cursor=pointer]:
                  - generic [ref=f4e354]: deepseek-flash
                - button "发送" [ref=f4e357] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f4e362]: 1 轮 · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
  - contentinfo "应用状态" [ref=f4e363]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f4e365] [cursor=pointer]
    - generic [ref=f4e366]:
      - generic [ref=f4e367]:
        - button "当前模型：deepseek-flash" [ref=f4e368] [cursor=pointer]:
          - generic [ref=f4e372]: deepseek-flash
        - button "R：未配置" [ref=f4e373] [cursor=pointer]:
          - generic [ref=f4e375]: R
          - generic [ref=f4e376]: 未配置
        - button "Python：未配置" [ref=f4e377] [cursor=pointer]:
          - generic [ref=f4e379]: Python
          - generic [ref=f4e380]: 未配置
      - generic [ref=f4e381]:
        - generic [ref=f4e382]:
          - button "插件 8" [ref=f4e383] [cursor=pointer]:
            - generic [ref=f4e386]: 插件
            - generic [ref=f4e387]: "8"
          - button "Skills 9" [ref=f4e388] [cursor=pointer]:
            - generic [ref=f4e392]: Skills
            - generic [ref=f4e393]: "9"
          - button "MCP 0" [ref=f4e394] [cursor=pointer]:
            - generic [ref=f4e397]: MCP
            - generic [ref=f4e398]: "0"
          - button "子 Agent 22" [ref=f4e399] [cursor=pointer]:
            - generic [ref=f4e402]: 子 Agent
            - generic [ref=f4e403]: "22"
        - button "版本 v0.0.44" [ref=f4e404] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  247 |   {
  248 |     /**
  249 |      * **坞里的对话**（侧边对话，2026-09-24 的 Task 8）。主区一问一答，坞开在「对话」格、
  250 |      * 挂着另开的一段、也是一问一答——钉住的是「一屏两段 ConversationView」的版面：
  251 |      * 坞头那颗「换到主区」与 ×、紧凑版的转录与输入卡。
  252 |      *
  253 |      * **走项目会话**：临时会话没有「同一个地方」，坞格对它只说「没处挂」（Task 6）。
  254 |      * 夹具的 workspace 名恒为 `workspace`，项目名不会随每次的临时目录变。
  255 |      */
  256 |     name: "坞里的对话",
  257 |     go: async (page) => {
  258 |       await 在项目里开会话(page)
  259 |       const 主区 = page.locator("main.main")
  260 |       const 坞 = page.locator("aside.right-dock")
  261 |       await 主区.getByPlaceholder(/输入问题/).fill("请说一句话")
  262 |       await 主区.getByPlaceholder(/输入问题/).press("Enter")
  263 |       await expect(主区.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
  264 |       await 进坞(page, "对话")
  265 |       await 坞.getByRole("button", { name: "另开一段", exact: true }).click()
  266 |       await 坞.locator(".side-chat-head").waitFor({ timeout: 30_000 })
  267 |       await 坞.getByPlaceholder(/输入问题/).fill("你好")
  268 |       await 坞.getByPlaceholder(/输入问题/).press("Enter")
  269 |       await expect(坞.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
  270 |       /** 标题要等「你好」落上去——先是「新对话」，首句回来之后才改名；截在中间那一帧就是一场竞态 */
  271 |       await expect(坞.locator(".side-chat-title")).toHaveText("你好")
  272 |       /** 两段都停下：停止键消失、发送键回来，截的是静止态 */
  273 |       await expect(page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0)
  274 |     },
  275 |     mask: (page) => [
  276 |       /** 工作目录那颗 chip 写的是夹具的临时目录（`/var/folders/…/dawn-e2e-XXXX/workspace`）：换台机器、换一次跑就不同 */
  277 |       page.locator(".ws-chip-label"),
  278 |       /** 项目底下那两行的「刚刚」：与 `.session-list .sess-when` 同一条理由，只是住在项目列表里 */
  279 |       page.locator(".proj-session-list .sess-when"),
  280 |     ],
  281 |   },
  282 | ]
  283 | 
  284 | /** 哪几张的侧栏是收起的（那时两行不在屏上，不用等数字） */
  285 | const sidebarCollapsedFor = (_name: string): boolean => false
  286 | 
  287 | for (const theme of ["亮色", "暗色"] as const) {
  288 |   for (const screen of SCREENS) {
  289 |     test(`${screen.name} · ${theme}`, async ({ dawn }) => {
  290 |       const { page } = dawn
  291 |       // 基线固定于 1280×808 内容区；外部桌面环境可能收窄新窗口，不能让它改变视觉验收尺寸。
  292 |       await page.setViewportSize({ width: 1280, height: 808 })
  293 |       await setTheme(page, theme)
  294 |       await screen.go(page)
  295 | 
  296 |       /**
  297 |        * **等状态栏落定。**
  298 |        *
  299 |        * 收紧阈值之后跑出的假报警是 3000–5000 像素级的，那不是抗锯齿，
  300 |        * 是**有东西时有时无**：状态栏那句「未配置任何 API key……」要等
  301 |        * `providers` 加载完才出现，而那行字本身就有几千像素。
  302 |        * 它随机命中不同的屏，看着像"图片对比不稳定"，其实是一场普通的竞态。
  303 |        *
  304 |        * 这条等待放在**所有**屏之前，因为状态栏在每一屏都在。
  305 |        */
  306 |       await expect(page.locator(".statusbar .caveat")).toBeVisible()
  307 |       /**
  308 |        * **侧栏那两个数字是异步取的**（2026-08-22）：「Agent Skills 3」「子 Agent 22」在一次 IPC 之后才画。
  309 |        * 不等它们，截图会随机落在数字出现前后——那看着像图片对比不稳定，其实是一场普通的竞态。
  310 |        */
  311 |       /**
  312 |        * **字体装完再截**（2026-08-22 抓到的：命令面板那张单跑稳定差 2px、合跑又过）。
  313 |        * 列表的高度跟着字体走——回退字体与真字体的行高差一两像素，而 `padding-top: 12vh` 的浮层
  314 |        * 整个跟着列表的高度变。等 `document.fonts.ready` 比猜一个延时诚实。
  315 |        */
  316 |       await page.evaluate(() => document.fonts.ready)
  317 |       // 技能 / 子 agent 的计数 2026-08-23 起在设置里，不在侧栏上了——要等的数挪进了「设置」那一屏自己的 `go()`
  318 | 
  319 |       /**
  320 |        * **把指针挪到一个不会悬停任何东西的角落。**
  321 |        *
  322 |        * `screen.go()` 里点过按钮，指针就停在最后点的那个位置上。
  323 |        * 只要那个位置将来长出一个有 hover 态的元素，基线就会开始飘——
  324 |        * 而且飘得极像"图片对比不稳定"。
  325 |        *
  326 |        * 2026-08-09 真的撞上了：空态原本那片空白被四张建议卡片占了，
  327 |        * 指针恰好落在第一张上，于是同一份代码两次跑出两张图，
  328 |        * **差异正好是那一张卡的 hover 底色**（17056 像素，其余分毫不差）。
  329 |        *
  330 |        * 与上面那条同类：**逐像素阈值是 0，任何"有时有有时无"都会说话。**
  331 |        * 该消除的是不确定性本身，不是把阈值放宽。
  332 |        */
  333 |       await page.mouse.move(0, 0)
  334 | 
  335 |       /**
  336 |        * **把鼠标挪开。**
  337 |        *
  338 |        * 走到某一屏往往要点几下，点完鼠标就停在最后那个按钮上——
  339 |        * 于是 `:hover` 生效（`.btn-primary:hover { filter: brightness(1.08) }`），
  340 |        * 而截图那一刻它有没有合成完是碰运气的。
  341 |        *
  342 |        * 表现为「只有那一个按钮在变、别的一个像素不动」，
  343 |        * 看着像图片对比不稳定，其实是**测试自己把界面留在了 hover 态**。
  344 |        */
  345 |       await page.mouse.move(0, 0)
  346 | 
> 347 |       await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`, {
      |                          ^ Error: expect(page).toHaveScreenshot(expected) failed
  348 |         animations: "disabled",
  349 |         caret: "hide",
  350 |         // **唯一跟墙上时钟走的东西。** 遮掉它，也就等于声明这一小块不在覆盖范围内
  351 |         /**
  352 |          * **会话行的副行也跟墙上时钟走**（2026-08-10 起它显示 `agent · HH:MM`）。
  353 |          * 不遮的话这张基线每过一分钟就自己红一次——**逐像素阈值是 0**，
  354 |          * 而一个每分钟红一次的基线，一周之内就会被人条件反射地 update 掉，
  355 |          * 那时它什么都不再证明。与 `.dur` 是同一条理由。
  356 |          */
  357 |         mask: [
  358 |           page.locator(".dur"),
  359 |           page.locator(".session-list .sess .sub"),
  360 |           /**
  361 |            * **会话行右端那一格是相对时间**（2026-08-19）：`14h` / `2d`。
  362 |            * 它比 `.sub` 那个时刻更会变——夹具刚建的会话是「刚刚」，
  363 |            * 一分钟后就成了 `1m`。**外面世界的东西不进逐像素基线**，
  364 |            * 与 `.dur` / `.sub` 同一条理由。
  365 |            */
  366 |           page.locator(".session-list .sess-when"),
  367 |           // 用户提问时间来自真实发送时刻，不把墙上时钟写入视觉基线。
  368 |           page.locator(".turn-time"),
  369 |           /**
  370 |            * **摘要那一行里的「几个模型」来自 pi 的模型目录**，目录一更新它就变。
  371 |            * 和时钟是同一类：**外面世界的东西不进逐像素基线**。
  372 |            */
  373 |           page.locator(".svc-sum"),
  374 |           /**
  375 |            * **工具调用的「已跑 …」是秒表**（②-B · R2）。跑完之后那个数也不稳定——
  376 |            * 它是这台机器这一次真实花掉的时间。同一条理由：
  377 |            * **外面世界的东西不进逐像素基线**，否则它会把人训练成条件反射按 update。
  378 |            */
  379 |           page.locator(".tool-elapsed"),
  380 |           ...(screen.mask?.(page) ?? []),
  381 |         ],
  382 |         /**
  383 |          * **逐像素必须完全一致**（默认是 0.2 的色距容差）。
  384 |          *
  385 |          * 这个值是试出来的，不是拍的。验证过程记在这里，因为结论反直觉：
  386 |          *
  387 |          * | threshold | ΔRGB=(2,5,5) 的强调色漂移 | 描边浓度 8%→10% |
  388 |          * |---|---|---|
  389 |          * | 0.2（默认） | 全绿 —— 漏掉 | 全绿 —— 漏掉 |
  390 |          * | 0.02 | 全绿 —— **仍然漏掉** | 全绿 —— 仍然漏掉 |
  391 |          * | **0** | 4 条红 | 8 条红 |
  392 |          *
  393 |          * 也就是说**只要留任何色距容差，令牌的微小漂移就是看不见的**——
  394 |          * 而那恰恰是最该被自动抓住的一类回归：肉眼发现不了，改动却是真的。
  395 |          *
  396 |          * 敢用 0，前提是采集环境已经确定（`--force-color-profile=srgb`，见 fixtures）。
  397 |          * 在钉死色彩配置之前，0.02 就已经随机红一两张了。
  398 |          *
  399 |          * `maxDiffPixels: 100` 仍然留着：它兜的是"万一有几个像素抖"，
  400 |          * 而不是"允许颜色不一样"。两者不是一回事。
  401 |          */
  402 |         threshold: 0,
  403 |         maxDiffPixels: 100,
  404 |       })
  405 |     })
  406 |   }
  407 | }
  408 | 
```