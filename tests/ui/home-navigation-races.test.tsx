import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../../src/ui/App.js'
import { showHome, $appPage } from '../../src/ui/state/app-page.js'
import { $activeSessionId } from '../../src/ui/state/view.js'
import { OPERATIONS, WORKBENCH_PROTOCOL_VERSION } from '../../src/protocol/index.js'
const original = window.dawn
afterEach(() => { if (original) window.dawn=original; else delete window.dawn })
const project={projectId:'p1',name:'Research fixture',workspace:'/w/fixture',createdAt:'2026-11-17T00:00:00Z',totalRunCount:0,totalSessionCount:1,unresolvedProblemCount:0}
const session={sessionId:'s1',projectId:'p1',agentId:'fixture',kind:'native',state:'alive',pinned:false,sortOrder:0,createdAt:'2026-11-17T00:00:00Z',title:'Resume fixture'}
function bridge() {
  let hold=false,held=false,release!:()=>void
  const pending=new Promise<void>(resolve=>{release=resolve})
  window.dawn={
    invoke:async(op:string)=>{
      if(op==='listSessions'&&hold){hold=false;held=true;await pending}
      const data=op==='getCapabilities'?{workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION,operations:Object.keys(OPERATIONS),entityTypes:[],maxPageSize:200,readOnly:false}
        :op==='listProjects'?[project]:op==='listSessions'?[session]
        :op==='listCredentials'?{configured:['deepseek'],encrypted:true}
        :op==='getProviders'?{agents:[],providers:[]}
        :op==='listKnownProviders'?{providers:[],models:{}}
        :op==='getUpdateState'||op==='checkUpdate'?{自动检查:false,状态:{阶段:'idle',当前:'0.0.25'}}
        :op==='listBots'?{bots:[]}:op==='openProject'?{projectId:'p1'}:[]
      return {ok:true,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION,data,warnings:[]}
    },onEvent:()=>()=>{},pickDirectory:async()=>null,
  }
  return {arm:()=>{hold=true},held:()=>held,release}
}
async function openPending() {
  showHome();const h=bridge();render(<App />)
  const recent=await screen.findByRole('button',{name:/Resume fixture/})
  h.arm();fireEvent.click(recent);await waitFor(()=>expect(h.held()).toBe(true))
  return h
}
function leaveAndReturn() {
  fireEvent.click(screen.getByRole('button',{name:'v0.0.25'}))
  fireEvent.click(screen.getByRole('button',{name:'首页'}))
}
describe('Home asynchronous navigation ownership',()=>{
  it('a late recent-session read does not override a newer home visit or selection',async()=>{
    const h=await openPending();leaveAndReturn()
    await act(async()=>h.release())
    expect(screen.getByRole('heading',{name:'DAWN Science'})).toBeTruthy()
    expect($activeSessionId.get()).toBeUndefined()
    expect($appPage.get()).toBe('home')
  })
  it('opening the guide from home cancels an in-flight recent-session navigation',async()=>{
    const h=await openPending()
    fireEvent.click(screen.getByRole('button',{name:'导航栏'}))
    const wizard=screen.getByRole('dialog',{name:'首次设置'})
    await act(async()=>h.release())
    fireEvent.click(within(wizard).getByRole('button',{name:'先跳过'}))
    expect(screen.getByRole('heading',{name:'DAWN Science'})).toBeTruthy()
    expect($appPage.get()).toBe('home')
  })
  it('a late directory choice does not reopen the workbench after returning home',async()=>{
    showHome();bridge();let release!:(path:string)=>void
    window.dawn!.pickDirectory=()=>new Promise(resolve=>{release=resolve})
    render(<App />);await screen.findByRole('button',{name:/Resume fixture/})
    fireEvent.click(screen.getByRole('button',{name:'打开项目'}))
    await waitFor(()=>expect(release).toBeDefined());leaveAndReturn()
    await act(async()=>{release('/w/fixture'); for(let i=0;i<20;i++)await Promise.resolve()})
    expect(screen.getByRole('heading',{name:'DAWN Science'})).toBeTruthy()
    expect($activeSessionId.get()).toBeUndefined()
    expect($appPage.get()).toBe('home')
  })
})
