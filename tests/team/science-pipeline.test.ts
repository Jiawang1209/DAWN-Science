import {expect,it} from 'vitest'
import {建团队,加成员,领取,结算} from '../../src/team/state.js'
import {startPipeline,advancePipeline,resumePipeline,recoverPipeline,pipelineStatus} from '../../src/team/science-pipeline.js'
import {AnalysisRouteSchema} from '../../src/protocol/analysis-route.js'
import type {TaskReceipt} from '../../src/protocol/task-contract.js'
const route=AnalysisRouteSchema.parse({routeId:'route',revision:1,updatedAt:1,title:'analysis',goal:'check and analyze',dataContext:[],steps:[{id:'s',title:'model',purpose:'confirmed method',inputs:['in.csv'],outputs:['out.csv'],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
const create=()=>{const team=建团队({id:'t',name:'t',goal:'g',captainSessionId:'p'});for(const name of ['check','analyze','review'])加成员(team,{name,agent:name});startPipeline(team,'req',{route,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],members:{check:'check',analyze:'analyze',review:'review'},instructions:'do analysis',requireExecution:false,maxRevisions:1});return team}
function settle(team:ReturnType<typeof create>,kind:'data-summary'|'model-metrics'|'review',verdict:'pass'|'revise'|'blocked'='pass'){
 const t=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,{attemptId}=领取(team,t.id,t.assignee!)
 const data=kind==='data-summary'?{kind,rows:5,columns:[{name:'x'}],issues:[]}:kind==='model-metrics'?{kind,method:'confirmed',metrics:{n:5},caveats:[]}:{kind,verdict,findings:verdict==='pass'?[]:['fix the units'],reviewedPaths:['out.csv']}
 const receipt:TaskReceipt={version:1,state:verdict==='pass'?'accepted':'blocked',summary:'checked',deliverables:[],result:{summary:'checked',blockers:[],deliverables:[],execution:{state:'not_run',note:'fixture'},verification:{state:kind==='review'?'reviewed':'unreviewed',note:'fixture'},data}}
 结算(team,t.id,attemptId,{ok:receipt.state==='accepted',output:JSON.stringify(receipt.result),receipt});advancePipeline(team)
}
it('advances only through validated stages and ends with a review-gated delivery',()=>{
 const team=create();expect(team.pipeline?.stage).toBe('check');settle(team,'data-summary');expect(team.pipeline?.stage).toBe('analyze');settle(team,'model-metrics');expect(team.pipeline?.stage).toBe('review');settle(team,'review')
 expect(team.pipeline?.status).toBe('completed');expect(team.tasks).toHaveLength(3)
 const snapshot=JSON.stringify(team);advancePipeline(team);expect(JSON.stringify(team)).toBe(snapshot)
})
it('keeps rejected reviews and creates only a bounded correction round',()=>{
 const team=create();settle(team,'data-summary');settle(team,'model-metrics');settle(team,'review','revise')
 expect(team.pipeline).toMatchObject({stage:'analyze',round:1,status:'running'});expect(team.tasks[3]?.dependencies).not.toContain(team.tasks[2]!.id)
 settle(team,'model-metrics');settle(team,'review','revise');expect(team.pipeline?.status).toBe('blocked');expect(team.tasks).toHaveLength(5)
})
it('requires explicit recovery, reuses accepted checkpoints and refuses unknown-effect replay without acknowledgement',()=>{
 const team=create();settle(team,'data-summary');const current=team.tasks[1]!,{attemptId}=领取(team,current.id,'analyze')
 expect(recoverPipeline(team)).toBe(true);expect(team.pipeline?.status).toBe('interrupted');expect(()=>resumePipeline(team,false)).toThrow(/核对/)
 结算(team,current.id,attemptId,{ok:false,output:'interrupted'});resumePipeline(team,true)
 expect(team.tasks[0]?.status).toBe('completed');expect(team.tasks[2]?.contract).toEqual(current.contract);expect(team.pipeline?.status).toBe('running')
 expect(pipelineStatus(team).observation.unknownUsageTasks).toBeGreaterThan(0)
})
it('reports visible usage as partial when any terminal stage has no provider receipt',()=>{
 const team=create();settle(team,'data-summary');settle(team,'model-metrics')
 team.tasks[0]!.observation={elapsedMs:10,submissionAttempts:2,invalidSubmissions:1,usage:{input:12,output:8}}
 const status=pipelineStatus(team)
 expect(status.observation).toMatchObject({usage:{input:12,output:8},unknownUsageTasks:1,submissionAttempts:2,invalidSubmissions:1})
 expect(status.observation.partialUsage).toEqual(expect.arrayContaining(['input','output','cacheRead']))
})
it('a replacement check becomes the dependency after the original check is interrupted',()=>{
 const team=create(),original=team.tasks[0]!,attempt=领取(team,original.id,'check')
 recoverPipeline(team);结算(team,original.id,attempt.attemptId,{ok:false,output:'interrupted'})
 resumePipeline(team,true);settle(team,'data-summary')
 const replacement=team.tasks[1]!,analysis=team.tasks[2]!
 expect(replacement.status).toBe('completed');expect(analysis.dependencies).toEqual([replacement.id])
 settle(team,'model-metrics');settle(team,'review');expect(team.pipeline?.status).toBe('completed')
})
it.each([0,2])('enforces exactly %s permitted review correction rounds',limit=>{
 const team=create();team.pipeline!.definition.maxRevisions=limit
 settle(team,'data-summary')
 for(let round=0;round<=limit;round++){settle(team,'model-metrics');settle(team,'review','revise')}
 expect(team.pipeline).toMatchObject({status:'blocked',round:limit});expect(team.tasks).toHaveLength(1+2*(limit+1))
})
it('bounds repeated interrupted attempts without losing the last checkpoint',()=>{
 const team=create()
 for(let i=0;i<16;i++){
  const task=team.tasks.at(-1)!,attempt=领取(team,task.id,'check');recoverPipeline(team);结算(team,task.id,attempt.attemptId,{ok:false,output:'unknown effects'});resumePipeline(team,true)
 }
 expect(team.tasks).toHaveLength(16);expect(team.pipeline).toMatchObject({status:'blocked',reason:expect.stringContaining('16')})
})
