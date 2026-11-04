import {expect,it,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import type {团队调度器} from '../../src/team/scheduler.js'
import {AnalysisRouteBook} from '../../src/runtime/analysis-route-book.js'
// @ts-expect-error deterministic localhost provider
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
// @ts-expect-error deterministic localhost scenario
import {scienceTemplateScenario} from '../../scripts/mock-science-template.mjs'
it.each([{templateId:'tabular-ecology',mode:'pass'},{templateId:'figure-reproduction',mode:'pass'},{templateId:'tabular-ecology',mode:'missing-units'},{templateId:'tabular-ecology',mode:'revise'}] as const)('real Pi $templateId batch $mode freezes versions and aggregates accepted receipts',async({templateId,mode})=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-batch-pi-')),server=await startMockInferenceServer({scenario:scienceTemplateScenario({mode})}),modelsPath=join(root,'models.json')
 writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));writeFileSync(join(root,'in.csv'),'x\n1\n2\n3\n4\n5\n');writeFileSync(join(root,'paper.md'),'fixture paper page 1 figure 1; mean x = 3 m')
 mkdirSync(join(root,'.dawn','agents'),{recursive:true});for(const name of ['check','analyze','review'])writeFileSync(join(root,'.dawn','agents',name+'.md'),`---\nname: ${name}\ndescription: fixture\ntools: read, write, bash\n---\nUse the frozen contract.`)
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:resolve('dist/electron/subagent-child.js')})
 const internals=runtime as unknown as {botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean;content:{text?:string}[]}>}}}>;routeBooks:Map<string,{book:AnalysisRouteBook}>}
 try{
 await runtime.start({sessionId:'p',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 const book=internals.routeBooks.get('p')!.book,route=book.replace(0,{title:'fixture',goal:'mean',dataContext:[],steps:[{id:'s',title:'mean',purpose:'approved mean',inputs:['in.csv'],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const session=internals.sessions.get('p')!.session,start=session.getToolDefinition('start_science_batch')
 const template=templateId==='tabular-ecology'?{id:templateId,version:1,language:'python',method:'mean',units:'m',missingValues:'block'}:{id:templateId,version:1,language:'python',method:'mean',evidencePath:'paper.md',citation:'fixture paper',page:'1',targetFigure:'1',transformations:'none'}
 const args={routeId:route.routeId,revision:route.revision,stepId:'s',executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved fixture mean',template,items:[{id:'a'.repeat(31)+'1',label:'A',inputs:templateId==='tabular-ecology'?['in.csv']:['in.csv','paper.md']},{id:'a'.repeat(31)+'2',label:'B',inputs:templateId==='tabular-ecology'?['in.csv']:['in.csv','paper.md']}],outputRoot:'results',maxRevisions:1}
 const result=await start.execute('batch',args);expect(result.isError,JSON.stringify(result)).not.toBe(true)
 const control=internals.botTeams.get('p')!
 await vi.waitFor(()=>{const t=control.scheduler.读(control.current.id);expect(t.scienceBatch?.status,JSON.stringify(t.tasks.map(t=>({id:t.id,status:t.status,output:t.output})))).toBe(mode==='missing-units'?'blocked':'completed')},{timeout:25000})
 if(mode==='missing-units'){const blocked=control.scheduler.读(control.current.id);expect(blocked.tasks).toHaveLength(1);expect(blocked.scienceBatch?.items.every(i=>!i.completed)).toBe(true);expect(book.read()?.steps[0]?.status).toBe('pending');return}
 await vi.waitFor(()=>expect(control.scheduler.读(control.current.id).pipeline?.routeSync).toBe('applied'),{timeout:5000})
 const team=control.scheduler.读(control.current.id);expect(team.tasks).toHaveLength(mode==='revise'?11:7);expect(team.tasks.every(t=>t.receipt?.versions)).toBe(true)
 const summary=JSON.parse(readFileSync(join(root,team.scienceBatch!.summaryOutputs[0]!),'utf8'));expect(summary.items.map((i:{data:unknown})=>i.data)).toEqual([expect.objectContaining({metrics:{n:5,mean:3}}),expect.objectContaining({metrics:{n:5,mean:3}})])
 expect(book.read()?.steps[0]?.deliverables).toHaveLength(8);expect(readFileSync(join(root,'in.csv'),'utf8')).toBe('x\n1\n2\n3\n4\n5\n')
 expect((await start.execute('batch',args)).isError).not.toBe(true);expect(control.scheduler.读(control.current.id).tasks).toHaveLength(mode==='revise'?11:7)
 expect((await session.getToolDefinition('resume_science_pipeline').execute('wrong-entry',{stateRevision:team.pipeline!.stateRevision})).isError).toBe(true)
 }finally{await runtime.stop('p');await server.close();rmSync(root,{recursive:true,force:true})}
},45000)
