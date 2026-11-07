import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {RunOverview} from '../../src/ui/run-overview.js'
import {RunBudgetPanel} from '../../src/ui/run-budget.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
afterEach(cleanup)
const budget={revision:5,limits:{maxRuns:2},consumedRuns:2,legacyRuns:0,knownTokens:20,unknownRuns:0,inFlight:0,elapsedMs:1500,blocked:{code:'runs' as const,message:'委派预算执行轮次已用完'}}
it('shows ordinary capacity and review recovery holds separately and saves the opt-in policy using CAS',async()=>{
 const get=vi.fn().mockResolvedValue({}),onSaved=vi.fn()
 render(<RunBudgetPanel client={{get} as unknown as WorkbenchClient} sessionId="p" budget={{...budget,limits:{maxRuns:5,reserveReviewRuns:true},ordinaryRemainingRuns:1,reviewReservedRuns:2,reviewRecoveryRuns:1,reviewReservations:[]}} live onSaved={onSaved}/>)
 expect(screen.getByText(/普通阶段可用 1 轮/)).toBeTruthy()
 expect(screen.getByText(/审阅预留 2 轮/)).toBeTruthy()
 expect(screen.getByText(/恢复待核对 1 轮/)).toBeTruthy()
 fireEvent.click(screen.getByText('调整预算限制'))
 const checkbox=screen.getByRole('checkbox',{name:'为科研周期保留独立审阅执行轮次'})
 expect((checkbox as HTMLInputElement).checked).toBe(true)
 fireEvent.change(screen.getByLabelText('累计执行轮次上限'),{target:{value:'6'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'委派限额生效'})))
 expect(get).toHaveBeenCalledWith('setRunBudget',{sessionId:'p',expectedRevision:5,limits:{maxRuns:6,reserveReviewRuns:true}})
 expect(onSaved).toHaveBeenCalledOnce()
})
it('requires a run cap before enabling review reservation and keeps missing observation values unknown',async()=>{
 const get=vi.fn()
 render(<RunBudgetPanel client={{get} as unknown as WorkbenchClient} sessionId="p" budget={{...budget,limits:{reserveReviewRuns:true,maxRuns:5}}} live onSaved={()=>{}}/>)
 expect(screen.getByText(/普通阶段可用 未知 轮/)).toBeTruthy()
 expect(screen.getByText(/审阅预留 未知 轮/)).toBeTruthy()
 fireEvent.click(screen.getByText('调整预算限制'))
 fireEvent.change(screen.getByLabelText('累计执行轮次上限'),{target:{value:''}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'委派限额生效'})))
 expect(get).not.toHaveBeenCalled()
 expect(screen.getByRole('alert').textContent).toContain('先设置累计执行轮次上限')
})
it('keeps outstanding reservations visible in a read-only snapshot after the policy is disabled',()=>{
 render(<RunBudgetPanel client={{get:vi.fn()} as unknown as WorkbenchClient} sessionId="p" budget={{...budget,limits:{maxRuns:5},ordinaryRemainingRuns:2,reviewReservedRuns:1,reviewRecoveryRuns:1,reviewReservations:[]}} live={false} onSaved={()=>{}}/>)
 expect(screen.getByText(/普通阶段可用 2 轮 · 审阅预留 1 轮/)).toBeTruthy()
 expect(screen.getByText(/恢复待核对 1 轮/)).toBeTruthy()
 expect(screen.queryByRole('checkbox')).toBeNull()
 expect(screen.queryByRole('button',{name:'委派限额生效'})).toBeNull()
})
it('edits limits using their observed revision and keeps visible consumed work',async()=>{
 const get=vi.fn().mockImplementation(async operation=>operation==='getRunOverview'?{ownerSessionId:'p',source:'live',runs:[],budget}:{...budget,revision:6,limits:{maxRuns:3}})
 render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="p"/>);await act(async()=>{})
 expect(screen.getByText(/已准入 2 轮/)).toBeTruthy()
 expect(screen.getByText(/已历时 0.03 分钟/)).toBeTruthy()
 fireEvent.click(screen.getByText('调整预算限制'))
 fireEvent.change(screen.getByLabelText('累计执行轮次上限'),{target:{value:'3'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'委派限额生效'})))
 expect(get).toHaveBeenCalledWith('setRunBudget',{sessionId:'p',expectedRevision:5,limits:{maxRuns:3}})
})
it('lets a conflicted draft reload the newest revision without resetting consumption',async()=>{
 let revision=5
 const get=vi.fn().mockImplementation((operation)=>operation==='getRunOverview'?Promise.resolve({ownerSessionId:'p',source:'live',runs:[],budget:{...budget,revision}}):Promise.reject(new Error('预算版本已变化')))
 render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByText('调整预算限制'));fireEvent.change(screen.getByLabelText('累计执行轮次上限'),{target:{value:'3'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'委派限额生效'})))
 expect(screen.getByRole('alert').textContent).toContain('版本')
 revision=9;await act(async()=>fireEvent.click(screen.getByRole('button',{name:'重新读取预算'})))
 expect(screen.getByLabelText<HTMLInputElement>('累计执行轮次上限').value).toBe('2')
 expect(screen.queryByRole('alert')).toBeNull()
 expect(screen.getByText(/已准入 2 轮/)).toBeTruthy()
})
it('cold snapshots show the persisted budget without offering a write',async()=>{
 const get=vi.fn().mockResolvedValue({ownerSessionId:'p',source:'disk',runs:[],budget})
 render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="p"/>);await act(async()=>{})
 expect(screen.getByText(/已准入 2 轮/)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'委派限额生效'})).toBeNull()
 expect(get).toHaveBeenCalledTimes(1)
})
it('does not paint an old-session save response into a new chat',async()=>{
 let finish!:(value:unknown)=>void
 const get=vi.fn().mockImplementation((operation,request)=>operation==='getRunOverview'?Promise.resolve({ownerSessionId:request.sessionId,source:'live',runs:[],budget:request.sessionId==='a'?budget:{...budget,consumedRuns:0}}):new Promise(r=>finish=r))
 const view=render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="a"/>);await act(async()=>{})
 fireEvent.click(screen.getByText('调整预算限制'));fireEvent.change(screen.getByLabelText('累计执行轮次上限'),{target:{value:'3'}})
 fireEvent.click(screen.getByRole('button',{name:'委派限额生效'}))
 view.rerender(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="b"/>);await act(async()=>{})
 await act(async()=>finish({...budget,consumedRuns:999}))
 expect(screen.queryByText(/已准入 999/)).toBeNull()
 expect(screen.getByText(/已准入 0 轮/)).toBeTruthy()
})
