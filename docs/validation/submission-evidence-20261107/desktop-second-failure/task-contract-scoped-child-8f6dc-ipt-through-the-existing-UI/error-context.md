# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: task-contract.spec.ts >> scoped child writes the declared output and returns a host-validated receipt through the existing UI
- Location: e2e/task-contract.spec.ts:10:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('region', { name: '运行总览', exact: true }).getByRole('region', { name: '任务证据与产物', exact: true })
Expected substring: "write"
Received string:    "正式提交 0 次 · 退回 0 次 · 阶段耗时 73 ms此任务没有保留工具证据摘要；可查看原始过程。"
Timeout: 25000ms

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true }).getByRole('region', { name: '任务证据与产物', exact: true })
    53 × locator resolved to <section aria-label="任务证据与产物" class="collaboration-evidence">…</section>
       - unexpected value "正式提交 0 次 · 退回 0 次 · 阶段耗时 73 ms此任务没有保留工具证据摘要；可查看原始过程。"

```

```yaml
- region "任务证据与产物":
  - paragraph: 正式提交 0 次 · 退回 0 次 · 阶段耗时 73 ms
  - paragraph: 此任务没有保留工具证据摘要；可查看原始过程。
```

# Test source

```ts
  1   | /** Same mock hook as dev:mock; real parent/child Pi, scoped write and durable host receipt. */
  2   | import {existsSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  3   | import {join,resolve} from 'node:path'
  4   | import {test,expect,在项目里开会话} from './fixtures.js'
  5   | const reply=JSON.stringify({summary:'已交付声明文件',blockers:[],deliverables:[{path:'results/contract.txt'}],execution:{state:'not_run',note:'仅写入文档'},verification:{state:'unreviewed',note:'未作科学审阅'}})
  6   | test.use({dawnOptions:{reply,toolCall:[
  7   |  {when:'结构化子任务验收',toolName:'start_subagent',args:{agent:'writer',task:'契约子任务写文件',contract:{version:1,access:'workspace-write',inputs:[],outputs:['results/contract.txt']}}},
  8   |  {when:'契约子任务写文件',toolName:'write',args:{path:'results/contract.txt',content:'contract output\n'}},
  9   | ]}})
  10  | test('scoped child writes the declared output and returns a host-validated receipt through the existing UI',async({dawn})=>{
  11  |  const {page,workspace,dir}=dawn
  12  |  mkdirSync(join(workspace,'.dawn','agents'),{recursive:true})
  13  |  writeFileSync(join(workspace,'.dawn','agents','writer.md'),'---\nname: writer\ndescription: 写入指定文件\ntools: read, write, bash\n---\n按任务契约交付，最后仅返回规定 JSON。\n')
  14  |  await 在项目里开会话(page)
  15  |  await page.getByPlaceholder(/输入问题/).fill('结构化子任务验收')
  16  |  await page.getByRole('button',{name:'发送',exact:true}).click()
  17  |  const chip=page.locator('.chip-group .chip').first()
  18  |  await expect(chip).toHaveAttribute('data-status','ok',{timeout:45000})
  19  |  await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:45000})
  20  |  expect(readFileSync(join(workspace,'results','contract.txt'),'utf8')).toBe('contract output\n')
  21  |  const states=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()&&!['electron-user-data','.git'].includes(e.name)?states(join(p,e.name)):e.name==='state.json'&&p.endsWith('orchestration')?[join(p,e.name)]:[])
  22  |  const state=states(dir).map(p=>JSON.parse(readFileSync(p,'utf8'))).find(s=>s.messages?.length)
  23  |  expect(state.messages[0]).toMatchObject({status:'completed',deliveredAt:expect.any(Number),outcome:{receipt:{state:'accepted',deliverables:[{path:'results/contract.txt',state:'observed'}]}}})
  24  |  expect(state.children[0].settings.scope).toMatchObject({access:'workspace-write',outputs:['results/contract.txt']})
  25  |  expect(state.children[0].settings.scope.tools).not.toContain('bash')
  26  |  const evidence=resolve(process.env.DAWN_SUBMISSION_EVIDENCE_DIR??'docs/validation/submission-evidence-20261107/desktop')
  27  |  mkdirSync(evidence,{recursive:true})
  28  |  await page.getByRole('button',{name:'打开协作：1 项任务 · 1 项验收通过',exact:true}).click()
  29  |  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  30  |  await overview.getByRole('tab',{name:'记录',exact:true}).click()
> 31  |  await expect(overview.getByRole('region',{name:'任务证据与产物',exact:true})).toContainText('write')
      |                                                                         ^ Error: expect(locator).toContainText(expected) failed
  32  |  await page.screenshot({path:join(evidence,'phase-b-actual-tool-evidence.png')})
  33  |  await overview.getByRole('tab',{name:'产物',exact:true}).click()
  34  |  await overview.getByRole('button',{name:'预览当前文件：results/contract.txt',exact:true}).click()
  35  |  await expect(overview.locator('.collaboration-file-preview')).toContainText('contract output')
  36  |  await expect(overview).toContainText('当前工作区文件预览')
  37  |  await page.screenshot({path:join(evidence,'phase-b-current-file-preview.png')})
  38  |  const saved=await page.evaluate(async sessionId=>{
  39  |   const w=window as unknown as {dawn:{invoke:(op:string,request:unknown)=>Promise<{ok:boolean}>}}
  40  |   return w.dawn.invoke('captureAndRetainCurrent',{sessionId,path:'results/contract.txt',name:'契约产物第一版',requestId:'collaboration-history'})
  41  |  },state.ownerSessionId)
  42  |  expect(saved.ok).toBe(true)
  43  |  writeFileSync(join(workspace,'results','contract.txt'),'current changed after acceptance\n')
  44  |  await overview.getByRole('button',{name:'查看文件留存：results/contract.txt',exact:true}).click()
  45  |  await overview.getByRole('button',{name:'打开已保留文件 results/contract.txt',exact:true}).click()
  46  |  await expect(overview.locator('.artifact-retained-preview')).toContainText('contract output')
  47  |  await expect(overview.locator('.artifact-retained-preview')).not.toContainText('current changed after acceptance')
  48  |  await page.screenshot({path:join(evidence,'phase-b-retained-version-preview.png')})
  49  |  await overview.getByRole('button',{name:'回到产物',exact:true}).click()
  50  |  await expect(overview.getByRole('button',{name:'查看文件留存：results/contract.txt',exact:true})).toBeFocused()
  51  |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  52  |  const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  53  |  await dialog.getByRole('button',{name:'writer',exact:true}).click()
  54  |  await expect(dialog.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true')
  55  |  await page.keyboard.press('Escape')
  56  |  await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  57  | })
  58  | 
  59  | test.describe('legacy Team contract adapter',()=>{
  60  |  test.use({dawnOptions:{reply,toolCall:[
  61  |   {when:'团队契约验收',toolName:'team_create',args:{name:'契约团队',goal:'交付指定文件',members:[{name:'writer',agent:'writer'}],tasks:[{id:'first',subject:'契约子任务写文件',assignee:'writer',contract:{access:'workspace-write',outputs:['results/contract.txt']}}]}},
  62  |   {when:'契约子任务写文件',toolName:'write',args:{path:'results/contract.txt',content:'contract output\n'}},
  63  |  ]}})
  64  |  test('Team dependency execution publishes an accepted receipt through the strict client protocol',async({dawn})=>{
  65  |   const {page,workspace}=dawn
  66  |   mkdirSync(join(workspace,'.dawn','agents'),{recursive:true})
  67  |   writeFileSync(join(workspace,'.dawn','agents','writer.md'),'---\nname: writer\ndescription: 写入文件\ntools: read, write, bash\n---\n按契约交付规定 JSON。\n')
  68  |   await 在项目里开会话(page)
  69  |   await page.getByPlaceholder(/输入问题/).fill('团队契约验收')
  70  |   await page.getByRole('button',{name:'发送',exact:true}).click()
  71  |   await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','ok',{timeout:45000})
  72  |   const sessions=join(workspace,'.dawn','sessions')
  73  |   let team: {tasks:{receipt?:{state:string};settings?:unknown}[];members:{taskSettings?:unknown}[]}|undefined
  74  |   await expect.poll(()=>{
  75  |    try{
  76  |     for(const id of readdirSync(sessions)){
  77  |      const current=join(sessions,id,'teams','current')
  78  |      let teamId:string;try{teamId=readFileSync(current,'utf8').trim()}catch{continue}
  79  |      team=JSON.parse(readFileSync(join(sessions,id,'teams',teamId,'team.json'),'utf8'))
  80  |      if(team?.tasks[0]?.receipt?.state==='accepted')return true
  81  |     }
  82  |    }catch{/* The fixture has not created its task file yet. */}
  83  |    return false
  84  |   },{timeout:30000}).toBe(true)
  85  |   expect(team?.tasks[0]?.settings).toBeDefined();expect(team?.members[0]?.taskSettings).toBeDefined()
  86  |   expect(readFileSync(join(workspace,'results','contract.txt'),'utf8')).toBe('contract output\n')
  87  |   await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:45000})
  88  |  })
  89  | })
  90  | 
  91  | test.describe('input readiness admission',()=>{
  92  |  test.use({dawnOptions:{reply,toolCall:{when:'缺失输入契约验收',toolName:'start_subagent',args:{agent:'writer',task:'契约子任务写文件',contract:{access:'workspace-write',inputs:['missing.csv'],outputs:['results/contract.txt']}}}}})
  93  |  test('missing inputs produce a blocked durable receipt without starting the child or writing outputs',async({dawn})=>{
  94  |   const {page,workspace,dir}=dawn
  95  |   mkdirSync(join(workspace,'.dawn','agents'),{recursive:true})
  96  |   writeFileSync(join(workspace,'.dawn','agents','writer.md'),'---\nname: writer\ndescription: 写文件\ntools: read, write\n---\n遵循契约。\n')
  97  |   await 在项目里开会话(page)
  98  |   await page.getByPlaceholder(/输入问题/).fill('缺失输入契约验收')
  99  |   await page.getByRole('button',{name:'发送',exact:true}).click()
  100 |   await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','error',{timeout:30000})
  101 |   await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:30000})
  102 |   expect(existsSync(join(workspace,'results','contract.txt'))).toBe(false)
  103 |   const states=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()&&!['electron-user-data','.git'].includes(e.name)?states(join(p,e.name)):e.name==='state.json'&&p.endsWith('orchestration')?[join(p,e.name)]:[])
  104 |   const state=states(dir).map(p=>JSON.parse(readFileSync(p,'utf8'))).find(s=>s.messages?.length)
  105 |   expect(state.messages[0]).toMatchObject({status:'failed',outcome:{receipt:{state:'blocked',reason:expect.stringContaining('missing.csv')}}})
  106 |  })
  107 | })
  108 | 
```