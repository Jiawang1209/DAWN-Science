import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {readRunOverview,liveRunOverview} from '../../src/orchestration/run-overview.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function setup(){const root=mkdtempSync(join(tmpdir(),'dawn-overview-'));roots.push(root);const store=new OrchestrationStore(root,'p');return{root,store,service:new OrchestrationService(store,1)}}
it('reads queued, stopping and drained from the live coordinator without releasing capacity',async()=>{
 const {store,service}=setup(),a=service.register('subagent',['call','0'],'reader'),b=service.register('bot',['team','b','1'],'bot')
 let release!:()=>void;const gate=new Promise<void>(r=>release=r),controller=new AbortController()
 const first=service.run(a.id,async()=>{await gate;return{ok:true,output:'private raw output'}},controller.signal)
 const second=service.run(b.id,async()=>({ok:true,output:''}))
 expect(liveRunOverview(service).runs.map(r=>r.phase)).toEqual(['running','queued'])
 controller.abort()
 expect(liveRunOverview(service).runs[0]?.phase).toBe('stopping')
 expect(store.get(b.id)?.state).toBe('queued')
 release();await first;await second
 expect(liveRunOverview(service).runs.every(r=>r.phase==='drained')).toBe(true)
 expect(JSON.stringify(liveRunOverview(service))).not.toContain('private raw output')
 await service.close()
})
it('cold inspection does not recover or rewrite running records and rejects wrong owner',()=>{
 const {root,store}=setup(),child=store.register('team',['t','member'],'scientist')
 store.update(child.id,{state:'running',epoch:1});const file=join(root,'orchestration/state.json'),before=readFileSync(file,'utf8')
 expect(readRunOverview(root,'p').runs[0]).toMatchObject({state:'running',phase:'unknown'})
 expect(readFileSync(file,'utf8')).toBe(before)
 expect(()=>readRunOverview(root,'another')).toThrow()
 const data=JSON.parse(before);data.children[0].id='forged';writeFileSync(file,JSON.stringify(data))
 expect(()=>readRunOverview(root,'p')).toThrow()
})
it('missing state is empty while corrupt state is reported',()=>{
 const {root}=setup();expect(readRunOverview(root,'p').runs).toEqual([])
 const {root:bad,store}=setup();store.register('subagent',['x','0'],'x')
 writeFileSync(join(bad,'orchestration/state.json'),'{broken')
 expect(()=>readRunOverview(bad,'p')).toThrow()
})
it('cold reads reject foreign event and budget identities rather than displaying another execution',()=>{
 const {root,service,store}=setup(),child=service.register('subagent',['call','0'],'reader')
 store.configureBudget({maxRuns:2},0);store.beginRun(child.id)
 const file=join(root,'orchestration/state.json'),original=readFileSync(file,'utf8'),state=JSON.parse(original)
 state.events[0].childId='foreign-child';writeFileSync(file,JSON.stringify(state))
 expect(()=>readRunOverview(root,'p')).toThrow()
 const other=JSON.parse(original);other.budget.active[0].childId='foreign-child';writeFileSync(file,JSON.stringify(other))
 expect(()=>readRunOverview(root,'p')).toThrow()
})
it('persists trace and full host receipt for cold inspection, but hides previous settlement while rerunning',async()=>{
 const {root,service}=setup(),child=service.register('subagent',['call','0'],'reader')
 const trace={records:[{toolCallId:'r',name:'read',status:'done' as const,execution:'not_observed' as const,path:'in.csv'}],omitted:0}
 const receipt={version:1 as const,state:'blocked' as const,summary:'needs input',reason:'missing unit',deliverables:[]}
 await service.run(child.id,async()=>({ok:false,output:'',trace,receipt}))
 expect(readRunOverview(root,'p').runs[0]).toMatchObject({taskReceipt:receipt,trace})
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 const rerun=service.run(child.id,async()=>{await gate;return{ok:true,output:''}})
 expect(liveRunOverview(service).runs[0]?.taskReceipt).toBeUndefined()
 expect(liveRunOverview(service).runs[0]?.trace).toBeUndefined()
 release();await rerun;await service.close()
})
it('cold cancellation diagnostics need a matching settled epoch and never recover previous-run traces as current',()=>{
 const {root,store}=setup(),child=store.register('subagent',['call','0'],'reader')
 const trace={records:[{toolCallId:'r1',name:'read',status:'done' as const,execution:'not_observed' as const}],omitted:0}
 store.update(child.id,{state:'cancelled',epoch:1,result:{ok:false,output:'',trace}})
 const file=join(root,'orchestration/state.json'),before=readFileSync(file,'utf8')
 expect(readRunOverview(root,'p').runs[0]?.trace).toEqual(trace);expect(readFileSync(file,'utf8')).toBe(before)
 store.update(child.id,{state:'running',epoch:2})
 new OrchestrationStore(root,'p')
 expect(readRunOverview(root,'p').runs[0]).toMatchObject({state:'interrupted'})
 expect(readRunOverview(root,'p').runs[0]?.trace).toBeUndefined()
 const bad=JSON.parse(readFileSync(file,'utf8'));bad.children[0].resultEpoch=3;writeFileSync(file,JSON.stringify(bad))
 expect(()=>readRunOverview(root,'p')).toThrow()
})
it('records the exact Team attempt atomically at admission and leaves aborted queued attempts unbound',async()=>{
 const {root,service}=setup(),child=service.register('team',['team-a','reader','generation'],'reader')
 const a={teamId:'team-a',taskId:'task-a',attemptId:'attempt-a',attempt:1},b={teamId:'team-a',taskId:'task-b',attemptId:'attempt-b',attempt:1}
 let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve}),controller=new AbortController()
 const first=service.run(child.id,async()=>{await hold;return{ok:true,output:''}},undefined,a)
 const queued=service.run(child.id,async()=>{throw Error('must not run')},controller.signal,b)
 controller.abort();await queued;release();await first
 await service.run(child.id,async()=>({ok:true,output:''}),undefined,{...a,attemptId:'resumed',attempt:2})
 const snapshot=readRunOverview(root,'p')
 expect(snapshot.history?.events.filter(event=>event.taskAttempt).map(event=>[event.type,event.epoch,event.taskAttempt?.attemptId])).toEqual([['started',1,'attempt-a'],['started',2,'resumed']])
 await service.close()
})
