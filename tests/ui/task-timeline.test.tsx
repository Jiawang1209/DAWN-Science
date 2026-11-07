import {expect,it,vi} from 'vitest'
import {fireEvent,render,screen,within} from '@testing-library/react'
import {TaskTimeline,directTaskTimeline,teamTaskTimeline} from '../../src/ui/task-timeline.js'
import type {RunOverview} from '../../src/protocol/run-overview.js'
const attempt={teamId:'t',taskId:'task',attemptId:'A',attempt:1}
const run:RunOverview['runs'][number]={id:'member',address:['t','m','1'],kind:'team',label:'worker',state:'running',phase:'running',epoch:2,updatedAt:5,contract:true,inputVersions:1,outputVersions:0,activity:{stage:'lock-wait',since:4,resources:['new-file']}}
const snapshot:RunOverview={ownerSessionId:'s',source:'live',runs:[run],history:{truncated:false,events:[
 {type:'started',seq:1,at:1,childId:'member',epoch:1,taskAttempt:attempt},
 {type:'stage',seq:2,at:2,childId:'member',epoch:1,stage:'acceptance'},
 {type:'started',seq:3,at:3,childId:'member',epoch:2,taskAttempt:{...attempt,attemptId:'B',attempt:2}},
 {type:'stage',seq:4,at:4,childId:'member',epoch:2,stage:'lock-wait'},
]}}
it('binds history to owner, task attempt and epoch, never attaching a later member run',()=>{
 const view=teamTaskTimeline(snapshot,'s',attempt)
 expect(view.events.map(event=>event.seq)).toEqual([1,2])
 expect(view.current).toBeUndefined()
 expect(teamTaskTimeline(snapshot,'other',attempt).events).toEqual([])
 expect(teamTaskTimeline(snapshot,'s',{...attempt,attemptId:'B',attempt:2}).current).toBe(run)
 expect(teamTaskTimeline(snapshot,'s',{...attempt,attemptId:'legacy'}).events).toEqual([])
})
it('links existing records and versions without making cold lock ownership current',()=>{
 const inspect=vi.fn()
 render(<TaskTimeline events={snapshot.history!.events.slice(0,2)} current={run} live={false} status="历史快照" toolCount={2} versionCount={1} onInspect={inspect}/>)
 const panel=screen.getByRole('region',{name:'任务轨迹'})
 expect(within(panel).getByText(/历史阶段/)).toBeTruthy()
 fireEvent.click(within(panel).getByRole('button',{name:/查看 2 条工具记录/}))
 fireEvent.click(within(panel).getByRole('button',{name:/查看 1 个产物版本/}))
 expect(inspect.mock.calls).toEqual([['records'],['artifacts']])
})
it('does not attach a later unadmitted queue/budget event that reused the settled epoch',()=>{
 const history={truncated:false,events:[...snapshot.history!.events.slice(0,2),
  {type:'settled' as const,seq:5,at:5,childId:'member',epoch:1,state:'completed'},
  {type:'queued' as const,seq:6,at:6,childId:'member',epoch:1},
  {type:'budget-blocked' as const,seq:7,at:7,childId:'member',epoch:1}]}
 const view=teamTaskTimeline({...snapshot,runs:[{...run,epoch:1,phase:'queued'}],history},'s',attempt)
 expect(view.events.map(event=>event.seq)).toEqual([1,2,5])
 expect(view.current).toBeUndefined()
})
it('keeps separate backend turns of a Bot in the same task attempt',()=>{
 const history=snapshot.history!,same={...history,events:history.events.map(e=>e.type==='started'?{...e,taskAttempt:attempt}:e)}
 expect(teamTaskTimeline({...snapshot,history:same},'s',attempt).events.map(e=>e.seq)).toEqual([1,2,3,4])
})

it('retains revoked attempt history as historical only, even with a newer member run',()=>{
 const view=teamTaskTimeline(snapshot,'s',{teamId:'t',taskId:'task',attempt:1})
 expect(view.events.map(e=>e.seq)).toEqual([1,2])
 expect(view.historical).toBe(true)
 expect(view.current).toBeUndefined()
 expect(teamTaskTimeline(snapshot,'s',{teamId:'t',taskId:'task',attempt:3}).events).toEqual([])
})

it('does not attribute an admission denial after settlement to a completed direct run',()=>{
 const child={...run,kind:'subagent' as const,state:'completed' as const,phase:'drained' as const,epoch:1}
 const events:NonNullable<RunOverview['history']>['events']=[
  {type:'started',seq:1,at:1,childId:child.id,epoch:1},
  {type:'settled',seq:2,at:2,childId:child.id,epoch:1},
  {type:'budget-blocked',seq:3,at:3,childId:child.id,epoch:1},
 ]
 expect(directTaskTimeline({events,truncated:false},child).map(e=>e.seq)).toEqual([1,2])
})
