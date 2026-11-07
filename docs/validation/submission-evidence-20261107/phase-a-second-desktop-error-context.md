# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: submission-feedback.spec.ts >> a real child corrects an invalid evidence reference using the host-visible label
- Location: e2e/submission-feedback.spec.ts:27:1

# Error details

```
Error: expect(received).toBeDefined()

Received: undefined
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
          - tab "提交反馈主任务" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「提交反馈主任务」（收进归档）" [ref=f3e26] [cursor=pointer]
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
                - button "提交反馈主任务 刚刚" [ref=f3e83]:
                  - generic [ref=f3e84]: 提交反馈主任务
                  - generic [ref=f3e88]: 刚刚
                - button "会话操作：提交反馈主任务" [ref=f3e90] [cursor=pointer]: ⋯
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
          - group "会话操作：提交反馈主任务" [ref=f3e121]:
            - button "查找当前对话" [ref=f3e123] [cursor=pointer]
            - button "导出对话" [ref=f3e127] [cursor=pointer]
        - generic [ref=f3e132]:
          - generic [ref=f3e133]:
            - generic [ref=f3e134]: 你
            - generic [ref=f3e136]:
              - paragraph [ref=f3e140]: 提交反馈主任务
              - generic [ref=f3e141]:
                - time [ref=f3e142]: 2026-11-07 09:18
                - button "复制我说的这段" [ref=f3e143] [cursor=pointer]
                - button "修改" [ref=f3e149] [cursor=pointer]
                - button "回到这句之前" [ref=f3e153] [cursor=pointer]
          - button "已完成 用时 0.1 秒 1 步" [expanded] [ref=f3e157] [cursor=pointer]:
            - generic [ref=f3e160]: 已完成
            - generic [ref=f3e161]: 用时 0.1 秒
            - generic [ref=f3e162]: 1 步
          - 'button "✓ start_subagent {\"agent\":\"feedback-reviewer\",\"task\":\"提交反馈子任务：读取 in.csv 后正式提交审阅\",\"contract\":{\"submission\":\"tool\",\"resultType\":\"review\",\"inputs\":[\"in.csv\"],\"requireReview\":true}} 成功" [ref=f3e164] [cursor=pointer]':
            - generic [ref=f3e167]: ✓ start_subagent
            - generic [ref=f3e168]: "{\"agent\":\"feedback-reviewer\",\"task\":\"提交反馈子任务：读取 in.csv 后正式提交审阅\",\"contract\":{\"submission\":\"tool\",\"resultType\":\"review\",\"inputs\":[\"in.csv\"],\"requireReview\":true}}"
            - generic [ref=f3e169]: 成功
          - generic [ref=f3e170]:
            - generic [ref=f3e171]: 子 agent 1/1
            - button "✓ feedback-reviewer 完成" [ref=f3e174] [cursor=pointer]:
              - text: ✓ feedback-reviewer
              - generic [ref=f3e175]: 完成
          - generic [ref=f3e176]:
            - generic [ref=f3e177]:
              - generic [ref=f3e178]: D
              - generic [ref=f3e179]: DeepSeek
            - generic [ref=f3e180]:
              - paragraph [ref=f3e184]: 提交反馈夹具已完成。
              - generic [ref=f3e185]:
                - button "复制这段回答" [ref=f3e186] [cursor=pointer]
                - paragraph [ref=f3e192]: 输入 12 · 输出 8 · 缓存 0 token
          - paragraph [ref=f3e193]: 子 agent「feedback-reviewer」的结果已返回（completed）。
          - generic [ref=f3e194]:
            - generic [ref=f3e195]:
              - generic [ref=f3e196]: D
              - generic [ref=f3e197]: DeepSeek
            - generic [ref=f3e198]:
              - paragraph [ref=f3e202]: 提交反馈夹具已完成。
              - generic [ref=f3e203]:
                - button "复制这段回答" [ref=f3e204] [cursor=pointer]
                - paragraph [ref=f3e210]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f3e211]:
          - generic [ref=f3e212]:
            - generic [ref=f3e213]:
              - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-6rkuwR/workspace" [ref=f3e215] [cursor=pointer]:
                - generic [ref=f3e218]: workspace
              - generic [ref=f3e221]: 本机
            - textbox "检查缺失值并说明处理方法" [ref=f3e227]
            - generic [ref=f3e228]:
              - generic [ref=f3e229]:
                - button "添加内容" [ref=f3e231] [cursor=pointer]
                - button "终端面板" [ref=f3e234] [cursor=pointer]
                - button "完全访问" [ref=f3e238] [cursor=pointer]
              - generic [ref=f3e243]:
                - button "上下文 <1%" [ref=f3e245] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f3e250] [cursor=pointer]:
                  - generic [ref=f3e254]: deepseek-flash
                - button "发送" [active] [ref=f3e257] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f3e262]: 1 轮 · 工具 1 次 50 ms · 输入 24 · 输出 16 · 缓存 0 · 命中 0%
  - contentinfo "应用状态" [ref=f3e263]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e265] [cursor=pointer]
    - generic [ref=f3e266]:
      - generic [ref=f3e267]:
        - button "当前模型：deepseek-flash" [ref=f3e268] [cursor=pointer]:
          - generic [ref=f3e272]: deepseek-flash
        - button "R：未配置" [ref=f3e273] [cursor=pointer]:
          - generic [ref=f3e275]: R
          - generic [ref=f3e276]: 未配置
        - button "Python：未配置" [ref=f3e277] [cursor=pointer]:
          - generic [ref=f3e279]: Python
          - generic [ref=f3e280]: 未配置
      - generic [ref=f3e281]:
        - generic [ref=f3e282]:
          - button "插件 8" [ref=f3e283] [cursor=pointer]:
            - generic [ref=f3e286]: 插件
            - generic [ref=f3e287]: "8"
          - button "Skills 9" [ref=f3e288] [cursor=pointer]:
            - generic [ref=f3e292]: Skills
            - generic [ref=f3e293]: "9"
          - button "MCP 0" [ref=f3e294] [cursor=pointer]:
            - generic [ref=f3e297]: MCP
            - generic [ref=f3e298]: "0"
          - button "子 Agent 23" [ref=f3e299] [cursor=pointer]:
            - generic [ref=f3e302]: 子 Agent
            - generic [ref=f3e303]: "23"
        - button "版本 v0.0.44" [ref=f3e304] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | /** Built Electron + real Pi child; inference only is the shared localhost fixture. */
  2  | import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  3  | import {join,resolve} from 'node:path'
  4  | import {test,expect,在项目里开会话,toolCallHook} from './fixtures.js'
  5  | const task='提交反馈子任务：读取 in.csv 后正式提交审阅'
  6  | const value={summary:'已读取合成数据',blockers:[],deliverables:[],execution:{state:'not_run',note:'只读'},verification:{state:'reviewed',note:'实际读取',toolCallIds:['forged-id']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}}
  7  | test.use({dawnOptions:{reply:'提交反馈夹具已完成。',toolCall:[
  8  |  {when:'提交反馈主任务',toolName:'start_subagent',args:{agent:'feedback-reviewer',task,contract:{submission:'tool',resultType:'review',inputs:['in.csv'],requireReview:true}}},
  9  |  {duringTask:task,toolName:'read',args:{path:'in.csv'}},
  10 |  {duringTask:task,toolName:'submit_task_result',args:value},
  11 |  {duringTask:task,toolName:'submit_task_result',args:value,evidenceReferences:{verification:'read'}},
  12 | ]}})
  13 | test('declarative task matching accepts Pi text-array prompts across result turns',()=>{
  14 |  for(const content of [task,[{type:'text',text:task}]]){
  15 |   const hook=toolCallHook({duringTask:task,toolName:'read',args:{path:'in.csv'}})!
  16 |   expect(hook({messages:[{role:'user',content},{role:'assistant',content:'working'},{role:'tool',content:'prior result',tool_call_id:'prior'}]})).toEqual({toolName:'read',args:{path:'in.csv'}})
  17 |  }
  18 | })
  19 | test('fixture evidence references reject missing, forged and ambiguous labels',()=>{
  20 |  const spec={toolName:'submit_task_result',args:value,evidenceReferences:{verification:'read'}} as const
  21 |  const tool=(id:string,labelId=id)=>({role:'tool',tool_call_id:id,content:`[task_tool_evidence] ${JSON.stringify({toolCallId:labelId,name:'read',status:'done',truncatedFields:[]})}`})
  22 |  expect(()=>toolCallHook(spec)!({messages:[]})).toThrow('exactly one')
  23 |  expect(()=>toolCallHook(spec)!({messages:[tool('actual','forged')]})).toThrow('exactly one')
  24 |  expect(()=>toolCallHook(spec)!({messages:[tool('r1'),tool('r2')]})).toThrow('found 2')
  25 |  expect(toolCallHook(spec)!({messages:[tool('actual')]} )!.args.verification).toMatchObject({toolCallIds:['actual']})
  26 | })
  27 | test('a real child corrects an invalid evidence reference using the host-visible label',async({dawn})=>{
  28 |  const {page,workspace,dir,requests}=dawn
  29 |  mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n')
  30 |  writeFileSync(join(workspace,'.dawn','agents','feedback-reviewer.md'),'---\nname: feedback-reviewer\ndescription: 审阅指定文件\ntools: read\n---\n按冻结契约审阅并正式提交。\n')
  31 |  await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('提交反馈主任务');await page.getByRole('button',{name:'发送',exact:true}).click()
  32 |  await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','ok',{timeout:45000})
  33 |  await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:45000})
  34 |  const states=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()&&!['electron-user-data','.git'].includes(e.name)?states(join(p,e.name)):e.name==='state.json'&&p.endsWith('orchestration')?[join(p,e.name)]:[])
  35 |  const state=states(dir).map(p=>JSON.parse(readFileSync(p,'utf8'))).find(s=>s.messages?.some((m:{outcome?:{receipt?:unknown}})=>m.outcome?.receipt))
  36 |  const outcome=state.messages.find((m:{outcome?:{receipt?:unknown}})=>m.outcome?.receipt).outcome
  37 |  expect(outcome).toMatchObject({receipt:{state:'accepted',result:{verification:{state:'reviewed'}}},observation:{submissionAttempts:2,invalidSubmissions:1}})
  38 |  const messages=requests.flatMap((body:any)=>body.messages??[]),toolResults=messages.filter((m:any)=>m.role==='tool'&&typeof m.content==='string')
  39 |  const feedback=toolResults.flatMap((m:any)=>{try{const value=JSON.parse(m.content);return value.recorded===false&&value.evidenceCatalog?[value]:[]}catch{return[]}}).find((f:any)=>f.evidenceCatalog.entries.some((e:any)=>e.name==='read'))
> 40 |  expect(feedback).toBeDefined();expect(feedback.contract).toMatchObject({inputs:['in.csv'],outputs:[],requireReview:true,readRequirements:['in.csv']})
     |                   ^ Error: expect(received).toBeDefined()
  41 |  const label=toolResults.flatMap((m:any)=>m.content.split('\n').filter((line:string)=>line.startsWith('[task_tool_evidence] ')).map((line:string)=>JSON.parse(line.slice('[task_tool_evidence] '.length)))).find((e:any)=>e.name==='read')
  42 |  expect(label).toMatchObject({name:'read',status:'done',execution:'not_observed',path:'in.csv'})
  43 |  expect(outcome.receipt.result.verification.toolCallIds).toEqual([label.toolCallId]);expect(label.toolCallId).not.toBe('forged-id')
  44 |  expect(feedback.evidenceCatalog.entries).toContainEqual(label)
  45 |  expect(readFileSync(join(workspace,'in.csv'),'utf8')).toBe('x\n1\n2\n')
  46 |  const output=resolve('docs/validation/submission-evidence-20261107');mkdirSync(output,{recursive:true})
  47 |  writeFileSync(join(output,'phase-a-model-visible-example.json'),JSON.stringify({inference:'shared localhost fixture; real Pi child',label,invalidFeedback:feedback,recorded:outcome.receipt.result,observation:outcome.observation},null,2)+'\n')
  48 | })
  49 | 
```