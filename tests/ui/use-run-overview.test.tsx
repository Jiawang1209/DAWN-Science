import {StrictMode} from 'react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,renderHook} from '@testing-library/react'
import {useRunOverview} from '../../src/ui/use-run-overview.js'
import {createClient,type WorkbenchClient} from '../../src/ui/client.js'
import {WORKBENCH_PROTOCOL_VERSION,type RunOverview,type RunOverviewChanged} from '../../src/protocol/index.js'
const snapshot=(owner='p',observerId:string|null='A',revision=0,label='value'):RunOverview=>({ownerSessionId:owner,source:observerId==='disk'?'disk':'live',...(observerId?{observation:{observerId,revision}}:{}),runs:[],observationIssue:label})
function deferred(){let resolve!:(s:RunOverview)=>void;let reject!:(e:Error)=>void;const promise=new Promise<RunOverview>((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
function harness(){
 const get=vi.fn().mockResolvedValue(snapshot()),callbacks=new Set<(event:RunOverviewChanged)=>void>(),unsubscribe=vi.fn()
 const subscribeRunOverviewChanges=vi.fn((cb:(e:RunOverviewChanged)=>void)=>{callbacks.add(cb);return()=>{callbacks.delete(cb);unsubscribe()}})
 return{get,client:{get,subscribeRunOverviewChanges} as unknown as WorkbenchClient,subscribeRunOverviewChanges,unsubscribe,
 emit:(observerId='A',revision=1,ownerSessionId='p')=>{for(const cb of callbacks)cb({type:'runOverviewChanged',ownerSessionId,observerId,revision,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION})}}
}
function rawHarness(){
 const read=vi.fn().mockResolvedValue(snapshot('p','A',8,'A initial')),callbacks=new Set<(raw:unknown)=>void>()
 const invoke=vi.fn(async()=>({ok:true,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION,data:await read()}))
 const client=createClient(invoke,cb=>{callbacks.add(cb);return()=>{callbacks.delete(cb)}})
 return{client,read,invoke,emit:(observerId:string,revision=0)=>{for(const cb of callbacks)cb({type:'runOverviewChanged',ownerSessionId:'p',observerId,revision,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION})}}
}
const flush=async()=>{await act(async()=>{})}
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{cleanup();vi.useRealTimers()})
describe('shared readonly overview observation',()=>{
 it('shares one read, event subscription and settled polling timer between components',async()=>{
  const h=harness(),a=renderHook(()=>useRunOverview(h.client,'p')),b=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  expect(h.get).toHaveBeenCalledExactlyOnceWith('getRunOverview',{sessionId:'p'});expect(h.subscribeRunOverviewChanges).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(1)
  expect(a.result.current.snapshot).toBe(b.result.current.snapshot)
  a.unmount();expect(h.unsubscribe).not.toHaveBeenCalled();b.unmount();expect(h.unsubscribe).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0)
 })
 it('uses a synchronous replay to start just one read and ignores a retained callback after unsubscribe',async()=>{
  const get=vi.fn().mockResolvedValue(snapshot()),unsubscribe=vi.fn();let callback!:(e:RunOverviewChanged)=>void
  const notice:RunOverviewChanged={type:'runOverviewChanged',ownerSessionId:'p',observerId:'A',revision:0,workbenchProtocolVersion:WORKBENCH_PROTOCOL_VERSION}
  const subscribeRunOverviewChanges=vi.fn((cb:typeof callback)=>{callback=cb;cb(notice);return unsubscribe}),client={get,subscribeRunOverviewChanges} as unknown as WorkbenchClient
  const view=renderHook(()=>useRunOverview(client,'p'));await flush();expect(get).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(1)
  view.unmount();act(()=>callback({...notice,revision:1}));await flush()
  expect(get).toHaveBeenCalledTimes(1);expect(unsubscribe).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0)
 })
 it('coalesces notification and manual refresh while pending into one tail and rejects superseded response',async()=>{
  const h=harness(),first=deferred(),tail=deferred();h.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(tail.promise)
  const view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  act(()=>{h.emit('A',1);h.emit('A',2);h.emit('A',2);view.result.current.refresh();view.result.current.refresh()})
  expect(h.get).toHaveBeenCalledTimes(1)
  await act(async()=>first.resolve(snapshot('p','A',0,'old')))
  expect(view.result.current.snapshot).toBeUndefined();expect(h.get).toHaveBeenCalledTimes(2)
  await act(async()=>tail.resolve(snapshot('p','A',2,'new')))
  expect(view.result.current.snapshot?.observationIssue).toBe('new');expect(h.get).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(1)
 })
 it('accepts a pending live response that proves the latest notice while retaining one coalesced tail',async()=>{
  const h=harness(),first=deferred(),tail=deferred();h.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(tail.promise)
  const view=renderHook(()=>useRunOverview(h.client,'p'));await flush();act(()=>{h.emit('A',1);h.emit('A',2)})
  await act(async()=>first.resolve(snapshot('p','A',3,'already current')))
  expect(view.result.current.snapshot?.observationIssue).toBe('already current');expect(h.get).toHaveBeenCalledTimes(2)
  await act(async()=>tail.resolve(snapshot('p','A',3,'tail elapsed')))
  expect(view.result.current.snapshot?.observationIssue).toBe('tail elapsed')
 })
 it('does not mistake an old disk stamp for a later disk lifecycle after intervening live notices',async()=>{
  const h=harness(),old=deferred(),tail=deferred();h.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(tail.promise)
  const view=renderHook(()=>useRunOverview(h.client,'p'));await flush();act(()=>{h.emit('A',0);h.emit('disk',0)})
  await act(async()=>old.resolve(snapshot('p','disk',0,'old disk generation')))
  expect(view.result.current.snapshot).toBeUndefined();expect(h.get).toHaveBeenCalledTimes(2)
  await act(async()=>tail.resolve(snapshot('p','disk',0,'new disk generation')))
  expect(view.result.current.snapshot?.observationIssue).toBe('new disk generation')
 })
 it('retains a manual refresh made during a read without any notification',async()=>{
  const h=harness(),first=deferred();h.get.mockReturnValueOnce(first.promise)
  const view=renderHook(()=>useRunOverview(h.client,'p'));await flush();act(()=>view.result.current.refresh())
  await act(async()=>first.resolve(snapshot()))
  expect(h.get).toHaveBeenCalledTimes(2)
 })
 it('ignores duplicate, lower and foreign-owner notices and lower responses without spinning',async()=>{
  const h=harness();h.get.mockResolvedValue(snapshot('p','A',5));const view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  act(()=>{h.emit('A',5);h.emit('A',4);h.emit('A',99,'other')});await flush();expect(h.get).toHaveBeenCalledTimes(1)
  h.get.mockResolvedValue(snapshot('p','A',4,'stale'));act(()=>h.emit('A',6));await flush()
  expect(h.get).toHaveBeenCalledTimes(2);expect(view.result.current.snapshot?.observation?.revision).toBe(5)
  await act(async()=>vi.advanceTimersByTimeAsync(1999));expect(h.get).toHaveBeenCalledTimes(2)
  await act(async()=>vi.advanceTimersByTimeAsync(1));expect(h.get).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(1)
 })
 it('allows equal-stamp elapsed/file updates and a new service counter starting at zero',async()=>{
  const h=harness(),view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  h.get.mockResolvedValue(snapshot('p','A',0,'elapsed changed'));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('elapsed changed')
  h.get.mockResolvedValue(snapshot('p','B',0,'new service'));act(()=>h.emit('B',0));await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('new service')
  act(()=>h.emit('A',100));await flush();expect(h.get).toHaveBeenCalledTimes(3)
 })
 it('rejects a pending old-service response after the new-service notice, then ignores retired service reads',async()=>{
  const h=harness(),old=deferred();h.get.mockResolvedValueOnce(snapshot('p','A',8)).mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot('p','B',0,'B'))
  const view=renderHook(()=>useRunOverview(h.client,'p'));await flush();act(()=>view.result.current.refresh());await flush()
  act(()=>h.emit('B',0));await act(async()=>old.resolve(snapshot('p','A',99,'old A')))
  expect(view.result.current.snapshot?.observationIssue).toBe('B');expect(h.get).toHaveBeenCalledTimes(3)
  h.get.mockResolvedValue(snapshot('p','A',100,'retired'));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('B');expect(h.get).toHaveBeenCalledTimes(4)
 })
 it('permits repeated disk/live transitions but rejects disk reads started before a new service notice',async()=>{
  const h=harness();h.get.mockResolvedValue(snapshot('p','disk',0,'disk one'));const view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  for(const id of ['A','B']){
   const oldDisk=deferred();h.get.mockReturnValueOnce(oldDisk.promise).mockResolvedValueOnce(snapshot('p',id,0,id))
   act(()=>view.result.current.refresh());await flush();act(()=>h.emit(id,0))
   await act(async()=>oldDisk.resolve(snapshot('p','disk',0,'stale disk')))
   expect(view.result.current.snapshot?.observationIssue).toBe(id)
   h.get.mockResolvedValue(snapshot('p','disk',0,'disk after '+id));act(()=>h.emit('disk',0));await flush()
   expect(view.result.current.snapshot?.observationIssue).toBe('disk after '+id)
  }
  h.get.mockResolvedValue(snapshot('p','disk',0,'file changed'));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('file changed')
  const calls=h.get.mock.calls.length;act(()=>{h.emit('A',10);h.emit('B',10)});await flush();expect(h.get).toHaveBeenCalledTimes(calls)
 })
 it('allows legacy metadata-free backends from the start but refuses missing metadata after expecting a stamp',async()=>{
  const h=harness();h.get.mockResolvedValue(snapshot('p',null,0,'legacy'));const view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('legacy')
  act(()=>h.emit('A',1));await flush();expect(view.result.current.snapshot?.observationIssue).toBe('legacy');expect(h.get).toHaveBeenCalledTimes(2)
  h.get.mockResolvedValue(snapshot('p','A',1,'stamped'));act(()=>view.result.current.refresh());await flush()
  h.get.mockResolvedValue(snapshot('p',null,0,'missing'));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('stamped');expect(vi.getTimerCount()).toBe(1)
 })
 it('rejects foreign returned owner and clears the old snapshot on read error',async()=>{
  const h=harness(),view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  h.get.mockResolvedValue(snapshot('other','A',1));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.snapshot).toBeUndefined();expect(view.result.current.error).toContain('会话不匹配')
  h.get.mockRejectedValue(new Error('read failed'));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.error).toBe('read failed')
 })
 it('isolates owner and client switches and invalidates late promises and captured refresh after last unsubscribe',async()=>{
  const h=harness(),other=harness(),old=deferred();h.get.mockReturnValueOnce(old.promise).mockResolvedValue(snapshot('q','Q',0,'q'))
  const view=renderHook(({client,owner})=>useRunOverview(client,owner),{initialProps:{client:h.client,owner:'p'}});await flush();const oldRefresh=view.result.current.refresh
  view.rerender({client:h.client,owner:'q'});await flush();expect(view.result.current.snapshot?.ownerSessionId).toBe('q')
  other.get.mockResolvedValue(snapshot('q','new',0,'other client'));view.rerender({client:other.client,owner:'q'});await flush()
  await act(async()=>old.resolve(snapshot('p','A',99,'old')))
  expect(view.result.current.snapshot?.observationIssue).toBe('other client')
  act(()=>oldRefresh());await flush();expect(h.get).toHaveBeenCalledTimes(2)
  const refresh=view.result.current.refresh;view.unmount();act(()=>refresh());await flush()
  expect(other.get).toHaveBeenCalledTimes(1);expect(other.unsubscribe).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0)
 })
 it('survives StrictMode mount cleanup and remount without accepting the first entry response',async()=>{
  const h=harness(),old=deferred();h.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot('p','B',0,'remounted'))
  const view=renderHook(()=>useRunOverview(h.client,'p'),{wrapper:StrictMode});await flush()
  await act(async()=>old.resolve(snapshot('p','A',99,'disposed')))
  expect(view.result.current.snapshot?.observationIssue).toBe('remounted');expect(h.subscribeRunOverviewChanges).toHaveBeenCalledTimes(2);expect(h.unsubscribe).toHaveBeenCalledTimes(1)
  view.unmount();expect(h.unsubscribe).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0)
 })
 it('does not retire accepted B on an ambiguous delayed disk hint from A close',async()=>{
  const h=rawHarness(),view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  h.read.mockResolvedValue(snapshot('p','B',0,'B accepted'));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('B accepted')
  h.read.mockResolvedValue(snapshot('p','B',1,'B fresh'));act(()=>h.emit('disk'));await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('B fresh')
  h.read.mockResolvedValue(snapshot('p','B',2,'B newer'));act(()=>h.emit('B',2));await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('B newer')
  const calls=h.invoke.mock.calls.length;act(()=>h.emit('A',99));await flush();expect(h.invoke).toHaveBeenCalledTimes(calls)
 })
 it('confirms a genuine live-to-disk snapshot, retires B, then accepts C',async()=>{
  const h=rawHarness();h.read.mockResolvedValue(snapshot('p','B',0,'B'));const view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  h.read.mockResolvedValue(snapshot('p','disk',0,'disk confirmed'));act(()=>h.emit('disk'));await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('disk confirmed')
  const calls=h.invoke.mock.calls.length;act(()=>h.emit('B',99));await flush();expect(h.invoke).toHaveBeenCalledTimes(calls)
  h.read.mockResolvedValue(snapshot('p','B',100,'retired B'));act(()=>view.result.current.refresh());await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('disk confirmed')
  h.read.mockResolvedValue(snapshot('p','C',0,'C'));act(()=>h.emit('C'));await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('C')
 })
 it('retires B on a distinct C notice even when a disk hint has not been confirmed',async()=>{
  const h=rawHarness(),pending=deferred();h.read.mockResolvedValue(snapshot('p','B',8,'B accepted'));const view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  h.read.mockReturnValueOnce(pending.promise).mockResolvedValue(snapshot('p','B',10,'stale B'))
  act(()=>h.emit('disk'));await flush();act(()=>{h.emit('disk');h.emit('C')})
  await act(async()=>pending.resolve(snapshot('p','B',9,'pending B')))
  expect(view.result.current.snapshot?.observationIssue).toBe('B accepted');expect(h.invoke).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(1)
  act(()=>h.emit('B',99));await flush();expect(h.invoke).toHaveBeenCalledTimes(3)
  h.read.mockResolvedValue(snapshot('p','C',0,'C confirmed'));await act(async()=>vi.advanceTimersByTimeAsync(2000))
  expect(view.result.current.snapshot?.observationIssue).toBe('C confirmed');expect(h.invoke).toHaveBeenCalledTimes(4)
 })
 it('retains the live revision guard while an unconfirmed disk hint is pending without a refetch storm',async()=>{
  const h=rawHarness();h.read.mockResolvedValue(snapshot('p','B',8,'B eight'));const view=renderHook(()=>useRunOverview(h.client,'p'));await flush()
  h.read.mockResolvedValue(snapshot('p','B',7,'older B'));act(()=>h.emit('disk'));await flush()
  expect(view.result.current.snapshot?.observationIssue).toBe('B eight');expect(h.invoke).toHaveBeenCalledTimes(2)
  act(()=>{h.emit('disk');h.emit('B',8);h.emit('B',7)});await flush();expect(h.invoke).toHaveBeenCalledTimes(2)
  await act(async()=>vi.advanceTimersByTimeAsync(1999));expect(h.invoke).toHaveBeenCalledTimes(2)
  h.read.mockResolvedValue(snapshot('p','B',9,'B nine'));await act(async()=>vi.advanceTimersByTimeAsync(1))
  expect(view.result.current.snapshot?.observationIssue).toBe('B nine');expect(h.invoke).toHaveBeenCalledTimes(3)
 })
 it('keeps get-only legacy clients on one two-second timer scheduled after settlement',async()=>{
  const pending=deferred(),get=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(snapshot('p',null)),client={get} as unknown as WorkbenchClient
  renderHook(()=>useRunOverview(client,'p'));await flush();await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(get).toHaveBeenCalledTimes(1)
  await act(async()=>pending.resolve(snapshot('p',null)));expect(vi.getTimerCount()).toBe(1)
  await act(async()=>vi.advanceTimersByTimeAsync(1999));expect(get).toHaveBeenCalledTimes(1)
  await act(async()=>vi.advanceTimersByTimeAsync(1));expect(get).toHaveBeenCalledTimes(2)
 })
})
