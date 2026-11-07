import {afterEach,beforeEach,describe,expect,it,vi} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/node_modules/vitest/dist/index.js'
import {act,cleanup,renderHook} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/node_modules/@testing-library/react/dist/index.js'
import {createClient} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/client.ts'
import {useRunOverview} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/use-run-overview.ts'
import {WORKBENCH_PROTOCOL_VERSION} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/protocol/index.ts'
const snap=(id:string,revision:number,label:string)=>({ownerSessionId:'p',source:id==='disk'?'disk':'live',observation:{observerId:id,revision},runs:[],observationIssue:label})
function deferred(){let resolve!:(v:unknown)=>void;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const flush=async()=>{await act(async()=>{})}
function harness(){
 let response:unknown=snap('A',8,'A initial');let pending:ReturnType<typeof deferred>|undefined
 const listeners=new Set<(v:unknown)=>void>();const invoke=vi.fn(async()=>({ok:true,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION,data:pending?await pending.promise:response}))
 const client=createClient(invoke,cb=>{listeners.add(cb);return()=>listeners.delete(cb)})
 return {client,invoke,set:(v:unknown)=>{response=v;pending=undefined},defer:()=>pending=deferred(),emit:(observerId:string,revision=0)=>{for(const cb of listeners)cb({type:'runOverviewChanged',ownerSessionId:'p',observerId,revision,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION})}}
}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers()})
describe('C2b independent lifecycle contract',()=>{
 it('recovers current B when an ambiguous delayed disk hint follows an accepted B response',async()=>{
  const h=harness(),view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  const b=h.defer();act(()=>view.result.current.refresh());await flush();await act(async()=>b.resolve(snap('B',0,'B accepted')))
  expect(view.result.current.snapshot?.observationIssue).toBe('B accepted')
  h.set(snap('B',1,'B fresh'));act(()=>h.emit('disk'));await flush()
  console.log('after delayed disk hint',JSON.stringify({snapshot:view.result.current.snapshot,calls:h.invoke.mock.calls.length}))
  act(()=>h.emit('B',2));h.set(snap('B',2,'B newer'));await act(async()=>vi.advanceTimersByTimeAsync(6000))
  console.log('after B notice and three fallback polls',JSON.stringify({snapshot:view.result.current.snapshot,calls:h.invoke.mock.calls.length}))
  expect(view.result.current.snapshot?.observationIssue).toBe('B newer')
 })
 it('still confirms genuine B close to disk and then accepts C',async()=>{
  const h=harness(),view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  h.set(snap('B',0,'B'));act(()=>h.emit('B'));await flush();expect(view.result.current.snapshot?.observationIssue).toBe('B')
  h.set(snap('disk',0,'disk confirmed'));act(()=>h.emit('disk'));await flush();expect(view.result.current.snapshot?.observationIssue).toBe('disk confirmed')
  h.set(snap('C',0,'C'));act(()=>h.emit('C'));await flush();expect(view.result.current.snapshot?.observationIssue).toBe('C')
 })
})
