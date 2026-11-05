# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: files.spec.ts >> **悬停文件弹信息卡；拖窄了时间戳也不折行**
- Location: e2e/files.spec.ts:448:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.right-dock .files-view').getByRole('button', { name: '加宽' })

```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - generic [ref=f2e4]:
    - generic [ref=f2e5]:
      - button "DAWN Science" [ref=f2e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f2e10] [cursor=pointer]
      - button "快捷键速查" [ref=f2e13] [cursor=pointer]
    - button "面板：文件" [expanded] [ref=f2e18] [cursor=pointer]
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
    - complementary "文件" [ref=f2e131]:
      - separator "调整面板宽度" [ref=f2e132]
      - generic [ref=f2e133]:
        - tablist "面板" [ref=f2e134]:
          - tab "文件" [selected] [ref=f2e135] [cursor=pointer]
          - tab "产物" [ref=f2e136] [cursor=pointer]
          - tab "笔记本" [ref=f2e137] [cursor=pointer]
          - tab "路线" [ref=f2e138] [cursor=pointer]
          - tab "Bot" [ref=f2e139] [cursor=pointer]
        - button "更多面板" [ref=f2e141] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f2e142] [cursor=pointer]
      - generic [ref=f2e146]:
        - generic:
          - paragraph:
            - generic: 数据
          - list:
            - listitem:
              - generic: ／
        - generic [ref=f2e147]:
          - generic [ref=f2e148]: 本机
          - textbox "跳到路径" [ref=f2e149]:
            - /placeholder: 输一个目录路径，回车跳过去
          - button "搜文件名" [ref=f2e150] [cursor=pointer]
          - button "刷新当前文件夹" [ref=f2e153] [cursor=pointer]: 刷新
          - group "文件根目录" [ref=f2e156]:
            - generic [ref=f2e157]:
              - generic [ref=f2e162]:
                - generic [ref=f2e163]: 项目文件夹
                - strong [ref=f2e164]: workspace
              - button "初始化科研目录" [ref=f2e166] [cursor=pointer]
            - generic [ref=f2e169]:
              - generic [ref=f2e170]: … / dawn-e2e-aQxdwK /
              - button "完整路径" [ref=f2e171] [cursor=pointer]
        - generic [ref=f2e174]:
          - navigation "工作区文件" [ref=f2e175]:
            - list [ref=f2e176]:
              - listitem [ref=f2e177]:
                - button "workspace" [ref=f2e178] [cursor=pointer]
                - list [ref=f2e184]:
                  - listitem [ref=f2e185]:
                    - button "数据" [active] [ref=f2e186] [cursor=pointer]
                    - button "目录操作：数据" [ref=f2e193] [cursor=pointer]: ⋯
                    - list [ref=f2e194]:
                      - listitem [ref=f2e195]:
                        - button [ref=f2e196] [cursor=pointer]:
                          - generic [ref=f2e197]: 一个名字很长很长很长很长的样本文件.csv
                          - generic: 2026-11-05 23:56 · 8 字节
                        - button "文件操作：一个名字很长很长很长很长的样本文件.csv" [ref=f2e201] [cursor=pointer]: ⋯
                  - listitem [ref=f2e202]:
                    - button "README.md 2026-11-05 23:56 · 16 字节" [ref=f2e203] [cursor=pointer]:
                      - generic [ref=f2e204]: README.md
                      - generic [ref=f2e207]: 2026-11-05 23:56 · 16 字节
                    - button "文件操作：README.md" [ref=f2e209] [cursor=pointer]: ⋯
          - separator "调整文件树高度" [ref=f2e210]
        - generic [ref=f2e212]:
          - paragraph [ref=f2e213]: 选一个文件
          - paragraph [ref=f2e214]: 上面是这台机器上的目录。
  - contentinfo "应用状态" [ref=f2e215]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e217] [cursor=pointer]
    - generic [ref=f2e218]:
      - generic [ref=f2e219]:
        - button "当前模型：deepseek-flash" [ref=f2e220] [cursor=pointer]:
          - generic [ref=f2e224]: deepseek-flash
        - button "R：未配置" [ref=f2e225] [cursor=pointer]:
          - generic [ref=f2e227]: R
          - generic [ref=f2e228]: 未配置
        - button "Python：未配置" [ref=f2e229] [cursor=pointer]:
          - generic [ref=f2e231]: Python
          - generic [ref=f2e232]: 未配置
      - generic [ref=f2e233]:
        - generic [ref=f2e234]:
          - button "插件 8" [ref=f2e235] [cursor=pointer]:
            - generic [ref=f2e238]: 插件
            - generic [ref=f2e239]: "8"
          - button "Skills 9" [ref=f2e240] [cursor=pointer]:
            - generic [ref=f2e244]: Skills
            - generic [ref=f2e245]: "9"
          - button "MCP 0" [ref=f2e246] [cursor=pointer]:
            - generic [ref=f2e249]: MCP
            - generic [ref=f2e250]: "0"
          - button "子 Agent 22" [ref=f2e251] [cursor=pointer]:
            - generic [ref=f2e254]: 子 Agent
            - generic [ref=f2e255]: "22"
        - button "版本 v0.0.44" [ref=f2e256] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  378 |   await 结果.getByRole("button", { name: /^right-dock\.ts/ }).click()
  379 |   await expect(page.locator(".file-preview")).toContainText("export const x = 1")
  380 | 
  381 |   // 换个搜不到的词：旧结果不留，说清看了几条
  382 |   await 框.fill("不存在的名字")
  383 |   await expect(结果).toContainText("没有名字里带「不存在的名字」的")
  384 |   await expect(结果.getByRole("button", { name: /^right-dock\.ts/ })).toHaveCount(0)
  385 | 
  386 |   // Esc 退出：树回来了
  387 |   await 框.press("Escape")
  388 |   await expect(面板.getByRole("button", { name: "src", exact: true })).toBeVisible()
  389 | })
  390 | 
  391 | test("**命中到上限就停，并且说停在哪**", async ({ dawn }) => {
  392 |   const { page, workspace } = dawn
  393 |   mkdirSync(join(workspace, "多"), { recursive: true })
  394 |   for (let i = 0; i < 230; i++) writeFileSync(join(workspace, "多", `hit-${String(i).padStart(3, "0")}.txt`), "")
  395 | 
  396 |   await 进坞(page, "文件")
  397 |   const 面板 = page.locator(".right-dock .files-view")
  398 |   await 面板.getByRole("button", { name: "搜文件名", exact: true }).click()
  399 |   await 面板.getByPlaceholder("输文件名的一部分，Esc 退出搜索").fill("hit-")
  400 |   const 结果 = 面板.locator(".files-search-results")
  401 |   await expect(结果.locator(".files-search-note")).toContainText("只列了前 200 条就停了")
  402 |   await expect(结果.locator(".search-hit")).toHaveCount(200)
  403 | })
  404 | 
  405 | /**
  406 |  * **行菜单**（dock-polish ⑤）：复制相对 / 绝对路径、`@路径` 插进输入框。
  407 |  * 「⋯」与右键两个入口都验——右键是看不见的能力，「⋯」才是人找得到的那个。
  408 |  */
  409 | test("**树行的菜单：复制路径、插进输入框**", async ({ dawn }) => {
  410 |   const { page, workspace } = dawn
  411 |   mkdirSync(join(workspace, "data"), { recursive: true })
  412 |   writeFileSync(join(workspace, "data", "样本.csv"), "a,b\n1,2\n")
  413 |   await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  414 | 
  415 |   await 在项目里开会话(page)
  416 |   await 进坞(page, "文件")
  417 |   const 面板 = page.locator(".right-dock .files-view")
  418 |   await 面板.getByRole("button", { name: "data", exact: true }).click()
  419 |   await expect(面板.getByRole("button", { name: /^样本\.csv/ })).toBeVisible()
  420 | 
  421 |   // ① 「⋯」→ 复制相对路径
  422 |   await 面板.getByRole("button", { name: "文件操作：样本.csv" }).click()
  423 |   await page.getByRole("menu").getByRole("menuitem", { name: "复制相对路径" }).click()
  424 |   await expect(面板.locator(".files-row-note")).toContainText("已复制相对路径：data/样本.csv")
  425 |   expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("data/样本.csv")
  426 | 
  427 |   // ② 右键 → 复制绝对路径（工作区 + 相对）
  428 |   await 面板.getByRole("button", { name: /^样本\.csv/ }).click({ button: "right" })
  429 |   await page.getByRole("menu").getByRole("menuitem", { name: "复制绝对路径" }).click()
  430 |   const 绝对 = await page.evaluate(() => navigator.clipboard.readText())
  431 |   expect(绝对.endsWith("/data/样本.csv")).toBe(true)
  432 |   expect(绝对.startsWith("/")).toBe(true)
  433 | 
  434 |   // ③ 目录也有；插进输入框 → 草稿末尾多了 `@data `
  435 |   await 面板.getByRole("button", { name: "目录操作：data" }).click()
  436 |   await page.getByRole("menu").getByRole("menuitem", { name: "插进输入框" }).click()
  437 |   await expect(page.getByPlaceholder(/输入问题/)).toHaveValue("@data ")
  438 |   await 面板.getByRole("button", { name: "文件操作：样本.csv" }).click()
  439 |   await page.getByRole("menu").getByRole("menuitem", { name: "插进输入框" }).click()
  440 |   await expect(page.getByPlaceholder(/输入问题/)).toHaveValue("@data @data/样本.csv ")
  441 | })
  442 | 
  443 | /**
  444 |  * **悬停卡与不换行**（2026-08-21 作者要的两条）：
  445 |  * ① 鼠标停在文件 / 文件夹上弹出信息卡（照左侧栏那张），开在坞的**左边**、不出屏；
  446 |  * ② 树拖得再窄，行上「时间 · 大小」也是一行，不折成两行把行撑高。
  447 |  */
  448 | test("**悬停文件弹信息卡；拖窄了时间戳也不折行**", async ({ dawn }) => {
  449 |   const { page, workspace } = dawn
  450 |   mkdirSync(join(workspace, "数据"), { recursive: true })
  451 |   writeFileSync(join(workspace, "数据", "一个名字很长很长很长很长的样本文件.csv"), "a,b\n1,2\n")
  452 | 
  453 |   await 进坞(page, "文件")
  454 |   const 面板 = page.locator(".right-dock .files-view")
  455 |   await 面板.getByRole("button", { name: "数据", exact: true }).click()
  456 |   const 行 = 面板.getByRole("button", { name: /^一个名字很长/ })
  457 |   await expect(行).toBeVisible()
  458 | 
  459 |   // ① 文件：卡上有所在目录、修改时间、大小；卡整个在坞的左边
  460 |   await 行.hover()
  461 |   const 卡 = page.locator(".sess-hover-card")
  462 |   await expect(卡).toBeVisible({ timeout: 5_000 })
  463 |   await expect(卡).toContainText("一个名字很长很长很长很长的样本文件.csv")
  464 |   await expect(卡.locator(".sess-hover-details li")).toHaveCount(3)
  465 |   await expect(卡).toContainText("数据")
  466 |   await expect(卡).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  467 |   await expect(卡).toContainText("8 字节")
  468 |   const 卡框 = (await 卡.boundingBox())!
  469 |   const 坞框 = (await page.locator(".right-dock").boundingBox())!
  470 |   expect(卡框.x + 卡框.width).toBeLessThanOrEqual(坞框.x + 1)
  471 |   expect(卡框.x).toBeGreaterThanOrEqual(0)
  472 | 
  473 |   // 文件夹也弹：只有所在目录那一行
  474 |   await 面板.getByRole("button", { name: "数据", exact: true }).hover()
  475 |   await expect(卡.locator(".sess-hover-details li")).toHaveCount(1, { timeout: 5_000 })
  476 | 
  477 |   // ② 拖窄树（坞是窄的，缝横着——先加宽成两栏再把树拖窄）
> 478 |   await 面板.getByRole("button", { name: "加宽" }).click()
      |                                                ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  479 |   const 缝 = 面板.getByRole("separator", { name: "调整文件树宽度" })
  480 |   const 缝框 = (await 缝.boundingBox())!
  481 |   await page.mouse.move(缝框.x + 缝框.width / 2, 缝框.y + 缝框.height / 2)
  482 |   await page.mouse.down()
  483 |   await page.mouse.move(缝框.x - 200, 缝框.y + 缝框.height / 2, { steps: 6 })
  484 |   await page.mouse.up()
  485 |   const 高 = await 行.evaluate((el) => el.getBoundingClientRect().height)
  486 |   const 行高 = await 行.evaluate((el) => parseFloat(getComputedStyle(el).minHeight))
  487 |   expect(高, "时间 · 大小折成两行把行撑高了").toBeLessThanOrEqual(行高 + 1)
  488 |   const 副 = 行.locator(".sub")
  489 |   expect(await 副.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap")
  490 | })
  491 | 
  492 | /**
  493 |  * **窗口不大时的三条**（2026-08-21 作者截图给的）：
  494 |  * ① 顶行的放大镜 / 刷新 / 加宽（或收窄）在窄坞里也看得见、点得到——此前被裁在右边外面；
  495 |  * ② 行上先缩时间戳再缩文件名；
  496 |  * ③ 预览头：文件名不逐字竖排，按钮不折成竖条。
  497 |  */
  498 | test("**窄坞：顶行按钮都在、先缩时间戳、预览头不竖排**", async ({ dawn }) => {
  499 |   const { page, workspace } = dawn
  500 |   writeFileSync(join(workspace, "AGENTS.md"), "# 产物落位\n\n正文。\n")
  501 |   await page.setViewportSize({ width: 1200, height: 760 })
  502 | 
  503 |   await 进坞(page, "文件")
  504 |   const 面板 = page.locator(".right-dock .files-view")
  505 | 
  506 |   // ① 三颗都在面板的可视范围里
  507 |   // 第三颗是「加宽」还是「收窄」取决于此刻坞的宽度（顶到窗口上限时两颗都不给，那是设计）
  508 |   const 宽窄 = (await 面板.getByRole("button", { name: "收窄", exact: true }).count()) > 0 ? "收窄" : (await 面板.getByRole("button", { name: "加宽", exact: true }).count()) > 0 ? "加宽" : undefined
  509 |   for (const 名 of ["搜文件名", "刷新当前文件夹", ...(宽窄 ? [宽窄] : [])]) {
  510 |     const b = 面板.getByRole("button", { name: 名, exact: true })
  511 |     await expect(b).toBeVisible()
  512 |     const 框 = (await b.boundingBox())!
  513 |     const 盒 = (await 面板.boundingBox())!
  514 |     expect(框.x + 框.width, `${名} 被裁在面板外面`).toBeLessThanOrEqual(盒.x + 盒.width + 1)
  515 |   }
  516 | 
  517 |   // ② 文件行：名字与时间戳谁先缩——把树拖到很窄之后，名字仍有宽度、时间戳先没
  518 |   const 行 = 面板.getByRole("button", { name: /^AGENTS\.md/ })
  519 |   await expect(行).toBeVisible()
  520 |   // 把整个坞拖窄（坞自己那条缝往右推），树跟着窄——不管此刻是一栏还是两栏都成立
  521 |   const 缝 = page.getByRole("separator", { name: "调整面板宽度" })
  522 |   const 缝框 = (await 缝.boundingBox())!
  523 |   await page.mouse.move(缝框.x + 缝框.width / 2, 缝框.y + 缝框.height / 2)
  524 |   await page.mouse.down()
  525 |   await page.mouse.move(缝框.x + 400, 缝框.y + 缝框.height / 2, { steps: 8 })
  526 |   await page.mouse.up()
  527 |   const 名宽 = await 行.locator(".name").evaluate((el) => el.getBoundingClientRect().width)
  528 |   const 副宽 = await 行.locator(".sub").evaluate((el) => el.getBoundingClientRect().width)
  529 |   const 副内容宽 = await 行.locator(".sub").evaluate((el) => el.scrollWidth)
  530 |   expect(副宽, "时间戳该先缩").toBeLessThan(副内容宽)
  531 |   expect(名宽).toBeGreaterThan(40)
  532 | 
  533 |   // ③ 预览头
  534 |   await 行.click()
  535 |   const 头 = page.locator(".preview-head")
  536 |   await expect(头.locator(".name")).toHaveText("AGENTS.md")
  537 |   // 单行文件名允许横向滚动；元素盒包含滚动条，不能用盒高判断文字换行。
  538 |   const 名 = 头.locator(".name")
  539 |   await expect(名).toHaveCSS("white-space", "nowrap")
  540 |   const 排版 = await 名.evaluate(el => {
  541 |     const range = document.createRange(); range.selectNodeContents(el)
  542 |     return { 文字行: [...range.getClientRects()].map(r => ({ 高: r.height, 顶: r.y })),
  543 |       行高: parseFloat(getComputedStyle(el).lineHeight), 可见宽: el.clientWidth, 全宽: el.scrollWidth }
  544 |   })
  545 |   expect(排版.文字行, "文件名实际字形应只有一行").toHaveLength(1)
  546 |   expect(排版.文字行[0]!.高, "文件名竖排了").toBeLessThanOrEqual(排版.行高 + 1)
  547 |   expect(排版.可见宽).toBeGreaterThan(0)
  548 |   await 名.focus()
  549 |   await expect(名).toBeFocused()
  550 |   if (排版.全宽 > 排版.可见宽) {
  551 |     await 名.press("ArrowRight")
  552 |     await expect.poll(() => 名.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  553 |   }
  554 |   const 删 = 头.getByRole("button", { name: "移到废纸篓" })
  555 |   const 删高 = (await 删.boundingBox())!.height
  556 |   expect(删高, "按钮折成竖条了").toBeLessThan(40)
  557 | })
  558 | 
  559 | /**
  560 |  * **坞不许伸出窗口**（2026-08-21 作者截图：窗口没最大化时，网格那一列被压窄了，
  561 |  * 坞却仍是 `width: 720px`，「加宽 / 搜索 / 刷新」全在屏幕右边看不见的地方）。
  562 |  * 坞现在占满那一列——列多宽它多宽，按钮跟着变。缝也贴坞的真实边。
  563 |  */
  564 | test("**坞宽过了窗口能给的：坞被压进窗口里，按钮都看得见，缝在坞的真实边上**", async ({ dawn }) => {
  565 |   const { page } = dawn
  566 |   await 进坞(page, "文件")
  567 |   // 先在宽窗口里把坞拉到最宽
  568 |   await page.setViewportSize({ width: 1600, height: 800 })
  569 |   const 面板 = page.locator(".right-dock .files-view")
  570 |   await 面板.getByRole("button", { name: "加宽", exact: true }).click()
  571 |   const 坞 = page.locator(".right-dock")
  572 |   // 列宽有 0.25s 的过渡，等它到位
  573 |   await expect.poll(async () => (await 坞.boundingBox())!.width).toBeGreaterThan(600)
  574 | 
  575 |   // 再把窗口缩小：坞必须整个在窗口里
  576 |   await page.setViewportSize({ width: 1000, height: 700 })
  577 |   await expect
  578 |     .poll(async () => {
```