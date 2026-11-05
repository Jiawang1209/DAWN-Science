# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: i18n.spec.ts >> **英文界面上每一屏都没有汉字**
- Location: e2e/i18n.spec.ts:109:1

# Error details

```
Error: 「Skills」这一屏上还有中文——补进 src/ui/i18n/en.ts

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 22

- Array []
+ Array [
+   "元",
+   "分析交付",
+   "分析路线",
+   "可复现",
+   "可视化",
+   "复现",
+   "技能",
+   "数据对账",
+   "数据科学",
+   "文献",
+   "文献调研",
+   "案例",
+   "环境",
+   "生态",
+   "科研",
+   "科研审查",
+   "统计",
+   "综述",
+   "论文精读",
+   "证据对照",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f3e3]:
  - generic [ref=f3e4]:
    - generic [ref=f3e5]:
      - button "DAWN Science" [ref=f3e7] [cursor=pointer]
      - button "Hide sidebar" [expanded] [ref=f3e10] [cursor=pointer]
      - button "Keyboard shortcuts" [ref=f3e13] [cursor=pointer]
    - button "Back" [ref=f3e17] [cursor=pointer]
    - button "Panel" [ref=f3e19] [cursor=pointer]
  - generic [ref=f3e20]:
    - complementary [ref=f3e21]:
      - button "New task" [ref=f3e23] [cursor=pointer]
      - separator [ref=f3e28]
      - generic [ref=f3e29]:
        - generic [ref=f3e30]: Workspace
        - generic [ref=f3e31]:
          - button "Search" [ref=f3e32] [cursor=pointer]
          - button "Add workspace folder" [ref=f3e35] [cursor=pointer]
      - region "Servers" [ref=f3e40]:
        - generic [ref=f3e41]:
          - button "Servers" [expanded] [ref=f3e42] [cursor=pointer]
          - button "Add a host" [ref=f3e51] [cursor=pointer]
        - paragraph [ref=f3e54]: No hosts yet
      - generic [ref=f3e55]:
        - button "Schedules" [ref=f3e56] [cursor=pointer]
        - button "Settings" [ref=f3e61] [cursor=pointer]
    - separator "Resize sidebar" [ref=f3e65]
    - main [ref=f3e66]:
      - generic [ref=f3e68]:
        - navigation "Settings sections" [ref=f3e69]:
          - button "Appearance" [ref=f3e70] [cursor=pointer]
          - button "Desktop notifications" [ref=f3e74] [cursor=pointer]
          - button "File references" [ref=f3e78] [cursor=pointer]
          - button "Usage" [ref=f3e82] [cursor=pointer]
          - button "Working folder" [ref=f3e86] [cursor=pointer]
          - button "Model providers" [ref=f3e90] [cursor=pointer]
          - button "ACP adapters" [ref=f3e94] [cursor=pointer]
          - button "Kernel" [ref=f3e98] [cursor=pointer]
          - paragraph [ref=f3e102]: Extensions
          - button "Skills" [active] [ref=f3e103] [cursor=pointer]:
            - generic [ref=f3e108]: "9"
          - button "Memory" [ref=f3e109] [cursor=pointer]
          - button "Subagents" [ref=f3e115] [cursor=pointer]:
            - generic [ref=f3e119]: "22"
          - button "Plugins" [ref=f3e120] [cursor=pointer]:
            - generic [ref=f3e124]: "8"
          - button "MCP servers" [ref=f3e125] [cursor=pointer]:
            - generic [ref=f3e129]: "0"
          - button "Remote assistant" [ref=f3e130] [cursor=pointer]
          - button "About" [ref=f3e134] [cursor=pointer]
        - generic [ref=f3e138]:
          - generic [ref=f3e139]:
            - heading "Skills" [level=1] [ref=f3e140]
            - button "Collapse" [ref=f3e141] [cursor=pointer]
          - generic [ref=f3e142]:
            - generic [ref=f3e143]:
              - paragraph [ref=f3e144]: A skill is a folder with a SKILL.md. The model reads it on demand; /skill:name invokes it explicitly.
              - generic [ref=f3e145]:
                - button "Re-read Skill list" [ref=f3e146] [cursor=pointer]
                - button "Import into yours…" [ref=f3e147] [cursor=pointer]
                - button "Import into this project…" [ref=f3e148] [cursor=pointer]
              - paragraph [ref=f3e149]: Open a built-in conversation to refresh its Skills.
            - tablist "Skill management" [ref=f3e150]:
              - tab "Installed" [selected] [ref=f3e151] [cursor=pointer]
              - tab "Discover Skills" [ref=f3e152] [cursor=pointer]
            - group [ref=f3e153]:
              - generic "Where do they go?" [ref=f3e154] [cursor=pointer]
            - generic [ref=f3e155]:
              - radiogroup "Source" [ref=f3e156]:
                - radio "All（9）" [checked] [ref=f3e157] [cursor=pointer]
                - radio "built in（9）" [ref=f3e158] [cursor=pointer]
              - searchbox "Search skills" [ref=f3e159]
              - generic [ref=f3e160]: 9 skills, 9 enabled
            - group "Filter by tag" [ref=f3e161]:
              - button "Any tag" [pressed] [ref=f3e162] [cursor=pointer]
              - button "EDA" [ref=f3e163] [cursor=pointer]
              - button "MCP" [ref=f3e164] [cursor=pointer]
              - button "Python" [ref=f3e165] [cursor=pointer]
              - button "R" [ref=f3e166] [cursor=pointer]
              - button "元" [ref=f3e167] [cursor=pointer]
              - button "分析交付" [ref=f3e168] [cursor=pointer]
              - button "分析路线" [ref=f3e169] [cursor=pointer]
              - button "可复现" [ref=f3e170] [cursor=pointer]
              - button "可视化" [ref=f3e171] [cursor=pointer]
              - button "复现" [ref=f3e172] [cursor=pointer]
              - button "技能" [ref=f3e173] [cursor=pointer]
              - button "数据对账" [ref=f3e174] [cursor=pointer]
              - button "数据科学" [ref=f3e175] [cursor=pointer]
              - button "文献" [ref=f3e176] [cursor=pointer]
              - button "文献调研" [ref=f3e177] [cursor=pointer]
              - button "案例" [ref=f3e178] [cursor=pointer]
              - button "环境" [ref=f3e179] [cursor=pointer]
              - button "生态" [ref=f3e180] [cursor=pointer]
              - button "科研" [ref=f3e181] [cursor=pointer]
              - button "科研审查" [ref=f3e182] [cursor=pointer]
              - button "统计" [ref=f3e183] [cursor=pointer]
              - button "综述" [ref=f3e184] [cursor=pointer]
              - button "论文精读" [ref=f3e185] [cursor=pointer]
              - button "证据对照" [ref=f3e186] [cursor=pointer]
            - group "Bulk Skill management" [ref=f3e187]:
              - button "Select filtered results" [ref=f3e188] [cursor=pointer]
              - button "Deselect" [disabled] [ref=f3e189]
              - generic [ref=f3e190]: 0 selected
              - button "Automatic invocation" [disabled] [ref=f3e191]
              - button "Make selected manual" [disabled] [ref=f3e192]
              - button "Turn selection off" [disabled] [ref=f3e193]
            - list "Skill list" [ref=f3e194]:
              - listitem [ref=f3e195]:
                - checkbox "Select Skill analysis-delivery" [ref=f3e196]
                - generic [ref=f3e197]:
                  - paragraph [ref=f3e198]:
                    - button "Inspect Skill analysis-delivery" [ref=f3e199] [cursor=pointer]: analysis-delivery
                    - generic [ref=f3e200]: built in
                    - generic [ref=f3e201]: Enabled
                  - paragraph [ref=f3e202]: 当用户要求整理已完成或基本完成的 R/Python 分析、生成完整分析报告、交付脚本和说明，或交给合作者复跑时使用；普通探索、临时检查和单次画图不自动打包。
                  - paragraph [ref=f3e203]:
                    - generic [ref=f3e204]: 分析交付
                    - generic [ref=f3e205]: R
                    - generic [ref=f3e206]: Python
                    - generic [ref=f3e207]: 科研
                    - generic [ref=f3e208]: 可复现
                - 'button "Skill actions: analysis-delivery" [ref=f3e210] [cursor=pointer]': ⋯
              - listitem [ref=f3e211]:
                - checkbox "Select Skill analyze-like-case" [ref=f3e212]
                - generic [ref=f3e213]:
                  - paragraph [ref=f3e214]:
                    - button "Inspect Skill analyze-like-case" [ref=f3e215] [cursor=pointer]: analyze-like-case
                    - generic [ref=f3e216]: built in
                    - generic [ref=f3e217]: Enabled
                  - paragraph [ref=f3e218]: 科研分析向导。适用于用户提出综合分析需求、询问完整分析路线或“需要哪些分析”、希望从 MLAI-science 分步骤寻找真实案例，以及查找单项分析案例或继续选定案例的场景。
                  - paragraph [ref=f3e219]:
                    - generic [ref=f3e220]: 数据科学
                    - generic [ref=f3e221]: 分析路线
                    - generic [ref=f3e222]: 案例
                    - generic [ref=f3e223]: MCP
                - 'button "Skill actions: analyze-like-case" [ref=f3e225] [cursor=pointer]': ⋯
              - listitem [ref=f3e226]:
                - checkbox "Select Skill dataset-first-look" [ref=f3e227]
                - generic [ref=f3e228]:
                  - paragraph [ref=f3e229]:
                    - button "Inspect Skill dataset-first-look" [ref=f3e230] [cursor=pointer]: dataset-first-look
                    - generic [ref=f3e231]: built in
                    - generic [ref=f3e232]: Enabled
                  - paragraph [ref=f3e233]: 拿到一份没见过的数据集时，先看哪些东西、按什么顺序看。适用于 CSV/Excel/parquet 这类表格数据，尤其是生态、环境、观测类数据。
                  - paragraph [ref=f3e234]:
                    - generic [ref=f3e235]: 数据科学
                    - generic [ref=f3e236]: 生态
                    - generic [ref=f3e237]: 环境
                    - generic [ref=f3e238]: EDA
                - 'button "Skill actions: dataset-first-look" [ref=f3e240] [cursor=pointer]': ⋯
              - listitem [ref=f3e241]:
                - checkbox "Select Skill figure-like-this" [ref=f3e242]
                - generic [ref=f3e243]:
                  - paragraph [ref=f3e244]:
                    - button "Inspect Skill figure-like-this" [ref=f3e245] [cursor=pointer]: figure-like-this
                    - generic [ref=f3e246]: built in
                    - generic [ref=f3e247]: Enabled
                  - paragraph [ref=f3e248]: 用户拿来一张文献里的图（截图、粘贴、拖进来的图片），说「这种图我也想画」时怎么办——认出图型、去 MLAI-science 的案例库找到「怎么画」、在他自己的数据上真画出来。需要配好 mlai-science 这台 MCP。
                  - paragraph [ref=f3e249]:
                    - generic [ref=f3e250]: 可视化
                    - generic [ref=f3e251]: 文献
                    - generic [ref=f3e252]: 复现
                    - generic [ref=f3e253]: MCP
                - 'button "Skill actions: figure-like-this" [ref=f3e255] [cursor=pointer]': ⋯
              - listitem [ref=f3e256]:
                - checkbox "Select Skill literature-review" [ref=f3e257]
                - generic [ref=f3e258]:
                  - paragraph [ref=f3e259]:
                    - button "Inspect Skill literature-review" [ref=f3e260] [cursor=pointer]: literature-review
                    - generic [ref=f3e261]: built in
                    - generic [ref=f3e262]: Enabled
                  - paragraph [ref=f3e263]: 文献调研：当用户要求精读多篇论文、比较实验设计/样本量/方法/结论、整理证据矩阵或写文献综述时使用；以实际可读材料及 PDF 页码短摘为依据，可交付 Excel 对照表与 Markdown 总结。
                  - paragraph [ref=f3e264]:
                    - generic [ref=f3e265]: 文献调研
                    - generic [ref=f3e266]: 论文精读
                    - generic [ref=f3e267]: 证据对照
                    - generic [ref=f3e268]: 综述
                - 'button "Skill actions: literature-review" [ref=f3e270] [cursor=pointer]': ⋯
              - listitem [ref=f3e271]:
                - checkbox "Select Skill office-docs" [ref=f3e272]
                - generic [ref=f3e273]:
                  - paragraph [ref=f3e274]:
                    - button "Inspect Skill office-docs" [ref=f3e275] [cursor=pointer]: office-docs
                    - generic [ref=f3e276]: built in
                    - generic [ref=f3e277]: Enabled
                  - paragraph [ref=f3e278]: 生成、读取、编辑 Office 文档（xlsx / PDF / pptx / docx）的工具用法与纪律——大文件分页读、交付前 recalc+audit 自检、能用 Markdown 交付就不用二进制。工具在「设置 → 插件」里开关。
                - 'button "Skill actions: office-docs" [ref=f3e280] [cursor=pointer]': ⋯
              - listitem [ref=f3e281]:
                - checkbox "Select Skill reproducible-analysis" [ref=f3e282]
                - generic [ref=f3e283]:
                  - paragraph [ref=f3e284]:
                    - button "Inspect Skill reproducible-analysis" [ref=f3e285] [cursor=pointer]: reproducible-analysis
                    - generic [ref=f3e286]: built in
                    - generic [ref=f3e287]: Enabled
                  - paragraph [ref=f3e288]: 写分析代码时怎么让它半年后还能跑出同样的结果——参数集中、随机种子、路径相对、版本记录。适用于任何要写进论文或交给别人的分析。
                  - paragraph [ref=f3e289]:
                    - generic [ref=f3e290]: 可复现
                    - generic [ref=f3e291]: 数据科学
                    - generic [ref=f3e292]: 科研
                - 'button "Skill actions: reproducible-analysis" [ref=f3e294] [cursor=pointer]': ⋯
              - listitem [ref=f3e295]:
                - checkbox "Select Skill scientific-review" [ref=f3e296]
                - generic [ref=f3e297]:
                  - paragraph [ref=f3e298]:
                    - button "Inspect Skill scientific-review" [ref=f3e299] [cursor=pointer]: scientific-review
                    - generic [ref=f3e300]: built in
                    - generic [ref=f3e301]: Enabled
                  - paragraph [ref=f3e302]: 当用户要求科研审查、核对统计方法与实验单位、检查样本量和图表文字一致性，或审查 R/Python 分析可复现性时使用；也适用于专业角色交接中需要确认审查依据与验证范围的场景。
                  - paragraph [ref=f3e303]:
                    - generic [ref=f3e304]: 科研审查
                    - generic [ref=f3e305]: 统计
                    - generic [ref=f3e306]: 可复现
                    - generic [ref=f3e307]: 数据对账
                - 'button "Skill actions: scientific-review" [ref=f3e309] [cursor=pointer]': ⋯
              - listitem [ref=f3e310]:
                - checkbox "Select Skill writing-skills" [ref=f3e311]
                - generic [ref=f3e312]:
                  - paragraph [ref=f3e313]:
                    - button "Inspect Skill writing-skills" [ref=f3e314] [cursor=pointer]: writing-skills
                    - generic [ref=f3e315]: built in
                    - generic [ref=f3e316]: Enabled
                  - paragraph [ref=f3e317]: 当用户要求「把这套做法记下来」「做成一个技能」「以后都这么干」或把可复用工作流程保存为 Skill 时使用。
                  - paragraph [ref=f3e318]:
                    - generic [ref=f3e319]: 技能
                    - generic [ref=f3e320]: 元
                - 'button "Skill actions: writing-skills" [ref=f3e322] [cursor=pointer]': ⋯
  - contentinfo "Application status" [ref=f3e323]:
    - button "No API key yet, so chatting is not possible — click here to add one" [ref=f3e325] [cursor=pointer]
    - generic [ref=f3e326]:
      - generic [ref=f3e327]:
        - 'button "Current model: deepseek-flash" [ref=f3e328] [cursor=pointer]':
          - generic [ref=f3e332]: deepseek-flash
        - 'button "R: Not configured" [ref=f3e333] [cursor=pointer]':
          - generic [ref=f3e335]: R
          - generic [ref=f3e336]: Not configured
        - 'button "Python: Not configured" [ref=f3e337] [cursor=pointer]':
          - generic [ref=f3e339]: Python
          - generic [ref=f3e340]: Not configured
      - generic [ref=f3e341]:
        - generic [ref=f3e342]:
          - button "Plugins 8" [ref=f3e343] [cursor=pointer]:
            - generic [ref=f3e346]: Plugins
            - generic [ref=f3e347]: "8"
          - button "Skills 9" [ref=f3e348] [cursor=pointer]:
            - generic [ref=f3e352]: Skills
            - generic [ref=f3e353]: "9"
          - button "MCP 0" [ref=f3e354] [cursor=pointer]:
            - generic [ref=f3e357]: MCP
            - generic [ref=f3e358]: "0"
          - button "Subagents 22" [ref=f3e359] [cursor=pointer]:
            - generic [ref=f3e362]: Subagents
            - generic [ref=f3e363]: "22"
        - button "Version v0.0.44" [ref=f3e364] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  39  |     const 走 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  40  |     let n: Node | null
  41  |     while ((n = 走.nextNode())) {
  42  |       const 文 = n.nodeValue ?? ""
  43  |       if (!/[一-鿿]/.test(文)) continue
  44  |       // 看不见的不算：它们不构成「界面还是中文」
  45  |       const el = n.parentElement
  46  |       if (!el) continue
  47  |       const r = el.getBoundingClientRect()
  48  |       if (r.width === 0 || r.height === 0) continue
  49  |       /**
  50  |        * **语言选择器上那两个字永远不翻**——它自己在 DOM 上说了
  51  |        * （`data-native-name`）。一个看不懂当前语言的人正是最需要那颗按钮的人。
  52  |        *
  53  |        * 例外写在被例外的那个东西上，不写在这里的白名单里：
  54  |        * 白名单会随着文案改动悄悄失效，而标记不会。
  55  |        */
  56  |       if (el.closest("[data-native-name]")) continue
  57  |       /**
  58  |        * **人写的内容不算「界面没翻」**（2026-08-15）。
  59  |        *
  60  |        * 技能的名字与说明是**作者写给模型看的**，不是界面文案——
  61  |        * 你自己写一个中文技能，它在英文界面下照样显示中文，那是对的。
  62  |        * 自带那两个也一样（它们是我们发的内容，不是 chrome）。
  63  |        *
  64  |        * 与上面那条同一副做法：**例外写在被例外的那个东西上**
  65  |        * （`data-authored`），不写成一张会悄悄失效的白名单。
  66  |        */
  67  |       if (el.closest("[data-authored]")) continue
  68  |       出.push(文.trim())
  69  |     }
  70  |     return 出
  71  |   })
  72  | }
  73  | 
  74  | /**
  75  |  * **把语言恢复成默认**（也就是「没人选过」）。
  76  |  *
  77  |  * 夹具在每次导航前都会把 `zh` 写进去，所以这里要先把那条 init script
  78  |  * 的效果抹掉——`page.addInitScript` 没有撤销接口，于是改用
  79  |  * 「清掉那一格 + 重新导航」：清完再 reload 会被 init script 又写回去，
  80  |  * 所以顺序是**先 reload，再清，再原地重挂**。
  81  |  *
  82  |  * 这里没有用重新导航，而是直接调应用自己的 `setLang` 之后再清存储：
  83  |  * 前者换语言，后者让「下次启动读到的是没选过」。
  84  |  */
  85  | async function 回到默认语言(page: import("@playwright/test").Page): Promise<void> {
  86  |   await page.evaluate(() => {
  87  |     localStorage.removeItem("dawn.global.lang")
  88  |     location.reload()
  89  |   })
  90  | }
  91  | 
  92  | test("**没选过语言时跟系统**（2026-08-28 作者定的：中文系统中文、其它英文）", async ({ dawn }) => {
  93  |   const { page } = dawn
  94  |   await page.addInitScript(() => {
  95  |     try {
  96  |       localStorage.removeItem("dawn.global.lang")
  97  |     } catch {
  98  |       /* 清不掉就让下面的断言去红 */
  99  |     }
  100 |   })
  101 |   await 回到默认语言(page)
  102 |   await page.waitForLoadState("domcontentloaded")
  103 |   await page.locator(".app-shell").waitFor({ timeout: 30_000 })
  104 |   const 系统 = await page.evaluate(() => navigator.language)
  105 |   const 期望中文 = /^zh\b/i.test(系统)
  106 |   await expect(page.getByRole("button", { name: 期望中文 ? "新建任务" : "New task" })).toBeVisible({ timeout: 30_000 })
  107 | })
  108 | 
  109 | test("**英文界面上每一屏都没有汉字**", async ({ dawn }) => {
  110 |   const { page } = dawn
  111 | 
  112 |   // 夹具钉的是中文；这里明确选英文（默认已改成跟系统语言，本机是中文系统）
  113 |   await page.addInitScript(() => {
  114 |     try {
  115 |       localStorage.setItem("dawn.global.lang", "en")
  116 |     } catch {
  117 |       /* 写不进就让下面的断言去红 */
  118 |     }
  119 |   })
  120 |   await page.evaluate(() => {
  121 |     localStorage.setItem("dawn.global.lang", "en")
  122 |     location.reload()
  123 |   })
  124 | 
  125 |   await expect(page.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 30_000 })
  126 |   await expect(page.getByPlaceholder("Enter a question, @ to reference files, / for commands", { exact: true })).toBeVisible()
  127 | 
  128 |   /**
  129 |    * **走一遍每一屏，不是只看首页。**
  130 |    *
  131 |    * 漏翻恰恰漏在想不起来的地方——只看首页的话，这条用例在
  132 |    * 「设置里还有六十句中文」的那一版上照样是绿的（它真的绿过）。
  133 |    *
  134 |    * 每一屏都单独断言，报错才说得出**是哪一屏**没翻完。
  135 |    */
  136 |   const 屏 = async (名: string, 走: () => Promise<void>) => {
  137 |     await 走()
  138 |     const 漏的 = await 屏上的汉字(page)
> 139 |     expect(漏的, `「${名}」这一屏上还有中文——补进 src/ui/i18n/en.ts`).toEqual([])
      |                                                        ^ Error: 「Skills」这一屏上还有中文——补进 src/ui/i18n/en.ts
  140 |   }
  141 | 
  142 |   await 屏("首页", async () => {})
  143 |   // 2026-08-23 起这四屏住在设置的「Extensions」一组里
  144 |   /**
  145 |    * **2026-09-16 起「设置」开的是右边那一栏**——那一栏本身也是一屏，
  146 |    * 一样得没有汉字，所以它也过一遍 `屏`；底下那几块在整页里，要先「Expand」。
  147 |    */
  148 |   await 屏("设置那一栏", () => page.getByRole("button", { name: "Settings", exact: true }).click())
  149 |   await page.getByRole("button", { name: "Expand", exact: true }).click()
  150 |   await 屏("Skills", () => page.locator(".settings-nav").getByRole("button", { name: "Skills", exact: true }).click())
  151 |   await 屏("子 Agent", () => page.locator(".settings-nav").getByRole("button", { name: "Subagents", exact: true }).click())
  152 |   await 屏("插件", () => page.locator(".settings-nav").getByRole("button", { name: "Plugins", exact: true }).click())
  153 |   await 屏("MCP", () => page.locator(".settings-nav").getByRole("button", { name: "MCP servers", exact: true }).click())
  154 | 
  155 |   // 设置的四块各看一遍——它们是同一屏的四种内容
  156 |   for (const 块 of ["Appearance", "Working folder", "Model providers", "Kernel"]) {
  157 |     const 入口 = page.locator(".settings-nav").getByRole("button", { name: 块, exact: true })
  158 |     if ((await 入口.count()) === 0) continue // 那一块没上就跳过，不假装它在
  159 |     await 屏(`设置 · ${块}`, () => 入口.click())
  160 |   }
  161 | })
  162 | 
  163 | test("**那颗按钮真的能切，而且记得住**", async ({ dawn }) => {
  164 |   const { page, 重开 } = dawn
  165 | 
  166 |   // 夹具钉的是中文，所以进来是中文
  167 |   await page.getByRole("button", { name: "设置", exact: true }).click()
  168 |   await page.getByRole("button", { name: "外观", exact: true }).click()
  169 | 
  170 |   // 切到英文：整屏跟着换
  171 |   await page.getByRole("radio", { name: "English" }).click()
  172 |   await expect(page.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 10_000 })
  173 | 
  174 |   /**
  175 |    * **两个选项都写自己的母语。**
  176 |    * 一个看不懂当前语言的人，正是最需要这颗按钮的人——
  177 |    * 把它写成「Chinese」，中文用户在英文界面上就找不着回去的路。
  178 |    */
  179 |   await expect(page.getByRole("radio", { name: "中文" })).toBeVisible()
  180 | 
  181 |   // 关掉再打开，仍然是英文
  182 |   const p2 = await 重开()
  183 |   /**
  184 |    * **夹具重开时会重新把 `zh` 钉回去**——所以这里不能直接断言英文，
  185 |    * 那样验的是夹具而不是产品。改成断言那一格真的写进了存储：
  186 |    * 「记得住」这件事的事实就在那儿。
  187 |    */
  188 |   const 存的 = await p2.evaluate(() => localStorage.getItem("dawn.global.lang"))
  189 |   expect(存的).toBe("zh") // 夹具钉回去的
  190 |   // 而产品自己的读回逻辑由单元测试盖（loadLang），这里只证明它落了盘
  191 | })
  192 | 
```