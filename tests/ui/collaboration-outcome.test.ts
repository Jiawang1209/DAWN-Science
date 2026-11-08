import {describe,expect,it} from 'vitest'
import type {RunOverview} from '../../src/protocol/run-overview.js'
import type {TeamSnapshot} from '../../src/protocol/events.js'
import {TaskContractSchema,type TaskReceipt} from '../../src/protocol/task-contract.js'
import {selectCollaborationOutcome} from '../../src/ui/collaboration-outcome.js'
import {RunOverviewSchema} from '../../src/protocol/run-overview.js'
const file={path:'result.csv',sha256:'a'.repeat(64),bytes:1,versionId:'retained-v1'}
const receipt:TaskReceipt={version:1,state:'accepted',summary:'accepted',deliverables:[],versions:{version:1,inputs:[],outputs:[file]}}
const contract=TaskContractSchema.parse({access:'workspace-write',outputs:[file.path],resultType:'model-metrics'})
const run:RunOverview['runs'][number]={id:'run',kind:'subagent',label:'analysis',address:['call','0'],state:'completed',phase:'drained',epoch:2,resultEpoch:2,updatedAt:1,contract:true,inputVersions:0,outputVersions:1,receipt:'accepted',taskReceipt:receipt}
const snapshot=(runs=[run]):RunOverview=>({ownerSessionId:'owner',source:'live',runs})
const task=(id='analysis'):TeamSnapshot['tasks'][number]=>({id,subject:id,dependencies:[],status:'completed',attempt:1,attemptId:`attempt-${id}`,contract,receipt,assignee:'same-member',createdAt:1,updatedAt:1})
const team=(tasks=[task()]):TeamSnapshot=>({id:'team',captainSessionId:'owner',name:'team',goal:'goal',createdAt:1,members:[],tasks,messages:[],taskSeq:tasks.length})
const withTeam=(value=team()):RunOverview=>({...snapshot(),team:value})
const review=()=>({...task('review'),assignee:'reviewer',dependencies:['analysis'],status:'pending' as const,receipt:undefined,contract:TaskContractSchema.parse({resultType:'review',inputs:[file.path]})})
function pipeline(status:'running'|'completed'|'blocked'|'cancelled'|'interrupted'='running'):NonNullable<TeamSnapshot['pipeline']>{return{version:1,requestId:'p',status,stage:'review',round:0,currentTaskId:'review',taskIds:['check','analysis','review'],stateRevision:1,startedAt:1,updatedAt:1,routeSync:'pending',maxRevisions:1,route:{routeId:'r',revision:1,stepId:'s'}}}
function reviewed():TeamSnapshot['tasks'][number]{const r=review();return{...r,status:'completed',receipt:{...receipt,versions:{version:1,inputs:[file],outputs:[]},result:{summary:'reviewed',blockers:[],deliverables:[],execution:{state:'not_run',note:'review only',toolCallIds:[]},verification:{state:'reviewed',note:'read frozen outputs',toolCallIds:['read']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:[file.path]}}}}}
const input={path:'raw.csv',sha256:'c'.repeat(64),bytes:10}
const resultBase={summary:'host accepted',blockers:[],deliverables:[],execution:{state:'not_run' as const,note:'not required'},verification:{state:'reviewed' as const,note:'checked'}}
function checked():TeamSnapshot['tasks'][number]{return{...task('check'),assignee:'checker',contract:TaskContractSchema.parse({inputs:[input.path],resultType:'data-summary'}),receipt:{...receipt,versions:{version:1,inputs:[input],outputs:[]},result:{...resultBase,data:{kind:'data-summary',rows:1,columns:[],issues:[]}}}}}
function analyzed():TeamSnapshot['tasks'][number]{return{...task(),dependencies:['check'],contract:TaskContractSchema.parse({inputs:[input.path],outputs:[file.path],access:'workspace-write',resultType:'model-metrics'}),receipt:{...receipt,versions:{version:1,inputs:[input],outputs:[file]},result:{...resultBase,data:{kind:'model-metrics',method:'model',metrics:{n:1},caveats:[]}}}}}
function pipelineTeam(reviewTask=review() as unknown as ReturnType<typeof task>){return team([analyzed(),reviewTask,checked()])}
describe('collaboration outcome from one authoritative snapshot',()=>{
 it('accepts only completed current host receipt versions and retains the version locator',()=>{
  const result=selectCollaborationOutcome(snapshot(),'run')
  expect(result).toMatchObject({state:'accepted',acceptedPaths:[file.path],artifacts:[{version:file,selectionKey:'run:run',scope:'final'}]})
  expect(selectCollaborationOutcome({...snapshot(),runs:[{...run,taskReceipt:{...receipt,deliverables:[{stepId:'s',path:'invented.txt',state:'exists'}]}}]},'run').acceptedPaths).toEqual([file.path])
 })
 it.each(['queued','running'] as const)('does not reuse accepted receipts while %s',phase=>{
  expect(selectCollaborationOutcome(snapshot([{...run,state:phase,phase}]),'run')).toMatchObject({state:'active',acceptedPaths:[]})
 })
 it('waits for cancellation drain and then reports cancelled',()=>{
  expect(selectCollaborationOutcome(snapshot([{...run,state:'cancelled',phase:'stopping'}]),'run')).toMatchObject({state:'stopping',action:'wait-for-drain',acceptedPaths:[]})
  expect(selectCollaborationOutcome(snapshot([{...run,state:'cancelled'}]),'run')).toMatchObject({state:'cancelled',acceptedPaths:[]})
 })
 it.each([undefined,1])('requires matching result epoch %s',resultEpoch=>{
  const value={...run};if(resultEpoch===undefined)delete value.resultEpoch;else value.resultEpoch=resultEpoch
  expect(selectCollaborationOutcome(snapshot([value]),'run')).toMatchObject({state:'unverified',acceptedPaths:[],action:'inspect-artifacts',inspectionArtifacts:[{version:file}]})
 })
 it('never treats a failed execution with retained accepted receipt as accepted',()=>expect(selectCollaborationOutcome(snapshot([{...run,state:'failed'}]),'run')).toMatchObject({state:'failed',acceptedPaths:[]}))
 it.each(['blocked','invalid'] as const)('shows real %s receipt feedback',state=>{
  const r={...run,receipt:state,taskReceipt:{...receipt,state,reason:'Missing measurement units'}}
  expect(selectCollaborationOutcome(snapshot([r]),'run')).toMatchObject({state:'blocked',blocker:'Missing measurement units',action:'inspect-feedback',acceptedPaths:[]})
 })
 it('keeps completed freeform work inspectable without scientific acceptance',()=>expect(selectCollaborationOutcome(snapshot([{...run,contract:false}]),'run')).toMatchObject({state:'unverified',action:'inspect-artifacts',acceptedPaths:[]}))
 it.each(['disk','unsupported'] as const)('does not show current acceptance from %s',source=>expect(selectCollaborationOutcome({...snapshot(),source},'run')).toMatchObject({state:'history',acceptedPaths:[],inspectionArtifacts:[{version:file}]}))
 it('does not mutate any snapshot records',()=>{const value=withTeam();const before=structuredClone(value);selectCollaborationOutcome(value);expect(value).toEqual(before)})
 it('uses own settled team task attempt even when its member moved to another run',()=>{
  const value=withTeam(team([task(),{...task('later'),status:'in_progress'}]));value.runs=[{...run,epoch:5,resultEpoch:2,state:'running',phase:'running'}]
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:'team',taskId:'analysis'})).toMatchObject({state:'accepted',acceptedPaths:[file.path],artifacts:[{selectionKey:'task:["team","analysis"]',attemptId:'attempt-analysis'}]})
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:'team',taskId:'later'})).toMatchObject({state:'active',acceptedPaths:[]})
 })
 it('requires a current task attempt and does not borrow a run receipt',()=>{
  const t=task();delete t.attemptId
  expect(selectCollaborationOutcome(withTeam(team([t])),{kind:'task',teamId:'team',taskId:t.id})).toMatchObject({state:'unverified',acceptedPaths:[]})
  expect(selectCollaborationOutcome(withTeam(team([{...task(),receipt:undefined} as unknown as ReturnType<typeof task>])),{kind:'task',teamId:'team',taskId:'analysis'}).acceptedPaths).toEqual([])
 })
 it('honors explicit team null and exact team selection identity',()=>{
  expect(selectCollaborationOutcome({...snapshot(),team:null},'task:["team","analysis"]')).toMatchObject({state:'unverified',acceptedPaths:[]})
  expect(selectCollaborationOutcome(withTeam(),{kind:'task',teamId:'foreign',taskId:'analysis'}).acceptedPaths).toEqual([])
 })
 it('exposes accepted analysis only as stage artifacts until independent review settles',()=>{
  const value=withTeam({...pipelineTeam(),pipeline:pipeline()})
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'active',pendingReview:true,acceptedPaths:[file.path],artifacts:[{scope:'stage',selectionKey:'task:["team","analysis"]'}],action:'inspect-findings'})
  const unrelated={...task('unrelated'),receipt:{...receipt,versions:{version:1 as const,inputs:[],outputs:[{...file,path:'wrong.csv'}]}}}
  value.team!.tasks=[unrelated,{...task(),status:'pending'},review() as unknown as ReturnType<typeof task>]
  expect(selectCollaborationOutcome(value).acceptedPaths).toEqual([])
 })
 it('requires completed checkpoint plus a valid host accepted passing review for final pipeline acceptance',()=>{
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:pipeline('completed')})
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'accepted',pendingReview:false,routeSync:'pending',acceptedPaths:[file.path],artifacts:[{scope:'final'}]})
  expect(selectCollaborationOutcome(value).actionTarget).toEqual({selectionKey:'task:["team","analysis"]'})
  value.team!.pipeline!.routeSync='conflict'
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'accepted',routeSync:'conflict'})
  value.team!.tasks[1]={...reviewed(),receipt:{...reviewed().receipt!,result:{...reviewed().receipt!.result!,data:{kind:'review',verdict:'revise',findings:['Fix units'],reviewedPaths:[file.path]}}}}
  expect(selectCollaborationOutcome(value).state).not.toBe('accepted')
 })
 it('targets the exact accepted artifact producer before a no-output accepted run',()=>{
  const empty={...run,id:'no-output-review',taskReceipt:{...receipt,versions:{version:1 as const,inputs:[],outputs:[]}}}
  expect(selectCollaborationOutcome(snapshot([empty,run])).actionTarget).toEqual({selectionKey:'run:run'})
 })
 it('does not infer blocked pipeline from ordinary new admission budget',()=>{
  const value=withTeam({...pipelineTeam(),pipeline:pipeline()})
  value.budget={revision:1,limits:{maxRuns:3},consumedRuns:2,legacyRuns:0,knownTokens:0,unknownRuns:0,inFlight:1,elapsedMs:0,blocked:{code:'runs',message:'review reserved'}}
  expect(selectCollaborationOutcome(value).state).toBe('active')
 })
 it('does not report whole teams accepted when another task remains active',()=>expect(selectCollaborationOutcome(withTeam(team([task(),{...task('later'),status:'in_progress'}])))).toMatchObject({state:'active',acceptedPaths:[]}))
 it('does not report whole batches accepted from one completed item; summary requires own accepted versions',()=>{
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:pipeline('completed'),scienceBatch:{version:1,template:{id:'tabular-ecology',version:1},status:'running',stateRevision:1,index:1,total:2,completed:1,items:[{id:'one',label:'one',status:'completed'},{id:'two',label:'two',status:'running'}],summaryOutputs:['summary.csv','summary.md']}})
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'active',acceptedPaths:[]})
  value.team!.scienceBatch!.status='completed';value.team!.scienceBatch!.items[1]!.status='completed';value.team!.scienceBatch!.completed=2
  expect(selectCollaborationOutcome(value).state).toBe('unverified')
  value.team!.scienceBatch!.aggregateTaskId='summary';value.team!.tasks.push({...task('summary'),receipt:{...receipt,versions:{version:1,inputs:[],outputs:[{...file,path:'summary.csv'},{...file,path:'summary.md'}]}}})
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'accepted',acceptanceScope:'final',acceptedPaths:['summary.csv','summary.md']})
  expect(selectCollaborationOutcome(value,'task:["team","summary"]')).toMatchObject({state:'accepted',acceptanceScope:'final',artifacts:[{scope:'final'},{scope:'final'}]})
 })
 it('keeps an exact team task attempt stopping until its bound run drains',()=>{
  const t={...task(),status:'cancelled' as const},value=withTeam(team([t]))
  value.runs=[{...run,kind:'team',phase:'stopping',state:'cancelled'}]
  value.history={truncated:false,events:[{seq:1,at:1,type:'started',childId:run.id,epoch:run.epoch,taskAttempt:{teamId:'team',taskId:t.id,attemptId:t.attemptId!,attempt:t.attempt}}]}
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:'team',taskId:t.id})).toMatchObject({state:'stopping',action:'wait-for-drain',acceptedPaths:[]})
  expect(selectCollaborationOutcome(value).state).toBe('stopping')
  value.history.events[0]!.taskAttempt!.attemptId='another-attempt'
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:'team',taskId:t.id}).state).toBe('cancelled')
 })
 it('does not accept a foreign owner team, or hide a current review rejection behind running',()=>{
  const value=withTeam({...pipelineTeam({...reviewed(),receipt:{...receipt,state:'blocked',reason:'Review needs units'}}),pipeline:pipeline()})
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'blocked',blocker:'Review needs units',action:'inspect-feedback'})
  value.team!.captainSessionId='foreign-owner'
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'unverified',acceptedPaths:[]})
 })
 it('requires review contract paths and review receipt versions to match the accepted analysis',()=>{
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:pipeline('completed')})
  value.team!.tasks[1]!.contract=TaskContractSchema.parse({resultType:'review',inputs:['other.csv']})
  expect(selectCollaborationOutcome(value).state).toBe('unverified')
  value.team!.tasks[1]=reviewed();value.team!.tasks[1]!.receipt!.versions!.inputs[0]={...file,sha256:'b'.repeat(64)}
  expect(selectCollaborationOutcome(value).state).toBe('unverified')
 })
 it('does not treat epoch zero or contradictory receipt summaries as current acceptance',()=>{
  expect(selectCollaborationOutcome(snapshot([{...run,epoch:0,resultEpoch:0}]),'run')).toMatchObject({state:'unverified',acceptedPaths:[]})
  expect(selectCollaborationOutcome(snapshot([{...run,receipt:'blocked'}]),'run').acceptedPaths).toEqual([])
  expect(selectCollaborationOutcome(snapshot([{...run,taskReceipt:{...receipt,state:'invalid'}}]),'run').acceptedPaths).toEqual([])
 })
 it('allows host accepted passing reviews to retain informational findings',()=>{
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:pipeline('completed')})
  const data=value.team!.tasks[1]!.receipt!.result!.data!
  if(data.kind==='review')data.findings=['Independent external validation remains future work']
  expect(selectCollaborationOutcome(value).state).toBe('accepted')
 })
 it('recognizes cancelled task drain after the host removes its attempt token',()=>{
  const t={...task(),status:'cancelled' as const};delete t.attemptId
  const value=withTeam({...team([t]),pipeline:{...pipeline('cancelled'),currentTaskId:t.id,taskIds:[t.id]}})
  value.runs=[{...run,kind:'team',phase:'stopping',state:'cancelled'}]
  value.history={truncated:false,events:[{seq:1,at:1,type:'started',childId:run.id,epoch:run.epoch,taskAttempt:{teamId:'team',taskId:t.id,attemptId:'attempt-analysis',attempt:t.attempt}}]}
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'stopping',action:'wait-for-drain',acceptedPaths:[]})
  value.runs[0]!.phase='drained'
  expect(selectCollaborationOutcome(value).state).toBe('cancelled')
 })
 it('prioritizes an actual stopping run over an unrelated unknown historical record',()=>{
  expect(selectCollaborationOutcome(snapshot([{...run,phase:'unknown'},{...run,id:'stopping',phase:'stopping'}]))).toMatchObject({state:'stopping',action:'wait-for-drain',acceptedPaths:[]})
 })
 it('requires the final review to belong to the public checkpoint task set',()=>{
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:pipeline('completed')})
  value.team!.pipeline!.taskIds=['analysis']
  expect(selectCollaborationOutcome(value).state).toBe('unverified')
 })
 it('supports existing prefixed run keys and returns a navigation-only action target',()=>{
  expect(selectCollaborationOutcome(snapshot(),'run:run')).toMatchObject({state:'accepted',actionTarget:{selectionKey:'run:run'},artifacts:[{selectionKey:'run:run'}]})
 })
 it('keeps mixed runs active while surfacing the actual blocker and its navigation target',()=>{
  const value=snapshot([{...run,id:'busy',state:'running',phase:'running'},{...run,id:'blocked',receipt:'blocked',taskReceipt:{...receipt,state:'blocked',reason:'Missing units'}}])
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'active',blocker:'Missing units',action:'inspect-feedback',actionTarget:{selectionKey:'run:blocked'},acceptedPaths:[]})
 })
 it('keeps mixed team tasks active while surfacing the actual blocker and its navigation target',()=>{
  const value=withTeam(team([{...task('busy'),status:'in_progress'},{...task('blocked'),status:'failed',receipt:{...receipt,state:'invalid',reason:'Input mismatch'}}]))
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'active',blocker:'Input mismatch',action:'inspect-feedback',actionTarget:{selectionKey:'task:["team","blocked"]'},acceptedPaths:[]})
 })
 it('uses current run task binding when bounded history has lost the started event',()=>{
  const t={...task(),status:'cancelled' as const};delete t.attemptId
  const value=withTeam(team([t]));value.history={events:[],truncated:true}
  value.runs=[{...run,phase:'stopping',state:'cancelled',taskAttempt:{teamId:'team',taskId:t.id,attemptId:'attempt-analysis',attempt:t.attempt}}]
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:'team',taskId:t.id})).toMatchObject({state:'stopping',action:'wait-for-drain'})
  value.runs[0]!.taskAttempt!.attempt=2
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:'team',taskId:t.id})).toMatchObject({state:'cancelled',drainVerified:false})
 })
 it('prefers current run binding over contradictory legacy history',()=>{
  const t={...task(),status:'cancelled' as const},value=withTeam(team([t]))
  value.runs=[{...run,phase:'stopping',taskAttempt:{teamId:'team',taskId:t.id,attemptId:'another',attempt:2}}]
  value.history={truncated:false,events:[{seq:1,at:1,type:'started',childId:run.id,epoch:run.epoch,taskAttempt:{teamId:'team',taskId:t.id,attemptId:t.attemptId!,attempt:t.attempt}}]}
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:'team',taskId:t.id})).toMatchObject({state:'cancelled',drainVerified:false})
 })
 it('requires a positive settled task attempt even when an attempt token is present',()=>{
  expect(selectCollaborationOutcome(withTeam(team([{...task(),attempt:0}])),{kind:'task',teamId:'team',taskId:'analysis'})).toMatchObject({state:'unverified',acceptedPaths:[]})
 })
 it('preserves stage acceptance and pending review when selecting an analysis or check task',()=>{
  const value=withTeam({...pipelineTeam(),pipeline:pipeline()})
  expect(selectCollaborationOutcome(value,'task:["team","analysis"]')).toMatchObject({state:'accepted',acceptanceScope:'stage',pendingReview:true,artifacts:[{scope:'stage'}]})
  expect(selectCollaborationOutcome(value,'task:["team","check"]')).toMatchObject({state:'accepted',acceptanceScope:'stage',pendingReview:true,acceptedPaths:[]})
 })
 it.each(['missing-check','unaccepted-check','wrong-input-version','same-reviewer','missing-reviewer'] as const)('rejects incomplete or non-independent final provenance: %s',problem=>{
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:pipeline('completed')})
  if(problem==='missing-check')value.team!.tasks=value.team!.tasks.filter(t=>t.id!=='check')
  if(problem==='unaccepted-check')value.team!.tasks[2]!.receipt={...checked().receipt!,state:'blocked'}
  if(problem==='wrong-input-version')value.team!.tasks[2]!.receipt={...checked().receipt!,versions:{version:1,inputs:[{...input,sha256:'d'.repeat(64)}],outputs:[]}}
  if(problem==='same-reviewer')value.team!.tasks[1]!.assignee=value.team!.tasks[0]!.assignee
  if(problem==='missing-reviewer')delete value.team!.tasks[1]!.assignee
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'unverified',acceptedPaths:[]})
 })
 it.each(['running','blocked','interrupted','cancelled'] as const)('rejects foreign current checkpoint tasks while %s',status=>{
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:{...pipeline(status),taskIds:['check','analysis']}})
  const result=selectCollaborationOutcome(value)
  expect(result).toMatchObject({state:'unverified',acceptedPaths:[],artifacts:[]})
  expect(result.actionTarget).toBeUndefined()
 })
 it('qualifies cancelled pipelines and batches with explicit drain proof only',()=>{
  const value=withTeam({...pipelineTeam(),pipeline:pipeline('cancelled')});value.runs=[]
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'cancelled',drainVerified:false})
  value.runs=[{...run,kind:'team',address:['team','worker','generation'],state:'cancelled',phase:'stopping'}]
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'stopping',action:'wait-for-drain'})
  value.runs[0]!.phase='drained'
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'cancelled',drainVerified:true})
  value.runs[0]!.resultEpoch=1
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'cancelled',drainVerified:false})
  value.team!.scienceBatch={version:1,template:{id:'tabular-ecology',version:1},status:'cancelled',stateRevision:1,index:0,total:1,completed:0,items:[{id:'one',label:'one',status:'cancelled'}],summaryOutputs:['summary.csv','summary.md']}
  value.runs=[]
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'cancelled',drainVerified:false})
  value.runs=[{...run,kind:'team',address:['team','worker','generation'],state:'cancelled',phase:'stopping'}]
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'stopping',action:'wait-for-drain'})
  value.runs[0]!.phase='drained'
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'cancelled',drainVerified:true})
 })
 it('preserves stage scope for a selected bound analysis run and a selected batch task',()=>{
  const value=withTeam({...pipelineTeam(),pipeline:pipeline()})
  value.runs=[{...run,kind:'team',address:['team','same-member','generation'],taskAttempt:{teamId:'team',taskId:'analysis',attemptId:'attempt-analysis',attempt:1}}]
  expect(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'accepted',acceptanceScope:'stage',pendingReview:true,artifacts:[{scope:'stage'}]})
  value.team!.scienceBatch={version:1,template:{id:'tabular-ecology',version:1},status:'running',stateRevision:1,index:0,total:1,completed:0,items:[{id:'one',label:'one',status:'running',currentTaskId:'review'}],summaryOutputs:['summary.csv','summary.md']}
  delete value.team!.pipeline
  expect(selectCollaborationOutcome(value,'task:["team","analysis"]')).toMatchObject({state:'accepted',acceptanceScope:'stage',artifacts:[{scope:'stage'}]})
 })
 it('does not verify individual cancellation drain from an unadmitted or unmatched settled epoch',()=>{
  const t={...task(),status:'cancelled' as const},value=withTeam(team([t]))
  value.runs=[{...run,epoch:0,resultEpoch:0,state:'cancelled',taskAttempt:{teamId:'team',taskId:t.id,attemptId:t.attemptId!,attempt:1}}]
  expect(selectCollaborationOutcome(value,'task:["team","analysis"]')).toMatchObject({state:'cancelled',drainVerified:false})
  expect(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'cancelled',drainVerified:false})
 })
 it.each(['running','completed','blocked','interrupted','cancelled'] as const)('rejects a missing current task while %s',status=>{
  const value=withTeam({...pipelineTeam(),pipeline:{...pipeline(status),currentTaskId:'missing',taskIds:['check','analysis','missing']}})
  const result=selectCollaborationOutcome(value)
  expect(result).toMatchObject({state:'unverified',artifacts:[],acceptedPaths:[]})
  expect(result.actionTarget).toBeUndefined()
 })
 it('finalizes only the exact analysis and review identified by the completed provenance chain',()=>{
  const olderFile={...file,sha256:'b'.repeat(64)},older={...analyzed(),id:'older-analysis',attemptId:'attempt-older',receipt:{...analyzed().receipt!,versions:{version:1 as const,inputs:[input],outputs:[olderFile]}}}
  const value=withTeam({...pipelineTeam(reviewed()),pipeline:pipeline('completed')})
  value.team!.tasks.push(older);value.team!.pipeline!.taskIds.push(older.id)
  expect.soft(selectCollaborationOutcome(value)).toMatchObject({state:'accepted',artifacts:[{version:file,scope:'final'}]})
  expect.soft(selectCollaborationOutcome(value,'task:["team","older-analysis"]')).toMatchObject({state:'accepted',acceptanceScope:'stage',artifacts:[{version:olderFile,scope:'stage'}]})
  expect.soft(selectCollaborationOutcome(value,'task:["team","analysis"]')).toMatchObject({state:'accepted',acceptanceScope:'final',artifacts:[{version:file,scope:'final'}]})
  expect.soft(selectCollaborationOutcome(value,'task:["team","review"]')).toMatchObject({state:'accepted',acceptanceScope:'final'})
  value.runs=[{...run,kind:'team',address:['team','same-member','generation'],taskReceipt:older.receipt,taskAttempt:{teamId:'team',taskId:older.id,attemptId:older.attemptId,attempt:older.attempt}}]
  expect.soft(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'accepted',acceptanceScope:'stage',pendingReview:false,artifacts:[{version:olderFile,scope:'stage'}]})
  value.runs[0]!.taskAttempt={teamId:'team',taskId:'analysis',attemptId:'attempt-analysis',attempt:1}
  expect.soft(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'accepted',acceptanceScope:'stage',pendingReview:false,artifacts:[{version:olderFile,scope:'stage'}]})
  value.runs[0]!.taskReceipt=analyzed().receipt
  expect.soft(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'accepted',acceptanceScope:'final',artifacts:[{version:file,scope:'final'}]})
 })
 it('does not apply a batch scope to an unrelated standalone run',()=>{
  const value=withTeam({...pipelineTeam(),pipeline:pipeline(),scienceBatch:{version:1,template:{id:'tabular-ecology',version:1},status:'running',stateRevision:1,index:0,total:1,completed:0,items:[{id:'one',label:'one',status:'running'}],summaryOutputs:['summary.csv','summary.md']}})
  expect.soft(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'accepted',acceptanceScope:'final',artifacts:[{scope:'final'}]})
  expect.soft(selectCollaborationOutcome(value,'run:run').pendingReview).not.toBe(true)
  value.team!.scienceBatch!.taskIds=['check','analysis','review'];value.team!.tasks.push(task('standalone'))
  expect.soft(selectCollaborationOutcome(value,'task:["team","standalone"]')).toMatchObject({state:'accepted',acceptanceScope:'final',artifacts:[{scope:'final'}]})
  value.runs=[{...run,kind:'team',address:['team','same-member','generation'],taskAttempt:{teamId:'team',taskId:'standalone',attemptId:'attempt-standalone',attempt:1}}]
  expect.soft(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'accepted',acceptanceScope:'final',artifacts:[{scope:'final'}]})
  expect.soft(selectCollaborationOutcome(value,'task:["team","analysis"]')).toMatchObject({state:'accepted',acceptanceScope:'stage',pendingReview:true,artifacts:[{scope:'stage'}]})
 })
 it('does not promote ambiguous legacy batch tasks to final when membership is absent',()=>{
  const value=withTeam({...team([task('retained')]),scienceBatch:{version:1,template:{id:'tabular-ecology',version:1},status:'running',stateRevision:1,index:0,total:1,completed:0,items:[{id:'one',label:'One',status:'running'}],summaryOutputs:['summary.csv','summary.md']}})
  expect(selectCollaborationOutcome(value,'task:["team","retained"]')).toMatchObject({state:'accepted',acceptanceScope:'stage',artifacts:[{scope:'stage'}]})
  expect(selectCollaborationOutcome(value,'run:run')).toMatchObject({state:'accepted',acceptanceScope:'final',artifacts:[{scope:'final'}]})
  value.team!.scienceBatch!.taskIds=[]
  expect(selectCollaborationOutcome(value,'task:["team","retained"]')).toMatchObject({state:'accepted',acceptanceScope:'final'})
 })
 it('keeps protocol optional fields backward compatible and strict',()=>{
  expect(RunOverviewSchema.safeParse(snapshot()).success).toBe(true)
  expect(RunOverviewSchema.safeParse({...snapshot(),team:null,teamIssue:'unreadable',observation:{observerId:'host',revision:0}}).success).toBe(true)
  for(const observation of [{observerId:'host',revision:-1},{observerId:'host',revision:0,extra:true}])expect(RunOverviewSchema.safeParse({...snapshot(),observation}).success).toBe(false)
  expect(RunOverviewSchema.safeParse({...snapshot(),team:{...team(),extra:true}}).success).toBe(false)
  expect(RunOverviewSchema.safeParse(snapshot([{...run,resultEpoch:-1}])).success).toBe(false)
 })
})


describe('paused approved arrangement outcome',()=>{
 function paused(){
  const stopped={...task('analysis'),status:'failed' as const,receipt:undefined},pending={...task('review'),status:'pending' as const,attempt:0,attemptId:undefined,receipt:undefined}
  const t=team([stopped,pending]);t.id='plan_'+ 'a'.repeat(24)
  t.approvedPlan={version:1,owner:'owner',planId:'p',planVersion:1,markdownHash:'b'.repeat(64),teamId:t.id,externalInputs:[],tasks:[{planTaskId:'analysis',taskId:stopped.id,memberName:'worker'},{planTaskId:'review',taskId:pending.id,memberName:'reviewer'}]}
  t.approvedPlanPaused=true;t.approvedPlanPauseReason='User stopped; inspect files before continuing'
  return{...snapshot([]),team:t}
 }
 it('does not call an explicitly paused arrangement active because downstream tasks remain pending',()=>{
  const value=paused(),before=structuredClone(value)
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'blocked',action:'inspect-recovery',blocker:value.team.approvedPlanPauseReason,acceptedPaths:[],artifacts:[]})
  expect(value).toEqual(before)
  expect(selectCollaborationOutcome(value,{kind:'task',teamId:value.team.id,taskId:'review'}).state).toBe('active')
 })
 it('still exposes an exact bound process stopping or running before it drains; foreign attempts cannot override pause',()=>{
  const value=paused();value.runs=[{...run,kind:'team',address:[value.team.id,'worker','analysis'],state:'cancelled',phase:'stopping',taskAttempt:{teamId:value.team.id,taskId:'analysis',attempt:1,attemptId:'attempt-analysis'}}]
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'stopping',action:'wait-for-drain',acceptedPaths:[]})
  value.runs[0]!.phase='running';value.runs[0]!.state='running'
  expect(selectCollaborationOutcome(value).state).toBe('active')
  value.runs[0]!.taskAttempt!.attemptId='old-attempt'
  expect(selectCollaborationOutcome(value).state).toBe('blocked')
  value.runs[0]!.taskAttempt!.attemptId='attempt-analysis';value.runs[0]!.phase='drained';value.runs[0]!.state='cancelled'
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'blocked',acceptedPaths:[]})
 })
 it('does not promote restored records or another owner to a live paused outcome',()=>{
  const value=paused()
  expect(selectCollaborationOutcome({...value,source:'disk'})).toMatchObject({state:'history',acceptedPaths:[]})
  value.team.captainSessionId='foreign'
  expect(selectCollaborationOutcome(value)).toMatchObject({state:'unverified',acceptedPaths:[]})
 })
})
