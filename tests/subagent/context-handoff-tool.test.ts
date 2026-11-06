import {afterEach,expect,it} from 'vitest'
import {mkdirSync,mkdtempSync,rmSync,writeFileSync,unlinkSync,copyFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createSubagentTool,prepareSubagentTask,type SubagentToolOptions} from '../../src/subagent/tool.js'
import {captureHandoff,readHandoff,freezeHandoff} from '../../src/subagent/context-handoff.js'
import {读元,写元} from '../../src/subagent/run-dir.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {createSubagentOrchestration} from '../../src/subagent/orchestration.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function setup(){
 const root=mkdtempSync(join(tmpdir(),'dawn-handoff-tool-'));roots.push(root)
 mkdirSync(join(root,'.dawn/agents'),{recursive:true});writeFileSync(join(root,'.dawn/agents/a.md'),'---\nname: a\ndescription: fixture\ntools: read\n---\nfixture')
 let source='保留输入，只读汇总',captures=0
 const opts:SubagentToolOptions={sessionId:'p',projectRoot:root,emit:()=>{},运行目录:(id,i)=>join(root,id,String(i)),
  captureHandoff:s=>{captures++;return captureHandoff('p',[{id:'u',type:'message',message:{role:'user',content:source}}],s.recentMessages)},
  context:{provider:'fixture',model:'fixture',cwd:root,agentDirOf:i=>join(root,'unused',String(i))},
  childOf:()=>({command:process.execPath,args:['-e',String.raw`let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);process.stdout.write(JSON.stringify({type:'done',ok:true,output:JSON.stringify({task:p.task,settings:p.taskSettings,tools:p.tools})})+'\n')})`]})}
 return{root,opts,setSource:(v:string)=>source=v,captures:()=>captures}
}
it('injects selected text into real subprocess stdin for single, parallel and chain without adding tools',async()=>{
 for(const mode of ['single','parallel','chain']){
  const {root,opts}=setup(),tool=createSubagentTool(opts),item={agent:'a',task:'task',handoff:{recentMessages:1}}
  const params=mode==='single'?item:mode==='parallel'?{tasks:[item,item]}:{chain:[item,{...item,task:'next {previous}'}]}
  const result=await tool.execute('call',params)
  expect(result.isError,JSON.stringify(result)).not.toBe(true)
  expect(result.content[0]?.text).toContain('保留输入，只读汇总')
  expect(result.content[0]?.text).toContain('read')
  expect(result.content[0]?.text).not.toContain('bash')
  expect(readHandoff(join(root,'call','0'),'p')?.entries[0]?.id).toBe('u')
 }
})
it('continuation does not recapture changed parent text and fails closed if a frozen capsule disappears',()=>{
 const {root,opts,setSource,captures}=setup(),dir=join(root,'call','0')
 写元(dir,{agent:'a',task:'task',startedAt:1,status:'running'})
 prepareSubagentTask(opts,'call',0,{agent:'a',handoff:{recentMessages:1}})
 const sha=readHandoff(dir,'p')!.sha256
 expect(读元(dir)?.handoffSha256).toBe(sha)
 setSource('changed');prepareSubagentTask(opts,'call',0,{agent:'a'})
 prepareSubagentTask(opts,'call',0,{agent:'a',handoff:{recentMessages:1}})
 expect(()=>prepareSubagentTask(opts,'call',0,{agent:'a',handoff:{recentMessages:2}})).toThrow(/冻结/)
 expect(captures()).toBe(1);expect(readHandoff(dir,'p')!.sha256).toBe(sha)
 unlinkSync(join(dir,'handoff.json'))
 expect(()=>prepareSubagentTask(opts,'call',0,{agent:'a'})).toThrow(/缺失/)
})
it('rejects contract handoff and foreign parent capture before writing a capsule',()=>{
 const {root,opts}=setup()
 expect(()=>prepareSubagentTask(opts,'science',0,{agent:'a',contract:{version:1,inputs:[],outputs:[],access:'read-only',requireExecution:false,requireReview:false},handoff:{recentMessages:1}})).toThrow(/科研/)
 opts.captureHandoff=()=>captureHandoff('other',[{id:'u',type:'message',message:{role:'user',content:'other'}}],1)
 expect(()=>prepareSubagentTask(opts,'foreign',0,{agent:'a',handoff:{recentMessages:1}})).toThrow(/其他父会话/)
 expect(readHandoff(join(root,'foreign','0'),'p')).toBeUndefined()
})
it('a repeated foreground call preserves the frozen marker and rejects a missing snapshot',async()=>{
 const {root,opts,captures}=setup(),tool=createSubagentTool(opts),task={agent:'a',task:'task',handoff:{recentMessages:1}}
 expect((await tool.execute('same',task)).isError).not.toBe(true)
 unlinkSync(join(root,'same','0','handoff.json'))
 const result=await tool.execute('same',task)
 expect(result.isError).toBe(true);expect(result.content[0]?.text).toContain('缺失')
 expect(captures()).toBe(1)
})
it('background admission freezes before mailbox execution, then runs the same capsule',async()=>{
 const {root,opts,setSource,captures}=setup(),service=new OrchestrationService(new OrchestrationStore(root,'p'),1)
 const adapter=createSubagentOrchestration(opts,service,()=>{},()=>{})
 const {message}=adapter.start('a','task','background',undefined,{recentMessages:1})
 setSource('later parent text')
 for(let i=0;i<200&&['queued','running'].includes(service.store.message(message.id)!.status);i++)await new Promise(r=>setTimeout(r,5))
 expect(service.store.message(message.id)?.status,JSON.stringify(service.store.message(message.id))).toBe('completed')
 expect(service.store.message(message.id)?.outcome?.output).toContain('保留输入，只读汇总')
 expect(captures()).toBe(1)
 await service.close()
})
it('does not start a queued child if its frozen handoff is lost while waiting',async()=>{
 const {root,opts}=setup(),service=new OrchestrationService(new OrchestrationStore(root,'p'),1)
 opts.orchestration=service
 const blocker=service.register('bot',['blocker'],'blocker');let release!:()=>void
 const gate=new Promise<void>(r=>release=r),blocking=service.run(blocker.id,async()=>{await gate;return{ok:true,output:''}})
 let spawned=0;const factory=opts.childOf;opts.childOf=spec=>{spawned++;return factory(spec)}
 const pending=createSubagentTool(opts).execute('queued',{agent:'a',task:'task',handoff:{recentMessages:1}})
 expect(readHandoff(join(root,'queued','0'),'p')).toBeDefined()
 unlinkSync(join(root,'queued','0','handoff.json'))
 release();await blocking
 const result=await pending
 expect(result.isError).toBe(true);expect(result.content[0]?.text).toContain('快照发生变化')
 expect(spawned).toBe(0)
 expect(service.controlPhase(service.store.list().find(c=>c.label==='a')!.id)).toBe('drained')
 await service.close()
})
it('cancels a queued handoff task without spawning or losing its recovery snapshot',async()=>{
 const {root,opts}=setup(),service=new OrchestrationService(new OrchestrationStore(root,'p'),1)
 opts.orchestration=service
 const blocker=service.register('bot',['blocker'],'blocker');let release!:()=>void
 const gate=new Promise<void>(r=>release=r),blocking=service.run(blocker.id,async()=>{await gate;return{ok:true,output:''}})
 let spawned=0;const factory=opts.childOf;opts.childOf=spec=>{spawned++;return factory(spec)}
 const controller=new AbortController(),pending=createSubagentTool(opts).execute('cancelled',{agent:'a',task:'task',handoff:{recentMessages:1}},controller.signal)
 controller.abort();const result=await pending
 expect(result.isError).toBe(true);expect(spawned).toBe(0)
 const capsule=readHandoff(join(root,'cancelled','0'),'p')!
 expect(读元(join(root,'cancelled','0'))?.handoffSha256).toBe(capsule.sha256)
 const record=service.store.list().find(c=>c.label==='a')!
 expect(record.state).toBe('cancelled');expect(service.controlPhase(record.id)).toBe('drained')
 release();await blocking;await service.close()
})
it('freezes absence too: an existing delegation cannot gain parent history on retry',async()=>{
 const {root,opts,captures}=setup(),tool=createSubagentTool(opts)
 expect((await tool.execute('plain',{agent:'a',task:'task'})).isError).not.toBe(true)
 const result=await tool.execute('plain',{agent:'a',task:'task',handoff:{recentMessages:1}})
 expect(result.isError).toBe(true)
 expect(captures()).toBe(0)
 expect(readHandoff(join(root,'plain','0'),'p')).toBeUndefined()
})
it('background queued handoff loss fails before spawning, even before meta.json exists',async()=>{
 const {root,opts}=setup(),service=new OrchestrationService(new OrchestrationStore(root,'p'),1)
 const blocker=service.register('bot',['blocker'],'blocker');let release!:()=>void
 const gate=new Promise<void>(r=>release=r),blocking=service.run(blocker.id,async()=>{await gate;return{ok:true,output:''}})
 let spawned=0;const factory=opts.childOf;opts.childOf=spec=>{spawned++;return factory(spec)}
 const adapter=createSubagentOrchestration(opts,service,()=>{},()=>{})
 const {message}=adapter.start('a','task','background-loss',undefined,{recentMessages:1})
 expect(读元(join(root,'background-loss','0'))).toBeUndefined()
 unlinkSync(join(root,'background-loss','0','handoff.json'))
 release();await blocking;await adapter.mailbox.settled()
 expect(service.store.message(message.id)?.status).toBe('failed')
 expect(spawned).toBe(0)
 await adapter.mailbox.close()
})
it('recovers the binding from orchestration even if both sidecar and meta are lost',async()=>{
 const {root,opts}=setup();opts.taskStore=new OrchestrationStore(root,'p')
 expect((await createSubagentTool(opts).execute('durable',{agent:'a',task:'task',handoff:{recentMessages:1}})).isError).not.toBe(true)
 rmSync(join(root,'durable','0'),{recursive:true,force:true})
 opts.taskStore=new OrchestrationStore(root,'p')
 expect(()=>prepareSubagentTask(opts,'durable',0,{agent:'a',handoff:{recentMessages:1}})).toThrow(/缺失/)
})
it('does not adopt another child snapshot and meta from the same parent',async()=>{
 const {root,opts,setSource}=setup();opts.taskStore=new OrchestrationStore(root,'p')
 const tool=createSubagentTool(opts),task={agent:'a',task:'task',handoff:{recentMessages:1}}
 expect((await tool.execute('first',task)).isError).not.toBe(true)
 setSource('different authorized context');expect((await tool.execute('second',task)).isError).not.toBe(true)
 for(const name of ['handoff.json','meta.json'])copyFileSync(join(root,'second','0',name),join(root,'first','0',name))
 expect(()=>prepareSubagentTask(opts,'first',0,{agent:'a'})).toThrow(/冲突/)
})
it('does not implicitly inherit an orphan snapshot without a child binding',async()=>{
 const {root,opts}=setup();opts.taskStore=new OrchestrationStore(root,'p')
 freezeHandoff(join(root,'orphan','0'),opts.captureHandoff!({recentMessages:1}))
 const result=await createSubagentTool(opts).execute('orphan',{agent:'a',task:'no history requested'})
 expect(result.isError).toBe(true)
 expect(result.content[0]?.text).toContain('绑定')
})
it('a durable child binding repairs an absent legacy meta marker without recapturing',async()=>{
 const {root,opts,captures}=setup();opts.taskStore=new OrchestrationStore(root,'p')
 const tool=createSubagentTool(opts),task={agent:'a',task:'task',handoff:{recentMessages:1}}
 expect((await tool.execute('repair',task)).isError).not.toBe(true)
 const dir=join(root,'repair','0'),meta=读元(dir)!;delete meta.handoffSha256;写元(dir,meta)
 expect((await tool.execute('repair',task)).isError).not.toBe(true)
 expect(captures()).toBe(1)
 expect(读元(dir)?.handoffSha256).toBe(readHandoff(dir,'p')?.sha256)
})
it('legacy executed children without meta cannot gain new parent context after recovery',()=>{
 const {root,opts,captures}=setup(),store=new OrchestrationStore(root,'p');opts.taskStore=store
 const child=store.register('subagent',['legacy','0'],'a');store.update(child.id,{state:'completed',epoch:1})
 expect(()=>prepareSubagentTask(opts,'legacy',0,{agent:'a',handoff:{recentMessages:1}})).toThrow(/冻结/)
 expect(captures()).toBe(0)
 prepareSubagentTask(opts,'legacy',0,{agent:'a'})
 expect(store.get(child.id)?.handoffSha256).toBeNull()
})
