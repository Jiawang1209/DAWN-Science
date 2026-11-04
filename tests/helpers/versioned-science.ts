import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {AnalysisRouteBook} from '../../src/runtime/analysis-route-book.js'
import {captureFileVersions} from '../../src/artifacts/task-versions.js'
import {建团队,加成员,领取,结算} from '../../src/team/state.js'
import {startPipeline,advancePipeline} from '../../src/team/science-pipeline.js'
export async function completedVersionedPipeline(workspace:string){
 writeFileSync(join(workspace,'in.csv'),'x\n1\n');writeFileSync(join(workspace,'out.csv'),'n\n1\n')
 const inputs=await captureFileVersions(workspace,['in.csv']),outputs=await captureFileVersions(workspace,['out.csv']),book=new AnalysisRouteBook(undefined)
 const route=book.replace(0,{title:'study',goal:'approved',dataContext:[],steps:[{id:'s',title:'s',purpose:'approved',inputs:['in.csv'],outputs:['out.csv'],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const team=建团队({id:'versioned',name:'study',goal:'approved',captainSessionId:'p'});for(const name of ['check','analyze','review'])加成员(team,{name,agent:name})
 startPipeline(team,'req',{route,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],initialVersions:inputs,members:{check:'check',analyze:'analyze',review:'review'},instructions:'approved',requireExecution:false,maxRevisions:1})
 for(const stage of ['check','analyze','review'] as const){
  const task=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,attempt=领取(team,task.id,task.assignee!)
  const data=stage==='check'?{kind:'data-summary' as const,rows:1,columns:[{name:'x'}],issues:[]}:stage==='analyze'?{kind:'model-metrics' as const,method:'approved',metrics:{n:1},caveats:[]}:{kind:'review' as const,verdict:'pass' as const,findings:[],reviewedPaths:['out.csv']}
  结算(team,task.id,attempt.attemptId,{ok:true,output:'host fixture',receipt:{version:1,state:'accepted',summary:'checked',deliverables:stage==='analyze'?[{stepId:'task',path:'out.csv',state:'observed'}]:[],versions:{version:1,inputs:stage==='review'?outputs:inputs,outputs:stage==='analyze'?outputs:[]},result:{summary:'checked',blockers:[],deliverables:stage==='analyze'?[{path:'out.csv'}]:[],execution:{state:'not_run',note:'fixture'},verification:{state:stage==='review'?'reviewed':'unreviewed',note:'fixture'},data}}});advancePipeline(team)
 }
 return{team,book,inputs,outputs}
}
