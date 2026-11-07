import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {completedVersionedPipeline} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/tests/helpers/versioned-science.ts'
import {startScienceBatch,advanceScienceBatch} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/science-batch.ts'
import {advancePipeline} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/science-pipeline.ts'
import {taskTeamSnapshot} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/task-snapshot.ts'
import {selectCollaborationOutcome} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/collaboration-outcome.ts'
import {RunOverviewSchema} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/protocol/run-overview.ts'
import {领取,结算} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/state.ts'
const root=mkdtempSync(join(tmpdir(),'c1-quality-batch-'))
try{
 for(const concurrency of [1,2] as const){
  const {team}=await completedVersionedPipeline(root),def=structuredClone(team.pipeline!.definition)
  team.tasks=[];delete team.pipeline
  startScienceBatch(team,'batch',{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},[{id:'one',label:'One',definition:def},{id:'two',label:'Two',definition:{...def,outputs:['two.csv']}}],['summary.json','summary.md'],undefined,Date.now(),concurrency)
  const failedId=concurrency===1?team.pipeline!.currentTaskId:team.scienceBatch!.items[1]!.checkpoint!.currentTaskId
  const failedTask=team.tasks.find(t=>t.id===failedId)!,attempt=领取(team,failedId,failedTask.assignee!)
  结算(team,failedId,attempt.attemptId,{ok:false,output:'Missing units',receipt:{version:1,state:'blocked',summary:'Missing units',reason:'Missing units in Two',deliverables:[]}})
  if(concurrency===1)advancePipeline(team)
  advanceScienceBatch(team)
  const snapshot=RunOverviewSchema.parse({ownerSessionId:team.captainSessionId,source:'live',team:taskTeamSnapshot(team),runs:[]})
  console.log(JSON.stringify({concurrency,failedId,pipelineTask:team.pipeline!.currentTaskId,batch:snapshot.team!.scienceBatch,outcome:selectCollaborationOutcome(snapshot)}))
 }
}finally{rmSync(root,{recursive:true,force:true})}
