import {afterEach,beforeEach,expect,it,vi} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/node_modules/vitest/dist/index.js'
import {act,cleanup,renderHook} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/node_modules/@testing-library/react/dist/index.js'
import {createClient} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/client.ts'
import {useRunOverview} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/ui/use-run-overview.ts'
import {WORKBENCH_PROTOCOL_VERSION} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/protocol/index.ts'
const snap=(ownerSessionId:string,id:string,revision:number,label:string)=>({ownerSessionId,source:id==='disk'?'disk':'live',observation:{observerId:id,revision},runs:[],observationIssue:label})
const flush=async()=>{await act(async()=>{})}
const deferred=()=>{let resolve!:(v:unknown)=>void,reject!:(e:Error)=>void;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers()})
function harness(){
 const listeners=new Set<(v:unknown)=>void>(),read=vi.fn((owner:string)=>Promise.resolve(snap(owner,owner+'-A',0,owner+' initial')))
 const invoke=vi.fn(async(_op:string,request:any)=>({ok:true,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION,data:await read(request.sessionId)}))
 const client=createClient(invoke,cb=>{listeners.add(cb);return()=>{listeners.delete(cb)}})
 return {client,read,invoke,listeners,emit:(ownerSessionId:string,observerId:string,revision:number)=>{for(const cb of listeners)cb({type:'runOverviewChanged',ownerSessionId,observerId,revision,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION})}}
}
it('isolates simultaneous owners and leaves surviving owner subscription and timer after partial teardown',async()=>{
 const h=harness(),p=renderHook(()=>useRunOverview(h.client,'p')),q=renderHook(()=>useRunOverview(h.client,'q'));await flush()
 expect(h.invoke).toHaveBeenCalledTimes(2);expect(h.listeners.size).toBe(2);expect(vi.getTimerCount()).toBe(2)
 const pending=deferred();h.read.mockImplementation((owner:string)=>owner==='p'?pending.promise:Promise.resolve(snap('q','q-A',2,'q refreshed')))
 act(()=>h.emit('p','p-A',1));await flush();act(()=>h.emit('q','q-A',2));await flush()
 expect(q.result.current.snapshot?.observationIssue).toBe('q refreshed');expect(p.result.current.snapshot?.observationIssue).toBe('p initial')
 act(()=>p.result.current.refresh());p.unmount();expect(h.listeners.size).toBe(1)
 await act(async()=>pending.reject(new Error('disposed read failed')))
 expect(vi.getTimerCount()).toBe(1)
 await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(h.invoke).toHaveBeenCalledTimes(5)
 q.unmount();expect(h.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0)
})
it('recovers from a synchronous get throw with one fallback and no ownerless activity',async()=>{
 const get=vi.fn(()=>{throw new Error('sync fail')}),client={get} as any
 const v=renderHook(({owner}:{owner?:string})=>useRunOverview(client,owner),{initialProps:{owner:undefined as string|undefined}});await flush();expect(get).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)
 v.rerender({owner:'p'});await flush();expect(v.result.current.error).toBe('sync fail');expect(get).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(1)
 get.mockImplementation(()=>Promise.resolve(snap('p','A',0,'recovered')) as any)
 await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(v.result.current.snapshot?.observationIssue).toBe('recovered');expect(v.result.current.error).toBeUndefined();expect(get).toHaveBeenCalledTimes(2)
})
it('rejects an older read error after B notice and recovers on its sole requested tail',async()=>{
 const h=harness(),v=renderHook(()=>useRunOverview(h.client,'p'));await flush();const pending=deferred()
 h.read.mockReturnValueOnce(pending.promise as any).mockResolvedValue(snap('p','B',0,'B recovered'))
 act(()=>v.result.current.refresh());await flush();act(()=>h.emit('p','B',0))
 await act(async()=>pending.reject(new Error('stale read failed')))
 expect(v.result.current.snapshot?.observationIssue).toBe('B recovered');expect(v.result.current.error).toBeUndefined();expect(h.invoke).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(1)
})
it('disposes an explicitly queued tail when the last observer unmounts',async()=>{
 const h=harness(),pending=deferred();h.read.mockReturnValue(pending.promise as any)
 const v=renderHook(()=>useRunOverview(h.client,'p'));await flush();act(()=>{h.emit('p','B',0);v.result.current.refresh()});v.unmount()
 await act(async()=>pending.resolve(snap('p','A',1,'disposed')))
 expect(h.invoke).toHaveBeenCalledTimes(1);expect(h.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0)
})
