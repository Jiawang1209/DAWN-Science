import {describe,it,expect} from 'vitest'
import {usageLabel} from '../../src/ui/collaboration-network.js'
import type {RunOverview} from '../../src/protocol/run-overview.js'
const run:RunOverview['runs'][number]={id:'member',kind:'team',label:'Reader',address:['team','member','reader'],epoch:2,updatedAt:1,state:'running',phase:'running',contract:false,inputVersions:0,outputVersions:0,observation:{elapsedMs:1,submissionAttempts:1,invalidSubmissions:0,usage:{input:900,output:100,cacheRead:500}},usageTotals:{source:'host-epoch-deltas',input:12,output:8,cacheRead:40,partial:[],settledEpochs:1,unknownEpochs:0,lastSettledEpoch:1}}
describe('settled member usage',()=>{
 it('uses settled child totals even while next epoch runs, and keeps cache reads separate',()=>{
  expect(usageLabel(run)).toBe('已结算累计 · 20 tokens')
 })
})

import {render,screen} from '@testing-library/react'
import {projectAgentObservation,exactTaskObservationRun} from '../../src/ui/agent-observation.js'
import {AgentObservation} from '../../src/ui/agent-observation-view.js'
const sampled=(patch:Partial<typeof run>={}):typeof run=>({...run,contextObservation:{current:true,reason:'current',sample:{ownerSessionId:'owner',childId:'member',epoch:2,sample:{version:1,availability:'available',source:'sdk-estimate',usedTokens:20,observedAt:1000,provider:'fixture',model:'child-model',contextWindow:100,contextWindowSource:'model-config',composition:{systemBytes:10,toolBytes:20,messageBytes:30,source:'retained-bytes-estimate'}}}},...patch})
const snapshot=(r=sampled(),source:RunOverview['source']='live'):RunOverview=>({ownerSessionId:'owner',source,runs:[r]})
describe('current SDK context qualification',()=>{
 it('separates the current SDK estimate from settled input plus output',()=>{
  const r=sampled(),p=projectAgentObservation(snapshot(r),r)
  expect(p.context.current).toBe(true);expect(p.context.used).toBe(20);expect(p.context.percent).toBe(20)
  expect(p.usage.value).toBe('20 tokens');expect(p.usage.cacheRead).toBe('40 tokens')
  render(<AgentObservation snapshot={snapshot(r)} run={r} details/>);
  expect(screen.getByText('当前上下文 · SDK估算')).toBeTruthy();expect(screen.getByText('已结算累计')).toBeTruthy()
  expect(screen.getByText('组成估算 · 保留内容字节')).toBeTruthy()
  expect(screen.getByText(/不含隐藏推理/)).toBeTruthy();expect(screen.getByText('fixture / child-model')).toBeTruthy()
 })
 it.each(['owner','child','epoch','route','stopping','cancelled','interrupted','disk','source','reason'] as const)('revokes current eligibility for %s',kind=>{
  const r=sampled(),o=r.contextObservation!,b=o.sample!
  if(kind==='owner')b.ownerSessionId='foreign'
  if(kind==='child')b.childId='other'
  if(kind==='epoch')b.epoch=1
  if(kind==='route'){o.current=false;o.reason='route-changed'}
  if(kind==='reason')o.reason='awaiting-sample'
  if(kind==='stopping')r.phase='stopping'
  if(kind==='cancelled'||kind==='interrupted')r.state=kind
  if(kind==='source')(b.sample as unknown as {source:string}).source='unknown'
  const p=projectAgentObservation(snapshot(r,kind==='disk'?'disk':'live'),r)
  expect(p.context.current).toBe(false);expect(p.context.percent).toBeUndefined();expect(p.context.used).toBeUndefined()
 })
 it('guards an explicitly selected owner and treats missing fields as unknown',()=>{
  expect(projectAgentObservation(snapshot(),sampled(),'foreign').context.current).toBe(false)
  expect(projectAgentObservation(snapshot(run),run).context.value).toBe('未知')
 })
 it('shows valid zero, omits proportions without model capacity, and clamps only the bar',()=>{
  const r=sampled(),s=r.contextObservation!.sample!.sample
  if(s.availability!=='available')throw Error('fixture')
  s.usedTokens=0;expect(projectAgentObservation(snapshot(r),r).context.value).toBe('0 / 100 tokens')
  delete s.contextWindow;delete s.contextWindowSource
  const p=projectAgentObservation(snapshot(r),r);expect(p.context.value).toBe('0 tokens');expect(p.context.percent).toBeUndefined()
  s.usedTokens=200;s.contextWindow=100;s.contextWindowSource='model-config'
  expect(projectAgentObservation(snapshot(r),r).context.value).toBe('200 / 100 tokens');expect(projectAgentObservation(snapshot(r),r).context.percent).toBe(100)
 })
 it('unknown SDK samples never fabricate zero or a percentage',()=>{
  const r=sampled();r.contextObservation!.sample!.sample={version:1,availability:'unknown',source:'unknown',reason:'after-compaction',observedAt:1000,provider:'fixture',model:'child-model',contextWindow:100,contextWindowSource:'model-config'}
  const p=projectAgentObservation(snapshot(r),r);expect(p.context.value).toBe('未知');expect(p.context.percent).toBeUndefined()
  render(<AgentObservation snapshot={snapshot(r)} run={r} details/>);expect(screen.queryByRole('meter')).toBeNull();expect(screen.getByText('压缩后等待新样本')).toBeTruthy()
 })
 it('retains an old epoch only as explicitly historical last value',()=>{
  const r=sampled();r.epoch=3;r.contextObservation!.current=false;r.contextObservation!.reason='awaiting-sample'
  render(<AgentObservation snapshot={snapshot(r)} run={r} details/>);
  expect(screen.getByText(/历史最后值 · 20 tokens/)).toBeTruthy();expect(screen.queryByRole('meter')).toBeNull()
 })
})
describe('settled coverage and numeric bounds',()=>{
 it('distinguishes no settlements, legacy uncovered history, missing and known zero',()=>{
  const r=sampled();delete r.usageTotals
  expect(projectAgentObservation(snapshot(r),r).usage.value).toBe('未记录')
  r.usageTotals={source:'host-epoch-deltas',settledEpochs:0,unknownEpochs:0,partial:[]}
  expect(projectAgentObservation(snapshot(r),r).usage.value).toBe('尚未结算')
  r.usageTotals.legacyHistory=true;r.usageTotals.partial=['input','output','cacheRead']
  expect(projectAgentObservation(snapshot(r),r).usage.value).toBe('历史未覆盖')
  r.usageTotals={source:'host-epoch-deltas',input:0,output:0,cacheRead:0,settledEpochs:1,unknownEpochs:0,lastSettledEpoch:1,partial:[]}
  expect(projectAgentObservation(snapshot(r),r).usage.value).toBe('0 tokens')
 })
 it('marks partial fields as lower bounds across two epochs and tasks',()=>{
  const r=sampled();r.usageTotals={source:'host-epoch-deltas',input:12,output:8,cacheRead:40,settledEpochs:2,unknownEpochs:1,lastSettledEpoch:2,partial:['input','cacheRead']}
  const p=projectAgentObservation(snapshot(r),r);expect(p.usage.value).toBe('至少 20 tokens');expect(p.usage.cacheRead).toBe('至少 40 tokens');expect(p.usage.coverage).toContain('2 轮已结算 · 1 轮不完整')
  render(<AgentObservation snapshot={snapshot(r)} run={r} details/>);expect(screen.getByText(/成员跨轮次、跨任务累计/)).toBeTruthy();expect(screen.getByText('费用未记录')).toBeTruthy()
 })
 it('does not fill missing values with zero or sum unsafe input plus output',()=>{
  const r=sampled();r.usageTotals!.input=Number.MAX_SAFE_INTEGER;r.usageTotals!.output=1
  expect(projectAgentObservation(snapshot(r),r).usage.value).toBe('合计超出安全范围')
  delete r.usageTotals!.input;r.usageTotals!.partial=['input'];r.usageTotals!.unknownEpochs=1
  expect(projectAgentObservation(snapshot(r),r).usage.value).toBe('输入或输出未记录')
 })
})
describe('exact task binding',()=>{
 const query={teamId:'team',taskId:'task',attemptId:'token',attempt:1}
 it('requires both timeline epoch ownership and exact current task binding',()=>{
  const r=sampled({taskAttempt:query}),s=snapshot(r)
  expect(exactTaskObservationRun(s,'owner',query,r)).toBe(r)
  expect(exactTaskObservationRun(s,'other',query,r)).toBeUndefined()
  expect(exactTaskObservationRun(s,'owner',{...query,taskId:'old-task'},r)).toBeUndefined()
  expect(exactTaskObservationRun(s,'owner',{...query,attemptId:undefined},r)).toBeUndefined()
  expect(exactTaskObservationRun({...s,runs:[{...r,epoch:3}]},'owner',query,r)).toBeUndefined()
  expect(exactTaskObservationRun(s,'owner',query,{...r,taskAttempt:{...query,attemptId:'new-token'}})).toBeUndefined()
 })
})

import {act,fireEvent,within} from '@testing-library/react'
import {vi} from 'vitest'
import {RunOverview as Overview} from '../../src/ui/run-overview.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
import type {TeamSnapshot} from '../../src/protocol/index.js'
it('shares metrics across roster, network, members and detail and preserves expand/return and owner switches',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
 const r=sampled(),s=snapshot(r),client={get:vi.fn().mockResolvedValue(s)} as unknown as WorkbenchClient
 const view=render(<Overview client={client} sessionId="owner"/>);await act(async()=>{})
 expect(view.container.querySelector('.collaboration-roster .agent-observation[data-context-current="true"]')).toBeTruthy()
 expect(view.container.querySelector('.collaboration-detail .agent-observation-details')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 expect(document.querySelector('.collaboration-network-node .agent-observation[data-context-current="true"]')).toBeTruthy()
 expect(document.querySelector('.collaboration-member-card .agent-observation[data-context-current="true"]')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'返回对话协作台'}))
 expect(screen.getByRole('tab',{name:'过程'}).getAttribute('aria-selected')).toBe('true')
 ;(client.get as ReturnType<typeof vi.fn>).mockResolvedValue({...s,ownerSessionId:'other',runs:[]})
 view.rerender(<Overview client={client} sessionId="other"/>);await act(async()=>{})
 expect(view.container.querySelector('.agent-observation')).toBeNull()
})
it('never borrows a member new assignment context for a selected old task',async()=>{
 const binding={teamId:'team',taskId:'old',attemptId:'old-token',attempt:1},r=sampled({taskAttempt:binding}),s=snapshot(r)
 const task:TeamSnapshot['tasks'][number]={id:'old',subject:'old task',status:'in_progress',attempt:1,attemptId:'old-token',assignee:'reader',dependencies:[],createdAt:1,updatedAt:1}
 s.team={id:'team',captainSessionId:'owner',name:'team',goal:'goal',members:[],tasks:[task],messages:[],taskSeq:1,createdAt:1}
 s.history={events:[{seq:1,at:1,type:'started',childId:r.id,epoch:2,taskAttempt:binding}],truncated:false}
 const get=vi.fn().mockResolvedValue(s),view=render(<Overview client={{get} as unknown as WorkbenchClient} sessionId="owner"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'old task'}))
 const detail=()=>view.container.querySelector('[data-task-detail="old"]')!
 expect(detail().querySelector('.agent-observation[data-context-current="true"]')).toBeTruthy()
 get.mockResolvedValue({...s,runs:[{...r,taskAttempt:{...binding,taskId:'new',attemptId:'new-token'}}]})
 fireEvent.click(screen.getByRole('button',{name:'刷新运行记录'}));await act(async()=>{})
 expect(detail().querySelector('.agent-observation')).toBeNull()
 expect(within(detail() as HTMLElement).getByText('本次任务没有可精确关联的成员观测')).toBeTruthy()
})
it('renders protocol-valid timestamps outside the Date range as unknown time',()=>{
 const r=sampled();r.contextObservation!.sample!.sample.observedAt=Number.MAX_SAFE_INTEGER
 render(<AgentObservation snapshot={snapshot(r)} run={r} details/>);
 expect(screen.getByText('采样时间：未知时间')).toBeTruthy()
 expect(screen.queryByText(/Invalid Date/)).toBeNull()
})
it('labels only actual SDK estimates and makes eligible retained values visibly historical',()=>{
 const unknown=sampled();delete unknown.contextObservation
 let view=render(<AgentObservation snapshot={snapshot(unknown)} run={unknown}/>);
 expect(screen.getByText('当前上下文')).toBeTruthy();expect(screen.queryByText(/SDK估算/)).toBeNull();view.unmount()
 const historical=sampled({phase:'drained',state:'completed'});historical.contextObservation!.current=false;historical.contextObservation!.reason='historical'
 view=render(<AgentObservation snapshot={snapshot(historical)} run={historical}/>);
 expect(screen.getByText('上次上下文 · 历史（估算）')).toBeTruthy();expect(view.container.querySelector('.agent-observation-row')?.textContent).toContain('20 tokens');expect(screen.queryByRole('meter')).toBeNull();view.unmount()
 historical.contextObservation!.sample!.ownerSessionId='foreign'
 render(<AgentObservation snapshot={snapshot(historical)} run={historical}/>);
 expect(screen.queryByText('上次上下文 · 历史（估算）')).toBeNull();expect(screen.getByText('未知')).toBeTruthy()
})
it('never exposes a future-epoch value as this member historical context',()=>{
 const r=sampled();r.contextObservation!.sample!.epoch=3;r.contextObservation!.current=false
 const p=projectAgentObservation(snapshot(r),r)
 expect(p.context.sample).toBeUndefined();expect(p.context.value).toBe('未知')
})
it('does not call a detached direct-run epoch current after the snapshot advanced',()=>{
 const old=sampled(),advanced={...old,epoch:3}
 const p=projectAgentObservation(snapshot(advanced),old)
 expect(p.context.current).toBe(false);expect(p.context.percent).toBeUndefined()
})
