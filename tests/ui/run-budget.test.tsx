import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {RunOverview} from '../../src/ui/run-overview.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
afterEach(cleanup)
const budget={revision:5,limits:{maxRuns:2},consumedRuns:2,legacyRuns:0,knownTokens:20,unknownRuns:0,inFlight:0,elapsedMs:1500,blocked:{code:'runs' as const,message:'委派预算执行轮次已用完'}}
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
