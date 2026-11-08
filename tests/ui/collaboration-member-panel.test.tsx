import {expect,it,vi} from 'vitest'
import {fireEvent,render,screen} from '@testing-library/react'
import {CollaborationMemberPanel} from '../../src/ui/collaboration-member-panel.js'
import type {RunOverview} from '../../src/protocol/run-overview.js'
const run:RunOverview['runs'][number]={id:'c',kind:'subagent',label:'Reader',address:['call','0'],epoch:1,phase:'drained',state:'completed',updatedAt:1,contract:false,inputVersions:0,outputVersions:0}
it('routes a normal task to existing process and controls without sending itself',()=>{
 const open=vi.fn();render(<CollaborationMemberPanel snapshot={{ownerSessionId:'p',source:'live',runs:[run]}} run={run} owner="p" onOpen={open}/>);
 expect(screen.getByText('续问、纠偏和停止由成员过程面板按宿主能力提供。')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'查看子任务过程'}));expect(open).toHaveBeenCalledWith('p#sub:call:0')
})
it('does not expose unrelated team members or invented controls',()=>{
 const r={...run,kind:'team' as const,address:['t','alice','old']}
 render(<CollaborationMemberPanel snapshot={{ownerSessionId:'p',source:'disk',runs:[r]}} run={r} owner="p" onOpen={vi.fn()}/>);
 expect(screen.getByText('没有可精确关联的当前成员，不能借用同名成员的消息或会话。')).toBeTruthy()
 expect(screen.queryByRole('button',{name:'查看子任务过程'})).toBeNull()
})
it('never presents retained version counts from an earlier epoch as this attempt versions',()=>{
 const r={...run,epoch:2,resultEpoch:1,inputVersions:9,outputVersions:7}
 render(<CollaborationMemberPanel snapshot={{ownerSessionId:'p',source:'live',runs:[r]}} run={r} owner="p"/>)
 expect(screen.queryByText('输入 9 · 产物 7')).toBeNull()
 expect(screen.getByText('本轮尚未结算')).toBeTruthy()
})
it('offers a matched Bot read-only route and reports host failure without inventing a result',async()=>{
 const{act}=await import('@testing-library/react')
 const r={...run,kind:'bot' as const,address:['t','alice','new']}
 const team:NonNullable<RunOverview['team']>={id:'t',captainSessionId:'p',name:'Team',goal:'Goal',createdAt:1,members:[{name:'alice',agent:'Reviewer',botId:'b',sessionId:'member-session',role:'Independent review',status:'idle',sessionDir:'unused',turns:1,joinedAt:1,orchestrationId:'new'}],tasks:[],messages:[],taskSeq:0}
 const open=vi.fn().mockRejectedValue(new Error('generation retired'))
 render(<CollaborationMemberPanel snapshot={{ownerSessionId:'p',source:'live',runs:[r],team}} run={r} owner="p" onBot={open}/>);
 expect(screen.getByText('Independent review')).toBeTruthy()
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'打开成员只读对话'})))
 expect(open).toHaveBeenCalledWith('t','b');expect(screen.getByRole('alert').textContent).toBe('generation retired')
})
