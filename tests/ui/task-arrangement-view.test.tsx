import {expect,it} from 'vitest'
import {render,screen} from '@testing-library/react'
import {TaskArrangementView} from '../../src/ui/task-arrangement-view.js'
import {serializeTaskArrangement,type TaskArrangement} from '../../src/protocol/task-arrangement.js'
const one={id:'mean',title:'计算均值',goal:'按给定数据计算',role:'统计执行',inputs:['in.csv'],outputs:['mean.csv'],dependencies:[],acceptance:'可核对',review:false}
const base:TaskArrangement={mode:'single',rationale:'只需一个计算任务',independentReview:false,tasks:[one],questions:[]}
it('displays counts from the proposal and updates when edited task structure changes',()=>{
 const view=render(<TaskArrangementView markdown={serializeTaskArrangement(base)}/>);
 expect(screen.getByText('1 个任务块')).toBeTruthy();expect(screen.getByText('统计执行')).toBeTruthy()
 view.rerender(<TaskArrangementView markdown={serializeTaskArrangement({...base,mode:'parallel',tasks:[one,{...one,id:'second',title:'计算另一数据集',outputs:['other.csv']}]})}/>);
 expect(screen.getByText('2 个任务块')).toBeTruthy();expect(screen.queryByText('1 个任务块')).toBeNull()
})
it('does not present malformed or legacy plans as an automatically valid arrangement',()=>{
 const view=render(<TaskArrangementView markdown={"## 原有方案\nunchanged"}/>);expect(view.container.textContent).toBe('')
 view.rerender(<TaskArrangementView markdown={"## 任务安排（自动安排）\nbad"}/>);expect(screen.getByRole('alert').textContent).toContain('任务安排需要修正')
})

it('shows approval as a frozen proposal fact without claiming execution or acceptance',()=>{
 const view=render(<TaskArrangementView markdown={serializeTaskArrangement(base)} status="approved"/>);
 expect(screen.queryByText(/这是方案中的任务划分，不代表已启动/)).toBeNull()
 expect(view.container.textContent).toContain('实际执行与验收以协作记录为准')
 expect(view.container.textContent).not.toContain('宿主验收通过')
 view.rerender(<TaskArrangementView markdown={serializeTaskArrangement(base)} status="superseded"/>)
 expect(view.container.textContent).toContain('这版方案已被替代')
 view.rerender(<TaskArrangementView markdown={serializeTaskArrangement(base)} status="discarded"/>)
 expect(view.container.textContent).toContain('这版方案未采用')
})

it('removes the executable proposal notice after approval and keeps the frozen scope explicit',async()=>{
 const {TaskContractSchema}=await import('../../src/protocol/task-contract.js')
 const executable={...base,dispatch:'team-v1' as const,tasks:[{...one,execution:{agent:'analyst',contract:TaskContractSchema.parse({access:'workspace-write',inputs:['in.csv'],outputs:['mean.csv'],resultType:'model-metrics'})}}]}
 const view=render(<TaskArrangementView markdown={serializeTaskArrangement(executable)}/>);
 expect(view.container.textContent).toContain('当前仍为待执行方案')
 view.rerender(<TaskArrangementView markdown={serializeTaskArrangement(executable)} status="approved"/>);
 expect(view.container.textContent).not.toContain('当前仍为待执行方案')
 expect(view.container.textContent).toContain('任务与执行范围已冻结')
})
