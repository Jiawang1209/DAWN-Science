import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';import {join} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
test.use({dawnOptions:{scienceBatch:true}})
test('batch versions, host summary and progress cross the actual strict desktop protocol',async({dawn})=>{
 const {page,workspace}=dawn;mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
 for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn','agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read, write, bash\n---\nUse frozen contract.`)
 await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('科研批量验收：按已确认方法分别核查、分析并审阅两个合成样本，汇总已验收结果。');await page.getByRole('button',{name:'发送',exact:true}).click()
 let team:any,dir=''
 await expect.poll(()=>{try{for(const id of readdirSync(join(workspace,'.dawn','sessions'))){const sessionDir=join(workspace,'.dawn','sessions',id),current=readFileSync(join(sessionDir,'teams/current'),'utf8').trim();team=JSON.parse(readFileSync(join(sessionDir,'teams',current,'team.json'),'utf8'));dir=join(sessionDir,'teams',current);if(team.scienceBatch)return team.scienceBatch.status}}catch{}},{timeout:45000}).toBe('completed')
 await expect.poll(()=>JSON.parse(readFileSync(join(dir,'team.json'),'utf8')).pipeline.routeSync).toBe('applied')
 expect(team.tasks).toHaveLength(7);expect(team.tasks.every((t:any)=>t.receipt.versions)).toBe(true);expect(JSON.parse(readFileSync(join(workspace,team.scienceBatch.summaryOutputs[0]),'utf8')).items).toHaveLength(2)
 await 进坞(page,'团队');await expect(page.locator('.science-pipeline-status').first()).toContainText('已完成 2/2');await expect(page.locator('.science-pipeline-status').first()).toContainText('内容版本已绑定')
})
