import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {cleanup, render, screen} from '@testing-library/react'
import {ConversationView} from '../../src/ui/views.js'
import {resetAllState} from '../../src/ui/state/index.js'
import type {SessionSummary, TranscriptItem} from '../../src/protocol/index.js'

const session:SessionSummary={sessionId:'planning-stop',projectId:'p',agentId:'ds-chat',kind:'native',pinned:false,sortOrder:1,state:'alive',createdAt:'2026-11-08T00:00:00Z'}
const input=(id:string):TranscriptItem=>({type:'turn',id,who:'user',text:'请自动安排',final:true,at:1794096000000})
beforeEach(resetAllState)
afterEach(cleanup)
it('clears waiting for the acknowledged input only and waits again for a new external input',()=>{
 const props={session,onSend:vi.fn(),onAbort:vi.fn()}
 const r=render(<ConversationView {...props} items={[input('u1')]}/>)
 expect(screen.getByRole('button',{name:'停止'})).toBeTruthy()
 r.rerender(<ConversationView {...props} items={[input('u1')]} stoppedInputId='unrelated'/>)
 expect(screen.getByRole('button',{name:'停止'})).toBeTruthy()
 r.rerender(<ConversationView {...props} items={[input('u1')]} stoppedInputId='u1'/>)
 expect(screen.queryByRole('button',{name:'停止'})).toBeNull()
 r.rerender(<ConversationView {...props} items={[input('u1'),input('u2')]} stoppedInputId='u1'/>)
 expect(screen.getByRole('button',{name:'停止'})).toBeTruthy()
 expect(props.onAbort).not.toHaveBeenCalled()
})
it('does not resurrect waiting from a restored automatic request but still waits for its live turn',()=>{
 const items=[{...input('u1'),text:'请为以下具体任务自动安排。计算均值'}]
 const props={session,onSend:vi.fn(),onAbort:vi.fn(),items}
 const r=render(<ConversationView {...props} externalInputRunning={false}/>)
 expect(screen.queryByRole('button',{name:'停止'})).toBeNull()
 r.rerender(<ConversationView {...props} externalInputRunning={true}/>)
 expect(screen.getByRole('button',{name:'停止'})).toBeTruthy()
})
