import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {liveRunOverview,readRunOverview} from '../../src/orchestration/run-overview.js'
import {localTaskOutputReservation} from '../../src/bot/output-locks.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function setup(owner:string,workspace?:string){const root=mkdtempSync(join(tmpdir(),'dawn-explanation-'));roots.push(root);const store=new OrchestrationStore(root,owner);return{root,workspace:workspace??root,store,service:new OrchestrationService(store,1)}}
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);return{promise,release}}
const tick=()=>new Promise<void>(r=>setImmediate(r))
it('explains real cross-parent output contention without releasing a cancelled holder early',async()=>{
 const a=setup('parent-a'),b=setup('parent-b',a.workspace)
 const first=a.service.register('subagent',['call','0'],'writer-a'),second=b.service.register('bot',['team','b','1'],'writer-b')
 const drain=gate(),ctrl=new AbortController();let secondStarted=false
 const one=a.service.run(first.id,async signal=>{const release=await localTaskOutputReservation(a.workspace,['result.json'],signal);try{await drain.promise;return{ok:true,output:'private model output'}}finally{release()}},ctrl.signal)
 await tick()
 const two=b.service.run(second.id,async signal=>{const release=await localTaskOutputReservation(b.workspace,['result.json'],signal);try{secondStarted=true;return{ok:true,output:'b'}}finally{release()}})
 try{
  await tick()
  expect(liveRunOverview(b.service).runs[0]).toMatchObject({activity:{stage:'lock-wait',blockers:[{ownerSessionId:'parent-a',childId:first.id,label:'writer-a',epoch:1}]}})
  ctrl.abort();await tick();expect(secondStarted).toBe(false)
  expect(liveRunOverview(a.service).runs[0]?.phase).toBe('stopping')
  expect(a.store.history().events.some(event=>event.type==='cancel-requested')).toBe(true)
 }finally{drain.release();await Promise.all([one,two]);await Promise.all([a.service.close(),b.service.close()])}
 expect(secondStarted).toBe(true)
 expect(liveRunOverview(b.service).runs[0]?.timing?.lockWaitMs).toBeGreaterThanOrEqual(0)
 const snapshot=liveRunOverview(a.service)
 expect(snapshot.history?.events.map(e=>e.type)).toContain('settled')
 expect(JSON.stringify(snapshot.history)).not.toContain('private model output')
})
it('an observation write failure cannot leak locks or turn a finished backend into a failed task',async()=>{
 const{workspace,store,service}=setup('p'),child=service.register('subagent',['c','0'],'reader')
 vi.spyOn(store,'observeStage').mockImplementationOnce(()=>{throw new Error('observer unavailable')})
 const result=await service.run(child.id,async signal=>{const release=await localTaskOutputReservation(workspace,['out'],signal);release();return{ok:true,output:'done'}})
 expect(result.ok).toBe(true);expect(liveRunOverview(service).observationIssue).toContain('观察')
 const release=await localTaskOutputReservation(workspace,['out'],new AbortController().signal);release();await service.close()
})
it('preserves the actual path spelling in wait facts while reservation aliases still serialize',async()=>{
 const a=setup('path-holder'),b=setup('path-waiter',a.workspace)
 const first=a.service.register('subagent',['call','0'],'holder'),second=b.service.register('subagent',['call','0'],'waiter')
 const drain=gate();let started=false
 const one=a.service.run(first.id,async signal=>{const release=await localTaskOutputReservation(a.workspace,['results/cafe\u0301.json'],signal);try{await drain.promise;return{ok:true,output:''}}finally{release()}})
 await tick()
 const two=b.service.run(second.id,async signal=>{const release=await localTaskOutputReservation(b.workspace,['Results/Caf\u00e9.JSON'],signal);try{started=true;return{ok:true,output:''}}finally{release()}})
 try{
  await tick();expect(started).toBe(false)
  expect(liveRunOverview(b.service).runs[0]?.activity?.resources).toEqual([join(realpathSync(a.workspace),'Results/Caf\u00e9.JSON')])
 }finally{drain.release();await Promise.all([one,two]);await Promise.all([a.service.close(),b.service.close()])}
 expect(started).toBe(true)
})
it('retains bounded ordered facts, rejects stale stage observations and cold inspection stays read-only',async()=>{
 const {root,store,service}=setup('p'),child=service.register('subagent',['call','0'],'reader')
 for(let n=0;n<90;n++)await service.run(child.id,async()=>({ok:true,output:'secret task text'}))
 const file=join(root,'orchestration/state.json'),before=readFileSync(file,'utf8'),cold=readRunOverview(root,'p')
 expect(cold.history?.events.length).toBeLessThanOrEqual(256)
 expect(cold.history?.truncated).toBe(true)
 expect(new Set(cold.history?.events.map(e=>e.seq)).size).toBe(cold.history?.events.length)
 expect(readFileSync(file,'utf8')).toBe(before)
 expect(JSON.stringify(cold.history)).not.toContain('secret task text')
 expect(store.observeStage(child.id,1,'execution')).toBe(false)
 expect(readFileSync(file,'utf8')).toBe(before)
 await service.close()
})
