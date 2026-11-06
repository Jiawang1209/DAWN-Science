# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: observable-handoff.spec.ts >> observable delegation >> shows real orchestration and immutable parent handoff; opens the actual child transcript
- Location: e2e/observable-handoff.spec.ts:7:2

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.session-list .sess-item').first().locator('.row').first()

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
      - generic [ref=f2e38]:
        - paragraph [ref=f2e39]:
          - button "项目 1" [expanded] [ref=f2e40] [cursor=pointer]:
            - generic [ref=f2e45]: 项目
            - generic [ref=f2e46]: "1"
          - button "多选项目" [ref=f2e47] [cursor=pointer]: 多选
        - list [ref=f2e48]:
          - listitem [ref=f2e49]:
            - generic [ref=f2e50]:
              - button "workspace" [ref=f2e51] [cursor=pointer]
              - generic [ref=f2e60]:
                - button "在「workspace」里开一段新对话" [ref=f2e61] [cursor=pointer]
                - button "项目操作：workspace" [ref=f2e65] [cursor=pointer]: ⋯
            - list [ref=f2e66]:
              - listitem [ref=f2e67]:
                - button "保留原始样本，单位为 m；仅汇总均值，不 刚刚" [ref=f2e68]:
                  - generic [ref=f2e69]: 保留原始样本，单位为 m；仅汇总均值，不
                  - generic [ref=f2e73]: 刚刚
                - button "会话操作：保留原始样本，单位为 m；仅汇总均值，不" [ref=f2e75] [cursor=pointer]: ⋯
        - region "服务器" [ref=f2e76]:
          - generic [ref=f2e77]:
            - button "服务器" [expanded] [ref=f2e78] [cursor=pointer]
            - button "添加服务器" [ref=f2e87] [cursor=pointer]
          - paragraph [ref=f2e90]: 还没有服务器
      - generic [ref=f2e91]:
        - button "定时" [ref=f2e92] [cursor=pointer]
        - button "设置" [ref=f2e97] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f2e101]
    - main [ref=f2e102]:
      - generic [ref=f2e104]:
        - heading "今天想分析什么？" [level=2] [ref=f2e106]
        - paragraph [ref=f2e107]: 直接输入问题，按需选择本机文件夹。
        - list [ref=f2e108]:
          - listitem [ref=f2e109]:
            - button "看看这里有什么 先摸清工作区" [ref=f2e110] [cursor=pointer]:
              - generic [ref=f2e111]: 看看这里有什么
              - generic [ref=f2e112]: 先摸清工作区
          - listitem [ref=f2e113]:
            - button "读一份数据 字段、规模、缺失" [ref=f2e114] [cursor=pointer]:
              - generic [ref=f2e115]: 读一份数据
              - generic [ref=f2e116]: 字段、规模、缺失
          - listitem [ref=f2e117]:
            - button "做一次探索性分析 分布与异常" [ref=f2e118] [cursor=pointer]:
              - generic [ref=f2e119]: 做一次探索性分析
              - generic [ref=f2e120]: 分布与异常
          - listitem [ref=f2e121]:
            - button "把结果写成说明 给人看的那一版" [ref=f2e122] [cursor=pointer]:
              - generic [ref=f2e123]: 把结果写成说明
              - generic [ref=f2e124]: 给人看的那一版
        - generic [ref=f2e126]:
          - generic [ref=f2e127]:
            - button "工作目录：默认工作目录" [ref=f2e129] [cursor=pointer]:
              - generic [ref=f2e132]: 默认工作目录
            - generic [ref=f2e135]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [active] [ref=f2e141]
          - generic [ref=f2e142]:
            - generic [ref=f2e143]:
              - button "添加内容" [ref=f2e145] [cursor=pointer]
              - button "终端面板" [ref=f2e148] [cursor=pointer]
              - button "完全访问" [ref=f2e152] [cursor=pointer]
            - generic [ref=f2e157]:
              - button "DeepSeek" [ref=f2e159] [cursor=pointer]
              - button "发送" [ref=f2e165] [cursor=pointer]
  - contentinfo "应用状态" [ref=f2e168]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e170] [cursor=pointer]
    - generic [ref=f2e171]:
      - generic [ref=f2e172]:
        - button "当前模型：deepseek-flash" [ref=f2e173] [cursor=pointer]:
          - generic [ref=f2e177]: deepseek-flash
        - button "R：未配置" [ref=f2e178] [cursor=pointer]:
          - generic [ref=f2e180]: R
          - generic [ref=f2e181]: 未配置
        - button "Python：未配置" [ref=f2e182] [cursor=pointer]:
          - generic [ref=f2e184]: Python
          - generic [ref=f2e185]: 未配置
      - generic [ref=f2e186]:
        - generic [ref=f2e187]:
          - button "插件 8" [ref=f2e188] [cursor=pointer]:
            - generic [ref=f2e191]: 插件
            - generic [ref=f2e192]: "8"
          - button "Skills 9" [ref=f2e193] [cursor=pointer]:
            - generic [ref=f2e197]: Skills
            - generic [ref=f2e198]: "9"
          - button "MCP 0" [ref=f2e199] [cursor=pointer]:
            - generic [ref=f2e202]: MCP
            - generic [ref=f2e203]: "0"
          - button "子 Agent 23" [ref=f2e204] [cursor=pointer]:
            - generic [ref=f2e207]: 子 Agent
            - generic [ref=f2e208]: "23"
        - button "版本 v0.0.44" [ref=f2e209] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readdirSync,readFileSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const evidence=resolve('docs/validation/observable-handoff-20261106')
  5  | test.describe('observable delegation',()=>{
  6  |  test.use({dawnOptions:{gitInit:true,toolCall:{toolName:'subagent',args:{agent:'scout',task:'请确认已收到交接背景，用一句话回答。',handoff:{recentMessages:1}},once:true}}})
  7  |  test('shows real orchestration and immutable parent handoff; opens the actual child transcript',async({dawn})=>{
  8  |   const {page,workspace}=dawn
  9  |   mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  10 |   writeFileSync(join(workspace,'.dawn/agents/scout.md'),'---\nname: scout\ndescription: 只读踏勘\ntools: read,ls\n---\n只读查看；用一句话回答。\n')
  11 |   await 在项目里开会话(page)
  12 |   await page.getByPlaceholder(/输入问题/).fill('保留原始样本，单位为 m；仅汇总均值，不修改原文件。')
  13 |   await page.getByRole('button',{name:'发送',exact:true}).click()
  14 |   await expect(page.locator('.tool').filter({hasText:'subagent'}).first()).toHaveAttribute('data-status','ok',{timeout:60000})
  15 |   await 进坞(page,'团队')
  16 |   const overview=page.getByRole('region',{name:'运行总览',exact:true})
  17 |   await expect(overview).toContainText('执行完成')
  18 |   await expect(overview).toContainText('执行代次 1')
  19 |   mkdirSync(evidence,{recursive:true})
  20 |   await page.screenshot({path:join(evidence,'phase-a-overview.png')})
  21 |   await overview.locator('summary').filter({hasText:'已冻结交接'}).click()
  22 |   await expect(overview.locator('pre')).toContainText('保留原始样本，单位为 m')
  23 |   expect(await overview.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  24 |   await page.screenshot({path:join(evidence,'phase-b-handoff.png')})
  25 |   const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,root=join(sessions,sid,'subagents'),call=readdirSync(root)[0]!,dir=join(root,call,'0')
  26 |   const originalHandoff=readFileSync(join(dir,'handoff.json'),'utf8'),capsule=JSON.parse(originalHandoff)
  27 |   expect(capsule.sourceSessionId).toBe(sid)
  28 |   expect(capsule.entries).toHaveLength(1)
  29 |   const transcript=readFileSync(join(dir,'transcript',readdirSync(join(dir,'transcript'))[0]!),'utf8')
  30 |   expect(transcript).toContain(capsule.sha256)
  31 |   expect(transcript).toContain('保留原始样本')
  32 |   writeFileSync(join(evidence,'actual-handoff.json'),JSON.stringify({capsule,metadata:JSON.parse(readFileSync(join(dir,'meta.json'),'utf8')),verifiedInActualChildTranscript:true},null,2))
  33 |   await overview.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  34 |   await expect(page.locator('.subagent-pane')).toBeVisible()
  35 |   const pane=page.locator('.subagent-pane')
  36 |   await pane.getByRole('textbox',{name:'接着问它'}).fill('继续核查；沿用第一次交接，不新增背景。')
  37 |   await pane.getByRole('button',{name:'接着问',exact:true}).click()
  38 |   await expect(pane.locator('.subagent-message.user').filter({hasText:'继续核查；沿用第一次交接'})).toHaveCount(1)
  39 |   await expect(pane).not.toHaveAttribute('data-asking','1')
  40 |   expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(originalHandoff)
  41 |   expect(readdirSync(join(dir,'transcript')).filter(f=>f.endsWith('.jsonl'))).toHaveLength(1)
  42 |   const restarted=await dawn.重开()
> 43 |   await restarted.locator('.session-list .sess-item').first().locator('.row').first().click()
     |                                                                                       ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  44 |   await 进坞(restarted,'团队')
  45 |   const restored=restarted.getByRole('region',{name:'运行总览',exact:true})
  46 |   await expect(restored).toContainText('已冻结交接')
  47 |   await restored.locator('summary').filter({hasText:'已冻结交接'}).click()
  48 |   await expect(restored.locator('pre')).toContainText('保留原始样本，单位为 m')
  49 |   expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(originalHandoff)
  50 |   await restarted.screenshot({path:join(evidence,'phase-b-recovery.png')})
  51 |  })
  52 | })
  53 |
```