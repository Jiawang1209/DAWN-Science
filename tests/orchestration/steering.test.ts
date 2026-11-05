import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function setup(){const root=mkdtempSync(join(tmpdir(),'steer-'));roots.push(root);const store=new OrchestrationStore(root,'parent'),service=new OrchestrationService(store);const child=service.register('subagent',['call','0'],'reader');return{root,store,service,child}}
async function running(){const x=setup();let finish!:()=>void;const gate=new Promise<void>(resolve=>finish=resolve);const run=x.service.run(x.child.id,async()=>{await gate;return{ok:true,output:'done'}});return{...x,finish,run}}
it('records accepted separately from applied, deduplicates per target, fences stale epochs',async()=>{
 const x=await running();const sent:unknown[]=[];const epoch=x.store.get(x.child.id)!.epoch
 const detach=x.service.attachSteering(x.child.id,epoch,request=>{sent.push(request)})
 const receipt=await x.service.steer(x.child.id,'one','correct this',1);expect(receipt.status).toBe('accepted');expect(sent).toHaveLength(1)
 expect(await x.service.steer(x.child.id,'one','correct this',1)).toEqual(receipt);expect(sent).toHaveLength(1)
 await expect(x.service.steer(x.child.id,'one','different',1)).rejects.toThrow(/conflict/)
 expect(x.service.applySteering(x.child.id,epoch-1,receipt.id)).toBe(false)
 expect(x.service.applySteering(x.child.id,epoch,receipt.id)).toBe(true)
 expect(x.store.steeringReceipts(x.child.id)[0]?.status).toBe('applied');detach();x.finish();await x.run;await x.service.close()
})
it('interrupt and close invalidate pending receipts before backend drain',async()=>{
 const x=await running();x.service.attachSteering(x.child.id,1,()=>{});await x.service.steer(x.child.id,'one','correct',1)
 x.service.interrupt(x.child.id);expect(x.store.steeringReceipts(x.child.id)[0]?.status).toBe('interrupted');expect(x.service.canSteer(x.child.id)).toBe(false)
 expect(x.service.applySteering(x.child.id,1,x.store.steeringReceipts(x.child.id)[0]!.id)).toBe(false)
 const closing=x.service.close();await expect(x.service.steer(x.child.id,'two','late',1)).rejects.toThrow();x.finish();await x.run;await closing
})
it('restart never replays accepted steering and cannot attach obsolete generation',async()=>{
 const x=await running();x.service.attachSteering(x.child.id,1,()=>{});await x.service.steer(x.child.id,'one','correct',1)
 const restored=new OrchestrationStore(x.root,'parent');expect(restored.steeringReceipts(x.child.id)[0]?.status).toBe('interrupted')
 const next=new OrchestrationService(restored);expect(next.canSteer(x.child.id)).toBe(false);expect(()=>next.attachSteering(x.child.id,1,()=>{})).toThrow()
 x.finish();await x.run;await x.service.close();await next.close()
})
it('rejects unsupported, inactive, oversized, overflow and frozen scientific targets',async()=>{
 const x=await running();await expect(x.service.steer(x.child.id,'no','x',1)).rejects.toThrow(/capab|支持/)
 x.service.attachSteering(x.child.id,1,()=>{});await expect(x.service.steer(x.child.id,'huge','x'.repeat(17000),1)).rejects.toThrow()
 for(let i=0;i<8;i++)await x.service.steer(x.child.id,String(i),'x',1)
 await expect(x.service.steer(x.child.id,'overflow','x',1)).rejects.toThrow(/limit|上限/)
 x.finish();await x.run;await x.service.close()
})
it('same requestId on different children does not collide',async()=>{
 const x=await running(),other=x.service.register('subagent',['other','0'],'reader');let end!:()=>void;const run=x.service.run(other.id,async()=>{await new Promise<void>(r=>end=r);return{ok:true,output:'x'}})
 x.service.attachSteering(x.child.id,1,()=>{});x.service.attachSteering(other.id,1,()=>{});const a=await x.service.steer(x.child.id,'same','x',1),b=await x.service.steer(other.id,'same','x',1);expect(a.id).not.toBe(b.id);x.finish();end();await Promise.all([x.run,run]);await x.service.close()
})
it('refuses frozen science even if a backend adapter exists',async()=>{
 const {resolveTaskSettings}=await import('../../src/subagent/task-tools.js');const {TaskContractSchema}=await import('../../src/orchestration/task-contract.js')
 const x=await running();x.store.bindTask(x.child.id,resolveTaskSettings(TaskContractSchema.parse({}),'allow-all'))
 x.service.attachSteering(x.child.id,1,()=>{});expect(x.service.canSteer(x.child.id)).toBe(false)
 await expect(x.service.steer(x.child.id,'contract-change','new task',1)).rejects.toThrow(/冻结.*停止.*新批次/)
 expect(x.store.steeringReceipts(x.child.id)).toEqual([]);x.finish();await x.run;await x.service.close()
})
it('cancelling queued work for the same child does not invalidate its active steering',async()=>{
 const x=await running();x.service.attachSteering(x.child.id,1,()=>{});const receipt=await x.service.steer(x.child.id,'first','correct',1)
 const ctrl=new AbortController(),queued=x.service.run(x.child.id,async()=>({ok:true,output:'never'}),ctrl.signal);ctrl.abort();await queued
 expect(x.service.canSteer(x.child.id)).toBe(true);expect(x.service.applySteering(x.child.id,1,receipt.id)).toBe(true)
 x.finish();await x.run;await x.service.close()
})
it('receipt persistence failure cannot prevent close from aborting and draining the backend',async()=>{
 const {vi}=await import('vitest');const x=setup();let aborted=false
 const run=x.service.run(x.child.id,async signal=>{await new Promise<void>(done=>signal.addEventListener('abort',()=>{aborted=true;done()},{once:true}));return{ok:false,output:''}})
 x.service.attachSteering(x.child.id,1,()=>{});await x.service.steer(x.child.id,'pending','correct',1)
 const spy=vi.spyOn(x.store,'settleSteering').mockImplementation(()=>{throw Error('disk unavailable')})
 const closing=x.service.close();expect(aborted).toBe(true);await run;await expect(closing).rejects.toThrow(/persistence/);spy.mockRestore()
})
it('late events from an earlier run cannot apply to the next run of the same target',async()=>{
 const x=await running();x.service.attachSteering(x.child.id,1,()=>{});const old=await x.service.steer(x.child.id,'old','old',1);x.finish();await x.run
 let finish!:()=>void;const run=x.service.run(x.child.id,async()=>{await new Promise<void>(done=>finish=done);return{ok:true,output:''}})
 x.service.attachSteering(x.child.id,2,()=>{});const next=await x.service.steer(x.child.id,'next','next',2)
 expect(x.service.applySteering(x.child.id,1,next.id)).toBe(false);expect(x.service.applySteering(x.child.id,1,old.id)).toBe(false)
 expect(x.store.steeringReceipts(x.child.id).map(receipt=>receipt.status)).toEqual(['interrupted','accepted']);expect((await x.service.steer(x.child.id,'old','old',1)).status).toBe('interrupted');await expect(x.service.steer(x.child.id,'old','old',2)).rejects.toThrow(/conflict/);finish();await run;await x.service.close()
})
it('restored receipt identities must belong to the same durable target and epoch',async()=>{
 const {readFileSync,writeFileSync}=await import('node:fs');const x=await running();x.service.attachSteering(x.child.id,1,()=>{});await x.service.steer(x.child.id,'one','x',1)
 const file=join(x.root,'orchestration','state.json'),state=JSON.parse(readFileSync(file,'utf8'));state.steering[0].epoch=2;writeFileSync(file,JSON.stringify(state))
 expect(()=>new OrchestrationStore(x.root,'parent')).toThrow(/steering identity/);x.finish();await x.run;await x.service.close()
})
it('an inspected old execution epoch cannot send a new correction to a later run',async()=>{
 const x=await running();x.service.attachSteering(x.child.id,1,()=>{});const inspected=x.store.get(x.child.id)!.epoch
 x.finish();await x.run;let finish!:()=>void;const delivered:unknown[]=[]
 const run=x.service.run(x.child.id,async()=>{await new Promise<void>(done=>finish=done);return{ok:true,output:''}})
 x.service.attachSteering(x.child.id,2,receipt=>{delivered.push(receipt)})
 try{
  await expect(x.service.steer(x.child.id,'stale-control','old intent',inspected)).rejects.toThrow(/Stale.*epoch/)
  expect(delivered).toEqual([]);expect(x.store.steeringReceipts(x.child.id)).toEqual([])
 }finally{finish();await run;await x.service.close()}
})
it('reports stopping until an aborted backend actually drains',async()=>{
 const x=await running();expect(x.service.controlPhase(x.child.id)).toBe('running');x.service.interrupt(x.child.id)
 expect(x.service.controlPhase(x.child.id)).toBe('stopping');x.finish();await x.run;expect(x.service.controlPhase(x.child.id)).toBe('drained');await x.service.close()
})
