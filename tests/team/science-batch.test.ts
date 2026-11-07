import {expect,it} from 'vitest'
import {completedVersionedPipeline} from '../helpers/versioned-science.js'
import {startScienceBatch,advanceScienceBatch,recoverScienceBatch,resumeScienceBatch} from '../../src/team/science-batch.js'
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path'
it('archives an accepted item and atomically queues only the next namespaced frozen item',async()=>{
 const root=mkdtempSync(join(tmpdir(),'batch-reducer-'));try{
 const {team}=await completedVersionedPipeline(root),p=structuredClone(team.pipeline!);team.tasks=[];Reflect.deleteProperty(team,'pipeline')
 startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},[{id:'a',label:'A',definition:p.definition},{id:'b',label:'B',definition:{...p.definition,outputs:['b.csv']}}],['summary.json','summary.md'])
 expect(team.pipeline?.currentTaskId).toContain('a-check');expect(team.tasks).toHaveLength(1)
 team.pipeline={...p,requestId:'batch:a'};advanceScienceBatch(team)
 expect(team.scienceBatch?.index).toBe(1);expect(team.scienceBatch?.items[0]?.completed?.status).toBe('completed');expect(team.pipeline?.currentTaskId).toContain('b-check')
 const frozen=structuredClone(team.scienceBatch?.items[1]?.settingsByStage);recoverScienceBatch(team);expect(team.scienceBatch?.status).toBe('interrupted');resumeScienceBatch(team,false);expect(team.scienceBatch?.status).toBe('running');expect(team.pipeline?.settingsByStage).toEqual(frozen)
 team.pipeline!.status='blocked';advanceScienceBatch(team);expect(team.scienceBatch?.status).toBe('blocked');expect(team.scienceBatch?.items[1]?.completed).toBeUndefined()
 }finally{rmSync(root,{recursive:true,force:true})}
})
it.each([27,32])('accepts a %i-character item ID throughout all three stages without oversized task IDs',async size=>{
 const {advancePipeline}=await import('../../src/team/science-pipeline.js'),{领取,结算}=await import('../../src/team/state.js')
 const root=mkdtempSync(join(tmpdir(),'batch-long-id-'));try{
 const {team}=await completedVersionedPipeline(root),p=structuredClone(team.pipeline!),receipts=team.tasks.map(t=>t.receipt!);team.tasks=[];Reflect.deleteProperty(team,'pipeline')
 startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},[{id:'a'.repeat(size),label:'long',definition:p.definition}],['summary.json','summary.md'])
 for(const receipt of receipts){const task=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,attempt=领取(team,task.id,task.assignee!);结算(team,task.id,attempt.attemptId,{ok:true,output:'fixture',receipt});advancePipeline(team)}
 expect(team.pipeline?.status).toBe('completed');expect(team.tasks.every(t=>t.id.length<=40)).toBe(true)
 }finally{rmSync(root,{recursive:true,force:true})}
})

it('projects complete serial batch task membership after a member moves to the next item',async()=>{
 const {advancePipeline}=await import('../../src/team/science-pipeline.js'),{领取,结算}=await import('../../src/team/state.js')
 const {publicScienceBatch,ScienceBatchSummarySchema}=await import('../../src/protocol/science-batch.js'),{taskTeamSnapshot}=await import('../../src/team/task-snapshot.js')
 const {selectCollaborationOutcome}=await import('../../src/ui/collaboration-outcome.js')
 const root=mkdtempSync(join(tmpdir(),'batch-membership-'))
 try{
  const {team}=await completedVersionedPipeline(root),p=structuredClone(team.pipeline!),receipts=team.tasks.map(t=>t.receipt!)
  team.tasks=[];delete team.pipeline
  startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},[{id:'one',label:'One',definition:p.definition},{id:'two',label:'Two',definition:{...p.definition,outputs:['two.csv']}}],['summary.json','summary.md'])
  for(const receipt of receipts){const task=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,attempt=领取(team,task.id,task.assignee!);结算(team,task.id,attempt.attemptId,{ok:true,output:'fixture',receipt});advancePipeline(team)}
  const oldAnalysis=team.tasks.find(t=>t.contract?.resultType==='model-metrics')!
  advanceScienceBatch(team)
  const check=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,attempt=领取(team,check.id,check.assignee!);结算(team,check.id,attempt.attemptId,{ok:true,output:'fixture',receipt:receipts[0]!});advancePipeline(team)
  const current=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,currentAttempt=领取(team,current.id,current.assignee!)
  const standalone={...structuredClone(oldAnalysis),id:'standalone',attemptId:'standalone-attempt'};team.tasks.push(standalone)
  const projected=publicScienceBatch(team.scienceBatch!,team.pipeline)
  expect(projected.taskIds).toEqual(expect.arrayContaining([oldAnalysis.id,current.id]))
  expect(projected.taskIds).not.toContain(standalone.id)
  const parallel=structuredClone(team.scienceBatch!);parallel.concurrency=2;parallel.items[1]!.checkpoint=structuredClone(team.pipeline!);parallel.aggregateTaskIds=['summary-earlier','summary-current'];parallel.aggregateTaskId='summary-current'
  const parallelProjection=publicScienceBatch(parallel)
  expect(parallelProjection.taskIds).toEqual(expect.arrayContaining([oldAnalysis.id,current.id,'summary-earlier','summary-current']))
  expect(new Set(parallelProjection.taskIds).size).toBe(parallelProjection.taskIds?.length)
  expect(ScienceBatchSummarySchema.safeParse(parallelProjection).success).toBe(true)
  expect(ScienceBatchSummarySchema.safeParse(projected).success).toBe(true)
  expect(publicScienceBatch(team.scienceBatch!).taskIds).toBeUndefined()
  expect(publicScienceBatch(team.scienceBatch!,{...team.pipeline!,requestId:'foreign-request'}).taskIds).toBeUndefined()
  expect(publicScienceBatch(team.scienceBatch!,{...team.pipeline!,definition:p.definition}).taskIds).toBeUndefined()
  const snapshot={ownerSessionId:team.captainSessionId,source:'live' as const,team:taskTeamSnapshot(team),history:{events:[],truncated:true},runs:[{id:'member',kind:'team' as const,label:'member moved',address:[team.id,current.assignee!,'generation'],state:'running' as const,phase:'running' as const,epoch:5,updatedAt:1,contract:true,inputVersions:1,outputVersions:0,taskAttempt:{teamId:team.id,taskId:current.id,attemptId:currentAttempt.attemptId,attempt:current.attempt}}]}
  expect(selectCollaborationOutcome(snapshot,{kind:'task',teamId:team.id,taskId:oldAnalysis.id})).toMatchObject({state:'accepted',acceptanceScope:'stage',artifacts:[{scope:'stage',version:oldAnalysis.receipt!.versions!.outputs[0]}]})
  expect(selectCollaborationOutcome(snapshot,{kind:'task',teamId:team.id,taskId:standalone.id})).toMatchObject({state:'accepted',acceptanceScope:'final'})
  const legacy=structuredClone(snapshot);delete legacy.team.scienceBatch!.taskIds
  expect(selectCollaborationOutcome(legacy,{kind:'task',teamId:team.id,taskId:oldAnalysis.id})).toMatchObject({state:'accepted',acceptanceScope:'stage'})
 }finally{rmSync(root,{recursive:true,force:true})}
})

async function navigationBatch(concurrency:1|2){
 const root=mkdtempSync(join(tmpdir(),'batch-navigation-')),fixture=await completedVersionedPipeline(root),team=fixture.team
 const definition=structuredClone(team.pipeline!.definition),receipts=team.tasks.map(task=>task.receipt!)
 team.tasks=[];delete team.pipeline
 startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},[{id:'one',label:'One',definition},{id:'two',label:'Two',definition:{...definition,outputs:['two.csv']}}],['summary.json','summary.md'],undefined,Date.now(),concurrency)
 return{root,team,receipts}
}
it.each([1,2] as const)('navigates to the actual blocked batch item with concurrency %i and keeps stopping higher priority',async concurrency=>{
 const {advancePipeline}=await import('../../src/team/science-pipeline.js'),{领取,结算}=await import('../../src/team/state.js')
 const {taskTeamSnapshot}=await import('../../src/team/task-snapshot.js'),{RunOverviewSchema}=await import('../../src/protocol/run-overview.js'),{selectCollaborationOutcome}=await import('../../src/ui/collaboration-outcome.js')
 const {root,team}=await navigationBatch(concurrency)
 try{
  const failedId=concurrency===1?team.pipeline!.currentTaskId:team.scienceBatch!.items[1]!.checkpoint!.currentTaskId,failed=team.tasks.find(task=>task.id===failedId)!
  const stoppingTask=concurrency===2?team.tasks.find(task=>task.id===team.pipeline!.currentTaskId)!:failed
  const stoppingAttempt=concurrency===2?领取(team,stoppingTask.id,stoppingTask.assignee!):undefined
  const attempt=领取(team,failed.id,failed.assignee!)
  结算(team,failed.id,attempt.attemptId,{ok:false,output:'Missing units',receipt:{version:1,state:'blocked',summary:'Missing units',reason:'Missing units in failed item',deliverables:[]}})
  if(concurrency===1)advancePipeline(team)
  advanceScienceBatch(team)
  const snapshot=RunOverviewSchema.parse({ownerSessionId:team.captainSessionId,source:'live',team:taskTeamSnapshot(team),runs:[]})
  expect(selectCollaborationOutcome(snapshot)).toMatchObject({state:'blocked',action:'inspect-feedback',actionTarget:{selectionKey:`task:${JSON.stringify([team.id,failed.id])}`}})
  if(concurrency===2)expect(team.pipeline!.currentTaskId).not.toBe(failed.id)
  snapshot.runs=[{id:'draining',kind:'team',label:'draining',address:[team.id,stoppingTask.assignee!,'generation'],state:'cancelled',phase:'stopping',epoch:1,updatedAt:1,contract:true,inputVersions:0,outputVersions:0,taskAttempt:{teamId:team.id,taskId:stoppingTask.id,attemptId:stoppingAttempt?.attemptId??attempt.attemptId,attempt:stoppingTask.attempt}}]
  expect(selectCollaborationOutcome(snapshot)).toMatchObject({state:'stopping',action:'wait-for-drain',actionTarget:{selectionKey:`task:${JSON.stringify([team.id,stoppingTask.id])}`}})
 }finally{rmSync(root,{recursive:true,force:true})}
})
it('preserves aggregate navigation for active summary work and its blocked receipt',async()=>{
 const {advancePipeline}=await import('../../src/team/science-pipeline.js'),{领取,结算}=await import('../../src/team/state.js')
 const {taskTeamSnapshot}=await import('../../src/team/task-snapshot.js'),{RunOverviewSchema}=await import('../../src/protocol/run-overview.js'),{selectCollaborationOutcome}=await import('../../src/ui/collaboration-outcome.js')
 const {root,team,receipts}=await navigationBatch(1)
 try{
  for(let item=0;item<2;item++){
   for(const receipt of receipts){const task=team.tasks.find(task=>task.id===team.pipeline!.currentTaskId)!,attempt=领取(team,task.id,task.assignee!);结算(team,task.id,attempt.attemptId,{ok:true,output:'fixture',receipt});advancePipeline(team)}
   advanceScienceBatch(team)
  }
  const summary=team.tasks.find(task=>task.id===team.scienceBatch!.aggregateTaskId)!,key=`task:${JSON.stringify([team.id,summary.id])}`
  const snapshot=()=>RunOverviewSchema.parse({ownerSessionId:team.captainSessionId,source:'live',team:taskTeamSnapshot(team),runs:[]})
  expect(selectCollaborationOutcome(snapshot())).toMatchObject({state:'active',action:'inspect-artifacts',actionTarget:{selectionKey:key}})
  const attempt=领取(team,summary.id,summary.assignee!)
  结算(team,summary.id,attempt.attemptId,{ok:false,output:'Summary needs metadata',receipt:{version:1,state:'invalid',summary:'Summary needs metadata',reason:'Summary needs metadata',deliverables:[]}});advanceScienceBatch(team)
  expect(selectCollaborationOutcome(snapshot())).toMatchObject({state:'blocked',blocker:'Summary needs metadata',action:'inspect-feedback',actionTarget:{selectionKey:key}})
 }finally{rmSync(root,{recursive:true,force:true})}
})
