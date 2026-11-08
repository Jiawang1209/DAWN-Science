import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import {团队调度器} from '../../src/team/scheduler.js'
import {读团队,写团队,团队目录} from '../../src/team/state.js'
import * as versions from '../../src/artifacts/task-versions.js'
const roots:string[]=[]
afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
async function setup(){
 const root=mkdtempSync(join(tmpdir(),'dawn-plan-bind-'));roots.push(root)
 mkdirSync(join(root,'.dawn/agents'),{recursive:true});writeFileSync(join(root,'.dawn/agents/worker.md'),'---\nname: worker\ndescription: fixture worker\ntools: read, write\n---\nFrozen worker role')
 writeFileSync(join(root,'input.csv'),'x\n1\n')
 const rt=new NativeRuntime({subagentChildEntry:'/fixture/unused-child.mjs',credentials:{read:async()=>({type:'api_key' as const,key:'offline'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}}})
 const spec={sessionId:'owner',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}}
 await rt.start(spec);await rt.setConfigOption('owner','dawn.plan','1')
 const session=(rt as any).sessions.get('owner').session
 const result=await session.getToolDefinition('propose_plan').execute('proposal',{title:'Frozen assignment',plan:'## 问题与假设\nfixture\n## 数据与切分\ninput.csv\n## 统计检验与模型\ncopy\n## 图\nnone\n## 产物\n`output.csv`',arrangement:{dispatch:'team-v1',mode:'single',rationale:'One copy',independentReview:false,questions:[],tasks:[{id:'copy',title:'Copy',goal:'Copy input',role:'writer',inputs:['input.csv'],outputs:['output.csv'],dependencies:[],acceptance:'Declared file produced',review:false,execution:{agent:'worker',contract:{version:1,inputs:['input.csv'],outputs:['output.csv'],access:'workspace-write',submission:'tool',requireExecution:false,requireReview:false}}}]}})
 expect(result.isError).not.toBe(true)
 return{root,rt,spec}
}
it('approval freezes without scheduling; explicit execution is bound and repeated starts do not replay',async()=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue(),{rt,root,spec}=await setup()
 try{
  const approval=await rt.answerPlan('owner','proposal','approve')
  expect(approval.executionTeamId).toMatch(/^plan_/);expect(kick).not.toHaveBeenCalled()
  const first=await rt.answerPlan('owner','proposal','execute'),again=await rt.answerPlan('owner','proposal','execute')
  expect(first.executionTeamId).toBe(approval.executionTeamId);expect(again).toEqual(first);expect(kick).toHaveBeenCalledTimes(1)
  const team=读团队(团队目录(spec.sessionDir,first.executionTeamId!))!
  expect(team.captainSessionId).toBe('owner');expect(team.members[0]!.frozenAgentDefinition!.name).toBe('worker')
  expect(JSON.stringify(await rt.history('owner'))).not.toContain('Frozen worker role')
  expect(readFileSync(join(root,approval.savedPath!),'utf8')).toContain('执行绑定：team-v1')
 }finally{await rt.stop('owner')}
})
it('blocks changed external bytes before creating or starting children',async()=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue(),{rt,root}=await setup()
 try{await rt.answerPlan('owner','proposal','approve');writeFileSync(join(root,'input.csv'),'x\n2\n');await expect(rt.answerPlan('owner','proposal','execute')).rejects.toThrow(/版本/);expect(kick).not.toHaveBeenCalled()}finally{await rt.stop('owner')}
})
it.each(['abort','scoped-stop'])('a late %s during input verification cannot create a team or start a child',async stop=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue(),{rt,spec}=await setup()
 try{
  const approval=await rt.answerPlan('owner','proposal','approve')
  let release!:()=>void,entered!:()=>void
  const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r)
  vi.spyOn(versions,'assertFileVersions').mockImplementationOnce(async()=>{entered();await wait})
  const start=rt.answerPlan('owner','proposal','execute');const failure=expect(start).rejects.toThrow(/取消/)
  await ready;if(stop==='abort')await rt.abort('owner');else await rt.answerPlan('owner','proposal','stop');release();await failure
  expect(kick).not.toHaveBeenCalled();expect(读团队(团队目录(spec.sessionDir,approval.executionTeamId!))).toBeUndefined()
 }finally{await rt.stop('owner')}
})
it('after restart pending work stays paused until an explicit execution action',async()=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue(),{rt,spec}=await setup()
 try{
  const approval=await rt.answerPlan('owner','proposal','approve');await rt.answerPlan('owner','proposal','execute');await rt.stop('owner')
  kick.mockClear();await rt.start({...spec,resume:true})
  expect(kick).not.toHaveBeenCalled();expect(读团队(团队目录(spec.sessionDir,approval.executionTeamId!))!.approvedPlanPaused).toBe(true)
  await rt.answerPlan('owner','proposal','execute');expect(kick).toHaveBeenCalledTimes(1)
 }finally{await rt.stop('owner')}
})
it('a failed durable approval restores the proposed record so it can be approved again',async()=>{
 const{rt}=await setup()
 try{
  const book=(rt as any).方案簿们.get('owner').簿,save=vi.spyOn(book,'存').mockImplementationOnce(()=>{throw new Error('fixture disk error')})
  await expect(rt.answerPlan('owner','proposal','approve')).rejects.toThrow('fixture disk error')
  save.mockRestore()
  await expect(rt.answerPlan('owner','proposal','approve')).resolves.toHaveProperty('executionTeamId')
 }finally{await rt.stop('owner')}
})
it('persists approval and leaving plan mode as one transaction',async()=>{
 const{rt}=await setup()
 try{const book=(rt as any).方案簿们.get('owner').簿,save=vi.spyOn(book,'存');await rt.answerPlan('owner','proposal','approve');expect(book.阶段).toBe('off');expect(save).toHaveBeenCalledTimes(1)}finally{await rt.stop('owner')}
})
it('explicit stop targets only this approved team and leaves pending tasks paused',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt,spec}=await setup()
 try{const a=await rt.answerPlan('owner','proposal','approve');await rt.answerPlan('owner','proposal','execute');await rt.answerPlan('owner','proposal','stop');expect(读团队(团队目录(spec.sessionDir,a.executionTeamId!))!.approvedPlanPaused).toBe(true)}finally{await rt.stop('owner')}
})
it('stopping remains available after a plan leaves the current branch, while restarting is refused',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt,spec}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve');await rt.answerPlan('owner','proposal','execute');(rt as any).方案簿们.get('owner').簿.只留(new Set())
  await expect(rt.answerPlan('owner','proposal','stop')).resolves.toHaveProperty('executionTeamId',a.executionTeamId)
  expect(读团队(团队目录(spec.sessionDir,a.executionTeamId!))!.approvedPlanPaused).toBe(true)
  await expect(rt.answerPlan('owner','proposal','execute')).rejects.toThrow(/当前分支/)
 }finally{await rt.stop('owner')}
})
it('explicitly ending a paused arrangement cancels pending work, preserving the archived task record',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt,spec}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve');await rt.answerPlan('owner','proposal','execute');await rt.answerPlan('owner','proposal','stop');await rt.answerPlan('owner','proposal','finish')
  const team=读团队(团队目录(spec.sessionDir,a.executionTeamId!))!;expect(team.finishedAt).toBeTypeOf('number');expect(team.tasks).toHaveLength(1);expect(team.tasks[0]!.status).toBe('cancelled')
  await expect(rt.answerPlan('owner','proposal','execute')).rejects.toThrow(/结束/)
 }finally{await rt.stop('owner')}
})

it.each(['team_remove_member','team_reassign','team_finish'])('refuses %s before cancelling or changing a bound team',async name=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt,spec}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve');await rt.answerPlan('owner','proposal','execute')
  const before=readFileSync(join(团队目录(spec.sessionDir,a.executionTeamId!),'team.json'),'utf8')
  const stop=vi.spyOn(团队调度器.prototype,'中止'),stopAll=vi.spyOn(团队调度器.prototype,'中止全部')
  const tool=(rt as any).sessions.get('owner').session.getToolDefinition(name)
  const result=await tool.execute('legacy',{name:'member_1',taskId:'plan_1',to:'captain'})
  expect(result.isError).toBe(true);expect(stop).not.toHaveBeenCalled();expect(stopAll).not.toHaveBeenCalled()
  expect(readFileSync(join(团队目录(spec.sessionDir,a.executionTeamId!),'team.json'),'utf8')).toBe(before)
 }finally{await rt.stop('owner')}
})
it('a failed initial current-team pointer write remains paused and can be explicitly retried',async()=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue(),{rt,spec}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve')
  mkdirSync(join(spec.sessionDir,'teams/current'),{recursive:true})
  await expect(rt.answerPlan('owner','proposal','execute')).rejects.toThrow(/指针/)
  rmSync(join(spec.sessionDir,'teams/current'),{recursive:true})
  expect(读团队(团队目录(spec.sessionDir,a.executionTeamId!))!.approvedPlanPaused).toBe(true)
  expect(kick).not.toHaveBeenCalled()
  await rt.answerPlan('owner','proposal','execute')
  expect(readFileSync(join(spec.sessionDir,'teams/current'),'utf8')).toBe(a.executionTeamId);expect(kick).toHaveBeenCalledTimes(1)
 }finally{await rt.stop('owner')}
})
it('refuses a team pointer change during asynchronous input verification',async()=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue(),{rt,spec}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve');let release!:()=>void,entered!:()=>void
  const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r)
  vi.spyOn(versions,'assertFileVersions').mockImplementationOnce(async()=>{entered();await wait})
  const start=rt.answerPlan('owner','proposal','execute'),failure=expect(start).rejects.toThrow(/团队.*变化|团队.*改变/)
  await ready;(rt as any).botTeams.get('owner').current.id='other-team';release();await failure
  expect(kick).not.toHaveBeenCalled();expect(读团队(团队目录(spec.sessionDir,a.executionTeamId!))).toBeUndefined()
 }finally{(rt as any).botTeams.get('owner').current.id=undefined;await rt.stop('owner')}
})
it('refuses Bot dispatch while approved execution is verifying its inputs',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt}=await setup()
 rt.configureBots({list:()=>[{id:'b',name:'b',role:'r',instructions:'i',enabled:true}],run:async()=>({ok:true,output:''}),result:()=>{}})
 try{
  await rt.answerPlan('owner','proposal','approve');let release!:()=>void,entered!:()=>void
  const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r)
  vi.spyOn(versions,'assertFileVersions').mockImplementationOnce(async()=>{entered();await wait})
  const start=rt.answerPlan('owner','proposal','execute');await ready
  const control=(rt as any).botTeams.get('owner'),create=vi.spyOn(control,'create').mockResolvedValue(undefined)
  try{await expect(rt.dispatchBotTask('owner','b','work')).rejects.toThrow(/方案/);expect(create).not.toHaveBeenCalled()}finally{release();await start}
 }finally{await rt.stop('owner')}
})

it('a pending Bot team creation blocks plan execution until it settles',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt}=await setup()
 rt.configureBots({list:()=>[{id:'b',name:'b',role:'r',instructions:'i',enabled:true}],run:async()=>({ok:true,output:''}),result:()=>{}})
 try{
  await rt.answerPlan('owner','proposal','approve');let release!:()=>void,entered!:()=>void
  const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r),original=(rt as any).runtime.bind(rt)
  vi.spyOn(rt as any,'runtime').mockImplementationOnce(async()=>{entered();await wait;return original()})
  const dispatch=rt.dispatchBotTask('owner','b','work');await ready
  try{await expect(rt.answerPlan('owner','proposal','execute')).rejects.toThrow(/Bot/)}finally{release();await dispatch}
 }finally{await rt.stop('owner')}
})
it.each(['abort','restart'])('late Bot creation after %s cannot publish a team or launch work',async action=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue(),{rt,spec}=await setup()
 rt.configureBots({list:()=>[{id:'b',name:'b',role:'r',instructions:'i',enabled:true}],run:async()=>({ok:true,output:''}),result:()=>{}})
 try{
  await rt.answerPlan('owner','proposal','approve');let release!:()=>void,entered!:()=>void
  const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r),original=(rt as any).runtime.bind(rt)
  vi.spyOn(rt as any,'runtime').mockImplementationOnce(async()=>{entered();await wait;return original()})
  const dispatch=rt.dispatchBotTask('owner','b','work'),failure=expect(dispatch).rejects.toThrow(/取消/);await ready
  if(action==='abort')await rt.abort('owner');else{await rt.stop('owner');await rt.start({...spec,resume:true})}
  release();await failure
  expect((rt as any).botTeams.get('owner').current.id).toBeUndefined();expect(kick).not.toHaveBeenCalled()
 }finally{await rt.stop('owner')}
})

it('ending a bound arrangement preserves status access and permits the old create-team entry',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve');await rt.answerPlan('owner','proposal','execute');await rt.answerPlan('owner','proposal','finish')
  const session=(rt as any).sessions.get('owner').session
  expect((await session.getToolDefinition('team_status').execute('status',{})).isError).not.toBe(true)
  const created=await session.getToolDefinition('team_create').execute('new-team',{name:'Legacy team',goal:'Continue ordinary work',members:[{name:'worker',agent:'worker'}]})
  expect(created.isError).not.toBe(true);expect((rt as any).botTeams.get('owner').current.id).not.toBe(a.executionTeamId)
 }finally{await rt.stop('owner')}
})
it('a failure after publishing pauses the team and explicit retry kicks pending work exactly once',async()=>{
 const kick=vi.spyOn(团队调度器.prototype,'踢一下').mockRejectedValueOnce(new Error('fixture admission failure')).mockResolvedValue(),{rt,spec}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve');await expect(rt.answerPlan('owner','proposal','execute')).rejects.toThrow('fixture admission failure')
  expect(读团队(团队目录(spec.sessionDir,a.executionTeamId!))!.approvedPlanPaused).toBe(true)
  expect(读团队(团队目录(spec.sessionDir,a.executionTeamId!))!.approvedPlanPauseReason).toContain('fixture admission failure')
  await rt.answerPlan('owner','proposal','execute');await rt.answerPlan('owner','proposal','execute');expect(kick).toHaveBeenCalledTimes(2)
 }finally{await rt.stop('owner')}
})
it('never overwrites a recovered team record changed while verifying versions',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt,spec}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve');await rt.answerPlan('owner','proposal','execute');await rt.answerPlan('owner','proposal','stop')
  let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r)
  vi.spyOn(versions,'assertFileVersions').mockImplementationOnce(async()=>{entered();await wait})
  const start=rt.answerPlan('owner','proposal','execute'),failure=expect(start).rejects.toThrow(/团队.*变化/);await ready
  const dir=团队目录(spec.sessionDir,a.executionTeamId!),team=读团队(dir)!;team.approvedPlanPauseReason='newer durable observation';写团队(dir,team);release();await failure
  expect(读团队(dir)!.approvedPlanPauseReason).toBe('newer durable observation')
 }finally{await rt.stop('owner')}
})
it('executor definitions and tool scope remain the approved snapshot after on-disk edits',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue();const{rt,spec,root}=await setup()
 try{
  const a=await rt.answerPlan('owner','proposal','approve'),snapshot=(rt as any).方案簿们.get('owner').簿.执行快照('proposal')
  writeFileSync(join(root,'.dawn/agents/worker.md'),'---\nname: worker\ndescription: changed\ntools: bash, read, write\n---\nAltered role')
  await rt.answerPlan('owner','proposal','execute');const team=读团队(团队目录(spec.sessionDir,a.executionTeamId!))!
  expect(team.members[0]!.frozenAgentDefinition!.systemPrompt).toBe('Frozen worker role')
  expect(team.tasks[0]!.settings).toEqual(snapshot.frozenTasks[0].settings);expect(team.tasks[0]!.settings!.scope.tools).not.toContain('bash')
 }finally{await rt.stop('owner')}
})
