/** Same mock hook as dev:mock; real parent/child Pi, scoped write and durable host receipt. */
import {existsSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话} from './fixtures.js'
const reply=JSON.stringify({summary:'已交付声明文件',blockers:[],deliverables:[{path:'results/contract.txt'}],execution:{state:'not_run',note:'仅写入文档'},verification:{state:'unreviewed',note:'未作科学审阅'}})
test.use({dawnOptions:{reply,toolCall:[
 {when:'结构化子任务验收',toolName:'start_subagent',args:{agent:'writer',task:'契约子任务写文件',contract:{version:1,access:'workspace-write',inputs:[],outputs:['results/contract.txt']}}},
 {when:'契约子任务写文件',toolName:'write',args:{path:'results/contract.txt',content:'contract output\n'}},
]}})
test('scoped child writes the declared output and returns a host-validated receipt through the existing UI',async({dawn})=>{
 const {page,workspace,dir}=dawn
 mkdirSync(join(workspace,'.dawn','agents'),{recursive:true})
 writeFileSync(join(workspace,'.dawn','agents','writer.md'),'---\nname: writer\ndescription: 写入指定文件\ntools: read, write, bash\n---\n按任务契约交付，最后仅返回规定 JSON。\n')
 await 在项目里开会话(page)
 await page.getByPlaceholder(/输入问题/).fill('结构化子任务验收')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 const chip=page.locator('.chip-group .chip').first()
 await expect(chip).toHaveAttribute('data-status','ok',{timeout:45000})
 await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:45000})
 expect(readFileSync(join(workspace,'results','contract.txt'),'utf8')).toBe('contract output\n')
 const states=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()&&!['electron-user-data','.git'].includes(e.name)?states(join(p,e.name)):e.name==='state.json'&&p.endsWith('orchestration')?[join(p,e.name)]:[])
 const state=states(dir).map(p=>JSON.parse(readFileSync(p,'utf8'))).find(s=>s.messages?.length)
 expect(state.messages[0]).toMatchObject({status:'completed',deliveredAt:expect.any(Number),outcome:{receipt:{state:'accepted',deliverables:[{path:'results/contract.txt',state:'observed'}]}}})
 expect(state.children[0].settings.scope).toMatchObject({access:'workspace-write',outputs:['results/contract.txt']})
 expect(state.children[0].settings.scope.tools).not.toContain('bash')
 const evidence=resolve(process.env.DAWN_SUBMISSION_EVIDENCE_DIR??'docs/validation/submission-evidence-20261107/desktop')
 mkdirSync(evidence,{recursive:true})
 await page.getByRole('button',{name:'打开协作：1 项任务 · 1 项验收通过',exact:true}).click()
 const overview=page.getByRole('region',{name:'运行总览',exact:true})
 await overview.getByRole('tab',{name:'记录',exact:true}).click()
 await expect(overview.getByRole('region',{name:'任务证据与产物',exact:true})).toContainText('write')
 await page.screenshot({path:join(evidence,'phase-b-actual-tool-evidence.png')})
 await overview.getByRole('tab',{name:'产物',exact:true}).click()
 await overview.getByRole('button',{name:'预览当前文件：results/contract.txt',exact:true}).click()
 await expect(overview.locator('.collaboration-file-preview')).toContainText('contract output')
 await expect(overview).toContainText('当前工作区文件预览')
 await overview.locator('.collaboration-file-preview').scrollIntoViewIfNeeded()
 await page.screenshot({path:join(evidence,'phase-b-current-file-preview.png')})
 const saved=await page.evaluate(async sessionId=>{
  const w=window as unknown as {dawn:{invoke:(op:string,request:unknown)=>Promise<{ok:boolean}>}}
  return w.dawn.invoke('captureAndRetainCurrent',{sessionId,path:'results/contract.txt',name:'契约产物第一版',requestId:'collaboration-history'})
 },state.ownerSessionId)
 expect(saved.ok).toBe(true)
 writeFileSync(join(workspace,'results','contract.txt'),'current changed after acceptance\n')
 await overview.getByRole('button',{name:'查看文件留存：results/contract.txt',exact:true}).click()
 await overview.getByRole('button',{name:'打开已保留文件 results/contract.txt',exact:true}).click()
 await expect(overview.locator('.artifact-retained-preview')).toContainText('contract output')
 await expect(overview.locator('.artifact-retained-preview')).not.toContainText('current changed after acceptance')
 await overview.locator('.artifact-retained-preview').scrollIntoViewIfNeeded()
 await page.screenshot({path:join(evidence,'phase-b-retained-version-preview.png')})
 await overview.getByRole('button',{name:'回到产物',exact:true}).click()
 await expect(overview.getByRole('button',{name:'查看文件留存：results/contract.txt',exact:true})).toBeFocused()
 await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
 await dialog.getByRole('button',{name:'writer',exact:true}).click()
 await expect(dialog.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true')
 await page.keyboard.press('Escape')
 await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
})

test.describe('legacy Team contract adapter',()=>{
 test.use({dawnOptions:{reply,toolCall:[
  {when:'团队契约验收',toolName:'team_create',args:{name:'契约团队',goal:'交付指定文件',members:[{name:'writer',agent:'writer'}],tasks:[{id:'first',subject:'契约子任务写文件',assignee:'writer',contract:{access:'workspace-write',outputs:['results/contract.txt']}}]}},
  {when:'契约子任务写文件',toolName:'write',args:{path:'results/contract.txt',content:'contract output\n'}},
 ]}})
 test('Team dependency execution publishes an accepted receipt through the strict client protocol',async({dawn})=>{
  const {page,workspace}=dawn
  mkdirSync(join(workspace,'.dawn','agents'),{recursive:true})
  writeFileSync(join(workspace,'.dawn','agents','writer.md'),'---\nname: writer\ndescription: 写入文件\ntools: read, write, bash\n---\n按契约交付规定 JSON。\n')
  await 在项目里开会话(page)
  await page.getByPlaceholder(/输入问题/).fill('团队契约验收')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','ok',{timeout:45000})
  const sessions=join(workspace,'.dawn','sessions')
  let team: {tasks:{receipt?:{state:string};settings?:unknown}[];members:{taskSettings?:unknown}[]}|undefined
  await expect.poll(()=>{
   try{
    for(const id of readdirSync(sessions)){
     const current=join(sessions,id,'teams','current')
     let teamId:string;try{teamId=readFileSync(current,'utf8').trim()}catch{continue}
     team=JSON.parse(readFileSync(join(sessions,id,'teams',teamId,'team.json'),'utf8'))
     if(team?.tasks[0]?.receipt?.state==='accepted')return true
    }
   }catch{/* The fixture has not created its task file yet. */}
   return false
  },{timeout:30000}).toBe(true)
  expect(team?.tasks[0]?.settings).toBeDefined();expect(team?.members[0]?.taskSettings).toBeDefined()
  expect(readFileSync(join(workspace,'results','contract.txt'),'utf8')).toBe('contract output\n')
  await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:45000})
 })
})

test.describe('input readiness admission',()=>{
 test.use({dawnOptions:{reply,toolCall:{when:'缺失输入契约验收',toolName:'start_subagent',args:{agent:'writer',task:'契约子任务写文件',contract:{access:'workspace-write',inputs:['missing.csv'],outputs:['results/contract.txt']}}}}})
 test('missing inputs produce a blocked durable receipt without starting the child or writing outputs',async({dawn})=>{
  const {page,workspace,dir}=dawn
  mkdirSync(join(workspace,'.dawn','agents'),{recursive:true})
  writeFileSync(join(workspace,'.dawn','agents','writer.md'),'---\nname: writer\ndescription: 写文件\ntools: read, write\n---\n遵循契约。\n')
  await 在项目里开会话(page)
  await page.getByPlaceholder(/输入问题/).fill('缺失输入契约验收')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','error',{timeout:30000})
  await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:30000})
  expect(existsSync(join(workspace,'results','contract.txt'))).toBe(false)
  const states=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()&&!['electron-user-data','.git'].includes(e.name)?states(join(p,e.name)):e.name==='state.json'&&p.endsWith('orchestration')?[join(p,e.name)]:[])
  const state=states(dir).map(p=>JSON.parse(readFileSync(p,'utf8'))).find(s=>s.messages?.length)
  expect(state.messages[0]).toMatchObject({status:'failed',outcome:{receipt:{state:'blocked',reason:expect.stringContaining('missing.csv')}}})
 })
})
