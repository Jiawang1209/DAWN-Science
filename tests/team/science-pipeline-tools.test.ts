import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createSciencePipelineTools} from '../../src/team/science-pipeline-tools.js'
import {团队调度器} from '../../src/team/scheduler.js'
import {AnalysisRouteSchema} from '../../src/protocol/analysis-route.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const route=()=>AnalysisRouteSchema.parse({routeId:'r',revision:1,updatedAt:1,title:'study',goal:'approved goal',dataContext:[],steps:[{id:'s',title:'s',purpose:'approved method',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
it('persists once before admission, deduplicates retries and refuses conflicting requests',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-tools-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{}})
 const kick=vi.spyOn(scheduler,'踢一下').mockResolvedValue();let current:string|undefined,live=route()
 const definitions=['check','analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name,tools:['read','write']}))
 const tools=createSciencePipelineTools({sessionId:'parent',调度器:scheduler,定义:()=>definitions,当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route:()=>live})
 const start=tools.find(t=>t.name==='start_science_pipeline')!,args={routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved analysis',requireExecution:false}
 const first=await start.execute('req',args);expect(first.isError).not.toBe(true);const id=current!
 expect(scheduler.读(id).pipeline).toMatchObject({status:'running',stage:'check'});expect(kick).toHaveBeenCalledTimes(1)
 const beforeInvalidResume=scheduler.读(id)
 expect((await tools.find(t=>t.name==='resume_science_pipeline')!.execute('invalid-resume',{stateRevision:beforeInvalidResume.pipeline!.stateRevision})).isError).toBe(true)
 expect(scheduler.读(id)).toEqual(beforeInvalidResume)
 live={...live,revision:2};expect((await start.execute('req',args)).isError).not.toBe(true);expect(kick).toHaveBeenCalledTimes(1)
 expect((await start.execute('req',{...args,outputs:['different.csv']})).isError).toBe(true)
 expect(scheduler.读(id).tasks).toHaveLength(1)
 expect((await tools.find(t=>t.name==='science_pipeline_status')!.execute('status',{teamId:'../../outside'})).isError).toBe(true)
})

it.each(['conflict','abort','orphan'] as const)('keeps admission safe during %s',async mode=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-admission-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{}})
 const kick=vi.spyOn(scheduler,'踢一下').mockResolvedValue();let current:string|undefined,failPointer=mode==='orphan',release!:()=>void
 const gate=new Promise<void>(r=>{release=r}),controller=new AbortController()
 const tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['check','analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),当前:{get:()=>current,set:id=>{if(failPointer)throw new Error('pointer write failed');current=id}},已知模型:async()=>{await gate;return[]},route})
 const start=tools[0]!,args={routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'confirmed',requireExecution:false}
 const first=start.execute('same',args,controller.signal)
 const second=mode==='conflict'?start.execute('same',{...args,outputs:['other.csv']}):undefined
 if(mode==='abort')controller.abort();release()
 const result=await first
 if(mode==='abort'){expect(result.isError).toBe(true);expect(current).toBeUndefined();expect(kick).not.toHaveBeenCalled()}
 if(mode==='conflict'){expect(result.isError,JSON.stringify(result)).not.toBe(true);expect((await second!).isError).toBe(true);expect(scheduler.读(current!).pipeline?.definition.outputs).toEqual(['out.csv']);expect(kick).toHaveBeenCalledTimes(1)}
 if(mode==='orphan'){
  expect(result.isError).toBe(true);failPointer=false
  expect((await start.execute('same',args)).isError).not.toBe(true);expect(current).toBeTruthy();expect(scheduler.读(current!).pipeline?.status).toBe('interrupted');expect(kick).not.toHaveBeenCalled()
  const p=scheduler.读(current!).pipeline!;expect((await tools.find(t=>t.name==='resume_science_pipeline')!.execute('resume',{stateRevision:p.stateRevision})).isError).not.toBe(true);expect(kick).toHaveBeenCalledTimes(1)
 }
})
it('an exception after the pointer is published leaves an explicit recovery checkpoint',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-notify-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 let failNotify=true,current:string|undefined
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{if(failNotify)throw new Error('notify failed')}})
 const kick=vi.spyOn(scheduler,'踢一下').mockResolvedValue(),start=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['check','analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route})[0]!
 const args={routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'confirmed',requireExecution:false}
 expect((await start.execute('same',args)).isError).toBe(true);failNotify=false
 expect((await start.execute('same',args)).isError).not.toBe(true);expect(scheduler.读(current!).pipeline?.status).toBe('interrupted');expect(kick).not.toHaveBeenCalled()
})
it('a failed resume notification returns to an interrupted checkpoint that can be explicitly retried',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-resume-fault-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 let failNotify=false,current:string|undefined
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{if(failNotify)throw new Error('resume snapshot notification failed')}})
 const kick=vi.spyOn(scheduler,'踢一下').mockResolvedValue(),tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['check','analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route})
 const args={routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'confirmed',requireExecution:false}
 await tools[0]!.execute('start',args);scheduler.中止全部(current!);kick.mockClear()
 const resume=tools.find(t=>t.name==='resume_science_pipeline')!,old=scheduler.读(current!).pipeline!
 failNotify=true
 expect((await resume.execute('resume',{stateRevision:old.stateRevision})).isError).toBe(true)
 failNotify=false
 const saved=scheduler.读(current!)
 expect(saved.pipeline?.status).toBe('interrupted');expect(saved.tasks).toHaveLength(1);expect(kick).not.toHaveBeenCalled()
 expect((await resume.execute('retry',{stateRevision:saved.pipeline!.stateRevision})).isError).not.toBe(true);expect(kick).toHaveBeenCalledTimes(1)
})
it('a failed resumed claim with no live backend can be recovered without restarting the host',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-resume-claim-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 let current:string|undefined,failClaim=false
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:team=>{if(failClaim&&team.tasks.at(-1)?.status==='claimed')throw new Error('claim notification failed')}})
 const kick=vi.spyOn(scheduler,'踢一下').mockResolvedValue(),tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['check','analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route})
 await tools[0]!.execute('start',{routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'confirmed',requireExecution:false})
 scheduler.中止全部(current!);kick.mockRestore();failClaim=true
 const resume=tools.find(t=>t.name==='resume_science_pipeline')!,p=scheduler.读(current!).pipeline!
 expect((await resume.execute('resume',{stateRevision:p.stateRevision})).isError).toBe(true)
 failClaim=false
 const saved=scheduler.读(current!);expect(saved.pipeline?.status).toBe('interrupted');expect(saved.tasks[0]?.status).toBe('failed');expect(saved.tasks[0]?.attemptId).toBeUndefined();expect(scheduler.几个在跑()).toBe(0)
 vi.spyOn(scheduler,'踢一下').mockResolvedValue()
 expect((await resume.execute('retry',{stateRevision:saved.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).not.toBe(true)
 expect(scheduler.读(current!).tasks).toHaveLength(2)
})
it('a stage settlement notification failure preserves accepted work and pauses the next stage for explicit recovery',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-settle-notify-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n');writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 let current:string|undefined,failNotify=true
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},memberRunner:async request=>({ok:true,output:'checked',receipt:{version:1,state:'accepted',summary:'checked',deliverables:[],...(request.settings?.versions?{versions:{version:1,inputs:request.settings.versions.inputs,outputs:[]}}:{}),result:{summary:'checked',blockers:[],deliverables:[],execution:{state:'not_run',note:'readonly'},verification:{state:'reviewed',note:'adapter fixture'},data:{kind:'data-summary',rows:1,columns:[{name:'x'}],issues:[]}}}}),onChange:team=>{if(failNotify&&team.pipeline?.stage==='analyze'){failNotify=false;throw new Error('stage settlement notification failed')}}})
 const tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),resolveBot:()=>({id:'checker',name:'checker',role:'check',instructions:'check',enabled:true}),当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route})
 await tools[0]!.execute('start',{routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{botId:'checker'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'confirmed',requireExecution:false})
 await vi.waitFor(()=>{expect(current).toBeTruthy();expect(scheduler.读(current!).pipeline?.stage).toBe('analyze');expect(scheduler.几个在跑()).toBe(0)})
 const saved=scheduler.读(current!);expect(saved.pipeline?.status).toBe('interrupted');expect(saved.tasks[0]?.receipt?.state).toBe('accepted');expect(saved.tasks[1]?.status).toBe('pending')
 const kick=vi.spyOn(scheduler,'踢一下').mockResolvedValue()
 expect((await tools.find(t=>t.name==='resume_science_pipeline')!.execute('resume',{stateRevision:saved.pipeline!.stateRevision})).isError).not.toBe(true)
 expect(scheduler.读(current!).tasks[0]).toEqual(saved.tasks[0]);expect(scheduler.读(current!).tasks).toHaveLength(2);expect(kick).toHaveBeenCalledTimes(1)
})
it('a changed input keeps an interrupted checkpoint frozen instead of blessing new bytes on acknowledgement',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-version-resume-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 let current:string|undefined
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{}})
 vi.spyOn(scheduler,'踢一下').mockResolvedValue()
 const tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['check','analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route})
 expect((await tools[0]!.execute('start',{routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved',requireExecution:false})).isError).not.toBe(true)
 scheduler.中止全部(current!);const before=scheduler.读(current!);writeFileSync(join(cwd,'in.csv'),'x\n2\n')
 expect((await tools.find(t=>t.name==='resume_science_pipeline')!.execute('resume',{stateRevision:before.pipeline!.stateRevision,acknowledgeInterrupted:true})).isError).toBe(true)
 expect(scheduler.读(current!)).toEqual(before)
})
it('does not admit an accepted legacy Bot receipt into a content-bound pipeline',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-pipeline-missing-bot-versions-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n');let current:string|undefined
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},memberRunner:async()=>({ok:true,output:'claimed',receipt:{version:1,state:'accepted',summary:'claimed',deliverables:[],result:{summary:'claimed',blockers:[],deliverables:[],execution:{state:'not_run',note:'read'},verification:{state:'reviewed',note:'claimed'},data:{kind:'data-summary',rows:1,columns:[],issues:[]}}}}),onChange:()=>{}})
 const tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),resolveBot:()=>({id:'checker',name:'checker',role:'check',instructions:'check',enabled:true}),当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route})
 await tools[0]!.execute('start',{routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{botId:'checker'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved',requireExecution:false})
 await vi.waitFor(()=>expect(scheduler.读(current!).pipeline?.status).toBe('blocked'))
 expect(scheduler.读(current!).tasks).toHaveLength(1)
})
it('rechecks the route after queued recovery verification without changing the interrupted checkpoint',async()=>{
 const {sharedTaskOutputLocks,outputLockScope}=await import('../../src/bot/output-locks.js')
 const cwd=mkdtempSync(join(tmpdir(),'dawn-resume-route-race-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 const scheduler=new 团队调度器({sessionDir:cwd,定义:()=>[],跑:{context:{cwd,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{}}),kick=vi.spyOn(scheduler,'踢一下').mockResolvedValue();let current:string|undefined,live=route()
 const tools=createSciencePipelineTools({sessionId:'p',调度器:scheduler,定义:()=>['check','analyze','review'].map(name=>({name,description:name,systemPrompt:name,filePath:'/'+name})),当前:{get:()=>current,set:id=>{current=id}},已知模型:async()=>[],route:()=>live})
 await tools.find(t=>t.name==='start_science_pipeline')!.execute('req',{routeId:'r',revision:1,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved',requireExecution:false})
 scheduler.中止全部(current!);kick.mockClear();const before=scheduler.读(current!),release=await sharedTaskOutputLocks.acquire(outputLockScope(cwd),undefined,new AbortController().signal)
 try{const pending=tools.find(t=>t.name==='resume_science_pipeline')!.execute('resume',{stateRevision:before.pipeline!.stateRevision});await new Promise<void>(done=>setImmediate(done));live={...live,revision:2};release();expect((await pending).isError).toBe(true);expect(scheduler.读(current!)).toEqual(before);expect(kick).not.toHaveBeenCalled()}finally{release()}
})
