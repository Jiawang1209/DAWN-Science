import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {RunOverview} from '../../src/ui/run-overview.js'
import {resetCollaborationViews} from '../../src/ui/state/collaboration-view.js'
import {serializeTaskArrangement} from '../../src/protocol/task-arrangement.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
import type {RunOverview as Snapshot} from '../../src/protocol/run-overview.js'
beforeEach(()=>{resetCollaborationViews();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
const empty:Snapshot={ownerSessionId:'owner',source:'live',runs:[]}
it('keeps a header entry while loading and ahead of a pending information form',async()=>{
 let resolve!:(s:Snapshot)=>void
 const pending=new Promise<Snapshot>(r=>{resolve=r}),get=vi.fn(()=>pending),generate=vi.fn(async()=>{})
 const plan={type:'plan' as const,id:'p',planId:'p',version:1,title:'确认',status:'proposed' as const,markdown:serializeTaskArrangement({mode:'single',rationale:'先确认',independentReview:false,questions:['单位是什么？'],tasks:[{id:'inspect',title:'等待单位',goal:'只读',role:'核查',inputs:[],outputs:[],dependencies:[],acceptance:'等待用户确认',review:false}]})}
 const view=render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="owner" autoArrangement={{task:'均值',plan,onGenerate:generate}}/>);
 expect(screen.getByRole('button',{name:'打开编排视图'}).closest('.collaboration-heading')).toBeTruthy()
 await act(async()=>resolve(empty))
 const entry=screen.getByRole('button',{name:'打开编排视图'}),form=screen.getByRole('region',{name:'补充待确认信息'})
 expect(entry.compareDocumentPosition(form)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.click(entry);expect(screen.getByRole('dialog',{name:'流程工作台'})).toBeTruthy()
 expect(screen.getByRole('heading',{name:'Agent 网络'}).compareDocumentPosition(screen.getByRole('region',{name:'补充待确认信息'}))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'返回 DAWN 对话'}))
 expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(screen.getByRole('button',{name:'打开编排视图'}))
 expect(generate).not.toHaveBeenCalled();view.unmount()
})
it('keeps the original outcome entry and does not enable navigation without an owner',async()=>{
 const client={get:vi.fn().mockResolvedValue(empty)} as unknown as WorkbenchClient
 const view=render(<RunOverview client={client}/>);
 expect(screen.getByRole('button',{name:'打开编排视图'})).toHaveProperty('disabled',true)
 view.rerender(<RunOverview client={client} sessionId="owner"/>);await act(async()=>{})
 expect(screen.getByRole('button',{name:'展开流程工作台'})).toBeTruthy()
})
