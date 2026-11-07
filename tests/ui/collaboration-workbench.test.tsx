import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {CommandPalette} from '../../src/ui/palette.js'
import {RunOverview} from '../../src/ui/run-overview.js'
import {CollaborationSummary} from '../../src/ui/collaboration-summary.js'
import type {RunOverview as Snapshot} from '../../src/protocol/run-overview.js'
import type {TeamSnapshot} from '../../src/protocol/index.js'
import {collaborationTaskKey} from '../../src/ui/collaboration-model.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(()=>{cleanup();vi.useRealTimers()})
const run=(id:string):Snapshot['runs'][number]=>({id,kind:'subagent',label:id,address:['call',id],state:'completed',phase:'drained',epoch:1,updatedAt:1,contract:true,inputVersions:1,outputVersions:1})
const data=():Snapshot=>({ownerSessionId:'p',source:'live',runs:[{...run('one'),receipt:'blocked'},{...run('two'),receipt:'accepted'}]})
const client=(value:Snapshot)=>({get:vi.fn().mockResolvedValue(value)}) as unknown as WorkbenchClient
it('counts only accepted receipts and shares one polling source with the conversation summary',async()=>{
 const c=client(data()),open=vi.fn();render(<><CollaborationSummary client={c} sessionId="p" onOpen={open}/><RunOverview client={c} sessionId="p"/></>);await act(async()=>{})
 expect(c.get).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:/打开协作.*2 项.*1 项验收通过/}));expect(open).toHaveBeenCalledOnce()
 expect(screen.getByRole('button',{name:'one'})).toBeTruthy()
 fireEvent.click(screen.getByRole('tab',{name:'产物'}));expect(screen.getByText('宿主验收阻塞')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'two'}));expect(screen.getByText('宿主验收通过')).toBeTruthy()
 expect(screen.queryByText('宿主验收阻塞')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}));expect(screen.getByRole('region',{name:'流程工作台'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'two'}))
 expect(screen.getByRole('tab',{name:'产物'}).getAttribute('aria-selected')).toBe('true')
 fireEvent.click(screen.getByRole('button',{name:'返回对话协作台'}));expect(screen.getByText('宿主验收通过')).toBeTruthy()
})
it('does not imply live work from disk snapshots or completed-only acceptance',async()=>{
 const s=data();s.source='disk';s.runs=s.runs.map(r=>({...r,phase:'unknown',state:'running',receipt:undefined}));render(<CollaborationSummary client={client(s)} sessionId="p" onOpen={()=>{}}/>);await act(async()=>{})
 expect(screen.getByRole('button').textContent).toContain('历史记录')
 expect(screen.getByRole('button').textContent).not.toContain('正在执行')
 expect(screen.getByRole('button').textContent).toContain('0 项验收通过')
})
it('keeps empty summaries out of the main conversation',async()=>{
 render(<CollaborationSummary client={client({...data(),runs:[]})} sessionId="p" onOpen={()=>{}}/>);await act(async()=>{});expect(screen.queryByRole('button')).toBeNull()
})
it('stops polling after the last subscriber leaves and does not start overlapping requests on refresh',async()=>{
 vi.useFakeTimers();let resolve!:(s:Snapshot)=>void;const get=vi.fn().mockReturnValue(new Promise<Snapshot>(r=>{resolve=r})),c={get} as unknown as WorkbenchClient
 const view=render(<RunOverview client={c} sessionId="p"/>);await act(async()=>{});fireEvent.click(screen.getByRole('button',{name:'刷新运行记录'}));expect(get).toHaveBeenCalledTimes(1)
 view.unmount();await act(async()=>{resolve(data());await vi.advanceTimersByTimeAsync(10000)});expect(get).toHaveBeenCalledTimes(1)
})
it('reports an unstarted task blocked by budget instead of claiming execution settled',async()=>{
 const s=data();s.runs=[{...run('not-started'),state:'idle',phase:'idle',epoch:0,receipt:undefined}];s.budget={revision:1,limits:{maxRuns:1},consumedRuns:1,legacyRuns:0,knownTokens:0,unknownRuns:0,inFlight:0,elapsedMs:0,blocked:{code:'runs',message:'轮次用完'}}
 render(<CollaborationSummary client={client(s)} sessionId="p" onOpen={()=>{}}/>);await act(async()=>{})
 expect(screen.getByRole('button').textContent).toContain('额度阻止继续执行')
 expect(screen.getByRole('button').textContent).not.toContain('执行已结算')
})
it('uses keyboard tabs and restores each session reading position without carrying it into another owner',async()=>{
 const get=vi.fn().mockImplementation(async(_op,request)=>({...data(),ownerSessionId:request.sessionId,runs:data().runs.map(r=>({...r,label:request.sessionId+' '+r.label}))})),c={get} as unknown as WorkbenchClient
 const view=render(<RunOverview client={c} sessionId="a"/>);await act(async()=>{})
 const process=screen.getByRole('tab',{name:'过程'});process.focus();fireEvent.keyDown(process,{key:'ArrowRight'})
 expect(screen.getByRole('tab',{name:'交接'}).getAttribute('aria-selected')).toBe('true')
 expect(document.activeElement).toBe(screen.getByRole('tab',{name:'交接'}))
 view.rerender(<RunOverview client={c} sessionId="b"/>);await act(async()=>{})
 expect(screen.queryByText('a one')).toBeNull();expect(screen.getByRole('tab',{name:'过程'}).getAttribute('aria-selected')).toBe('true')
 view.rerender(<RunOverview client={c} sessionId="a"/>);await act(async()=>{})
 expect(screen.getByRole('tab',{name:'交接'}).getAttribute('aria-selected')).toBe('true')
})

it('binds task selection to the team identity and does not select a new team task with the same ID',async()=>{
 const mkTeam=(id:string,label:string):TeamSnapshot=>({id,captainSessionId:'p',name:id,goal:'g',createdAt:1,members:[],messages:[],taskSeq:1,tasks:[{id:'t1',subject:label,status:'pending',dependencies:[],attempt:1,createdAt:1,updatedAt:1}]})
 const c=client(data()),old=mkTeam('old','old task'),next=mkTeam('new','new task')
 const view=render(<RunOverview client={c} sessionId="p" team={old}/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'old task'}));fireEvent.click(screen.getByRole('tab',{name:'记录'}))
 view.rerender(<RunOverview client={c} sessionId="p" team={next}/>);await act(async()=>{})
 expect(screen.getByRole('button',{name:'new task'}).getAttribute('aria-pressed')).toBe('false')
 expect(view.container.querySelector('[data-task-detail="t1"]')).toBeNull()
 expect(collaborationTaskKey('old','t1')).not.toBe(collaborationTaskKey('new','t1'))
})

it('closes the expanded native modal before opening the existing command palette',async()=>{
 render(<><RunOverview client={client(data())} sessionId="p"/><CommandPalette commands={[]}/></>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 fireEvent.keyDown(screen.getByRole('dialog',{name:'流程工作台'}),{key:'k',metaKey:true})
 expect(screen.queryByRole('dialog',{name:'流程工作台'})).toBeNull()
 expect(document.activeElement).toBe(screen.getByRole('combobox',{name:'搜索命令'}))
})
it('lets existing file navigation run after closing the workbench and does not remember a hidden expanded modal',async()=>{
 render(<RunOverview client={client(data())} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 const navigate=vi.fn();document.addEventListener('keydown',navigate)
 try{fireEvent.keyDown(screen.getByRole('dialog',{name:'流程工作台'}),{key:'p',metaKey:true})}finally{document.removeEventListener('keydown',navigate)}
 expect(navigate).toHaveBeenCalledOnce()
 expect(screen.queryByRole('dialog',{name:'流程工作台'})).toBeNull()
 expect(screen.getByRole('button',{name:'展开流程工作台'})).toBeTruthy()
})
it('does not open a background command palette from an IME-owned shortcut inside the modal',async()=>{
 render(<><RunOverview client={client(data())} sessionId="p"/><CommandPalette commands={[]}/></>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 fireEvent.keyDown(screen.getByRole('dialog',{name:'流程工作台'}),{key:'k',metaKey:true,isComposing:true})
 expect(screen.getByRole('dialog',{name:'流程工作台'})).toBeTruthy()
 expect(screen.queryByRole('dialog',{name:'命令面板'})).toBeNull()
})
it('coordinates command navigation even if focus temporarily falls on the body while the modal is open',async()=>{
 render(<><RunOverview client={client(data())} sessionId="p"/><CommandPalette commands={[]}/></>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 fireEvent.keyDown(document.body,{key:'k',metaKey:true})
 expect(screen.queryByRole('dialog',{name:'流程工作台'})).toBeNull()
 expect(document.activeElement).toBe(screen.getByRole('combobox',{name:'搜索命令'}))
})
it('returns focus to the selected card when the expanded detail drawer closes',async()=>{
 render(<RunOverview client={client(data())} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'展开流程工作台'}))
 const card=screen.getByRole('button',{name:'one'});fireEvent.click(card)
 const close=screen.getByRole('button',{name:'收起检查面板'});close.focus();fireEvent.click(close)
 expect(document.activeElement).toBe(card)
})
