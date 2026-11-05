import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
test.use({dawnOptions:{scienceBatch:'incremental'}})
test('visibly reuses accepted A and reruns failed B through actual parent tools and Pi',async({dawn})=>{
 const {page,workspace}=dawn,dir=resolve(process.env.DAWN_SCIENCE_DEMO_DIR??'docs/validation/incremental-science-20261105/demo');mkdirSync(dir,{recursive:true});mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});for(const file of ['in.csv','other.csv'])writeFileSync(join(workspace,file),'x\n1\n2\n3\n4\n5\n')
 for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read, write, bash\n---\nUse frozen contract and submit_task_result.`)
 const readTeam=()=>{for(const id of readdirSync(join(workspace,'.dawn','sessions'))){try{const session=join(workspace,'.dawn','sessions',id),current=readFileSync(join(session,'teams/current'),'utf8').trim();return{team:JSON.parse(readFileSync(join(session,'teams',current,'team.json'),'utf8')),file:join(session,'teams',current,'team.json')}}catch{}}}
 await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('科研批量验收：先按批准的均值方法处理样地 A 和 B，结果须独立核验。');await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect.poll(()=>readTeam()?.team.scienceBatch?.status,{timeout:45000}).toBe('blocked');const source=readTeam()!,sourceBytes=readFileSync(source.file,'utf8');expect(source.team.scienceBatch.items[0].completed.status).toBe('completed')
 await 进坞(page,'团队');await expect(page.locator('.science-acceptance-status').first()).toContainText('期望 3，实际 999');await page.screenshot({path:join(dir,'03-source-blocked.png'),fullPage:true})
 // Wait for the captain turn to finish before taking the actual incremental request delta.
 await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();const before=dawn.requests.length
 await page.getByPlaceholder(/输入问题/).fill('局部重跑：B 的生成错误已修正，请派生新批次，复用满足全部条件的历史项，只重跑必要项。');await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect.poll(()=>{const next=readTeam()?.team;return next?.id!==source.team.id?next?.scienceBatch?.status:undefined},{timeout:45000}).toBe('completed');const derived=readTeam()!.team
 expect(derived.scienceBatch.items.map((i:any)=>i.reuse.mode)).toEqual(['reused','rerun']);expect(readFileSync(source.file,'utf8')).toBe(sourceBytes)
 await expect(page.locator('.science-reuse-status')).toContainText('复用 1 项，重跑 1 项');await page.locator('.science-reuse-status').scrollIntoViewIfNeeded();await page.screenshot({path:join(dir,'04-derived-full.png'),fullPage:true});await page.locator('.science-reuse-status').screenshot({path:join(dir,'04-derived-decisions.png')})
 const summary=readFileSync(join(workspace,derived.scienceBatch.summaryOutputs[0]),'utf8');writeFileSync(join(dir,'derived-summary.json'),summary)
 const evidence={conditions:'localhost deterministic inference; actual Electron/Pi/Python/files; synthetic inputs',initialRequests:before,recoveryRequestsIncludingCaptain:dawn.requests.length-before,source:{teamId:source.team.id,status:'blocked',items:source.team.scienceBatch.items.map((i:any)=>({id:i.id,status:i.completed?.status??'blocked'}))},derived:{teamId:derived.id,status:'completed',items:derived.scienceBatch.items.map((i:any)=>({id:i.id,reuse:i.reuse,outputs:i.definition.outputs})),executedAnalysisTasks:derived.tasks.filter((t:any)=>!t.reusedFrom&&t.contract?.resultType==='model-metrics').length,historicalTasks:derived.tasks.filter((t:any)=>t.reusedFrom).length},sourcePreserved:true}
 writeFileSync(join(dir,'incremental-electron.json'),JSON.stringify(evidence,null,2)+'\n')
})
