import {expect,it} from 'vitest'
import {AnalysisRouteBook} from '../../src/runtime/analysis-route-book.js'
import {projectPipelineRoute} from '../../src/runtime/science-pipeline-route.js'
import {建团队,加成员,领取,结算} from '../../src/team/state.js'
import {startPipeline,advancePipeline} from '../../src/team/science-pipeline.js'
it('projects completed host receipts once and preserves a newer conflicting route',()=>{
 const book=new AnalysisRouteBook(undefined)
 const route=book.replace(0,{title:'study',goal:'approved',dataContext:[],steps:[{id:'s',title:'s',purpose:'approved method',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const team=建团队({id:'p',name:'p',goal:'g',captainSessionId:'parent'});for(const n of ['check','analyze','review'])加成员(team,{name:n,agent:n})
 startPipeline(team,'req',{route,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],members:{check:'check',analyze:'analyze',review:'review'},instructions:'do',requireExecution:false,maxRevisions:0})
 for(const kind of ['data-summary','model-metrics','review'] as const){const t=team.tasks.find(t=>t.id===team.pipeline!.currentTaskId)!,{attemptId}=领取(team,t.id,t.assignee!);结算(team,t.id,attemptId,{ok:true,output:'host accepted',receipt:{version:1,state:'accepted',summary:'done',deliverables:kind==='model-metrics'?[{stepId:'task',path:'out.csv',state:'observed'}]:[],result:{summary:'done',blockers:[],deliverables:kind==='model-metrics'?[{path:'out.csv'}]:[],execution:{state:'not_run',note:'document'},verification:{state:kind==='review'?'reviewed':'unreviewed',note:'actual review'},data:kind==='data-summary'?{kind,rows:1,columns:[],issues:[]}:kind==='model-metrics'?{kind,method:'approved',metrics:{n:1},caveats:[]}:{kind,verdict:'pass',findings:[],reviewedPaths:['out.csv']}}}});advancePipeline(team)}
 expect(projectPipelineRoute(book,team)).toBe('applied');expect(book.read()?.steps[0]).toMatchObject({status:'delivered',needsReview:false,deliverables:[{path:'out.csv'}]})
 const revision=book.read()!.revision;expect(projectPipelineRoute(book,team)).toBe('applied');expect(book.read()?.revision).toBe(revision)
 const newer=new AnalysisRouteBook(undefined);newer.replace(0,{title:route.title,goal:route.goal,dataContext:route.dataContext,steps:route.steps});expect(projectPipelineRoute(newer,team)).toBe('conflict')
})
it('refuses stale revision or missing accepted review without mutating the current route',()=>{
 const book=new AnalysisRouteBook(undefined),draft={title:'study',goal:'approved',dataContext:[],steps:[{id:'s',title:'s',purpose:'method',inputs:[],outputs:[],dependencies:[],status:'pending' as const,blockers:[],cases:[],deliverables:[],execution:{state:'not_run' as const,note:'pending'},verification:{state:'unreviewed' as const,note:'pending'},needsReview:true,notes:[]}]}
 const route=book.replace(0,draft),team=建团队({id:'p',name:'p',goal:'g',captainSessionId:'parent'})
 for(const n of ['check','analyze','review'])加成员(team,{name:n,agent:n})
 startPipeline(team,'req',{route,stepId:'s',inputs:['in.csv'],outputs:['out.csv'],members:{check:'check',analyze:'analyze',review:'review'},instructions:'confirmed',requireExecution:false,maxRevisions:0})
 team.pipeline!.status='completed'
 const current=book.replace(1,{...draft,title:'new title'})
 expect(projectPipelineRoute(book,team)).toBe('conflict');expect(book.read()).toEqual(current)
})
