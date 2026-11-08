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
