# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auto-arrangement.spec.ts >> automatically proposes 3 task blocks for 清洗、建模并独立审阅 input.csv
- Location: e2e/auto-arrangement.spec.ts:7:2

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.session-list .sess-item .row').first()

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
                - button "请为以下具体任务自动安排。先只读理解目标 刚刚" [ref=f2e68]:
                  - generic [ref=f2e69]: 请为以下具体任务自动安排。先只读理解目标
                  - generic [ref=f2e73]: 刚刚
                - button "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f2e75] [cursor=pointer]: ⋯
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
          - button "子 Agent 22" [ref=f2e204] [cursor=pointer]:
            - generic [ref=f2e207]: 子 Agent
            - generic [ref=f2e208]: "22"
        - button "版本 v0.0.44" [ref=f2e209] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const out=resolve(process.env.DAWN_AUTO_ARRANGEMENT_EVIDENCE_DIR??'docs/validation/auto-arrangement-20261108/desktop')
  5  | test.use({dawnOptions:{gitInit:true}})
  6  | for(const [goal,count]of [['只计算 input.csv 的均值',1],['分别统计 east.csv 与 west.csv',2],['清洗、建模并独立审阅 input.csv',3]] as const){
  7  |  test(`automatically proposes ${count} task blocks for ${goal}`,async({dawn})=>{
  8  |   const{page,workspace}=dawn;mkdirSync(out,{recursive:true})
  9  |   for(const name of ['input.csv','east.csv','west.csv'])writeFileSync(join(workspace,name),'x\n1\n2\n3\n')
  10 |   await 在项目里开会话(page);await page.locator('main.main .composer textarea').fill(goal);await 进坞(page,'团队')
  11 |   let auto=page.getByRole('region',{name:'自动安排',exact:true})
  12 |   await expect(auto.locator('input[type="number"]')).toHaveCount(0)
  13 |   await expect(auto.getByRole('textbox',{name:'任务目标',exact:true})).toHaveValue(goal)
  14 |   if(count===1)await page.screenshot({path:join(out,'stage-a-auto-default.png')})
  15 |   await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  16 |   await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText(`${count} 个任务块`)
  17 |   await expect(auto.locator('[data-arrangement-task]')).toHaveCount(count)
  18 |   await expect(page.locator('main.main .plan-card')).toContainText(`${count} 个任务块`)
  19 |   await expect(page.locator('main.main .chip-group .chip')).toHaveCount(0)
  20 |   expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  21 |   expect(readdirSync(workspace).some(name=>name==='mean.csv'||name==='model.csv'||name==='review.md')).toBe(false)
  22 |   await page.screenshot({path:join(out,`stage-b-task-${count}.png`)})
  23 |   if(count!==3)return
  24 |   await auto.getByRole('textbox',{name:'调整要求（可选）',exact:true}).fill('合并前两步，保留独立审阅')
  25 |   await auto.getByRole('button',{name:'重新安排',exact:true}).click()
  26 |   await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('2 个任务块')
  27 |   await expect(auto.locator('[data-arrangement-task="review"]')).toContainText('独立审阅员')
  28 |   await expect(auto).toContainText('方案第 2 版')
  29 |   await page.screenshot({path:join(out,'stage-b-adjusted.png')})
  30 |   const reopened=await dawn.重开()
> 31 |   await reopened.locator('.session-list .sess-item .row').first().click();await 进坞(reopened,'团队')
     |                                                                   ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  32 |   auto=reopened.getByRole('region',{name:'自动安排',exact:true})
  33 |   await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('2 个任务块')
  34 |   await expect(auto).toContainText('方案第 2 版')
  35 |   await expect(auto.getByRole('button',{name:'重新安排',exact:true})).toBeDisabled() // No task goal entered after restart.
  36 |   await reopened.screenshot({path:join(out,'stage-c-restored.png')})
  37 |  })
  38 | }
  39 | 
```