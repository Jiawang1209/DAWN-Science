import {expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {completedVersionedPipeline} from '../helpers/versioned-science.js'
import {startScienceBatch,advanceScienceBatch,recoverScienceBatch,resumeScienceBatch,cancelScienceBatch,activateDerivedBatch} from '../../src/team/science-batch.js'
import {领取,结算,写团队} from '../../src/team/state.js'
import * as TeamState from '../../src/team/state.js'
import {团队调度器} from '../../src/team/scheduler.js'
import {pipelineCheckpointVersions,assertPipelineVersions} from '../../src/team/science-pipeline-versions.js'
function receiptsForReuse(versions:import('../../src/protocol/file-versions.js').FileVersion[]){return{version:1 as const,state:'accepted' as const,summary:'fixture',deliverables:[],versions:{version:1 as const,inputs:versions,outputs:versions}}}
import type {团队} from '../../src/team/types.js'

it.each(['observer','persistence'] as const)('a %s failure aborts every sibling and leaves no ownerless attempt after drain',async fault=>{
 const {root,team,receipts}=await fixture()
 for(const member of team.members)if(member.name!=='aggregate')member.botId='fixture-'+member.name
 let finishFirst!:(value:any)=>void,finishSibling!:(value:any)=>void,triggered=false
 const first=new Promise<any>(resolve=>{finishFirst=resolve}),sibling=new Promise<any>(resolve=>{finishSibling=resolve})
 const signals:AbortSignal[]=[],originalWrite=TeamState.写团队
 const inject=(snapshot:团队)=>{if(!triggered&&snapshot.scienceBatch?.items[0]?.checkpoint?.stage==='analyze'){triggered=true;throw new Error('injected '+fault+' failure')}}
 const scheduler=new 团队调度器({sessionDir:root,定义:()=>[],跑:{context:{cwd:root,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},memberRunner:async run=>{signals.push(run.signal);return run.member.name==='check'?first:sibling},onChange:snapshot=>{if(fault==='observer')inject(snapshot)}})
 写团队(scheduler.dir(team.id),team)
 const writer=vi.spyOn(TeamState,'写团队').mockImplementation((dir,snapshot)=>{if(fault==='persistence')inject(snapshot);originalWrite(dir,snapshot)})
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  await scheduler.踢一下(team.id);await vi.waitFor(()=>expect(signals).toHaveLength(2))
  finishFirst({ok:true,output:'trusted fixture',receipt:receipts[0]})
  await vi.waitFor(()=>expect(scheduler.读(team.id).scienceBatch?.status).toBe('interrupted'))
  expect(signals[1]?.aborted).toBe(true);expect(scheduler.hasActiveTeam(team.id)).toBe(true)
  expect(()=>resumeScienceBatch(scheduler.读(team.id),true)).toThrow(/排空/)
  finishSibling({ok:true,output:'late success must not publish',receipt:receipts[0]})
  await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
  const drained=scheduler.读(team.id)
  expect(drained.tasks[1]?.receipt?.state).not.toBe('accepted')
  expect(drained.tasks.some(task=>['claimed','in_progress'].includes(task.status))).toBe(false)
  expect(()=>resumeScienceBatch(drained,true)).not.toThrow()
 }finally{
  finishFirst({ok:false,output:''});finishSibling({ok:false,output:''})
  await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
  writer.mockRestore();errors.mockRestore();rmSync(root,{recursive:true,force:true})
 }
})

it.each(['notification','read-after-claim'] as const)('a %s failure before backend admission closes only the owned claim and pauses the batch',async fault=>{
 const {root,team}=await fixture();for(const member of team.members)if(member.name!=='aggregate')member.botId='fixture-'+member.name
 let finish!:(value:any)=>void,triggered=false,failNextRead=false
 const backend=new Promise<any>(resolve=>{finish=resolve}),signals:AbortSignal[]=[]
 const scheduler=new 团队调度器({sessionDir:root,定义:()=>[],跑:{context:{cwd:root,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},memberRunner:async run=>{signals.push(run.signal);return backend},onChange:snapshot=>{
  if(!triggered&&snapshot.tasks.find(task=>task.id===snapshot.scienceBatch?.items[1]?.checkpoint?.currentTaskId)?.status==='claimed'){
   triggered=true;if(fault==='notification')throw new Error('injected claimed notification failure');failNextRead=true
  }
 }})
 写团队(scheduler.dir(team.id),team)
 const originalRead=scheduler.读.bind(scheduler),reader=vi.spyOn(scheduler,'读').mockImplementation(id=>{if(failNextRead){failNextRead=false;throw new Error('injected claimed read failure')}return originalRead(id)})
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  await expect(scheduler.踢一下(team.id)).rejects.toThrow(/injected claimed/);await vi.waitFor(()=>expect(scheduler.读(team.id).scienceBatch?.status).toBe('interrupted'))
  expect(signals).toHaveLength(1);expect(signals[0]?.aborted).toBe(true)
  expect(scheduler.读(team.id).tasks[1]?.status).toBe('failed');expect(scheduler.读(team.id).tasks[1]?.attemptId).toBeUndefined();expect(scheduler.hasActiveTeam(team.id)).toBe(true)
  expect(()=>resumeScienceBatch(scheduler.读(team.id),true)).toThrow(/排空/)
  finish({ok:false,output:'drained'});await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
  const paused=scheduler.读(team.id);expect(paused.tasks.some(task=>['claimed','in_progress'].includes(task.status))).toBe(false);expect(()=>resumeScienceBatch(paused,true)).not.toThrow()
 }finally{finish({ok:false,output:''});await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false));reader.mockRestore();errors.mockRestore();rmSync(root,{recursive:true,force:true})}
})
async function fixture(){const root=mkdtempSync(join(tmpdir(),'batch-parallel-'));const {team}=await completedVersionedPipeline(root),p=structuredClone(team.pipeline!),receipts=team.tasks.map(t=>t.receipt!);team.tasks=[];delete team.pipeline;const items=['a','b','c'].map(id=>({id,label:id,definition:{...p.definition,outputs:[id+'.csv']}}));startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},items,['summary.json','summary.md'],undefined,Date.now(),2);return{root,team,receipts}}
function settle(team:团队,id:string,receipt:NonNullable<团队['tasks'][number]['receipt']>){const task=team.tasks.find(t=>t.id===id)!,attempt=领取(team,id,task.assignee!);结算(team,id,attempt.attemptId,{ok:true,output:'fixture',receipt});advanceScienceBatch(team)}
it('bounds active items at two and advances independent stages without a batch-wide barrier',async()=>{const {root,team,receipts}=await fixture();try{expect(team.tasks).toHaveLength(2);expect(team.scienceBatch?.concurrency).toBe(2);const a=team.scienceBatch!.items[0]!,b=team.scienceBatch!.items[1]!;expect(a.checkpoint?.stage).toBe('check');expect(b.checkpoint?.stage).toBe('check');expect(a.definition.members.check).not.toBe(b.definition.members.check);expect(a.definition.members.review).not.toBe(b.definition.members.review);settle(team,a.checkpoint!.currentTaskId,receipts[0]!);expect(a.checkpoint?.stage).toBe('analyze');expect(b.checkpoint?.stage).toBe('check');settle(team,a.checkpoint!.currentTaskId,receipts[1]!);expect(a.checkpoint?.stage).toBe('review');expect(pipelineCheckpointVersions(team)?.some(v=>v.path==='out.csv')).toBe(true);settle(team,a.checkpoint!.currentTaskId,receipts[2]!);expect(a.completed?.status).toBe('completed');expect(team.scienceBatch?.items[2]?.checkpoint?.stage).toBe('check');expect(team.scienceBatch?.aggregateTaskIds).toHaveLength(0)}finally{rmSync(root,{recursive:true,force:true})}})
it('blocks the entire batch and closes queued siblings before any summary on a failed item',async()=>{const {root,team}=await fixture();try{const a=team.scienceBatch!.items[0]!,task=team.tasks.find(t=>t.id===a.checkpoint!.currentTaskId)!,attempt=领取(team,task.id,task.assignee!);结算(team,task.id,attempt.attemptId,{ok:false,output:'bad input'});advanceScienceBatch(team);expect(team.scienceBatch?.status).toBe('blocked');expect(team.tasks[1]?.status).toBe('cancelled');expect(team.scienceBatch?.items[2]?.checkpoint).toBeUndefined();expect(team.scienceBatch?.aggregateTaskIds).toHaveLength(0)}finally{rmSync(root,{recursive:true,force:true})}})
it('pauses every active checkpoint, refuses resume while any old attempt runs, then resumes only unfinished stages',async()=>{const {root,team,receipts}=await fixture();try{const a=team.scienceBatch!.items[0]!,b=team.scienceBatch!.items[1]!;settle(team,a.checkpoint!.currentTaskId,receipts[0]!);const task=team.tasks.find(t=>t.id===b.checkpoint!.currentTaskId)!,attempt=领取(team,task.id,task.assignee!);recoverScienceBatch(team);expect([a,b].every(i=>i.checkpoint?.status==='interrupted')).toBe(true);const before=JSON.stringify(team);expect(()=>resumeScienceBatch(team,true)).toThrow(/排空/);expect(JSON.stringify(team)).toBe(before);结算(team,task.id,attempt.attemptId,{ok:false,output:'stopped'});expect(()=>resumeScienceBatch(team,false)).toThrow(/acknowledge/);resumeScienceBatch(team,true);expect(a.checkpoint?.stage).toBe('analyze');expect(b.checkpoint?.taskIds).toHaveLength(2);expect(team.scienceBatch?.status).toBe('running')}finally{rmSync(root,{recursive:true,force:true})}})
it('cancels all checkpoints and never starts a pending item on later reducer ticks',async()=>{const {root,team}=await fixture();try{cancelScienceBatch(team);advanceScienceBatch(team);expect(team.scienceBatch?.status).toBe('cancelled');expect(team.scienceBatch?.items.slice(0,2).every(i=>i.checkpoint?.status==='cancelled')).toBe(true);expect(team.scienceBatch?.items[2]?.checkpoint).toBeUndefined();expect(team.tasks.every(t=>t.status==='cancelled')).toBe(true)}finally{rmSync(root,{recursive:true,force:true})}})

it('validates accepted analysis bytes in a hidden reviewing checkpoint before recovery',async()=>{const {root,team,receipts}=await fixture();try{
 const hidden=team.scienceBatch!.items[1]!;settle(team,hidden.checkpoint!.currentTaskId,receipts[0]!);settle(team,hidden.checkpoint!.currentTaskId,receipts[1]!)
 expect(team.pipeline?.stage).toBe('check');expect(hidden.checkpoint?.stage).toBe('review');recoverScienceBatch(team)
 await expect(assertPipelineVersions(team,root)).resolves.toBeUndefined();writeFileSync(join(root,'out.csv'),'n\n999\n')
 await expect(assertPipelineVersions(team,root)).rejects.toThrow();expect(team.scienceBatch?.status).toBe('interrupted')
 }finally{rmSync(root,{recursive:true,force:true})}})

it('stopping the hidden readonly member pauses every checkpoint rather than only the displayed item',async()=>{const {root,team}=await fixture();try{
 const hidden=team.scienceBatch!.items[1]!,member=hidden.definition.members.check
 const scheduler=new 团队调度器({sessionDir:root,定义:()=>[],跑:{context:{cwd:root,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},onChange:()=>{}})
 写团队(scheduler.dir(team.id),team);scheduler.中止(team.id,member)
 const paused=scheduler.读(team.id);expect(paused.scienceBatch?.status).toBe('interrupted');expect(paused.scienceBatch?.items.slice(0,2).every(i=>i.checkpoint?.status==='interrupted')).toBe(true)
 }finally{rmSync(root,{recursive:true,force:true})}})

it('a failed lane cancels and drains a sibling even when its backend returns a late success',async()=>{const {root,team}=await fixture();let finishSibling:(value:any)=>void=()=>{},failFirst:(value:any)=>void=()=>{};try{
 const first=new Promise<any>(resolve=>{failFirst=resolve}),sibling=new Promise<any>(resolve=>{finishSibling=resolve}),signals:AbortSignal[]=[]
 for(const m of team.members)if(m.name!=='aggregate')m.botId='fixture-'+m.name
 const scheduler=new 团队调度器({sessionDir:root,定义:()=>[],跑:{context:{cwd:root,provider:'p',model:'m'},childOf:()=>({command:'unused',args:[]})},memberRunner:async run=>{signals.push(run.signal);return run.member.name==='check'?first:sibling},onChange:()=>{}})
 写团队(scheduler.dir(team.id),team);await scheduler.踢一下(team.id);await vi.waitFor(()=>expect(signals).toHaveLength(2))
 failFirst({ok:false,output:'',error:'failed first item'});await vi.waitFor(()=>expect(scheduler.读(team.id).scienceBatch?.status).toBe('blocked'))
 expect(signals[1]?.aborted).toBe(true);expect(scheduler.hasActiveTeam(team.id)).toBe(true)
 finishSibling({ok:true,output:'must not publish late success'});await vi.waitFor(()=>expect(scheduler.hasActiveTeam(team.id)).toBe(false))
 const final=scheduler.读(team.id);expect(final.tasks[1]?.status).toBe('cancelled');expect(final.scienceBatch?.items[1]?.completed).toBeUndefined();expect(final.scienceBatch?.aggregateTaskIds).toHaveLength(0)
 }finally{failFirst({ok:false,output:''});finishSibling({ok:false,output:''});rmSync(root,{recursive:true,force:true})}})

it('rebases an all-reused parallel display to the new frozen route before final CAS',async()=>{const {root,team}=await fixture();try{const b=team.scienceBatch!;for(const item of b.items){item.completed={...structuredClone(b.items[0]!.checkpoint!),status:'completed',routeSync:'applied'};item.definition.route={...item.definition.route,revision:99}}const history=b.items.map((item,index)=>{const task={...structuredClone(team.tasks[0]!),id:'history-'+index,status:'completed' as const,contract:{...team.tasks[0]!.contract!,resultType:'model-metrics' as const},receipt:receiptsForReuse(item.definition.initialVersions!)};item.completed!.taskIds=[task.id];item.completed!.currentTaskId=task.id;return task});activateDerivedBatch(team,history);expect(team.pipeline?.definition.route.revision).toBe(99);expect(team.pipeline?.requestId).toBe('batch:c');expect(team.pipeline?.routeSync).toBe('pending');expect(b.aggregateTaskIds).toHaveLength(1);advanceScienceBatch(team);expect(b.aggregateTaskIds).toHaveLength(1)}finally{rmSync(root,{recursive:true,force:true})}})
