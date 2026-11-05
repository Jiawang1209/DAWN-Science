import {expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path'
import {createSciencePipelineTools} from '../../src/team/science-pipeline-tools.js'
import {团队调度器} from '../../src/team/scheduler.js'
import {AnalysisRouteSchema} from '../../src/protocol/analysis-route.js'
import {taskTeamSnapshot} from '../../src/team/task-snapshot.js'
it('rejects raw/aliased output roots, freezes every future item, and preserves request identity across stages',async()=>{
 const root=mkdtempSync(join(tmpdir(),'batch-tools-'));try{
 writeFileSync(join(root,'in.csv'),'x\n1\n');mkdirSync(join(root,'data/raw'),{recursive:true});symlinkSync(join(root,'data/raw'),join(root,'raw-alias'))
 const scheduler=new 团队调度器({sessionDir:root,定义:()=>[],跑:{context:{cwd:root,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{}});vi.spyOn(scheduler,'踢一下').mockResolvedValue();let current:string|undefined
 const route=AnalysisRouteSchema.parse({routeId:'r',revision:1,updatedAt:1,title:'fixture',goal:'mean',dataContext:[],steps:[{id:'s',title:'mean',purpose:'approved',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const definitions=['check','analyze','review'].map(name=>({name,description:'fixture',systemPrompt:'fixture',filePath:'/'+name,tools:['read','write','bash']})),tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>definitions,当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route:()=>route})
 const args={routeId:'r',revision:1,stepId:'s',executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved mean',template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},items:[{id:'a',label:'A',inputs:['in.csv']},{id:'b',label:'B',inputs:['in.csv']}],outputRoot:'results'}
 const start=tools.find(t=>t.name==='start_science_batch')!
 for(const outputRoot of ['data/raw','raw-alias']){expect((await start.execute(outputRoot,{...args,outputRoot})).isError).toBe(true);expect(current).toBeUndefined()}
 expect((await start.execute('req',{...args,items:[args.items[0],args.items[0]]})).isError).toBe(true)
 expect((await start.execute('req',args)).isError).not.toBe(true);const before=scheduler.读(current!);expect(before.scienceBatch?.items.every(i=>i.settingsByStage.check.versions?.inputs.length===1)).toBe(true)
 expect((await start.execute('req',{...args,template:{...args.template,method:'different'}})).isError).toBe(true);expect(scheduler.读(current!)).toEqual(before)
 const publicTeam=taskTeamSnapshot(before);expect(JSON.stringify(publicTeam.scienceBatch)).not.toContain('settingsByStage');expect(publicTeam.scienceBatch?.total).toBe(2);expect(publicTeam.scienceBatch?.active).toBe(1)
 }finally{rmSync(root,{recursive:true,force:true})}
})
