import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
import {collectTree} from '../src/runtime/process-tree.js'
const evidence=resolve(process.env.DAWN_RUN_BUDGET_EVIDENCE_DIR??'docs/validation/run-explanation-budget-20261106')
const pipelinePrompt='科研流水线验收：演示审阅执行轮次预留，使用合成数据。'
function preparePipeline(workspace:string){
 mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
 for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn/agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read,write,bash\n---\n按冻结契约执行并正式提交。`)
}
function persistedPipeline(workspace:string){
 for(const sid of readdirSync(join(workspace,'.dawn/sessions'))){
  const dir=join(workspace,'.dawn/sessions',sid)
  try{const id=readFileSync(join(dir,'teams/current'),'utf8').trim(),team=JSON.parse(readFileSync(join(dir,'teams',id,'team.json'),'utf8'))
   if(team.pipeline)return{team,budget:JSON.parse(readFileSync(join(dir,'orchestration/state.json'),'utf8')).budget}
  }catch{/* A team and its first admission are saved separately. */}
 }
 return undefined
}
test.describe('scientific review reservation',()=>{
 // Two analysis requests keep this actual state visible across the existing 2s fallback poll.
 test.use({dawnOptions:{gitInit:true,sciencePipeline:'pass',firstChunkDelayMs:1500}})
 test('reserves independent review under three actual runs and preserves consumption after restart',async({dawn})=>{
  let page=dawn.page;preparePipeline(dawn.workspace)
  await 在项目里开会话(page);await 进坞(page,'团队')
  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  await overview.getByText('查看额度',{exact:true}).click();await overview.getByText('调整预算限制',{exact:true}).click()
  await overview.getByLabel('累计执行轮次上限',{exact:true}).fill('3')
  await overview.getByRole('checkbox',{name:'为科研周期保留独立审阅执行轮次',exact:true}).check()
  await overview.getByRole('button',{name:'委派限额生效',exact:true}).click()
  await expect(overview).toContainText('当前限制：轮次 3')
  await overview.getByText('调整预算限制',{exact:true}).click()
  await page.locator('main.main .composer textarea').fill(pipelinePrompt);await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(overview).toContainText('普通阶段可用 0 轮 · 审阅预留 1 轮')
  await overview.locator('.run-budget-reserve').scrollIntoViewIfNeeded();mkdirSync(evidence,{recursive:true})
  await page.screenshot({path:join(evidence,'review-held-before-review.png')})
  await expect.poll(()=>persistedPipeline(dawn.workspace)?.team.pipeline.status).toBe('completed')
  const before=persistedPipeline(dawn.workspace)!
  expect(before.budget).toMatchObject({consumedRuns:3,active:[],reviewReservations:[{phase:'consumed',remainingRuns:0}]})
  expect(before.budget.reviewBindings.map((b:any)=>b.admission.stage).sort()).toEqual(['analyze','check','review'])
  expect(before.team.tasks.at(-1).receipt.result.data.verdict).toBe('pass')
  await expect(overview).toContainText('已准入 3 轮');await expect(overview).toContainText('普通阶段可用 0 轮 · 审阅预留 0 轮')
  await page.screenshot({path:join(evidence,'review-completed-at-three-runs.png')})
  page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  overview=page.getByRole('region',{name:'运行总览',exact:true})
  await overview.getByText('查看额度',{exact:true}).click();await expect(overview).toContainText('已准入 3 轮')
  const after=persistedPipeline(dawn.workspace)!
  expect(after.budget.consumedRuns).toBe(3);expect(after.budget.reviewReservations).toEqual(before.budget.reviewReservations)
  await overview.locator('.run-budget').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'review-restart-preserved.png')})
  writeFileSync(join(evidence,'review-reservation-ledger.json'),JSON.stringify({inference:'localhost-fixture',actualElectron:true,before:before.budget,after:after.budget},null,2))
 })
})
test.describe('scientific reservation cancellation',()=>{
 test.use({dawnOptions:{gitInit:true,sciencePipeline:'interrupt'}})
 test('releases an unused review hold only after elapsed cancellation drains actual analysis',async({dawn})=>{
  const {page,workspace}=dawn;preparePipeline(workspace)
  await 在项目里开会话(page);await 进坞(page,'团队')
  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  await overview.getByText('查看额度',{exact:true}).click();await overview.getByText('调整预算限制',{exact:true}).click()
  await overview.getByLabel('累计执行轮次上限',{exact:true}).fill('3');await overview.getByLabel('总历时上限（分钟）',{exact:true}).fill('0.1')
  await overview.getByRole('checkbox',{name:'为科研周期保留独立审阅执行轮次',exact:true}).check()
  await overview.getByRole('button',{name:'委派限额生效',exact:true}).click();await expect(overview).toContainText('总历时 0.1 分钟')
  await overview.getByText('调整预算限制',{exact:true}).click()
  const baseline=new Set(collectTree(dawn.app.process().pid!).pids)
  await page.locator('main.main .composer textarea').fill(pipelinePrompt);await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect.poll(()=>persistedPipeline(workspace)?.team.pipeline.stage).toBe('analyze')
  await expect.poll(()=>collectTree(dawn.app.process().pid!).pids.filter(pid=>!baseline.has(pid)).length).toBeGreaterThan(0)
  const owned=collectTree(dawn.app.process().pid!).pids.filter(pid=>!baseline.has(pid))
  await expect.poll(()=>persistedPipeline(workspace)?.team.pipeline.status).toBe('blocked')
  await expect.poll(()=>persistedPipeline(workspace)?.budget.active.length).toBe(0)
  await expect.poll(()=>persistedPipeline(workspace)?.budget.reviewReservations[0]?.phase).toBe('released')
  await expect.poll(()=>owned.filter(pid=>{try{process.kill(pid,0);return true}catch{return false}})).toEqual([])
  const final=persistedPipeline(workspace)!
  expect(final.budget.consumedRuns).toBe(2);expect(final.team.tasks.some((t:any)=>t.contract?.resultType==='review')).toBe(false)
  await expect(overview).toContainText('审阅预留 0 轮');await expect(overview).toContainText('总历时已到')
  mkdirSync(evidence,{recursive:true});await overview.locator('.run-budget').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'review-cancel-drained.png')})
  writeFileSync(join(evidence,'review-cancel-drained.json'),JSON.stringify({inference:'localhost-fixture',owned,allExited:true,budget:final.budget,pipelineStatus:final.team.pipeline.status},null,2))
 })
})
test.describe('scientific reservation recovery',()=>{
 test.use({dawnOptions:{gitInit:true,sciencePipeline:'interrupt'}})
 test('keeps an interrupted hold for verification across restart and resumes only after an explicit budget change',async({dawn})=>{
  let page=dawn.page;const {workspace}=dawn;preparePipeline(workspace)
  await 在项目里开会话(page);await 进坞(page,'团队')
  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  await overview.getByText('查看额度',{exact:true}).click();await overview.getByText('调整预算限制',{exact:true}).click()
  await overview.getByLabel('累计执行轮次上限',{exact:true}).fill('3');await overview.getByRole('checkbox',{name:'为科研周期保留独立审阅执行轮次',exact:true}).check()
  await overview.getByRole('button',{name:'委派限额生效',exact:true}).click();await expect(overview).toContainText('当前限制：轮次 3')
  await page.locator('main.main .composer textarea').fill(pipelinePrompt);await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect.poll(()=>persistedPipeline(workspace)?.budget.consumedRuns).toBe(2)
  await expect.poll(()=>persistedPipeline(workspace)?.team.pipeline.stage).toBe('analyze')
  await expect.poll(()=>dawn.requests.some(request=>JSON.stringify(request).includes('阶段 analyze，'))).toBe(true)
  const before=persistedPipeline(workspace)!
  page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  overview=page.getByRole('region',{name:'运行总览',exact:true});await overview.getByText('查看额度',{exact:true}).click()
  await page.locator('main.main .composer textarea').fill('读取科研恢复状态');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(overview).toContainText('恢复待核对 1 轮')
  const interrupted=persistedPipeline(workspace)!
  expect(interrupted.team.pipeline.status).toBe('interrupted');expect(interrupted.team.tasks.length).toBe(before.team.tasks.length)
  expect(interrupted.budget).toMatchObject({consumedRuns:2,active:[],reviewReservations:[{phase:'recovery-check',remainingRuns:1}]})
  mkdirSync(evidence,{recursive:true});await overview.locator('.run-budget').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'review-interrupted-awaiting-verification.png')})
  await overview.getByText('调整预算限制',{exact:true}).click();await overview.getByLabel('累计执行轮次上限',{exact:true}).fill('4')
  await overview.getByRole('button',{name:'委派限额生效',exact:true}).click();await expect(overview).toContainText('当前限制：轮次 4')
  await page.locator('main.main .composer textarea').fill('显式恢复科研流程，已核对中断副作用');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect.poll(()=>persistedPipeline(workspace)?.team.pipeline.status).toBe('completed')
  const after=persistedPipeline(workspace)!
  expect(after.budget).toMatchObject({consumedRuns:4,active:[],reviewReservations:[{phase:'consumed',remainingRuns:0}]})
  expect(after.team.pipeline.round).toBe(0)
  await expect(overview).toContainText('已准入 4 轮');await overview.getByText('调整预算限制',{exact:true}).click()
  await overview.locator('.run-budget').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'review-explicit-recovery-completed.png')})
  writeFileSync(join(evidence,'review-interrupted-recovery.json'),JSON.stringify({inference:'localhost-fixture',actualElectron:true,before:before.budget,interrupted:interrupted.budget,after:after.budget,scientificRound:after.team.pipeline.round},null,2))
 })
})
test.describe('run explanation',()=>{
 test.use({dawnOptions:{gitInit:true,toolCall:[
  {when:'演示产物锁等待',toolName:'subagent',args:{tasks:[{agent:'lockwriter',task:'锁演示持有任务，等待工具完成。'},{agent:'lockwriter',task:'锁演示等待任务，用一句话确认完成。'}]},once:true},
  {when:'锁演示持有任务',toolName:'bash',args:{command:'sleep 8'},once:true},
 ]}})
 test('explains actual shared lock waiting and retained host history',async({dawn})=>{
  const{page,workspace}=dawn
  mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  writeFileSync(join(workspace,'.dawn/agents/lockwriter.md'),'---\nname: lockwriter\ndescription: 锁等待演示\ntools: read,bash\n---\n使用指定工具，用一句话回答。')
  await 在项目里开会话(page)
  await page.getByPlaceholder(/输入问题/).fill('演示产物锁等待')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await 进坞(page,'团队')
  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  await overview.locator('.collaboration-row').filter({hasText:'等待产物锁'}).getByRole('button').click()
  await expect(overview.locator('.run-activity').filter({hasText:'等待产物锁'})).toHaveCount(1)
  await expect(overview.locator('.run-activity').filter({hasText:'等待产物锁'})).toContainText('lockwriter · 代次 1')
  await expect(overview).toContainText('等待工作区独占执行')
  await overview.locator('.run-activity').filter({hasText:'等待产物锁'}).scrollIntoViewIfNeeded()
  mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'phase-a-lock-wait.png')})
  await expect(overview.locator('.run-overview-row').filter({hasText:'执行完成'})).toHaveCount(2)
  const timeline=overview.getByRole('region',{name:'任务轨迹',exact:true})
  await expect(timeline.locator('ol')).toContainText('等待产物锁')
  await expect(timeline.locator('ol')).toContainText('执行已结算')
  await page.screenshot({path:join(evidence,'phase-a-history.png')})
  const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!
  const state=JSON.parse(readFileSync(join(sessions,sid,'orchestration/state.json'),'utf8'))
  expect(state.events.some((event:{stage?:string})=>event.stage==='lock-wait')).toBe(true)
  writeFileSync(join(evidence,'phase-a-state.json'),JSON.stringify(state,null,2))
 })
})
test.describe('elapsed budget',()=>{
 test.use({dawnOptions:{gitInit:true,toolCall:{when:'历时预算演示',toolName:'subagent',args:{agent:'budgetslow',task:'子任务慢：按要求运行慢工具。'},once:true}}})
 test('elapsed limit cancels a real slow process and retains ownership until it exits',async({dawn})=>{
  const{page,workspace}=dawn
  mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'.dawn/agents/budgetslow.md'),'---\nname: budgetslow\ndescription: 历时预算演示\ntools: read,bash\n---\n按要求执行。')
  await 在项目里开会话(page);await 进坞(page,'团队')
  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  await overview.getByText('查看额度',{exact:true}).click()
  await overview.getByText('调整预算限制',{exact:true}).click();await overview.getByLabel('总历时上限（分钟）',{exact:true}).fill('0.1');await overview.getByRole('button',{name:'委派限额生效',exact:true}).click()
  await expect(overview).toContainText('总历时 0.1 分钟');await overview.getByText('调整预算限制',{exact:true}).click()
  const baseline=new Set(collectTree(dawn.app.process().pid!).pids)
  await page.locator('main.main .composer textarea').fill('历时预算演示');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect(page.locator('.chip-group .chip').first().locator('.chip-activity')).toContainText('sleep 15')
  const owned=collectTree(dawn.app.process().pid!).pids.filter(pid=>!baseline.has(pid));expect(owned.length).toBeGreaterThan(0)
  await expect(overview).toContainText('总历时已到');await expect(overview).toContainText('已取消并排空')
  await expect.poll(()=>owned.filter(pid=>{try{process.kill(pid,0);return true}catch{return false}})).toEqual([])
  const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,state=JSON.parse(readFileSync(join(sessions,sid,'orchestration/state.json'),'utf8'))
  expect(state.budget.consumedRuns).toBe(1);expect(state.budget.active).toEqual([])
  expect(state.events.some((e:{type:string})=>e.type==='cancel-requested')).toBe(true)
  const editor=overview.locator('.run-budget details');if(await editor.getAttribute('open')!==null)await editor.locator('summary').click()
  await overview.locator('.run-overview-row').first().scrollIntoViewIfNeeded()
  mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'phase-b-elapsed-drained.png')});writeFileSync(join(evidence,'elapsed-process-drain.json'),JSON.stringify({owned,allExited:true,budget:state.budget,childState:state.children[0].state},null,2))
 })
})
test.describe('delegation budget',()=>{
 test.use({dawnOptions:{gitInit:true}})
 test('sets real limits, rejects a third Pi child, and retains consumption across Electron restart',async({dawn})=>{
  let page=dawn.page;const{workspace}=dawn
  mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'.dawn/agents/scout.md'),'---\nname: scout\ndescription: 预算演示\ntools: read,ls\n---\n只读确认，一句话回复。')
  await 在项目里开会话(page);await 进坞(page,'团队')
  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  await overview.getByText('查看额度',{exact:true}).click()
await overview.getByText('调整预算限制',{exact:true}).click()
  await overview.getByLabel('累计执行轮次上限',{exact:true}).fill('2')
  await overview.getByRole('button',{name:'委派限额生效',exact:true}).click()
  await expect(overview).toContainText('当前限制：轮次 2')
  const send=async()=>{const tools=page.locator('.tool').filter({hasText:'subagent'}),before=await tools.count();await page.locator('main.main .composer textarea').fill('演示委派预算');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(tools).toHaveCount(before+1);await expect(tools.last()).toHaveAttribute('data-status',/^(ok|error)$/);await expect(page.locator('main.main').getByRole('button',{name:'停止',exact:true})).toHaveCount(0)}
  await send();await expect(overview).toContainText('已准入 1 轮')
  await send();await expect(overview).toContainText('已准入 2 轮')
  await send();await expect(page.locator('.tool').filter({hasText:'subagent'}).last()).toHaveAttribute('data-status','error')
  await expect(overview).toContainText('已准入 2 轮')
  const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,file=join(sessions,sid,'orchestration/state.json')
  const before=JSON.parse(readFileSync(file,'utf8'));expect(before.budget.consumedRuns).toBe(2);expect(before.children.reduce((n:number,c:{epoch:number})=>n+c.epoch,0)).toBe(2)
  mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'phase-b-limit.png')})
  page=await dawn.重开();await page.getByRole('button',{name:/^演示委派预算/}).click();await 进坞(page,'团队')
  overview=page.getByRole('region',{name:'运行总览',exact:true});await expect(overview).toContainText('已准入 2 轮')
  const after=JSON.parse(readFileSync(file,'utf8'));expect(after.budget.consumedRuns).toBe(2)
  expect(after.children.filter((c:{state:string})=>c.state==='completed').map((c:{result:unknown})=>c.result)).toEqual(before.children.filter((c:{state:string})=>c.state==='completed').map((c:{result:unknown})=>c.result))
  await page.screenshot({path:join(evidence,'phase-b-recovery.png')});writeFileSync(join(evidence,'phase-b-budget.json'),JSON.stringify({before:before.budget,after:after.budget,actualElectron:true,actualPiChildren:2,thirdChildRejected:true},null,2))
 })
})
