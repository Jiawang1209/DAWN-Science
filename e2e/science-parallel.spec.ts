import {mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
test.use({dawnOptions:{scienceBatch:'parallel'}})
test('two independent science items use bounded checkpoints through the desktop protocol and deliver one host summary',async({dawn},testInfo)=>{
 const {page,workspace}=dawn,out=resolve(process.env.DAWN_SCIENCE_DEMO_DIR??testInfo.outputPath('evidence'))
 mkdirSync(out,{recursive:true});mkdirSync(join(workspace,'.dawn','agents'),{recursive:true})
 for(const file of ['in.csv','other.csv'])writeFileSync(join(workspace,file),'x\n1\n2\n3\n4\n5\n')
 for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read, write, bash\n---\nUse frozen contract.`)
 await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('科研批量验收：两个独立 CSV，以并发上限 2 分别完成核查、分析和审阅，再汇总。');await page.getByRole('button',{name:'发送',exact:true}).click()
 let team:any,dir=''
 await expect.poll(()=>{try{for(const id of readdirSync(join(workspace,'.dawn','sessions'))){const sessionDir=join(workspace,'.dawn','sessions',id),current=readFileSync(join(sessionDir,'teams/current'),'utf8').trim();dir=join(sessionDir,'teams',current);team=JSON.parse(readFileSync(join(dir,'team.json'),'utf8'));if(team.scienceBatch)return team.scienceBatch.status}}catch{}},{timeout:45000}).toBe('completed')
 await expect.poll(()=>JSON.parse(readFileSync(join(dir,'team.json'),'utf8')).pipeline.routeSync).toBe('applied')
 team=JSON.parse(readFileSync(join(dir,'team.json'),'utf8'))
 expect(team.scienceBatch.concurrency).toBe(2);expect(team.scienceBatch.items.every((i:any)=>i.completed?.status==='completed'&&i.checkpoint)).toBe(true)
 expect(team.scienceBatch.aggregateTaskIds).toHaveLength(1);expect(team.tasks).toHaveLength(7)
 const summary=JSON.parse(readFileSync(join(workspace,team.scienceBatch.summaryOutputs[0]),'utf8'));expect(summary.items).toHaveLength(2)
 for(const i of team.scienceBatch.items){const result=JSON.parse(readFileSync(join(workspace,i.definition.acceptance.resultPath),'utf8'));expect(result).toEqual({n:5,mean:3,unit:'m'})}
 await 进坞(page,'团队');const status=page.locator('.science-pipeline-status').first();await expect(status).toContainText('并发上限 2');await expect(status).toContainText('已完成 2/2');await expect(status).toContainText('检查通过')
 await page.screenshot({path:join(out,'parallel-completed.png'),fullPage:true});copyFileSync(join(dir,'team.json'),join(out,'desktop-team.json'))
 for(const path of team.scienceBatch.summaryOutputs)copyFileSync(join(workspace,path),join(out,path.endsWith('.json')?'summary.json':'summary.md'))
})
