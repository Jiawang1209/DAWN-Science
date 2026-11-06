# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: run-explanation-budget.spec.ts >> delegation budget >> sets real limits, rejects a third Pi child, and retains consumption across Electron restart
- Location: e2e/run-explanation-budget.spec.ts:37:2

# Error details

```
TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/输入问题/)

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
          - tab "演示委派预算" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「演示委派预算」（收进归档）" [ref=f3e26] [cursor=pointer]
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
                - button "演示委派预算 刚刚" [ref=f3e83]:
                  - generic [ref=f3e84]: 演示委派预算
                  - generic [ref=f3e88]: 刚刚
                - button "会话操作：演示委派预算" [ref=f3e90] [cursor=pointer]: ⋯
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
          - group "会话操作：演示委派预算" [ref=f3e121]:
            - button "查找当前对话" [ref=f3e123] [cursor=pointer]
            - button "导出对话" [ref=f3e127] [cursor=pointer]
        - generic [ref=f3e132]:
          - generic [ref=f3e133]:
            - generic [ref=f3e134]: 你
            - generic [ref=f3e136]:
              - paragraph [ref=f3e140]: 演示委派预算
              - generic [ref=f3e141]:
                - time [ref=f3e142]: 2026-11-06 16:39
                - button "复制我说的这段" [ref=f3e143] [cursor=pointer]
                - button "修改" [ref=f3e149] [cursor=pointer]
                - button "回到这句之前" [ref=f3e153] [cursor=pointer]
          - button "已完成 用时 0.6 秒 1 步" [expanded] [ref=f3e156] [cursor=pointer]:
            - generic [ref=f3e159]: 已完成
            - generic [ref=f3e160]: 用时 0.6 秒
            - generic [ref=f3e161]: 1 步
          - 'button "✓ subagent {\"agent\":\"scout\",\"task\":\"只读检查当前工作区，用一句话报告完成。\"} 成功" [ref=f3e163] [cursor=pointer]':
            - generic [ref=f3e166]: ✓ subagent
            - generic [ref=f3e167]: "{\"agent\":\"scout\",\"task\":\"只读检查当前工作区，用一句话报告完成。\"}"
            - generic [ref=f3e168]: 成功
          - generic [ref=f3e169]:
            - generic [ref=f3e170]: 子 agent 1/1
            - button "✓ scout 完成" [ref=f3e173] [cursor=pointer]:
              - text: ✓ scout
              - generic [ref=f3e174]: 完成
          - generic [ref=f3e175]:
            - generic [ref=f3e176]:
              - generic [ref=f3e177]: D
              - generic [ref=f3e178]: DeepSeek
            - generic [ref=f3e179]:
              - paragraph [ref=f3e183]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e184]:
                - button "复制这段回答" [ref=f3e185] [cursor=pointer]
                - paragraph [ref=f3e191]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f3e192]:
          - generic [ref=f3e193]:
            - generic [ref=f3e194]:
              - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-G6BseF/workspace" [ref=f3e196] [cursor=pointer]:
                - generic [ref=f3e199]: workspace
              - generic [ref=f3e202]: 本机
            - textbox "检查缺失值并说明处理方法" [ref=f3e208]
            - generic [ref=f3e209]:
              - generic [ref=f3e210]:
                - button "添加内容" [ref=f3e212] [cursor=pointer]
                - button "终端面板" [ref=f3e215] [cursor=pointer]
                - button "完全访问" [ref=f3e219] [cursor=pointer]
              - generic [ref=f3e224]:
                - button "上下文 <1%" [ref=f3e226] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f3e231] [cursor=pointer]:
                  - generic [ref=f3e235]: deepseek-flash
                - button "发送" [active] [ref=f3e238] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f3e243]: 1 轮 · 工具 1 次 592 ms · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
    - complementary "团队" [ref=f3e244]:
      - separator "调整面板宽度" [ref=f3e245]
      - generic [ref=f3e246]:
        - tablist "面板" [ref=f3e247]:
          - tab "文件" [ref=f3e248] [cursor=pointer]
          - tab "产物" [ref=f3e249] [cursor=pointer]
          - tab "笔记本" [ref=f3e250] [cursor=pointer]
          - tab "路线" [ref=f3e251] [cursor=pointer]
          - tab "审阅" [ref=f3e252] [cursor=pointer]
          - tab "团队" [selected] [ref=f3e253] [cursor=pointer]
          - tab "Bot" [ref=f3e254] [cursor=pointer]
        - button "更多面板" [ref=f3e256] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f3e257] [cursor=pointer]
      - generic [ref=f3e261]:
        - region "运行总览" [ref=f3e262]:
          - generic [ref=f3e263]:
            - heading "运行总览" [level=3] [ref=f3e264]
            - button "刷新运行记录" [ref=f3e265] [cursor=pointer]
          - paragraph [ref=f3e266]: 来自当前会话的统一编排；每两秒刷新
          - region "会话委派预算" [ref=f3e267]:
            - strong [ref=f3e268]: 会话委派预算
            - paragraph [ref=f3e269]: 已准入 1 轮 · 可核验 token 20 · 未知用量 1 轮 · 在途 0 轮
            - paragraph [ref=f3e270]: 当前限制：轮次 2 · 总历时 不限 分钟 · token 不限
            - paragraph [ref=f3e271]: 仅统计本会话统一编排的子任务、团队和 Bot；总历时包含暂停与离线。token 在结算后核验，在途请求可能超额，未知用量不计为零。
            - group [ref=f3e272]:
              - generic "调整预算限制" [ref=f3e273]
          - article [ref=f3e274]:
            - strong [ref=f3e275]: scout
            - paragraph [ref=f3e276]: 类型 subagent · 执行代次 1
            - paragraph [ref=f3e277]: 执行完成
            - paragraph [ref=f3e278]: 已结算耗时：锁等待 0.00 秒 · 输入核验 0.00 秒 · 执行 0.57 秒 · 验收 0.00 秒
            - paragraph [ref=f3e279]: 普通委派任务 · 暂无宿主验收回执
            - paragraph [ref=f3e280]: 输入版本 0 · 产物版本 0
            - button "查看子任务过程" [ref=f3e281] [cursor=pointer]
          - group [ref=f3e282]:
            - generic "关键执行历史" [ref=f3e283]
        - paragraph [ref=f3e284]: 这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。
  - contentinfo "应用状态" [ref=f3e285]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e287] [cursor=pointer]
    - generic [ref=f3e288]:
      - generic [ref=f3e289]:
        - button "当前模型：deepseek-flash" [ref=f3e290] [cursor=pointer]:
          - generic [ref=f3e294]: deepseek-flash
        - button "R：未配置" [ref=f3e295] [cursor=pointer]:
          - generic [ref=f3e297]: R
          - generic [ref=f3e298]: 未配置
        - button "Python：未配置" [ref=f3e299] [cursor=pointer]:
          - generic [ref=f3e301]: Python
          - generic [ref=f3e302]: 未配置
      - generic [ref=f3e303]:
        - generic [ref=f3e304]:
          - button "插件 8" [ref=f3e305] [cursor=pointer]:
            - generic [ref=f3e308]: 插件
            - generic [ref=f3e309]: "8"
          - button "Skills 9" [ref=f3e310] [cursor=pointer]:
            - generic [ref=f3e314]: Skills
            - generic [ref=f3e315]: "9"
          - button "MCP 0" [ref=f3e316] [cursor=pointer]:
            - generic [ref=f3e319]: MCP
            - generic [ref=f3e320]: "0"
          - button "子 Agent 23" [ref=f3e321] [cursor=pointer]:
            - generic [ref=f3e324]: 子 Agent
            - generic [ref=f3e325]: "23"
        - button "版本 v0.0.44" [ref=f3e326] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const evidence=resolve(process.env.DAWN_RUN_BUDGET_EVIDENCE_DIR??'docs/validation/run-explanation-budget-20261106')
  5  | test.describe('run explanation',()=>{
  6  |  test.use({dawnOptions:{gitInit:true,toolCall:[
  7  |   {when:'演示产物锁等待',toolName:'subagent',args:{tasks:[{agent:'lockwriter',task:'锁演示持有任务，等待工具完成。'},{agent:'lockwriter',task:'锁演示等待任务，用一句话确认完成。'}]},once:true},
  8  |   {when:'锁演示持有任务',toolName:'bash',args:{command:'sleep 8'},once:true},
  9  |  ]}})
  10 |  test('explains actual shared lock waiting and retained host history',async({dawn})=>{
  11 |   const{page,workspace}=dawn
  12 |   mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  13 |   writeFileSync(join(workspace,'.dawn/agents/lockwriter.md'),'---\nname: lockwriter\ndescription: 锁等待演示\ntools: read,bash\n---\n使用指定工具，用一句话回答。')
  14 |   await 在项目里开会话(page)
  15 |   await page.getByPlaceholder(/输入问题/).fill('演示产物锁等待')
  16 |   await page.getByRole('button',{name:'发送',exact:true}).click()
  17 |   await 进坞(page,'团队')
  18 |   const overview=page.getByRole('region',{name:'运行总览',exact:true})
  19 |   await expect(overview.locator('.run-activity').filter({hasText:'等待产物锁'})).toHaveCount(1)
  20 |   await expect(overview.locator('.run-activity').filter({hasText:'等待产物锁'})).toContainText('lockwriter · 代次 1')
  21 |   await expect(overview).toContainText('等待工作区独占执行')
  22 |   await overview.locator('.run-activity').filter({hasText:'等待产物锁'}).scrollIntoViewIfNeeded()
  23 |   mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'phase-a-lock-wait.png')})
  24 |   await expect(overview.locator('.run-overview-row').filter({hasText:'执行完成'})).toHaveCount(2)
  25 |   await overview.getByText('关键执行历史',{exact:true}).click()
  26 |   await expect(overview.locator('.run-history')).toContainText('等待产物锁')
  27 |   await expect(overview.locator('.run-history')).toContainText('执行已结算')
  28 |   await page.screenshot({path:join(evidence,'phase-a-history.png')})
  29 |   const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!
  30 |   const state=JSON.parse(readFileSync(join(sessions,sid,'orchestration/state.json'),'utf8'))
  31 |   expect(state.events.some((event:{stage?:string})=>event.stage==='lock-wait')).toBe(true)
  32 |   writeFileSync(join(evidence,'phase-a-state.json'),JSON.stringify(state,null,2))
  33 |  })
  34 | })
  35 | test.describe('delegation budget',()=>{
  36 |  test.use({dawnOptions:{gitInit:true}})
  37 |  test('sets real limits, rejects a third Pi child, and retains consumption across Electron restart',async({dawn})=>{
  38 |   let page=dawn.page;const{workspace}=dawn
  39 |   mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'.dawn/agents/scout.md'),'---\nname: scout\ndescription: 预算演示\ntools: read,ls\n---\n只读确认，一句话回复。')
  40 |   await 在项目里开会话(page);await 进坞(page,'团队')
  41 |   let overview=page.getByRole('region',{name:'运行总览',exact:true})
  42 |   await overview.getByText('调整预算限制',{exact:true}).click()
  43 |   await overview.getByLabel('累计执行轮次上限',{exact:true}).fill('2')
  44 |   await overview.getByRole('button',{name:'委派限额生效',exact:true}).click()
  45 |   await expect(overview).toContainText('当前限制：轮次 2')
> 46 |   const send=async()=>{await page.getByPlaceholder(/输入问题/).fill('演示委派预算');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.locator('main.main').getByRole('button',{name:'停止',exact:true})).toHaveCount(0)}
     |                                                            ^ TimeoutError: locator.fill: Timeout 30000ms exceeded.
  47 |   await send();await expect(overview).toContainText('已准入 1 轮')
  48 |   await send();await expect(overview).toContainText('已准入 2 轮')
  49 |   await send();await expect(page.locator('.tool').filter({hasText:'subagent'}).last()).toHaveAttribute('data-status','error')
  50 |   await expect(overview).toContainText('已准入 2 轮')
  51 |   const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,file=join(sessions,sid,'orchestration/state.json')
  52 |   const before=JSON.parse(readFileSync(file,'utf8'));expect(before.budget.consumedRuns).toBe(2);expect(before.children.reduce((n:number,c:{epoch:number})=>n+c.epoch,0)).toBe(2)
  53 |   mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'phase-b-limit.png')})
  54 |   page=await dawn.重开();await page.getByRole('button',{name:/^演示委派预算/}).click();await 进坞(page,'团队')
  55 |   overview=page.getByRole('region',{name:'运行总览',exact:true});await expect(overview).toContainText('已准入 2 轮')
  56 |   const after=JSON.parse(readFileSync(file,'utf8'));expect(after.budget.consumedRuns).toBe(2)
  57 |   expect(after.children.filter((c:{state:string})=>c.state==='completed').map((c:{result:unknown})=>c.result)).toEqual(before.children.filter((c:{state:string})=>c.state==='completed').map((c:{result:unknown})=>c.result))
  58 |   await page.screenshot({path:join(evidence,'phase-b-recovery.png')});writeFileSync(join(evidence,'phase-b-budget.json'),JSON.stringify({before:before.budget,after:after.budget,actualElectron:true,actualPiChildren:2,thirdChildRejected:true},null,2))
  59 |  })
  60 | })
  61 |
```