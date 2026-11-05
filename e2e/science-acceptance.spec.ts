/** Visible real Electron/Pi before/after: same wrong numeric file, different configured host criteria. */
import {mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync} from 'node:fs';import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
for(const mode of ['basic-error','numeric-error'] as const)test.describe(mode,()=>{
 test.use({dawnOptions:{scienceBatch:mode}})
 test('shows actual host acceptance and saves inspectable demonstration evidence',async({dawn})=>{
  const {page,workspace}=dawn,dir=resolve(process.env.DAWN_SCIENCE_DEMO_DIR??'docs/validation/incremental-science-20261105/demo');mkdirSync(dir,{recursive:true});mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
  for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read, write, bash\n---\nUse frozen contract and submit_task_result.`)
  await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('科研批量验收：按已确认的均值方法处理合成数据 x=1..5，单位m。');await page.getByRole('button',{name:'发送',exact:true}).click()
  let team:any
  await expect.poll(()=>{try{for(const id of readdirSync(join(workspace,'.dawn','sessions'))){const session=join(workspace,'.dawn','sessions',id),current=readFileSync(join(session,'teams/current'),'utf8').trim();team=JSON.parse(readFileSync(join(session,'teams',current,'team.json'),'utf8'));if(team.scienceBatch)return team.scienceBatch.status}}catch{}},{timeout:45000}).toBe(mode==='numeric-error'?'blocked':'completed')
  const analysis=team.tasks.find((t:any)=>t.contract?.resultType==='model-metrics');expect(analysis.receipt.acceptance.state).toBe(mode==='numeric-error'?'blocked':'passed');expect(JSON.parse(readFileSync(join(workspace,analysis.contract.acceptance.resultPath),'utf8')).mean).toBe(999)
  if(mode==='numeric-error'){expect(team.tasks.some((t:any)=>t.contract?.resultType==='review')).toBe(false);expect(analysis.receipt.acceptance.checks.find((c:any)=>c.id==='numeric.mean')).toMatchObject({expected:'3',actual:'999',state:'blocked'})}
  await 进坞(page,'团队');await expect(page.locator('.science-acceptance-status').first()).toContainText(mode==='numeric-error'?'期望 3，实际 999':'数值核验未配置')
  await page.locator('.science-acceptance-status').first().scrollIntoViewIfNeeded()
  await page.screenshot({path:join(dir,mode==='numeric-error'?'02-numeric-blocked.png':'01-basic-only.png'),fullPage:true})
  copyFileSync(join(workspace,analysis.contract.acceptance.resultPath),join(dir,mode+'-result.json'));copyFileSync(join(workspace,'in.csv'),join(dir,'input.csv'))
  writeFileSync(join(dir,mode+'-receipt.json'),JSON.stringify({conditions:'deterministic-local inference, actual Pi/Python/files/Electron; synthetic data only',batchStatus:team.scienceBatch.status,tasks:team.tasks.map((t:any)=>({id:t.id,status:t.status,resultType:t.contract?.resultType,receipt:t.receipt}))},null,2)+'\n')
 })
})
