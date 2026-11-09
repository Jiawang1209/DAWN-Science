import {PlanningSourceStateSchema} from '../../src/protocol/planning-contract-source.js'
import {resetCollaborationViews} from '../../src/ui/state/collaboration-view.js'
import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {PlanningContractSourceForm} from '../../src/ui/planning-contract-source-form.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
afterEach(()=>{cleanup();resetCollaborationViews()})
function mockClient(get:unknown=vi.fn(async()=>({revision:0}))){return{get} as unknown as WorkbenchClient}
async function fill(){
 for(const[name,value]of [['输入文件（每行一个）','input.csv'],['产物目录','results/study'],['分析方法','计算均值'],['数据单位','m'],['缺失值处理','遇到缺失时停止']] as const)fireEvent.change(screen.getByRole('textbox',{name}),{target:{value}})
}
it('requires explicit scientific values, confirms metadata only and separates approval',async()=>{
 const confirm=vi.fn(async(_s:unknown,_r:number,_signal:AbortSignal)=>({revision:1,fingerprint:'a'.repeat(64)}))
 render(<PlanningContractSourceForm client={mockClient()} ownerSessionId="a" disabled={false} onConfirm={confirm}/>);await act(async()=>{})
 fireEvent.click(screen.getByText('科研任务约束'))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'确认约束'})))
 expect(confirm).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('请补齐')
 await fill();await act(async()=>fireEvent.click(screen.getByRole('button',{name:'确认约束'})))
 expect(confirm).toHaveBeenCalledOnce();expect(confirm.mock.calls[0]).toEqual([expect.objectContaining({template:expect.objectContaining({units:'m'}),inputs:['input.csv']}),0,expect.any(AbortSignal)])
 expect(screen.getByRole('status').textContent).toContain('重新安排');expect(screen.queryByRole('button',{name:'采纳方案'})).toBeNull()
})
it('ignores late owner reads and cancels a confirmation waiting across an owner switch',async()=>{
 let finish!:(value:unknown)=>void
 const get=vi.fn((operation:string)=>operation==='getAnalysisRoute'?Promise.resolve({}):new Promise(resolve=>{finish=resolve}))
 const confirm=vi.fn(async()=>({revision:1}))
 const view=render(<PlanningContractSourceForm client={mockClient(get)} ownerSessionId="a" disabled={false} onConfirm={confirm}/>);
 view.rerender(<PlanningContractSourceForm client={mockClient()} ownerSessionId="b" disabled={false} onConfirm={confirm}/>);await act(async()=>{})
 await act(async()=>finish({revision:9,issue:'owner A issue'}));expect(screen.queryByText('owner A issue')).toBeNull()
 fireEvent.click(screen.getByText('科研任务约束'));await fill()
 let signal:AbortSignal|undefined,resolve!:()=>void
 const pending=vi.fn((_s:unknown,_r:number,s:AbortSignal)=>{signal=s;return new Promise<{revision:number}>(done=>{resolve=()=>done({revision:1})})})
 view.rerender(<PlanningContractSourceForm client={mockClient()} ownerSessionId="b" disabled={false} onConfirm={pending}/>);await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'确认约束'}));expect(pending).toHaveBeenCalledOnce()
 view.rerender(<PlanningContractSourceForm client={mockClient()} ownerSessionId="c" disabled={false} onConfirm={pending}/>);
 expect(signal?.aborted).toBe(true);await act(async()=>resolve());expect(screen.queryByText(/已确认约束/)).toBeNull()
})
it('does not silently remove a stored route binding when route metadata is unavailable',async()=>{
 const source={version:1,ownerSessionId:'a',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block'},inputs:['input.csv'],outputRoot:'results',requireExecution:true,independentReview:false,route:{routeId:'route',revision:1,stepId:'step'}}
 const get=vi.fn(async(operation:string)=>{if(operation==='getAnalysisRoute')throw Error('route unavailable');return{revision:1,source}}),confirm=vi.fn(async()=>({revision:2}))
 render(<PlanningContractSourceForm client={mockClient(get)} ownerSessionId="a" disabled={false} onConfirm={confirm}/>);await act(async()=>{});fireEvent.click(screen.getByText(/科研任务约束/))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'确认约束'})));expect(confirm).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('路线')
})
it('preserves unconfirmed fields and open state through expansion remounts but isolates owners',async()=>{
 const client=mockClient(),confirm=vi.fn(async()=>({revision:1}))
 const first=render(<PlanningContractSourceForm client={client} ownerSessionId="draft-owner" disabled={false} onConfirm={confirm}/>);await act(async()=>{});fireEvent.click(screen.getByText('科研任务约束'));await fill();first.unmount()
 const second=render(<PlanningContractSourceForm client={client} ownerSessionId="draft-owner" disabled={false} onConfirm={confirm}/>);await act(async()=>{})
 expect(screen.getByRole('textbox',{name:'分析方法'})).toHaveProperty('value','计算均值');expect(second.container.querySelector('details')?.open).toBe(true)
 second.rerender(<PlanningContractSourceForm client={client} ownerSessionId="other-draft-owner" disabled={false} onConfirm={confirm}/>);await act(async()=>{});fireEvent.click(screen.getByText('科研任务约束'));expect(screen.getByRole('textbox',{name:'分析方法'})).toHaveProperty('value','')
})
function confirmedState(tolerance=1e-6){return{revision:1,source:{version:1,ownerSessionId:'a',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block',absoluteTolerance:tolerance}},inputs:['input.csv'],dataPath:'input.csv',outputRoot:'results',requireExecution:true,independentReview:false}}}
it('preserves the confirmed numeric tolerance instead of silently replacing it with the default',async()=>{
 const confirm=vi.fn(async(_s:unknown,_r:number,_signal:AbortSignal)=>PlanningSourceStateSchema.parse(confirmedState()))
 render(<PlanningContractSourceForm client={mockClient(vi.fn(async()=>confirmedState()))} ownerSessionId="a" disabled={false} onConfirm={confirm}/>);await act(async()=>{});fireEvent.click(screen.getByText(/科研任务约束/))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'确认约束'})))
 expect(confirm).toHaveBeenCalledWith(expect.objectContaining({template:expect.objectContaining({validation:expect.objectContaining({absoluteTolerance:1e-6})})}),1,expect.any(AbortSignal))
})
it('labels edited fields as unconfirmed rather than the active frozen source',async()=>{
 render(<PlanningContractSourceForm client={mockClient(vi.fn(async()=>confirmedState()))} ownerSessionId="a" disabled={false} onConfirm={vi.fn()}/>);await act(async()=>{});fireEvent.click(screen.getByText(/科研任务约束/))
 fireEvent.change(screen.getByRole('textbox',{name:'数据单位'}),{target:{value:'cm'}})
 expect(screen.getByRole('status').textContent).toContain('尚未确认')
})
it('releases cancelled form admission when the client changes for the same owner and ignores the old acknowledgement',async()=>{
 let signal:AbortSignal|undefined,resolve!:(value:{revision:number})=>void
 const confirm=vi.fn((_s:unknown,_r:number,s:AbortSignal)=>{signal=s;return new Promise<{revision:number}>(done=>{resolve=done})}),client=mockClient()
 const view=render(<PlanningContractSourceForm client={client} ownerSessionId="a" disabled={false} onConfirm={confirm}/>);await act(async()=>{});fireEvent.click(screen.getByText('科研任务约束'));await fill();fireEvent.click(screen.getByRole('button',{name:'确认约束'}))
 const replacement=mockClient();view.rerender(<PlanningContractSourceForm client={replacement} ownerSessionId="a" disabled={false} onConfirm={confirm}/>);await act(async()=>{})
 expect(signal?.aborted).toBe(true);expect(screen.getByRole('button',{name:'确认约束'})).toHaveProperty('disabled',false)
 await act(async()=>resolve({revision:99}));expect(view.container.textContent).not.toContain('第 99 版');expect(screen.getByRole('button',{name:'确认约束'})).toHaveProperty('disabled',false)
})
it('reports a cleared source explicitly and returns edited fields to draft status',async()=>{
 const confirm=vi.fn(async()=>({revision:2}))
 render(<PlanningContractSourceForm client={mockClient(vi.fn(async()=>confirmedState()))} ownerSessionId="a" disabled={false} onConfirm={confirm}/>);await act(async()=>{});fireEvent.click(screen.getByText(/科研任务约束/))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'清除约束'})));expect(screen.getByRole('status').textContent).toContain('已清除')
 fireEvent.change(screen.getByRole('textbox',{name:'数据单位'}),{target:{value:'cm'}});expect(screen.getByRole('status').textContent).toContain('尚未确认')
})
