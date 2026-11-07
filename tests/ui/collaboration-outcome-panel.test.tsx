import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {RunOverview} from '../../src/ui/run-overview.js'
import {CollaborationSummary} from '../../src/ui/collaboration-summary.js'
import {resetCollaborationViews} from '../../src/ui/state/collaboration-view.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
import type {RunOverview as Snapshot} from '../../src/protocol/run-overview.js'
import type {TeamSnapshot} from '../../src/protocol/index.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
const file={path:'reports/result.csv',bytes:12,sha256:'a'.repeat(64),versionId:'host-v7'}
const receipt={version:1 as const,state:'accepted' as const,summary:'accepted',deliverables:[],versions:{version:1 as const,inputs:[],outputs:[file]}}
const base=():Snapshot=>({ownerSessionId:'p',source:'live',runs:[{id:'analysis',kind:'subagent',label:'Analysis',address:['call','0'],epoch:3,resultEpoch:3,state:'completed',phase:'drained',updatedAt:1,contract:true,inputVersions:0,outputVersions:1,receipt:'accepted',taskReceipt:receipt}]})
const client=(value:Snapshot)=>({get:vi.fn().mockResolvedValue(value)}) as unknown as WorkbenchClient
beforeEach(()=>{resetCollaborationViews();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
it('puts the overall goal and final host version before task inspection and navigates to its existing artifact tab',async()=>{
 const view=render(<RunOverview client={client(base())} sessionId="p"/>);await act(async()=>{})
 const panel=screen.getByRole('region',{name:'协作成果'})
 expect(panel.textContent).toContain('本会话协作');expect(panel.textContent).toContain('本轮成果已验收')
 expect(panel.textContent).toContain('最终成果');expect(panel.textContent).toContain('host-v7');expect(panel.textContent).toContain(file.sha256)
 expect(panel.compareDocumentPosition(view.container.querySelector('.collaboration-roster')!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.click(within(panel).getByRole('button',{name:'查看验收成果'}))
 expect(screen.getByRole('tab',{name:'产物'}).getAttribute('aria-selected')).toBe('true')
 expect(view.container.querySelector('[data-selected-run="analysis"]')).toBeTruthy()
})
it.each(['history','unverified','stopping','cancelled'] as const)('keeps %s separate from acceptance and never claims an unproved drain',async mode=>{
 const value=base();if(mode==='history')value.source='disk';if(mode==='unverified')value.runs[0]!.resultEpoch=2;if(mode==='stopping')value.runs[0]!.phase='stopping';if(mode==='cancelled'){value.runs[0]!.state='cancelled';value.runs[0]!.phase='idle'}
 render(<RunOverview client={client(value)} sessionId="p"/>);await act(async()=>{})
 const panel=screen.getByRole('region',{name:'协作成果'});expect(panel.getAttribute('data-outcome')).toBe(mode)
 expect(panel.textContent).not.toContain('本轮成果已验收');expect(panel.textContent).not.toContain('已取消并排空')
 if(mode==='cancelled')expect(panel.textContent).toContain('排空尚未核验')
 if(mode==='history'||mode==='unverified')expect(panel.textContent).toContain('留存版本，仅供检查')
})
it('shows team read failure as an alert and host budget unknowns without invented zeroes',async()=>{
 const value=base();value.team=null;value.teamIssue='TEAM read failed';value.budget={revision:1,limits:{maxRuns:3,reserveReviewRuns:true},consumedRuns:1,legacyRuns:0,knownTokens:0,unknownRuns:0,inFlight:0,elapsedMs:0}
 render(<RunOverview client={client(value)} sessionId="p"/>);await act(async()=>{})
 expect(screen.getByRole('alert').textContent).toBe('TEAM read failed')
 const panel=screen.getByRole('region',{name:'协作成果'});expect(panel.textContent).toContain('普通可用 未知');expect(panel.textContent).toContain('审阅预留 未知')
})
it('opens the actual blocked batch task, while historical selection cannot replace the overall outcome',async()=>{
 const value=base(),contract=TaskContractSchema.parse({resultType:'review',inputs:[]})
 const task=(id:string,status:'completed'|'pending',blocked=false):TeamSnapshot['tasks'][number]=>({id,subject:id,status,attempt:1,attemptId:id+'-attempt',createdAt:1,updatedAt:1,dependencies:[],contract,receipt:blocked?{...receipt,state:'blocked',reason:'wrong frozen inputs'}:undefined})
 value.team={id:'team',captainSessionId:'p',name:'Research',goal:'Compare two datasets',createdAt:1,members:[],messages:[],taskSeq:2,tasks:[task('old-analysis','pending'),task('actual-blocked','completed',true)],scienceBatch:{version:1,template:{id:'tabular-ecology',version:1},status:'blocked',stateRevision:1,index:0,total:2,completed:0,items:[{id:'one',label:'one',status:'pending',currentTaskId:'old-analysis'},{id:'two',label:'two',status:'blocked',currentTaskId:'actual-blocked'}],summaryOutputs:['summary.csv'],reason:'batch blocked'}}
 render(<RunOverview client={client(value)} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'Analysis'}))
 const panel=screen.getByRole('region',{name:'协作成果'});expect(panel.getAttribute('data-outcome')).toBe('blocked');expect(panel.textContent).toContain('Compare two datasets')
 fireEvent.click(within(panel).getByRole('button',{name:'查看提交反馈'}))
 expect(document.querySelector('[data-task-detail="actual-blocked"]')).toBeTruthy();expect(screen.getByRole('tab',{name:'记录'}).getAttribute('aria-selected')).toBe('true')
})
it('uses the shared active outcome in the compact strip when ordinary admission is blocked',async()=>{
 const value=base();value.runs[0]!.phase='running';value.runs[0]!.state='running';value.budget={revision:1,limits:{maxRuns:1},consumedRuns:1,legacyRuns:0,knownTokens:0,unknownRuns:0,inFlight:1,elapsedMs:0,blocked:{code:'runs',message:'new admission blocked'}}
 render(<CollaborationSummary client={client(value)} sessionId="p" onOpen={()=>{}}/>);await act(async()=>{})
 expect(screen.getByRole('button').textContent).toContain('协作进行中');expect(screen.getByRole('button').textContent).not.toContain('额度阻止继续执行')
})
it('keeps blocked review prominent even when stage artifacts and a pending review remain',async()=>{
 const {CollaborationOutcomePanel}=await import('../../src/ui/collaboration-outcome-panel.js')
 render(<CollaborationOutcomePanel snapshot={base()} outcome={{state:'blocked',pendingReview:true,blocker:'Review needs units',acceptedPaths:[file.path],artifacts:[{version:file,selectionKey:'run:analysis',scope:'stage',runId:'analysis',epoch:3}],inspectionArtifacts:[]}} onInspect={()=>{}}/>)
 expect(screen.getByRole('heading',{name:'协作需要核对'})).toBeTruthy()
 expect(screen.queryByRole('heading',{name:'分析阶段已验收，等待独立审阅'})).toBeNull()
})
it('does not label inspection of unverified files as accepted results and keeps policy-off budget quiet',async()=>{
 const value=base();value.runs[0]!.resultEpoch=2;value.budget={revision:1,limits:{},consumedRuns:1,legacyRuns:0,knownTokens:0,unknownRuns:0,inFlight:0,elapsedMs:0}
 render(<RunOverview client={client(value)} sessionId="p"/>);await act(async()=>{})
 const panel=screen.getByRole('region',{name:'协作成果'});expect(within(panel).getByRole('button',{name:'查看产物记录'})).toBeTruthy()
 expect(panel.textContent).toContain('执行轮次未设上限');expect(panel.textContent).toContain('审阅预留未启用');expect(panel.textContent).not.toContain('未知');expect(panel.textContent).not.toContain('恢复待核对')
})
it('collapses outcome artifact details in the expanded workflow while preserving the full compact-dock outcome',async()=>{
 render(<RunOverview client={client(base())} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 const panel=screen.getByRole('region',{name:'协作成果'});expect(panel.getAttribute('data-compact')).toBe('true')
 const disclosure=within(panel).getByText('展开成果版本与检查入口').closest('details');expect(disclosure?.open).toBe(false)
})
it('ignores an already queued navigation frame after the overview changes owner',async()=>{
 let frame:FrameRequestCallback|undefined;const raf=vi.spyOn(globalThis,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 77});const cancel=vi.spyOn(globalThis,'cancelAnimationFrame').mockImplementation(()=>{})
 try{
 const c={get:vi.fn().mockImplementation(async(_op,request)=>({...base(),ownerSessionId:request.sessionId}))} as unknown as WorkbenchClient
 const view=render(<RunOverview client={c} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(within(screen.getByRole('region',{name:'协作成果'})).getByRole('button',{name:'查看验收成果'}))
 view.rerender(<RunOverview client={c} sessionId="other"/>);await act(async()=>{})
 const process=screen.getByRole('tab',{name:'过程'});process.focus();act(()=>frame?.(0));expect(document.activeElement).toBe(process)
 }finally{raf.mockRestore();cancel.mockRestore()}
})
it('opens live execution state for an active task without submission feedback',async()=>{
 const value=base();value.runs[0]!.phase='running';value.runs[0]!.state='running'
 render(<RunOverview client={client(value)} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('tab',{name:'产物'}));fireEvent.click(within(screen.getByRole('region',{name:'协作成果'})).getByRole('button',{name:'查看当前任务'}))
 expect(screen.getByRole('tab',{name:'过程'}).getAttribute('aria-selected')).toBe('true')
})
it('shows stage artifacts pending review separately from final acceptance and route sync',async()=>{
 const {CollaborationOutcomePanel}=await import('../../src/ui/collaboration-outcome-panel.js')
 render(<CollaborationOutcomePanel snapshot={base()} outcome={{state:'active',pendingReview:true,routeSync:'conflict',acceptedPaths:[file.path],artifacts:[{version:file,selectionKey:'run:analysis',scope:'stage',runId:'analysis',epoch:3}],inspectionArtifacts:[]}} onInspect={()=>{}}/>)
 const panel=screen.getByRole('region',{name:'协作成果'});expect(within(panel).getByRole('heading',{name:'分析阶段已验收，等待独立审阅'})).toBeTruthy();expect(panel.textContent).toContain('阶段产物');expect(panel.textContent).not.toContain('最终成果');expect(screen.getByRole('status').textContent).toContain('路线回写存在冲突')
})
it.each(['history','stopping'] as const)('keeps the %s explanation when an unfinished review is retained',async state=>{
 const {CollaborationOutcomePanel}=await import('../../src/ui/collaboration-outcome-panel.js')
 render(<CollaborationOutcomePanel snapshot={base()} outcome={{state,pendingReview:true,acceptedPaths:[],artifacts:[],inspectionArtifacts:[]}} onInspect={()=>{}}/>)
 expect(screen.getByRole('region',{name:'协作成果'}).textContent).toContain(state==='history'?'磁盘记录只读':'停止请求已接收')
})
it('preserves host held and recovery reservation counts after the future reservation policy is disabled',async()=>{
 const value=base();value.budget={revision:2,limits:{maxRuns:3,reserveReviewRuns:false},consumedRuns:2,legacyRuns:0,knownTokens:0,unknownRuns:0,inFlight:1,elapsedMs:0,ordinaryRemainingRuns:0,reviewReservedRuns:1,reviewRecoveryRuns:1}
 render(<RunOverview client={client(value)} sessionId="p"/>);await act(async()=>{})
 const panel=screen.getByRole('region',{name:'协作成果'});expect(panel.textContent).toContain('审阅预留 1');expect(panel.textContent).toContain('恢复待核对 1');expect(panel.textContent).not.toContain('审阅预留未启用')
})
it('provides an explicit narrow-panel path to the full workflow view',async()=>{
 render(<RunOverview client={client(base())} sessionId="p"/>);await act(async()=>{})
 expect(screen.getByText('窄面板显示摘要；展开可查看完整目标和成果版本。')).toBeTruthy()
 expect(screen.getByRole('button',{name:'展开流程工作台'})).toBeTruthy()
})
it('opens the current review process while independent review has not submitted findings',async()=>{
 const value=base();value.runs=[]
 const analysis:TeamSnapshot['tasks'][number]={id:'analysis',subject:'analysis',status:'completed',attempt:1,attemptId:'analysis-attempt',createdAt:1,updatedAt:1,dependencies:[],contract:TaskContractSchema.parse({resultType:'model-metrics',outputs:[file.path],access:'workspace-write'}),receipt}
 const review:TeamSnapshot['tasks'][number]={id:'review',subject:'review',status:'pending',attempt:1,attemptId:'review-attempt',createdAt:1,updatedAt:1,dependencies:['analysis'],contract:TaskContractSchema.parse({resultType:'review',inputs:[file.path]})}
 value.team={id:'team',captainSessionId:'p',name:'Research',goal:'Review current outputs',createdAt:1,members:[],messages:[],taskSeq:2,tasks:[analysis,review],pipeline:{version:1,requestId:'pipeline',status:'running',stage:'review',round:0,currentTaskId:'review',taskIds:['analysis','review'],stateRevision:1,startedAt:1,updatedAt:1,routeSync:'pending',maxRevisions:1,route:{routeId:'route',revision:1,stepId:'step'}}}
 render(<RunOverview client={client(value)} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(within(screen.getByRole('region',{name:'协作成果'})).getByRole('button',{name:'查看审阅任务'}))
 expect(document.querySelector('[data-task-detail="review"]')).toBeTruthy();expect(screen.getByRole('tab',{name:'过程'}).getAttribute('aria-selected')).toBe('true')
})
