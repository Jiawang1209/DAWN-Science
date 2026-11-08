# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: science-pipeline.spec.ts >> pass >> scientific pipeline persists receipts and projects through the strict desktop protocol
- Location: e2e/science-pipeline.spec.ts:7:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('dialog', { name: '流程工作台', exact: true }).locator('.collaboration-tool-result pre')
Timeout: 25000ms
- Expected  - 0
+ Received  + 3

@@ -2,5 +2,8 @@
  1
  2
  3
  4
  5
+
+ [task_tool_evidence] {"toolCallId":"call_mock_46","name":"read","status":"done","execution":"not_observed","references":["verification.reviewed"],"path":"in.csv","truncatedFields":[]}
+ [task_delivery_status] {"submissionPending":true,"requiredReadsRemaining":0,"declaredOutputsUnobserved":0,"missingEvidence":[],"instruction":"需要交付缺口与近期证据时查询 get_task_status。观察不是验收；工具排空且满足契约后及时正式提交，未解决问题如实阻塞。不要为消除未观察写入提示重复计算或覆盖产物。"}

Call log:
  - Expect "toHaveText" with timeout 25000ms
  - waiting for getByRole('dialog', { name: '流程工作台', exact: true }).locator('.collaboration-tool-result pre')
    53 × locator resolved to <pre tabindex="0" data-authored="1" aria-label="记录中的工具结果">x↵1↵2↵3↵4↵5↵↵[task_tool_evidence] {"toolCallId":"…</pre>
       - unexpected value "x
1
2
3
4
5

[task_tool_evidence] {"toolCallId":"call_mock_46","name":"read","status":"done","execution":"not_observed","references":["verification.reviewed"],"path":"in.csv","truncatedFields":[]}
[task_delivery_status] {"submissionPending":true,"requiredReadsRemaining":0,"declaredOutputsUnobserved":0,"missingEvidence":[],"instruction":"需要交付缺口与近期证据时查询 get_task_status。观察不是验收；工具排空且满足契约后及时正式提交，未解决问题如实阻塞。不要为消除未观察写入提示重复计算或覆盖产物。"}"

```

```yaml
- text: "x 1 2 3 4 5 [task_tool_evidence] {\"toolCallId\":\"call_mock_46\",\"name\":\"read\",\"status\":\"done\",\"execution\":\"not_observed\",\"references\":[\"verification.reviewed\"],\"path\":\"in.csv\",\"truncatedFields\":[]} [task_delivery_status] {\"submissionPending\":true,\"requiredReadsRemaining\":0,\"declaredOutputsUnobserved\":0,\"missingEvidence\":[],\"instruction\":\"需要交付缺口与近期证据时查询 get_task_status。观察不是验收；工具排空且满足契约后及时正式提交，未解决问题如实阻塞。不要为消除未观察写入提示重复计算或覆盖产物。\"}"
```

# Test source

```ts
  1  | /** Built Electron + real Pi children; only inference is a deterministic localhost fixture. */
  2  | import {existsSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  3  | import {join,resolve} from 'node:path'
  4  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  5  | for(const mode of ['pass','revise','blocked'] as const)test.describe(mode,()=>{
  6  |  test.use({dawnOptions:{sciencePipeline:mode}})
  7  |  test('scientific pipeline persists receipts and projects through the strict desktop protocol',async({dawn})=>{
  8  |   const {page,workspace}=dawn
  9  |   if(mode==='pass'&&process.env.DAWN_TRACE_VERIFY==='1'){await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await expect(page.locator('html')).toHaveClass(/dawn-dark/)}
  10 |   mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
  11 |   for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read, write, bash\n---\n按冻结契约执行，最终调用 submit_task_result。\n`)
  12 |   await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('科研流水线验收：按已确认方法执行合成数据核查、分析及独立审阅。');await page.getByRole('button',{name:'发送',exact:true}).click()
  13 |   let team:any,sessionDir=''
  14 |   await expect.poll(()=>{
  15 |    try{for(const id of readdirSync(join(workspace,'.dawn','sessions'))){
  16 |     const dir=join(workspace,'.dawn','sessions',id),current=readFileSync(join(dir,'teams','current'),'utf8').trim()
  17 |     const saved=JSON.parse(readFileSync(join(dir,'teams',current,'team.json'),'utf8'));if(saved.pipeline){team=saved;sessionDir=dir;return saved.pipeline.status}
  18 |    }}catch{/* Initial files are created asynchronously. */}
  19 |   },{timeout:30000}).toBe(mode==='blocked'?'blocked':'completed')
  20 |   expect(team.tasks).toHaveLength(mode==='revise'?5:mode==='blocked'?1:3);expect(team.tasks[0].observation).toMatchObject({invalidSubmissions:1,usage:{input:36,output:24}})
  21 |   expect(readFileSync(join(workspace,'in.csv'),'utf8')).toBe('x\n1\n2\n3\n4\n5\n')
  22 |   if(mode==='blocked')expect(existsSync(join(workspace,'results','pipeline.csv'))).toBe(false)
  23 |   else{
  24 |    await expect.poll(()=>JSON.parse(readFileSync(join(sessionDir,'teams',team.id,'team.json'),'utf8')).pipeline.routeSync).toBe('applied')
  25 |    expect(JSON.parse(readFileSync(join(sessionDir,'analysis-route.json'),'utf8')).history.at(-1).steps[0]).toMatchObject({status:'delivered',needsReview:false})
  26 |    expect(team.tasks.at(-1).receipt.result.data).toMatchObject({kind:'review',verdict:'pass'})
  27 |   }
  28 |   // A malformed public snapshot would be rejected before this live status banner could render.
  29 |   await 进坞(page,'团队')
  30 |   await expect(page.locator('.science-pipeline-status').first()).toContainText(mode==='blocked'?'受阻':'交付检查通过',{timeout:15000})
  31 |   if(mode==='blocked'){
  32 |    await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  33 |    const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  34 |    await dialog.getByRole('button',{name:team.tasks[0].subject,exact:true}).click()
  35 |    const timeline=dialog.getByRole('region',{name:'任务轨迹',exact:true})
  36 |    await expect(timeline).toContainText('宿主验收阻塞')
  37 |    await expect(timeline.locator('ol')).toContainText('核验冻结输入')
  38 |    await expect(timeline.getByRole('button',{name:/个产物版本/})).toHaveCount(0)
  39 |    const evidence=process.env.DAWN_COLLABORATION_EVIDENCE_DIR
  40 |    if(evidence){mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'task-timeline-blocked.png')})}
  41 |   }
  42 |   if(mode==='pass'){
  43 |    const evidence=resolve(process.env.DAWN_COLLABORATION_EVIDENCE_DIR??'docs/validation/collaboration-workbench-20261107/desktop');mkdirSync(evidence,{recursive:true})
  44 |    await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  45 |    const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  46 |    await expect(dialog.locator('[data-workflow-edge]')).toHaveCount(2)
  47 |    await dialog.getByRole('button',{name:team.tasks[0].subject,exact:true}).click()
  48 |    await dialog.getByRole('tab',{name:'产物',exact:true}).click()
  49 |    await expect(dialog.locator('.collaboration-detail')).toContainText('宿主验收通过')
  50 |    await page.screenshot({path:join(evidence,'phase-c-pipeline-accepted.png')})
  51 |    const analysis=team.tasks.find((task:any)=>task.contract?.resultType==='model-metrics')
  52 |    expect(analysis.receipt.versions.outputs.length).toBeGreaterThan(0)
  53 |    await dialog.getByRole('button',{name:analysis.subject,exact:true}).click()
  54 |    await page.setViewportSize({width:1440,height:960})
  55 |    await dialog.getByRole('tab',{name:'过程',exact:true}).click()
  56 |    const timeline=dialog.getByRole('region',{name:'任务轨迹',exact:true})
  57 |    await expect(timeline.locator('ol')).toContainText('核验冻结输入')
  58 |    await expect(timeline.locator('ol')).toContainText('宿主验收')
  59 |    await expect(timeline.getByRole('button',{name:/条工具记录/})).toBeVisible()
  60 |    if(process.env.DAWN_COLLABORATION_EVIDENCE_DIR)await page.screenshot({path:join(evidence,'task-timeline-accepted.png')})
  61 |    await timeline.getByRole('button',{name:/个产物版本/}).click()
  62 |    await expect(dialog.getByRole('tab',{name:'产物',exact:true})).toBeFocused()
  63 |    const version=analysis.receipt.versions.outputs[0]
  64 |    await expect(dialog.locator('.collaboration-evidence')).toContainText(version.sha256)
  65 |    await dialog.getByRole('button',{name:`预览当前文件：${version.path}`,exact:true}).click()
  66 |    await dialog.locator('.collaboration-file-preview').scrollIntoViewIfNeeded()
  67 |    await page.screenshot({path:join(evidence,'phase-b-bound-version-workbench.png')})
  68 |    await page.setViewportSize({width:1440,height:960})
  69 |    await dialog.getByRole('button',{name:team.tasks[0].subject,exact:true}).click()
  70 |    await dialog.getByRole('tab',{name:'过程',exact:true}).click()
  71 |    await dialog.getByRole('region',{name:'任务轨迹',exact:true}).getByRole('button',{name:/条工具记录/}).click()
  72 |    await expect(dialog.getByRole('tab',{name:'记录',exact:true})).toBeFocused()
  73 |    const call=team.tasks[0].trace.records.find((record:any)=>record.name==='read')
  74 |    expect(call.transcriptRef).toBeTruthy()
  75 |    await dialog.getByRole('button',{name:`查看原始工具记录：${call.toolCallId}`,exact:true}).click()
  76 |    await expect(dialog.locator('.collaboration-tool-original')).toContainText('in.csv')
  77 |    await expect(dialog.locator('.collaboration-tool-original')).toContainText('记录中的工具结果')
  78 |    const output=dialog.locator('.collaboration-tool-result pre')
> 79 |    await expect(output).toHaveText('x\n1\n2\n3\n4\n5')
     |                         ^ Error: expect(locator).toHaveText(expected) failed
  80 |    await expect(dialog.getByLabel('宿主证据标签')).not.toBeVisible()
  81 |    if(process.env.DAWN_TRACE_VERIFY==='1'){
  82 |     await page.screenshot({path:join(evidence,'team-exact-tool-record.png')})
  83 |     await dialog.locator('.collaboration-detail').screenshot({path:join(evidence,'team-record-panel.png')})
  84 |    }
  85 | 
  86 |   }
  87 |  })
  88 | })
  89 | 
```