/** Built Electron + real Pi children; only inference is a deterministic localhost fixture. */
import {existsSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
for(const mode of ['pass','revise','blocked'] as const)test.describe(mode,()=>{
 test.use({dawnOptions:{sciencePipeline:mode}})
 test('scientific pipeline persists receipts and projects through the strict desktop protocol',async({dawn})=>{
  const {page,workspace}=dawn
  mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
  for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read, write, bash\n---\n按冻结契约执行，最终调用 submit_task_result。\n`)
  await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('科研流水线验收：按已确认方法执行合成数据核查、分析及独立审阅。');await page.getByRole('button',{name:'发送',exact:true}).click()
  let team:any,sessionDir=''
  await expect.poll(()=>{
   try{for(const id of readdirSync(join(workspace,'.dawn','sessions'))){
    const dir=join(workspace,'.dawn','sessions',id),current=readFileSync(join(dir,'teams','current'),'utf8').trim()
    const saved=JSON.parse(readFileSync(join(dir,'teams',current,'team.json'),'utf8'));if(saved.pipeline){team=saved;sessionDir=dir;return saved.pipeline.status}
   }}catch{/* Initial files are created asynchronously. */}
  },{timeout:30000}).toBe(mode==='blocked'?'blocked':'completed')
  expect(team.tasks).toHaveLength(mode==='revise'?5:mode==='blocked'?1:3);expect(team.tasks[0].observation).toMatchObject({invalidSubmissions:1,usage:{input:36,output:24}})
  expect(readFileSync(join(workspace,'in.csv'),'utf8')).toBe('x\n1\n2\n3\n4\n5\n')
  if(mode==='blocked')expect(existsSync(join(workspace,'results','pipeline.csv'))).toBe(false)
  else{
   await expect.poll(()=>JSON.parse(readFileSync(join(sessionDir,'teams',team.id,'team.json'),'utf8')).pipeline.routeSync).toBe('applied')
   expect(JSON.parse(readFileSync(join(sessionDir,'analysis-route.json'),'utf8')).history.at(-1).steps[0]).toMatchObject({status:'delivered',needsReview:false})
   expect(team.tasks.at(-1).receipt.result.data).toMatchObject({kind:'review',verdict:'pass'})
  }
  // A malformed public snapshot would be rejected before this live status banner could render.
  await 进坞(page,'团队')
  await expect(page.locator('.science-pipeline-status').first()).toContainText(mode==='blocked'?'受阻':'交付检查通过',{timeout:15000})
  if(mode==='pass'){
   const evidence=resolve(process.env.DAWN_COLLABORATION_EVIDENCE_DIR??'docs/validation/collaboration-workbench-20261107/desktop');mkdirSync(evidence,{recursive:true})
   await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
   const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
   await expect(dialog.locator('[data-workflow-edge]')).toHaveCount(2)
   await dialog.getByRole('button',{name:team.tasks[0].subject,exact:true}).click()
   await dialog.getByRole('tab',{name:'产物',exact:true}).click()
   await expect(dialog.locator('.collaboration-detail')).toContainText('宿主验收通过')
   await page.screenshot({path:join(evidence,'phase-c-pipeline-accepted.png')})
  }
 })
})
