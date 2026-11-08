import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,render,screen,act,fireEvent} from '@testing-library/react'
import {RunOverview} from '../../src/ui/run-overview.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
import type {RunOverview as Snapshot} from '../../src/protocol/run-overview.js'
import {WORKBENCH_PROTOCOL_VERSION} from '../../src/protocol/index.js'
import {captureEvidenceHandoff} from '../../src/subagent/handoff-sources.js'
import {handoffRouteLines} from '../../src/ui/handoff-route.js'
afterEach(cleanup)
it('presents route evidence as readable fields rather than raw implementation JSON',()=>{
 const lines=handoffRouteLines(JSON.stringify({title:'碳分析',goal:'按约定方法统计',step:{title:'统计',purpose:'保留单位',inputs:['in.csv'],outputs:['result.json']}}))
 expect(lines.join('\n')).toContain('步骤目的：保留单位')
 expect(lines.join('\n')).toContain('输入：in.csv')
 expect(lines.join('\n')).not.toContain('"step"')
 expect(handoffRouteLines('invalid')).toEqual(['历史路线内容无法呈现，请核对引用原文'])
})
it('labels evidence handoff as historical references without implying approval or live file validity',async()=>{
 const data=snapshot('p');data.runs[0]!.handoff=captureEvidenceHandoff('p',[{type:'message',id:'early',message:{role:'user',content:'早期批准方法与单位'}}],{recentMessages:1,messageIds:['early']},{})
 render(<RunOverview client={{get:vi.fn().mockResolvedValue(data)} as unknown as WorkbenchClient} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('tab',{name:'交接'}))
 expect(screen.getByText(/历史版本尚未重新核验/)).toBeTruthy()
 expect(screen.getByText('早期批准方法与单位')).toBeTruthy()
 expect(screen.getByText(/交接总计/)).toBeTruthy()
})
function deferred(){let resolve!:(s:Snapshot)=>void;const promise=new Promise<Snapshot>(r=>resolve=r);return{promise,resolve}}
const snapshot=(ownerSessionId:string):Snapshot=>({ownerSessionId,source:'live',runs:[{id:'child',kind:'subagent',label:ownerSessionId+' reader',address:['call','0'],state:'running',phase:'stopping',epoch:3,updatedAt:1,contract:true,receipt:'blocked',inputVersions:1,outputVersions:0}]})
it('shows real drain and acceptance facts, routes transcript selection, and drops stale owner replies',async()=>{
 const a=deferred(),b=deferred(),view=vi.fn(),get=vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise),client={get} as unknown as WorkbenchClient
 const rendered=render(<RunOverview client={client} sessionId="a" onView={view}/>)
 rendered.rerender(<RunOverview client={client} sessionId="b" onView={view}/>)
 await act(async()=>a.resolve(snapshot('a')))
 expect(screen.queryByText('a reader')).toBeNull()
 await act(async()=>b.resolve(snapshot('b')))
 expect(screen.getAllByText('停止中，等待进程排空')[0]).toBeTruthy()
 expect(screen.queryByText(/宿主验收阻塞/)).toBeNull()
 expect(screen.getByText('暂无宿主验收回执')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'查看子任务过程'}))
 expect(view).toHaveBeenCalledWith('b#sub:call:0')
 rendered.unmount();expect(get).toHaveBeenCalledTimes(2)
})
it('reports read failures instead of keeping a stale success',async()=>{
 const get=vi.fn().mockRejectedValue(new Error('corrupt record'))
 render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="p"/>)
 await act(async()=>{})
 expect(screen.getByRole('alert').textContent).toBe('corrupt record')
})
it('shows lock blockers and bounded host history without calling a historical holder live',async()=>{
 const data=snapshot('p');data.runs[0]!.phase='running';data.runs[0]!.activity={stage:'lock-wait',since:1,blockers:[{ownerSessionId:'other',childId:'holder',label:'writer',epoch:2}]}
 data.history={events:[{seq:4,at:1,type:'stage',childId:'child',epoch:3,stage:'lock-wait'}],truncated:true}
 const client={get:vi.fn().mockResolvedValue(data)} as unknown as WorkbenchClient
 const view=render(<RunOverview client={client} sessionId="p"/>)
 await act(async()=>{})
 expect(view.container.querySelector('.run-activity')?.textContent).toContain('等待产物锁')
 expect(screen.getByText(/writer.*代次 2/)).toBeTruthy()
 fireEvent.click(screen.getAllByText('关键执行历史')[0]!)
 expect(screen.getAllByText(/较早历史已省略/)[0]).toBeTruthy()
 view.unmount();data.source='disk'
 render(<RunOverview client={client} sessionId="p"/>);await act(async()=>{})
 expect(screen.getByText(/历史阶段.*等待产物锁/)).toBeTruthy()
 expect(screen.queryByText(/^等待者当前被/)).toBeNull()
})

function bindingTeam(id:string,owner='binding'):import('../../src/protocol/index.js').TeamSnapshot{return{id,captainSessionId:owner,name:id,goal:'goal',createdAt:1,members:[],messages:[],taskSeq:1,tasks:[{id:'t1',subject:id+' task',status:'pending',dependencies:[],attempt:1,createdAt:1,updatedAt:1}]}}
it('uses the authoritative same-snapshot team instead of a stale parent and explicitly clears it with null',async()=>{
 const parent=bindingTeam('stale A'),owned=bindingTeam('owned B'),data={...snapshot('binding'),team:owned},get=vi.fn().mockResolvedValue(data)
 const view=render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="binding" team={parent}/>);await act(async()=>{})
 expect(screen.queryByRole('button',{name:'stale A task'})).toBeNull();expect(screen.getByRole('button',{name:'owned B task'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'owned B task'}));expect(view.container.querySelector('[data-task-detail="t1"]')).toBeTruthy()
 get.mockResolvedValue({...data,team:null});fireEvent.click(screen.getByRole('button',{name:'刷新运行记录'}));await act(async()=>{})
 expect(screen.queryByRole('button',{name:'owned B task'})).toBeNull();expect(screen.queryByRole('button',{name:'stale A task'})).toBeNull();expect(view.container.querySelector('[data-task-detail="t1"]')).toBeNull()
})
it('ignores foreign authoritative teams and only falls back to the parent when snapshot team is absent',async()=>{
 const parent=bindingTeam('legacy A','binding-legacy'),get=vi.fn().mockResolvedValue({...snapshot('binding-legacy'),team:bindingTeam('foreign','other')})
 render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="binding-legacy" team={parent}/>);await act(async()=>{})
 expect(screen.queryByRole('button',{name:'foreign task'})).toBeNull();expect(screen.queryByRole('button',{name:'legacy A task'})).toBeNull()
 get.mockResolvedValue(snapshot('binding-legacy'));fireEvent.click(screen.getByRole('button',{name:'刷新运行记录'}));await act(async()=>{})
 expect(screen.getByRole('button',{name:'legacy A task'})).toBeTruthy()
})
it('push refresh keeps the same snapshot projection, selected tab, expanded view and task inspection scoped to the owner',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
 const owner='binding-refresh',team=bindingTeam('current',owner);let notify!:(e:import('../../src/protocol/index.js').RunOverviewChanged)=>void
 const get=vi.fn().mockResolvedValue({...snapshot(owner),team,observation:{observerId:'A',revision:0}}),client={get,subscribeRunOverviewChanges:(cb:typeof notify)=>{notify=cb;return()=>{}}} as unknown as WorkbenchClient
 const view=render(<RunOverview client={client} sessionId={owner} team={bindingTeam('stale',owner)}/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'current task'}));fireEvent.click(screen.getByRole('tab',{name:'记录'}));fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}));fireEvent.click(screen.getByRole('button',{name:'current task'}))
 const close=screen.getByRole('button',{name:'收起检查面板'});expect(document.activeElement).toBe(close)
 get.mockResolvedValue({...snapshot(owner),team:{...team,tasks:[{...team.tasks[0]!,subject:'updated current task'}]},observation:{observerId:'A',revision:1}})
 act(()=>notify({type:'runOverviewChanged',ownerSessionId:owner,observerId:'A',revision:1,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION} as import('../../src/protocol/index.js').RunOverviewChanged));await act(async()=>{})
 expect(screen.getByRole('dialog',{name:'流程工作台'})).toBeTruthy();expect(screen.getByRole('tab',{name:'记录'}).getAttribute('aria-selected')).toBe('true');expect(document.activeElement).toBe(close)
 expect(screen.getByRole('button',{name:'updated current task'}).getAttribute('aria-pressed')).toBe('true');expect(screen.queryByRole('button',{name:'stale task'})).toBeNull()
 get.mockResolvedValue({...snapshot('binding-other'),team:null});view.rerender(<RunOverview client={client} sessionId="binding-other" team={team}/>);await act(async()=>{})
 expect(screen.queryByRole('button',{name:'updated current task'})).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('tab',{name:'过程'}).getAttribute('aria-selected')).toBe('true')
})
it('retains expanded preferences when a dock switch opens a member and the summary opens collaboration again',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
 const owner='summary-return',client={get:vi.fn().mockResolvedValue(snapshot(owner))} as unknown as WorkbenchClient
 const first=render(<RunOverview client={client} sessionId={owner} onView={()=>{}}/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('tab',{name:'产物'}));fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 fireEvent.click(screen.getByRole('button',{name:owner+' reader'}));fireEvent.click(screen.getByRole('button',{name:'查看子任务过程'}))
 first.unmount()
 render(<RunOverview client={client} sessionId={owner} onView={()=>{}}/>);await act(async()=>{})
 expect(screen.getByRole('dialog',{name:'流程工作台'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:owner+' reader'}))
 expect(screen.getByRole('tab',{name:'产物'}).getAttribute('aria-selected')).toBe('true')
})
it('expires a pending Bot navigation when selection changes before the host reply',async()=>{
 const owner='late-bot',data=snapshot(owner)
 data.team={id:'t',captainSessionId:owner,name:'Team',goal:'Goal',createdAt:1,taskSeq:0,tasks:[],messages:[],members:['alice','bob'].map(name=>({name,agent:name,botId:name,sessionId:name+'-session',status:'idle' as const,sessionDir:'unused',turns:1,joinedAt:1,orchestrationId:name+'-gen'}))}
 data.runs=['alice','bob'].map(name=>({...data.runs[0]!,id:name,label:name,kind:'bot' as const,address:['t',name,name+'-gen']}))
 let valid:undefined|(()=>boolean),resolve!:()=>void
 const onBot=vi.fn((...args:unknown[])=>{valid=args[3] as ()=>boolean;return new Promise<void>(r=>{resolve=r})})
 render(<RunOverview client={{get:vi.fn().mockResolvedValue(data)} as unknown as WorkbenchClient} sessionId={owner} onBot={onBot}/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'打开成员只读对话'}))
 expect(typeof valid).toBe('function');expect(valid!()).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'bob'}));expect(valid!()).toBe(false)
 await act(async()=>resolve())
})
