import {expect,it,vi} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {ApprovedPlanProgress} from '../../src/ui/approved-plan-progress.js'
import type {TeamSnapshot} from '../../src/protocol/events.js'
const team:TeamSnapshot={id:'plan_'+'a'.repeat(24),name:'Approved',goal:'Goal',captainSessionId:'owner',createdAt:1,members:[],tasks:[{id:'t1',subject:'Write result',status:'failed',dependencies:[],assignee:'m1',attempt:1,createdAt:1,updatedAt:1,output:'Input version changed'},{id:'t2',subject:'Review',status:'pending',dependencies:['t1'],assignee:'m2',attempt:0,createdAt:1,updatedAt:1}],messages:[],taskSeq:0,approvedPlan:{version:1,owner:'owner',planId:'p',planVersion:2,markdownHash:'b'.repeat(64),teamId:'plan_'+'a'.repeat(24),externalInputs:[],tasks:[{planTaskId:'write',taskId:'t1',memberName:'m1'},{planTaskId:'review',taskId:'t2',memberName:'m2'}]}}
it('shows the approved mapping, actual starts and upstream blocker without claiming pending work ran',()=>{
 const select=vi.fn();render(<ApprovedPlanProgress owner="owner" team={team} onSelect={select}/>)
 expect(screen.getByText('计划 2 项 · 已启动 1 项')).toBeTruthy()
 expect(screen.getByText('Input version changed')).toBeTruthy()
 expect(screen.getByText('前置任务未通过：Write result')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:/Review/}));expect(select).toHaveBeenCalledWith('t2',expect.any(HTMLButtonElement))
})
it('never borrows a plan mapping from another owner or team identity',()=>{
 const{container}=render(<ApprovedPlanProgress owner="other" team={team}/>);expect(container.textContent).toBe('')
})
