# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mode-member-workspace.spec.ts >> advice explains structure and appends only to its owner draft without sending
- Location: e2e/mode-member-workspace.spec.ts:6:1

# Error details

```
TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: '运行总览', exact: true }).getByLabel('任务之间的关系', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=f3e3]:
  - generic [ref=f3e4]:
    - generic [ref=f3e5]:
      - button "DAWN Science" [ref=f3e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f3e10] [cursor=pointer]
      - button "快捷键速查" [ref=f3e13] [cursor=pointer]
    - generic [ref=f3e17]:
      - tablist "同一处的会话" [ref=f3e21]:
        - generic [ref=f3e22]:
          - tab "新会话" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「新会话」（收进归档）" [ref=f3e26] [cursor=pointer]
        - button "在这里再开一段" [ref=f3e29] [cursor=pointer]
      - generic:
        - banner
    - button "面板：团队" [expanded] [ref=f3e33] [cursor=pointer]
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
                - button "新会话 刚刚" [ref=f3e83]:
                  - generic [ref=f3e84]: 新会话
                  - generic [ref=f3e88]: 刚刚
                - button "会话操作：新会话" [ref=f3e90] [cursor=pointer]: ⋯
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
          - group "会话操作：新对话" [ref=f3e121]:
            - button "查找当前对话" [ref=f3e123] [cursor=pointer]
        - paragraph [ref=f3e129]: 还没有对话
        - generic [ref=f3e131]:
          - generic [ref=f3e132]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-xCctuH/workspace" [ref=f3e134] [cursor=pointer]:
              - generic [ref=f3e137]: workspace
            - generic [ref=f3e140]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f3e146]: 我已有的任务说明
          - generic [ref=f3e147]:
            - generic [ref=f3e148]:
              - button "添加内容" [ref=f3e150] [cursor=pointer]
              - button "终端面板" [ref=f3e153] [cursor=pointer]
              - button "完全访问" [ref=f3e157] [cursor=pointer]
            - generic [ref=f3e162]:
              - button "上下文 —" [ref=f3e164] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f3e169] [cursor=pointer]:
                - generic [ref=f3e173]: deepseek-flash
              - button "发送" [ref=f3e176] [cursor=pointer]
    - complementary "团队" [ref=f3e179]:
      - separator "调整面板宽度" [ref=f3e180]
      - generic [ref=f3e181]:
        - tablist "面板" [ref=f3e182]:
          - tab "文件" [ref=f3e183] [cursor=pointer]
          - tab "产物" [ref=f3e184] [cursor=pointer]
          - tab "笔记本" [ref=f3e185] [cursor=pointer]
          - tab "路线" [ref=f3e186] [cursor=pointer]
          - tab "审阅" [ref=f3e187] [cursor=pointer]
          - tab "团队" [selected] [ref=f3e188] [cursor=pointer]
          - tab "Bot" [ref=f3e189] [cursor=pointer]
        - button "更多面板" [ref=f3e191] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f3e192] [cursor=pointer]
      - region "运行总览" [ref=f3e197]:
        - generic [ref=f3e198]:
          - generic [ref=f3e199]:
            - text: 对话协作台
            - heading "协作" [level=3] [ref=f3e200]
          - button "刷新运行记录" [ref=f3e202] [cursor=pointer]
        - region "协作成果" [ref=f3e203]:
          - generic [ref=f3e204]:
            - generic [ref=f3e205]: 任务目标
            - heading "本会话协作" [level=3] [ref=f3e206]
          - generic [ref=f3e207]:
            - heading "当前成果尚未核验" [level=4] [ref=f3e208]
            - paragraph [ref=f3e209]: 保留的记录不作为本轮验收通过。
          - generic [ref=f3e210]:
            - generic [ref=f3e211]: 下一步 · 查看会话执行记录
            - button "查看会话执行记录" [ref=f3e212] [cursor=pointer]
          - generic [ref=f3e213]:
            - heading "验收成果与版本" [level=4] [ref=f3e214]
            - paragraph [ref=f3e215]: 尚无本轮已验收成果。
          - generic [ref=f3e216]:
            - paragraph [ref=f3e217]: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
            - button "展开流程工作台" [ref=f3e218] [cursor=pointer]
        - paragraph [ref=f3e219]: 来自当前会话的统一编排；每两秒刷新
        - generic [ref=f3e220]:
          - paragraph [ref=f3e221]: 这段会话暂无子任务运行记录
          - paragraph [ref=f3e222]: 这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。
        - group [ref=f3e223]:
          - generic "如何安排任务" [ref=f3e224] [cursor=pointer]
          - paragraph [ref=f3e225]: 先说明任务结构，再决定是否分工。只准备草稿，不会启动或改动现有任务。
          - generic [ref=f3e226]:
            - generic [ref=f3e227]:
              - text: 任务块数
              - spinbutton "任务块数" [active] [ref=f3e228]: "3"
            - generic [ref=f3e229]:
              - text: 任务之间的关系
              - combobox "任务之间的关系" [ref=f3e230]:
                - option "尚未说明" [selected]
                - option "彼此独立"
                - option "前后依赖"
            - generic [ref=f3e231]:
              - checkbox "写入同一目标" [ref=f3e232]
              - text: 写入同一目标
            - generic [ref=f3e233]:
              - checkbox "需要独立审阅" [ref=f3e234]
              - text: 需要独立审阅
            - generic [ref=f3e235]:
              - text: 选用模式
              - combobox "选用模式" [ref=f3e236]:
                - option "采用建议" [selected]
                - option "单任务"
                - option "并行委派"
                - option "串行交接"
                - option "科研流水线"
          - list [ref=f3e237]:
            - listitem [ref=f3e238]: 请先说明任务是否依赖前一步的结果。
          - button "放入任务草稿" [disabled] [ref=f3e239]
        - generic [ref=f3e240]:
          - group [ref=f3e241]:
            - generic "查看额度" [ref=f3e242] [cursor=pointer]
          - group [ref=f3e243]:
            - generic "会话完整执行记录" [ref=f3e244] [cursor=pointer]
  - contentinfo "应用状态" [ref=f3e245]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e247] [cursor=pointer]
    - generic [ref=f3e248]:
      - generic [ref=f3e249]:
        - button "当前模型：deepseek-flash" [ref=f3e250] [cursor=pointer]:
          - generic [ref=f3e254]: deepseek-flash
        - button "R：未配置" [ref=f3e255] [cursor=pointer]:
          - generic [ref=f3e257]: R
          - generic [ref=f3e258]: 未配置
        - button "Python：未配置" [ref=f3e259] [cursor=pointer]:
          - generic [ref=f3e261]: Python
          - generic [ref=f3e262]: 未配置
      - generic [ref=f3e263]:
        - generic [ref=f3e264]:
          - button "插件 8" [ref=f3e265] [cursor=pointer]:
            - generic [ref=f3e268]: 插件
            - generic [ref=f3e269]: "8"
          - button "Skills 9" [ref=f3e270] [cursor=pointer]:
            - generic [ref=f3e274]: Skills
            - generic [ref=f3e275]: "9"
          - button "MCP 0" [ref=f3e276] [cursor=pointer]:
            - generic [ref=f3e279]: MCP
            - generic [ref=f3e280]: "0"
          - button "子 Agent 22" [ref=f3e281] [cursor=pointer]:
            - generic [ref=f3e284]: 子 Agent
            - generic [ref=f3e285]: "22"
        - button "版本 v0.0.44" [ref=f3e286] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const evidence=resolve(process.env.DAWN_MODE_MEMBER_EVIDENCE_DIR??'docs/validation/mode-member-workspace-20261108/desktop')
  5  | test.use({dawnOptions:{gitInit:true}})
  6  | test('advice explains structure and appends only to its owner draft without sending',async({dawn})=>{
  7  |  const{page}=dawn;mkdirSync(evidence,{recursive:true});await 在项目里开会话(page);await 进坞(page,'团队')
  8  |  const overview=page.getByRole('region',{name:'运行总览',exact:true}),main=page.locator('main.main .composer textarea')
  9  |  await main.fill('我已有的任务说明')
  10 |  await overview.getByText('如何安排任务',{exact:true}).click()
  11 |  await overview.getByLabel('任务块数',{exact:true}).fill('3')
> 12 |  await overview.getByLabel('任务之间的关系',{exact:true}).selectOption('independent')
     |                                                    ^ TimeoutError: locator.selectOption: Timeout 30000ms exceeded.
  13 |  await expect(overview).toContainText('建议：并行委派')
  14 |  await page.screenshot({path:join(evidence,'stage-a-advice.png')})
  15 |  const count=await page.locator('main.main .turn').count()
  16 |  await overview.getByRole('button',{name:'放入任务草稿',exact:true}).click()
  17 |  await expect(main).toHaveValue(/^我已有的任务说明\n\n任务安排建议/)
  18 |  expect(await page.locator('main.main .turn').count()).toBe(count)
  19 |  await expect(page.locator('main.main').getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
  20 |  await page.screenshot({path:join(evidence,'stage-a-draft.png')})
  21 |  await page.getByRole('button',{name:'新建任务',exact:true}).click()
  22 |  await expect(page.locator('main.main .composer textarea')).toHaveValue('')
  23 | })
  24 | test('member process and continuation return to the exact expanded collaboration selection',async({dawn})=>{
  25 |  const{page,workspace}=dawn;mkdirSync(evidence,{recursive:true});writeFileSync(join(workspace,'README.md'),'# local member fixture\n')
  26 |  await 在项目里开会话(page)
  27 |  await page.locator('main.main .composer textarea').fill('派子agent看看这个仓库')
  28 |  await page.locator('main.main').getByRole('button',{name:'发送',exact:true}).click()
  29 |  await expect(page.locator('main.main .chip-group .chip').first()).toHaveAttribute('data-status','ok')
  30 |  await expect(page.locator('main.main').getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
  31 |  await 进坞(page,'团队')
  32 |  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  33 |  await overview.getByRole('tab',{name:'记录',exact:true}).click()
  34 |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  35 |  await overview.locator('[data-member-card]').first().click()
  36 |  const selected=await overview.locator('.collaboration-detail').getAttribute('data-selected-run')
  37 |  await page.screenshot({path:join(evidence,'stage-b-member.png')})
  38 |  await overview.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  39 |  await expect(page.getByRole('dialog',{name:'流程工作台',exact:true})).toHaveCount(0)
  40 |  const pane=page.locator('.subagent-pane')
  41 |  await expect(pane.locator('.subagent-turns')).toContainText('我先读一下 README。')
  42 |  await expect(pane.getByRole('button',{name:'返回协作台',exact:true})).toBeVisible()
  43 |  await pane.getByRole('textbox',{name:'接着问它',exact:true}).fill('再说一句')
  44 |  await pane.getByRole('button',{name:'接着问',exact:true}).click()
  45 |  await expect(pane.locator('.subagent-message.user').filter({hasText:'再说一句'})).toHaveCount(1)
  46 |  await expect(pane).not.toHaveAttribute('data-asking','1')
  47 |  await page.screenshot({path:join(evidence,'stage-b-conversation.png')})
  48 |  await pane.getByRole('button',{name:'返回协作台',exact:true}).click()
  49 |  overview=page.getByRole('region',{name:'运行总览',exact:true})
  50 |  await expect(page.getByRole('dialog',{name:'流程工作台',exact:true})).toBeVisible()
  51 |  await expect(overview.getByRole('tab',{name:'记录',exact:true})).toHaveAttribute('aria-selected','true')
  52 |  await expect(overview.locator('.collaboration-detail')).toHaveAttribute('data-selected-run',selected!)
  53 |  await expect(overview.getByRole('button',{name:'收起检查面板',exact:true})).toBeFocused()
  54 |  await page.screenshot({path:join(evidence,'stage-b-return.png')})
  55 |  await page.keyboard.press('Escape')
  56 |  await page.getByRole('button',{name:'新建任务',exact:true}).click()
  57 |  await expect(page.locator('.subagent-pane')).toHaveCount(0)
  58 | })
  59 | 
```