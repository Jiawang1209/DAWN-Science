# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: submission-feedback.spec.ts >> a real child corrects an invalid evidence reference using the host-visible label
- Location: e2e/submission-feedback.spec.ts:13:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('.chip-group .chip').first()
Expected: "ok"
Received: "error"
Timeout:  45000ms

Call log:
  - Expect "toHaveAttribute" with timeout 45000ms
  - waiting for locator('.chip-group .chip').first()
    5 × locator resolved to <button type="button" data-status="running" class="btn btn-text btn-inline chip running">…</button>
      - unexpected value "running"
    88 × locator resolved to <button type="button" data-status="error" class="btn btn-text btn-inline chip error">…</button>
       - unexpected value "error"

```

```yaml
- button "✗ feedback-reviewer 失败"
```

# Test source

```ts
  1  | /** Built Electron + real Pi child; inference only is the shared localhost fixture. */
  2  | import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  3  | import {join,resolve} from 'node:path'
  4  | import {test,expect,在项目里开会话} from './fixtures.js'
  5  | const task='提交反馈子任务：读取 in.csv 后正式提交审阅'
  6  | const value={summary:'已读取合成数据',blockers:[],deliverables:[],execution:{state:'not_run',note:'只读'},verification:{state:'reviewed',note:'实际读取',toolCallIds:['forged-id']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}}
  7  | test.use({dawnOptions:{reply:'提交反馈夹具已完成。',toolCall:[
  8  |  {when:'提交反馈主任务',toolName:'start_subagent',args:{agent:'feedback-reviewer',task,contract:{submission:'tool',resultType:'review',inputs:['in.csv'],requireReview:true}}},
  9  |  {duringTask:task,toolName:'read',args:{path:'in.csv'}},
  10 |  {duringTask:task,toolName:'submit_task_result',args:value},
  11 |  {duringTask:task,toolName:'submit_task_result',args:value,evidenceReferences:{verification:'read'}},
  12 | ]}})
  13 | test('a real child corrects an invalid evidence reference using the host-visible label',async({dawn})=>{
  14 |  const {page,workspace,dir,requests}=dawn
  15 |  mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n')
  16 |  writeFileSync(join(workspace,'.dawn','agents','feedback-reviewer.md'),'---\nname: feedback-reviewer\ndescription: 审阅指定文件\ntools: read\n---\n按冻结契约审阅并正式提交。\n')
  17 |  await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('提交反馈主任务');await page.getByRole('button',{name:'发送',exact:true}).click()
> 18 |  await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','ok',{timeout:45000})
     |                                                          ^ Error: expect(locator).toHaveAttribute(expected) failed
  19 |  await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:45000})
  20 |  const states=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()&&!['electron-user-data','.git'].includes(e.name)?states(join(p,e.name)):e.name==='state.json'&&p.endsWith('orchestration')?[join(p,e.name)]:[])
  21 |  const state=states(dir).map(p=>JSON.parse(readFileSync(p,'utf8'))).find(s=>s.messages?.some((m:{outcome?:{receipt?:unknown}})=>m.outcome?.receipt))
  22 |  const outcome=state.messages.find((m:{outcome?:{receipt?:unknown}})=>m.outcome?.receipt).outcome
  23 |  expect(outcome).toMatchObject({receipt:{state:'accepted',result:{verification:{state:'reviewed'}}},observation:{submissionAttempts:2,invalidSubmissions:1}})
  24 |  const messages=requests.flatMap((body:any)=>body.messages??[]),toolResults=messages.filter((m:any)=>m.role==='tool'&&typeof m.content==='string')
  25 |  const feedback=toolResults.flatMap((m:any)=>{try{const value=JSON.parse(m.content);return value.recorded===false&&value.evidenceCatalog?[value]:[]}catch{return[]}}).find((f:any)=>f.evidenceCatalog.entries.some((e:any)=>e.name==='read'))
  26 |  expect(feedback).toBeDefined();expect(feedback.contract).toMatchObject({inputs:['in.csv'],outputs:[],requireReview:true,readRequirements:['in.csv']})
  27 |  const label=toolResults.flatMap((m:any)=>m.content.split('\n').filter((line:string)=>line.startsWith('[task_tool_evidence] ')).map((line:string)=>JSON.parse(line.slice('[task_tool_evidence] '.length)))).find((e:any)=>e.name==='read')
  28 |  expect(label).toMatchObject({name:'read',status:'done',execution:'not_observed',path:'in.csv'})
  29 |  expect(outcome.receipt.result.verification.toolCallIds).toEqual([label.toolCallId]);expect(label.toolCallId).not.toBe('forged-id')
  30 |  expect(feedback.evidenceCatalog.entries).toContainEqual(label)
  31 |  expect(readFileSync(join(workspace,'in.csv'),'utf8')).toBe('x\n1\n2\n')
  32 |  const output=resolve('docs/validation/submission-evidence-20261107');mkdirSync(output,{recursive:true})
  33 |  writeFileSync(join(output,'phase-a-model-visible-example.json'),JSON.stringify({inference:'shared localhost fixture; real Pi child',label,invalidFeedback:feedback,recorded:outcome.receipt.result,observation:outcome.observation},null,2)+'\n')
  34 | })
  35 | 
```