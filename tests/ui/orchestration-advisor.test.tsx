import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {OrchestrationAdvisor} from '../../src/ui/orchestration-advisor.js'
afterEach(cleanup)
it('defaults to automatic arrangement and requests the concrete task without any count input',async()=>{
 const generate=vi.fn(async(_task:string,_adjustment:string,_signal:AbortSignal)=>{})
 const view=render(<OrchestrationAdvisor task="计算 input.csv 的均值" onGenerate={generate}/>);
 expect(screen.getByText('自动安排')).toBeTruthy();expect(view.container.querySelector('input[type="number"]')).toBeNull()
 expect(screen.getByRole('textbox',{name:'任务目标'})).toHaveProperty('value','计算 input.csv 的均值')
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'生成安排'})))
 expect(generate).toHaveBeenCalledTimes(1);expect(generate.mock.calls[0]?.[0]).toBe('计算 input.csv 的均值')
 expect(screen.getByText('规划请求已发送；结果由模型提交后显示。')).toBeTruthy()
})
it('keeps task text after failure and rejects empty or busy generation',async()=>{
 const generate=vi.fn(async()=>{throw Error('owner changed')})
 const view=render(<OrchestrationAdvisor task="" onGenerate={generate}/>);
 expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',true)
 fireEvent.change(screen.getByRole('textbox',{name:'任务目标'}),{target:{value:'比较两份数据'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'生成安排'})))
 expect(screen.getByRole('alert').textContent).toBe('owner changed')
 expect(screen.getByRole('textbox',{name:'任务目标'})).toHaveProperty('value','比较两份数据')
 view.rerender(<OrchestrationAdvisor task="" busy onGenerate={generate}/>)
 expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',true)
})
it('reports a completed model turn without a new proposal rather than waiting forever',async()=>{
 const props={task:'计算均值',replyVersion:'old',onGenerate:vi.fn(async()=>{})}
 const view=render(<OrchestrationAdvisor {...props}/>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'生成安排'})))
 view.rerender(<OrchestrationAdvisor {...props} replyVersion="new-completed-turn"/>);
 expect(screen.getByRole('alert').textContent).toContain('本轮没有提交新的有效任务安排')
})
it('locks regeneration and repeated stop while a stop acknowledgement is pending',async()=>{
 let done!:()=>void
 const onGenerate=vi.fn(async()=>{}),onStop=vi.fn(()=>new Promise<void>(r=>{done=r}))
 const props={task:'计算均值',busy:true,planning:true,onGenerate,onStop}
 const view=render(<OrchestrationAdvisor {...props}/>)
 fireEvent.click(screen.getByRole('button',{name:'中止规划'}))
 view.rerender(<OrchestrationAdvisor {...props} busy={false}/>)
 expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',true)
 const stop=screen.getByRole('button',{name:'中止规划'});expect(stop).toHaveProperty('disabled',true)
 fireEvent.click(stop);expect(onStop).toHaveBeenCalledOnce();expect(onGenerate).not.toHaveBeenCalled()
 await act(async()=>done())
 expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',false)
})

it('passes approved status to the arrangement and explains revision without offering to edit frozen work',async()=>{
 const {serializeTaskArrangement}=await import('../../src/protocol/task-arrangement.js')
 const markdown=serializeTaskArrangement({mode:'single',rationale:'one task',independentReview:false,questions:[],tasks:[{id:'mean',title:'mean',goal:'mean',role:'analyst',inputs:['in.csv'],outputs:['mean.csv'],dependencies:[],acceptance:'checked',review:false}]})
 const plan={type:'plan' as const,id:'i',planId:'p',version:1,title:'mean',markdown,status:'approved' as const}
 const view=render(<OrchestrationAdvisor task="mean" plan={plan} onGenerate={vi.fn(async()=>{})}/>);
 expect(view.container.textContent).toContain('实际执行与验收以协作记录为准')
 expect(view.container.textContent).toContain('原有任务不会自动重跑')
 expect(view.container.textContent).not.toContain('可在对话中的方案卡修改并采纳')
})

async function clarificationPlan(){
 const {serializeTaskArrangement}=await import('../../src/protocol/task-arrangement.js')
 return{type:'plan' as const,id:'i',planId:'clarify',version:1,title:'确认单位',status:'proposed' as const,markdown:serializeTaskArrangement({mode:'single',rationale:'缺单位',independentReview:false,questions:['carbon 的单位是什么？'],tasks:[{id:'inspect',title:'等待单位',goal:'先确认',role:'分析员',inputs:['in.csv'],outputs:[],dependencies:[],acceptance:'不猜单位',review:false}]})}
}
it('collects all questions and generates a new proposal without approving the old plan',async()=>{
 const plan=await clarificationPlan(),onGenerate=vi.fn(async(_goal:string,_answers:string,_signal:AbortSignal)=>{})
 render(<OrchestrationAdvisor task="计算均值" plan={plan} onGenerate={onGenerate}/>);
 const button=screen.getByRole('button',{name:'补充后重新规划'})
 expect(button).toHaveProperty('disabled',true)
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}})
 await act(async()=>fireEvent.click(button))
 expect(onGenerate).toHaveBeenCalledOnce();expect(onGenerate.mock.calls[0]).toEqual(['计算均值',expect.stringContaining('mg/g'),expect.any(AbortSignal)])
 expect(onGenerate.mock.calls[0]?.[1]).toContain('clarify');expect(screen.getByText('等待新方案，采纳后才执行。')).toBeTruthy()
})
it('retains failed clarification answers and aborts their pending request when the proposal changes',async()=>{
 const plan=await clarificationPlan(),generate=vi.fn(async()=>{throw Error('retry later')})
 const view=render(<OrchestrationAdvisor task="计算均值" plan={plan} onGenerate={generate}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'})))
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','mg/g')
 let signal:AbortSignal|undefined,finish!:()=>void
 const pending=vi.fn((_goal:string,_answers:string,s:AbortSignal)=>{signal=s;return new Promise<void>(resolve=>{finish=resolve})})
 view.rerender(<OrchestrationAdvisor task="计算均值" plan={plan} onGenerate={pending}/>);
 fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'}))
 view.rerender(<OrchestrationAdvisor task="计算均值" plan={{...plan,planId:'new',version:2}} onGenerate={pending}/>);
 expect(signal?.aborted).toBe(true)
 await act(async()=>finish())
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','')
 expect(screen.queryByText('等待新方案，采纳后才执行。')).toBeNull()
})
it('can replan restored questions when the conversation composer draft is empty',async()=>{
 const plan=await clarificationPlan(),generate=vi.fn(async()=>{})
 render(<OrchestrationAdvisor task="" plan={plan} onGenerate={generate}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}})
 expect(screen.getByRole('button',{name:'补充后重新规划'})).toHaveProperty('disabled',false)
})

it('allows retry after a clarification turn ends without a new proposal and retains its answers',async()=>{
 const plan=await clarificationPlan(),generate=vi.fn(async(_g:string,_a:string,_s:AbortSignal)=>{})
 const view=render(<OrchestrationAdvisor task="均值" plan={plan} replyVersion="old" onGenerate={generate}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'})))
 view.rerender(<OrchestrationAdvisor task="均值" plan={plan} replyVersion="finished" onGenerate={generate}/>);
 expect(screen.getByRole('button',{name:'补充后重新规划'})).toHaveProperty('disabled',false)
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','mg/g')
 expect(screen.getByRole('alert').textContent).toContain('本轮没有提交新的有效任务安排')
 view.unmount();expect(generate.mock.calls[0]?.[2].aborted).toBe(true)
})
it('retains clarification drafts across panel remounts and isolates owners and plan versions',async()=>{
 const plan=await clarificationPlan(),generate=vi.fn(async()=>{})
 const first=render(<OrchestrationAdvisor ownerSessionId="draft-a" task="均值" plan={plan} onGenerate={generate}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}});first.unmount()
 const restored=render(<OrchestrationAdvisor ownerSessionId="draft-a" task="均值" plan={plan} onGenerate={generate}/>);
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','mg/g');restored.unmount()
 const foreign=render(<OrchestrationAdvisor ownerSessionId="draft-b" task="均值" plan={plan} onGenerate={generate}/>);
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','');foreign.unmount()
 render(<OrchestrationAdvisor ownerSessionId="draft-a" task="均值" plan={{...plan,version:2}} onGenerate={generate}/>);
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','')
})
it('keeps cancellation outside collapsed adjustment details when a proposal already exists',async()=>{
 const plan=await clarificationPlan()
 const view=render(<OrchestrationAdvisor task="均值" plan={plan} busy planning onGenerate={vi.fn(async()=>{})} onStop={vi.fn(async()=>{})}/>);
 const stop=view.container.querySelector('button')?.textContent==='中止规划'?view.container.querySelector('button'):Array.from(view.container.querySelectorAll('button')).find(b=>b.textContent==='中止规划')
 expect(stop).toBeTruthy();expect(stop!.closest('details')).toBeNull()
})
it('can answer legal long questions without copying their immutable text into the request',async()=>{
 const {serializeTaskArrangement,parseTaskArrangement}=await import('../../src/protocol/task-arrangement.js')
 const initial=await clarificationPlan(),read=parseTaskArrangement(initial.markdown)
 if(read.state!=='valid')throw Error('invalid fixture')
 const plan={...initial,markdown:serializeTaskArrangement({...read.arrangement,questions:['甲'.repeat(2000),'乙'.repeat(2000)]})}
 const generate=vi.fn(async(_goal:string,_answers:string,_signal:AbortSignal)=>{})
 render(<OrchestrationAdvisor ownerSessionId="long-questions" task="均值" plan={plan} onGenerate={generate}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}})
 fireEvent.change(screen.getByRole('textbox',{name:'问题 2 的回答'}),{target:{value:'全部行'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'})))
 expect(generate).toHaveBeenCalledOnce()
 const adjustment=generate.mock.calls[0]![1]
 expect(adjustment.length).toBeLessThanOrEqual(4000)
 const payload=JSON.parse(adjustment.split('\n')[0]!.slice('[plan_clarification] '.length))
 expect(payload).toEqual({planId:plan.planId,version:plan.version,answers:[{questionIndex:1,answer:'mg/g'},{questionIndex:2,answer:'全部行'}]})
 expect(screen.queryByRole('alert')).toBeNull()
})
it('can cancel clarification before send acknowledgement and fences its late completion',async()=>{
 const plan=await clarificationPlan()
 let finish!:()=>void,finishStop!:()=>void
 const generate=vi.fn((_goal:string,_answers:string,_signal:AbortSignal)=>new Promise<void>(resolve=>{finish=resolve}))
 const stop=vi.fn(()=>new Promise<void>(resolve=>{finishStop=resolve}))
 render(<OrchestrationAdvisor task="均值" plan={plan} onGenerate={generate} onStop={stop}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}})
 fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'}))
 expect(screen.getByRole('button',{name:'重新安排'})).toHaveProperty('disabled',true)
 fireEvent.click(screen.getByRole('button',{name:'中止规划'}))
 expect(generate.mock.calls[0]![2].aborted).toBe(true)
 expect(stop).toHaveBeenCalledOnce()
 expect(screen.getByRole('button',{name:'补充后重新规划'})).toHaveProperty('disabled',true)
 await act(async()=>finishStop())
 await act(async()=>finish())
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','mg/g')
 expect(screen.getByRole('button',{name:'补充后重新规划'})).toHaveProperty('disabled',false)
 expect(screen.queryByText('等待新方案，采纳后才执行。')).toBeNull()
})
it.each(['read','acquire','enable'] as const)('does not send clarification after cancellation during %s',async(stage)=>{
 const {createAutoArrangementRequester}=await import('../../src/ui/auto-arrangement-request.js')
 const plan=await clarificationPlan(),send=vi.fn(async()=>{})
 let release!:()=>void
 const wait=()=>new Promise<void>(resolve=>{release=resolve})
 const requester=createAutoArrangementRequester({read:async()=>{if(stage==='read')await wait();return{planning:false}},acquire:async()=>{if(stage==='acquire')await wait()},enable:async()=>{if(stage==='enable')await wait()},send,running:()=>false})
 const generate=vi.fn((goal:string,answers:string,signal:AbortSignal)=>requester('cancel-owner',goal,answers,signal,()=>true))
 render(<OrchestrationAdvisor ownerSessionId="cancel-owner" task="均值" plan={plan} onGenerate={generate} onStop={vi.fn(async()=>{})}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'问题 1 的回答'}),{target:{value:'mg/g'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'})))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'中止规划'})))
 await act(async()=>release())
 expect(send).not.toHaveBeenCalled()
 expect(screen.getByRole('textbox',{name:'问题 1 的回答'})).toHaveProperty('value','mg/g')
 expect(screen.getByRole('button',{name:'补充后重新规划'})).toHaveProperty('disabled',false)
 expect(screen.queryByRole('alert')).toBeNull()
})
it('keeps a new clarification locked when the cancelled generation acknowledges late',async()=>{
 const plan=await clarificationPlan(),finishes:Array<()=>void>=[]
 const generate=vi.fn((_goal:string,_answers:string,_signal:AbortSignal)=>new Promise<void>(resolve=>{finishes.push(resolve)}))
 render(<OrchestrationAdvisor task="均值" plan={plan} onGenerate={generate} onStop={vi.fn(async()=>{})}/>);
 const answer=screen.getByRole('textbox',{name:'问题 1 的回答'})
 fireEvent.change(answer,{target:{value:'mg/g'}})
 fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'}))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'中止规划'})))
 fireEvent.click(screen.getByRole('button',{name:'补充后重新规划'}))
 expect(generate).toHaveBeenCalledTimes(2)
 expect(generate.mock.calls[0]![2].aborted).toBe(true)
 await act(async()=>finishes[0]!())
 expect(generate.mock.calls[1]![2].aborted).toBe(false)
 expect(answer).toHaveProperty('disabled',true)
 expect(screen.getByRole('button',{name:'重新安排'})).toHaveProperty('disabled',true)
 expect(screen.getByRole('button',{name:'中止规划'})).toBeTruthy()
 expect(screen.queryByText('等待新方案，采纳后才执行。')).toBeNull()
 await act(async()=>finishes[1]!())
 expect(screen.getByText('等待新方案，采纳后才执行。')).toBeTruthy()
})

it('shares planning admission and prevents confirmation after a cancelled lease acknowledgement',async()=>{
 let release!:(value:unknown)=>void
 const get=vi.fn((operation:string)=>operation==='getPlanningContractSource'?Promise.resolve({revision:0}):operation==='getAnalysisRoute'?Promise.resolve({}):new Promise(resolve=>{release=resolve}))
 const client={get} as unknown as import('../../src/ui/client.js').WorkbenchClient
 render(<OrchestrationAdvisor client={client} ownerSessionId="owner" task="mean" onGenerate={vi.fn()} onStop={vi.fn(async()=>{})}/>);await act(async()=>{})
 fireEvent.click(screen.getByText('科研任务约束'))
 for(const[name,value]of [['输入文件（每行一个）','input.csv'],['产物目录','results'],['分析方法','mean'],['数据单位','m'],['缺失值处理','block']] as const)fireEvent.change(screen.getByRole('textbox',{name}),{target:{value}})
 fireEvent.click(screen.getByRole('button',{name:'确认约束'}));expect(get).toHaveBeenCalledWith('acquireLease',{sessionId:'owner',holder:'user'})
 expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',true)
 fireEvent.click(screen.getByRole('button',{name:'中止规划'}));await act(async()=>{})
 expect(screen.getByRole('button',{name:'确认约束'})).toHaveProperty('disabled',false)
 await act(async()=>release({}))
 expect(get.mock.calls.some(([name])=>name==='confirmPlanningContractSource')).toBe(false)
 expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',false)
})

it('releases the shared confirmation admission on a same-owner connection change without a late write to the old client',async()=>{
 let release!:(value:unknown)=>void
 const oldGet=vi.fn((operation:string)=>operation==='getPlanningContractSource'?Promise.resolve({revision:0}):operation==='getAnalysisRoute'?Promise.resolve({}):new Promise(resolve=>{release=resolve}))
 const oldClient={get:oldGet} as unknown as import('../../src/ui/client.js').WorkbenchClient
 const newGet=vi.fn(async(_operation:string)=>({revision:0})),newClient={get:newGet} as unknown as import('../../src/ui/client.js').WorkbenchClient
 const generate=vi.fn(async()=>{}),stop=vi.fn(async()=>{})
 const view=render(<OrchestrationAdvisor client={oldClient} ownerSessionId="reconnect-owner" task="mean" onGenerate={generate} onStop={stop}/>);await act(async()=>{});fireEvent.click(screen.getByText('科研任务约束'))
 for(const[name,value]of [['输入文件（每行一个）','input.csv'],['产物目录','results'],['分析方法','mean'],['数据单位','m'],['缺失值处理','block']] as const)fireEvent.change(screen.getByRole('textbox',{name}),{target:{value}})
 fireEvent.click(screen.getByRole('button',{name:'确认约束'}))
 view.rerender(<OrchestrationAdvisor client={newClient} ownerSessionId="reconnect-owner" task="mean" onGenerate={generate} onStop={stop}/>);await act(async()=>{})
 expect(screen.getByRole('button',{name:'确认约束'})).toHaveProperty('disabled',false);expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',false)
 await act(async()=>release({}));expect(oldGet.mock.calls.some(([name])=>name==='confirmPlanningContractSource')).toBe(false);expect(newGet.mock.calls.some(([name])=>name==='confirmPlanningContractSource')).toBe(false)
})
it('does not let an old stop callback change the replacement connection state',async()=>{
 const clientA={get:vi.fn(async()=>({revision:0}))} as unknown as import('../../src/ui/client.js').WorkbenchClient,clientB={get:vi.fn(async()=>({revision:0}))} as unknown as import('../../src/ui/client.js').WorkbenchClient
 let reject!:(error:Error)=>void;const stop=vi.fn(()=>new Promise<void>((_r,no)=>{reject=no})),generate=vi.fn(async()=>{})
 const view=render(<OrchestrationAdvisor client={clientA} ownerSessionId="stop-reconnect" task="mean" busy planning onGenerate={generate} onStop={stop}/>);await act(async()=>{});fireEvent.click(screen.getByRole('button',{name:'中止规划'}))
 view.rerender(<OrchestrationAdvisor client={clientB} ownerSessionId="stop-reconnect" task="mean" busy={false} planning={false} onGenerate={generate} onStop={stop}/>);await act(async()=>{})
 expect(screen.getByRole('button',{name:'生成安排'})).toHaveProperty('disabled',false)
 await act(async()=>reject(Error('old transport failed')));expect(screen.queryByText('old transport failed')).toBeNull()
})
