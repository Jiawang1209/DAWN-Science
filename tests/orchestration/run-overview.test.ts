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

it('projects settled resultEpoch so consumers can distinguish retained earlier results',async()=>{
 const {service}=setup(),child=service.register('subagent',['call','0'],'reader')
 await service.run(child.id,async()=>({ok:true,output:'',receipt:{version:1,state:'accepted',summary:'done',deliverables:[]}}))
 expect(liveRunOverview(service).runs[0]).toMatchObject({epoch:1,resultEpoch:1})
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 const rerun=service.run(child.id,async()=>{await gate;return{ok:true,output:''}})
 expect(liveRunOverview(service).runs[0]).toMatchObject({epoch:2})
 expect(liveRunOverview(service).runs[0]?.resultEpoch).toBeUndefined()
 release();await rerun;await service.close()
})

it('includes stable live observation and active task proof without read mutations',async()=>{
 const {service}=setup(),child=service.register('team',['t','m','1'],'m');let release!:()=>void
 const run=service.run(child.id,async()=>{await new Promise<void>(r=>release=r);return{ok:true,output:''}},undefined,{teamId:'t',taskId:'x',attemptId:'a',attempt:1})
 const a=liveRunOverview(service),b=liveRunOverview(service)
 expect(a.observation).toEqual(service.observation);expect(b).toEqual(a);expect(a.runs[0]?.taskAttempt?.attemptId).toBe('a')
 release();await run;await service.close()
})
it('reads owned current teams without legacy migration even when orchestration state is absent',async()=>{
 const {mkdirSync,readdirSync}=await import('node:fs'),{建团队,加成员}=await import('../../src/team/state.js')
 const root=mkdtempSync(join(tmpdir(),'dawn-pure-team-'));roots.push(root)
 const team=建团队({id:'t',name:'team',goal:'g',captainSessionId:'p'});加成员(team,{name:'m',agent:'a',botId:'bot',botScopeKey:'scope'})
 delete team.botOriginScopeKey
 const stamped={...team,botOwnerContext:{key:'forged',workspace:'/private'}}
 mkdirSync(join(root,'teams','t'),{recursive:true});writeFileSync(join(root,'teams','current'),'t');writeFileSync(join(root,'teams','t','team.json'),JSON.stringify(stamped))
 const before=readFileSync(join(root,'teams','t','team.json'),'utf8'),files=readdirSync(root,{recursive:true})
 const view=readRunOverview(root,'p');expect(view.team?.id).toBe('t');expect(view.team?.botOwnerContext).toBeUndefined();expect(view.runs).toEqual([])
 expect(readFileSync(join(root,'teams','t','team.json'),'utf8')).toBe(before);expect(readdirSync(root,{recursive:true})).toEqual(files)
 expect(readRunOverview(root,'other')).toMatchObject({team:null,teamIssue:expect.any(String)})
 for(const pointer of ['../t','a/b','a\\b','.', '..','x\0y']){writeFileSync(join(root,'teams','current'),pointer);expect(readRunOverview(root,'p')).toMatchObject({team:null,teamIssue:expect.any(String)})}
 writeFileSync(join(root,'teams','current'),'t');writeFileSync(join(root,'teams','t','team.json'),'{private broken payload')
 expect(readRunOverview(root,'p')).toMatchObject({team:null,teamIssue:expect.not.stringContaining('private')})
})
it('bounds current pointer leaves and treats malformed raw teams and pointer read failures as issues',async()=>{
 const {mkdirSync}=await import('node:fs'),{readCurrentTeamSnapshot}=await import('../../src/team/read-current-snapshot.js')
 const root=mkdtempSync(join(tmpdir(),'dawn-pure-invalid-team-'));roots.push(root);mkdirSync(join(root,'teams','t'),{recursive:true})
 // The in-memory pointer is validated before attempting any disk team read.
 expect(readCurrentTeamSnapshot(root,'p',{id:'x'.repeat(256)})).toMatchObject({team:null,teamIssue:expect.any(String)})
 for(const raw of [null,1,'secret',[],{id:'other',captainSessionId:'p'},{id:'t',captainSessionId:'p',pipeline:{private:'invalid'}}]){
  writeFileSync(join(root,'teams','current'),'t');writeFileSync(join(root,'teams','t','team.json'),JSON.stringify(raw))
  const before=readFileSync(join(root,'teams','t','team.json'),'utf8')
  expect(readRunOverview(root,'p')).toMatchObject({team:null,teamIssue:expect.any(String)})
  expect(readFileSync(join(root,'teams','t','team.json'),'utf8')).toBe(before)
 }
 rmSync(join(root,'teams','current'));mkdirSync(join(root,'teams','current'))
 expect(readCurrentTeamSnapshot(root,'p')).toMatchObject({team:null,teamIssue:expect.any(String)})
})
for(const field of ['pipeline','scienceBatch'])for(const value of [null,false,0,''])it(`rejects explicitly malformed falsy ${field}=${JSON.stringify(value)} without rewriting the team`,async()=>{
 const {mkdirSync,readdirSync}=await import('node:fs'),{建团队}=await import('../../src/team/state.js'),{readCurrentTeamSnapshot}=await import('../../src/team/read-current-snapshot.js')
 const root=mkdtempSync(join(tmpdir(),'dawn-pure-falsy-team-'));roots.push(root);mkdirSync(join(root,'teams','t'),{recursive:true})
 const base=建团队({id:'t',name:'legacy',goal:'g',captainSessionId:'p'}),file=join(root,'teams','t','team.json')
 writeFileSync(join(root,'teams','current'),'t');writeFileSync(file,JSON.stringify(base))
 expect(readCurrentTeamSnapshot(root,'p')).toMatchObject({team:{id:'t'}})
 writeFileSync(file,JSON.stringify({...base,[field]:value}));const before=readFileSync(file),files=readdirSync(root,{recursive:true})
 expect(readCurrentTeamSnapshot(root,'p')).toMatchObject({team:null,teamIssue:'当前团队记录不可读取或身份不匹配'})
 expect(readFileSync(file)).toEqual(before);expect(readdirSync(root,{recursive:true})).toEqual(files)
})
