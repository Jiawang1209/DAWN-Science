import {it,expect,afterEach,vi} from 'vitest'
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {currentExecutionContext} from '../../src/orchestration/execution-context.js'
import {liveRunOverview,readRunOverview,publicRunOverview} from '../../src/orchestration/run-overview.js'
import {observeAgentContext} from '../../src/runtime/agent-context-sampler.js'
import {RunOverviewSchema} from '../../src/protocol/run-overview.js'
const roots:string[]=[];afterEach(()=>roots.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})))
const setup=(owner='owner')=>{const dir=mkdtempSync(join(tmpdir(),'dawn-p14-d1-store-'));roots.push(dir);const store=new OrchestrationStore(dir,owner);return{dir,store,service:new OrchestrationService(store)}}
const gate=()=>{let release!:()=>void;const promise=new Promise<void>(r=>release=r);return{promise,release}}
const sample=(observedAt=10,model='m')=>({version:1,availability:'available',source:'sdk-estimate',observedAt,provider:'p',model,usedTokens:0} as const)
it('binds ordinary execution without taskSettings/steering and only invalidates observation',async()=>{
 const {store,service,dir}=setup(),child=store.register('subagent',['ordinary'],'ordinary'),wait=gate();let report!:(s:unknown)=>void
 const running=service.run(child.id,async()=>{report=currentExecutionContext()!.bindContextRoute!({provider:'p',model:'m'});await wait.promise;return{ok:true,output:'done'}})
 const before=store.get(child.id)!,budget=store.budget(),revision=service.revision,observation=service.observation.revision
 report(sample());const view=liveRunOverview(service).runs[0]!
 expect(view.contextObservation).toMatchObject({current:true,reason:'current',sample:{ownerSessionId:'owner',childId:child.id,epoch:1,sample:{usedTokens:0}}})
 expect(service.revision).toBe(revision);expect(service.observation.revision).toBeGreaterThan(observation);expect(store.budget()).toEqual({...budget,elapsedMs:expect.any(Number)})
 expect(store.get(child.id)?.updatedAt).toBe(before.updatedAt);expect(store.get(child.id)?.activity).toEqual(before.activity);expect(store.get(child.id)?.timing).toEqual(before.timing);expect(store.get(child.id)?.result).toBeUndefined();expect(store.get(child.id)?.settings).toBeUndefined()
 const file=join(dir,'orchestration/state.json'),bytes=readFileSync(file,'utf8'),stamp=service.observation
 expect(readRunOverview(dir,'owner').runs[0]?.contextObservation).toMatchObject({current:false,reason:'historical'})
 expect(RunOverviewSchema.safeParse(publicRunOverview(liveRunOverview(service))).success).toBe(true)
 liveRunOverview(service);readRunOverview(dir,'owner');expect(readFileSync(file,'utf8')).toBe(bytes);expect(service.observation).toEqual(stamp)
 wait.release();await running;expect(liveRunOverview(service).runs[0]?.contextObservation).toMatchObject({current:false,reason:'historical'});report(sample(999));expect(store.get(child.id)?.contextObservation?.sample.observedAt).toBe(10);await service.close()
})
it('isolates owner/child/epoch/route and rejects invalid, stale, late, out-of-order samples',async()=>{
 const {store,service}=setup(),child=store.register('bot',['t','b','1'],'bot'),wait=gate();let bind!:NonNullable<ReturnType<typeof currentExecutionContext>>['bindContextRoute'];let old!:(s:unknown)=>void
 const run=service.run(child.id,async()=>{bind=currentExecutionContext()!.bindContextRoute;old=bind!({provider:'p',model:'m'});await wait.promise;return{ok:true,output:''}})
 old(sample(10));old(sample(9));old({...sample(20),ownerSessionId:'foreign'});old(sample(30,'foreign'));expect(store.get(child.id)?.contextObservation?.sample.observedAt).toBe(10)
 bind!({provider:'p',model:'m'});expect(service.contextObservation(child.id)).toMatchObject({current:false,reason:'awaiting-sample'});
 const fresh=bind!({provider:'p',model:'new'});expect(liveRunOverview(service).runs[0]?.contextObservation).toMatchObject({current:false,reason:'route-changed'});old(sample(100));fresh(sample(20,'new'));expect(store.get(child.id)?.contextObservation?.sample).toMatchObject({observedAt:20,model:'new'})
 fresh({version:1,availability:'unknown',source:'unknown',provider:'p',model:'new',observedAt:21,reason:'sdk-unavailable'});expect(liveRunOverview(service).runs[0]?.contextObservation).toMatchObject({current:true,sample:{sample:{availability:'unknown'}}});expect(store.get(child.id)?.contextObservation?.sample).not.toHaveProperty('usedTokens')
 service.interrupt(child.id);fresh(sample(40,'new'));expect(liveRunOverview(service).runs[0]?.contextObservation?.current).toBe(false);expect(store.get(child.id)?.contextObservation?.sample.observedAt).toBe(21)
 wait.release();await run
 const next=gate();const rerun=service.run(child.id,async()=>{bind=currentExecutionContext()!.bindContextRoute;bind!({provider:'p',model:'new'});await next.promise;return{ok:true,output:''}});fresh(sample(100,'new'));expect(liveRunOverview(service).runs[0]?.contextObservation).toMatchObject({current:false,reason:'awaiting-sample'});next.release();await rerun;await service.close()
})
it('persists only bound history and refuses foreign durable identities; old schema stays compatible',async()=>{
 const {dir,store,service}=setup(),child=store.register('team',['t','a','1'],'a')
 await service.run(child.id,async()=>{currentExecutionContext()!.bindContextRoute!({provider:'p',model:'m'})(sample());return{ok:true,output:''}});await service.close()
 expect(new OrchestrationStore(dir,'owner').get(child.id)?.contextObservation?.sample).toMatchObject({usedTokens:0})
 const file=join(dir,'orchestration/state.json'),state=JSON.parse(readFileSync(file,'utf8'));state.children[0].contextObservation.ownerSessionId='foreign';writeFileSync(file,JSON.stringify(state));expect(()=>readRunOverview(dir,'owner')).toThrow(/context|identity|owner/i)
 delete state.children[0].contextObservation;writeFileSync(file,JSON.stringify(state));expect(readRunOverview(dir,'owner').runs[0]).not.toHaveProperty('contextObservation')
})
it('accepts changed samples within one millisecond in bound reporter order while duplicate and older readings do not write',async()=>{
 const {store,service,dir}=setup(),child=store.register('subagent',['same-ms'],'same-ms'),wait=gate();let report!:(s:unknown)=>void
 const running=service.run(child.id,async()=>{report=currentExecutionContext()!.bindContextRoute!({provider:'p',model:'m'});await wait.promise;return{ok:true,output:''}})
 report({version:1,availability:'unknown',source:'unknown',observedAt:10,provider:'p',model:'m',reason:'sdk-unavailable'})
 report(sample(10));expect(store.get(child.id)?.contextObservation?.sample).toMatchObject({availability:'available',usedTokens:0})
 const file=join(dir,'orchestration/state.json'),bytes=readFileSync(file,'utf8'),revision=service.observation.revision
 report(sample(10));report({...sample(9),usedTokens:999});expect(readFileSync(file,'utf8')).toBe(bytes);expect(service.observation.revision).toBe(revision)
 wait.release();await running;await service.close()
})

it('a fresh same-route reporter admits its equal-time duplicate as current without persistence or execution changes',async()=>{
 const {store,service,dir}=setup(),child=store.register('subagent',['duplicate-lease'],'duplicate-lease'),wait=gate()
 let bind!:NonNullable<NonNullable<ReturnType<typeof currentExecutionContext>>['bindContextRoute']>
 const running=service.run(child.id,async()=>{bind=currentExecutionContext()!.bindContextRoute!;await wait.promise;return{ok:true,output:''}})
 const message={role:'assistant',provider:'p',model:'m',stopReason:'stop',usage:{totalTokens:20},content:[{type:'text',text:'visible'}]}
 let listener!:(event:unknown)=>void
 const session={state:{model:{id:'m',provider:'p',contextWindow:100},systemPrompt:'system',tools:[],messages:[message]},getContextUsage:()=>({tokens:20}),sessionManager:{getBranch:()=>[{type:'message',message}]},subscribe:(cb:typeof listener)=>{listener=cb;return()=>{}}}
 const now=vi.spyOn(Date,'now').mockReturnValue(10)
 let stop=()=>{}
 try{
  const old=bind({provider:'p',model:'m'});stop=observeAgentContext(session,old)
  expect(service.contextObservation(child.id).current).toBe(true);stop()
  const fresh=bind({provider:'p',model:'m'})
  expect(service.contextObservation(child.id)).toMatchObject({current:false,reason:'awaiting-sample'})
  const file=join(dir,'orchestration/state.json'),bytes=readFileSync(file,'utf8'),generation=service.revision,budget=store.budget(),stamp=service.observation.revision
  stop=observeAgentContext(session,fresh)
  expect(service.contextObservation(child.id)).toMatchObject({current:true,reason:'current'})
  expect(service.observation.revision).toBe(stamp+1);expect(service.revision).toBe(generation);expect(store.budget()).toEqual(budget);expect(readFileSync(file,'utf8')).toBe(bytes)
  now.mockReturnValue(11);listener({type:'turn_end'});await Promise.resolve()
  expect(service.contextObservation(child.id).current).toBe(true);expect(service.observation.revision).toBe(stamp+1);expect(readFileSync(file,'utf8')).toBe(bytes)
  const pending=bind({provider:'p',model:'m'}),pendingStamp=service.observation.revision
  old({...sample(100),usedTokens:999});pending({...sample(9),usedTokens:999})
  expect(service.contextObservation(child.id)).toMatchObject({current:false,reason:'awaiting-sample'});expect(service.observation.revision).toBe(pendingStamp);expect(readFileSync(file,'utf8')).toBe(bytes)
 }finally{stop();now.mockRestore();wait.release();await running;await service.close()}
})
