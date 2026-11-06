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
