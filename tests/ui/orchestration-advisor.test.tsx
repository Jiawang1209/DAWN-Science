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
