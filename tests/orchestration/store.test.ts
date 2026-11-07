import {afterEach, describe, expect, it} from 'vitest'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore, childIdentity} from '../../src/orchestration/store.js'
import {reviewReservationKey,type ReviewRunAdmission} from '../../src/orchestration/budget.js'
import type {TaskAttemptBinding} from '../../src/protocol/run-explanation.js'

const roots: string[] = []
const root = () => {const dir = mkdtempSync(join(tmpdir(), 'dawn-orchestration-')); roots.push(dir); return dir}
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})

describe('durable child identity and recovery', () => {
  it('keeps backend addresses distinct and stable across reopen', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    const child = store.register('subagent', ['call/1', '0'], 'reviewer')
    expect(child.id).toBe(childIdentity('subagent', ['call/1', '0'], 'parent'))
    expect(child.id).not.toBe(childIdentity('team', ['call/1', '0'], 'parent'))
    expect(new OrchestrationStore(dir, 'parent').get(child.id)).toEqual(child)
    expect(() => store.register('subagent', ['call/1', '0'], 'someone-else')).toThrow(/conflict/)
    const exposed = store.list(); exposed[0]!.label = 'mutated'
    expect(store.get(child.id)?.label).toBe('reviewer')
  })

  it('recovers unknown running work as interrupted without losing previous results', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    const finished = store.register('subagent', ['first', '0'], 'a')
    const running = store.register('bot', ['team', 'b', 'epoch-1'], 'b')
    store.update(finished.id, {state: 'completed', result: {ok: true, output: 'checked output'}})
    store.update(running.id, {state: 'running', epoch: 3})
    const reopened = new OrchestrationStore(dir, 'parent')
    expect(reopened.get(finished.id)?.result).toEqual({ok: true, output: 'checked output'})
    expect(reopened.get(running.id)).toMatchObject({state: 'interrupted', epoch: 3, reason: expect.stringMatching(/核对|interrupted/)})
    expect(store.get(running.id)?.state).toBe('running')
  })

  it('refuses corrupt, future-version and foreign-owner state without overwriting the file', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    store.register('team', ['t', 'm', '1'], 'member')
    const file = join(dir, 'orchestration', 'state.json')
    const good = JSON.parse(readFileSync(file, 'utf8'))
    for (const text of ['{broken', JSON.stringify({...good, version: 999}), JSON.stringify({...good, ownerSessionId: 'other'})]) {
      writeFileSync(file, text)
      expect(() => new OrchestrationStore(dir, 'parent')).toThrow(/orchestration/i)
      expect(readFileSync(file, 'utf8')).toBe(text)
    }
  })

  it('does not publish a transaction whose disk commit failed', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    const child = store.register('subagent', ['c', '0'], 'a')
    rmSync(join(dir, 'orchestration'), {recursive: true})
    writeFileSync(join(dir, 'orchestration'), 'occupied')
    expect(() => store.update(child.id, {state: 'running'})).toThrow()
    expect(store.get(child.id)?.state).toBe('idle')
  })
})

it('the same backend address in two parent chats cannot produce an interchangeable child ID', () => {
  const a = new OrchestrationStore(root(), 'parent-a')
  const b = new OrchestrationStore(root(), 'parent-b')
  const first = a.register('subagent', ['call-1', '0'], 'reviewer')
  const second = b.register('subagent', ['call-1', '0'], 'reviewer')
  expect(first.id).not.toBe(second.id)
  expect(b.get(first.id)).toBeUndefined()
})

it('freezes task settings across reopen and refuses contract or permission widening', () => {
  const dir=mkdtempSync(join(tmpdir(),'dawn-frozen-task-'));roots.push(dir)
  const store=new OrchestrationStore(dir,'p'),child=store.register('subagent',['a'],'a')
  const scope={version:1 as const,tier:'deny-risky' as const,access:'read-only' as const,tools:['read'],inputs:[],outputs:[]}
  store.bindTask(child.id,{scope})
  const recovered=new OrchestrationStore(dir,'p')
  expect(recovered.get(child.id)?.settings?.scope).toEqual(scope)
  expect(()=>recovered.bindTask(child.id,{scope:{...scope,tier:'allow-all'}})).toThrow(/frozen|冻结/)
})

describe('atomic review execution-run reservations',()=>{
 const setup=()=>{const dir=root(),store=new OrchestrationStore(dir,'p');store.configureBudget({maxRuns:3,reserveReviewRuns:true},0);return{dir,store}}
 const settle=(store:OrchestrationStore,id:string,epoch:number)=>store.settleRun(id,epoch,{ok:true,output:'',observation:{elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage:{input:0,output:0,cacheRead:0}}},false)
 it('can reserve one fresh review-only retry while default initial admission still needs three',()=>{
  const store=new OrchestrationStore(root(),'p');store.configureBudget({maxRuns:1,reserveReviewRuns:true},0)
  expect(()=>store.reserveReviewRuns('initial',0)).toThrow(/至少需要 3/)
  const reservation=store.reserveReviewRuns('verified-review-recovery-generation-1',0,1)!
  expect(reservation).toMatchObject({phase:'held',remainingRuns:1})
  expect(store.admissionBlock()).toMatchObject({code:'runs'})
  expect(store.admissionBlock({key:reservation.key,stage:'review'})).toBeUndefined()
 })
 const child=(store:OrchestrationStore,name:string)=>store.register('team',['t',name,name],name)
 const attemptFor=(admission:ReviewRunAdmission):TaskAttemptBinding=>({teamId:'t',taskId:JSON.parse(admission.key)[1]+':'+admission.stage,attemptId:JSON.parse(admission.key)[1]+':'+JSON.parse(admission.key)[2]+':'+admission.stage,attempt:1})
 const begin=(store:OrchestrationStore,id:string,admission:ReviewRunAdmission,taskAttempt=attemptFor(admission))=>{store.bindReviewAdmission(id,admission,taskAttempt);return store.beginRun(id,taskAttempt,admission)}
 it('holds the final review run while ordinary work uses its available runs',()=>{
  const{store}=setup(),reservation=store.reserveReviewRuns('pipeline',0)!,key=reservation.key
  expect(key).toBe(reviewReservationKey('p','pipeline',0))
  expect(store.budget()).toMatchObject({consumedRuns:0,ordinaryRemainingRuns:2,reviewReservedRuns:1})
  for(const stage of ['check','analyze'] as const){const c=child(store,stage),epoch=begin(store,c.id,{key,stage});settle(store,c.id,epoch)}
  const extra=child(store,'extra');expect(()=>store.beginRun(extra.id)).toThrow(/预留|预算/)
  expect(store.get(extra.id)?.epoch).toBe(0)
  const review=child(store,'review'),epoch=begin(store,review.id,{key,stage:'review'})
  expect(store.budget()).toMatchObject({consumedRuns:3,reviewReservedRuns:0,inFlight:1,reviewReservations:[{key,phase:'consumed',remainingRuns:0}]})
  settle(store,review.id,epoch)
  expect(()=>settle(store,review.id,epoch)).toThrow(/Stale|settled/)
  expect(store.budget().consumedRuns).toBe(3)
 })
 it('blocks undersized and competing pipelines atomically before any run or reservation is created',()=>{
  const{store}=setup();store.configureBudget({maxRuns:2,reserveReviewRuns:true},store.budget().revision)
  expect(()=>store.reserveReviewRuns('first',0)).toThrow(/三|3|轮次|预算/)
  expect(store.budget()).toMatchObject({consumedRuns:0,reviewReservedRuns:0})
  store.configureBudget({maxRuns:3,reserveReviewRuns:true},store.budget().revision)
  store.reserveReviewRuns('first',0)
  expect(()=>store.reserveReviewRuns('second',0)).toThrow(/轮次|预算/)
  expect(store.budget().reviewReservations).toHaveLength(1)
 })
 it('repeated holds are idempotent and cannot use an owner, pipeline or cycle without a live hold',()=>{
  const{store}=setup(),first=store.reserveReviewRuns('a',0)!,rev=store.budget().revision
  expect(store.reserveReviewRuns('a',0)).toEqual(first);expect(store.budget().revision).toBe(rev)
  const c=child(store,'review')
  for(const key of [reviewReservationKey('other','a',0),reviewReservationKey('p','b',0),reviewReservationKey('p','a',1)])expect(()=>begin(store,c.id,{key,stage:'review'})).toThrow()
  expect(store.budget().consumedRuns).toBe(0)
 })
 it('does not release a running cycle and never refunds an admitted execution',()=>{
  const{store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'check'),epoch=begin(store,c.id,{key,stage:'check'})
  expect(()=>store.releaseReviewReservation(key)).toThrow(/排空|active|flight/)
  settle(store,c.id,epoch);store.releaseReviewReservation(key);const rev=store.budget().revision
  store.releaseReviewReservation(key);expect(store.budget().revision).toBe(rev)
  expect(store.budget()).toMatchObject({consumedRuns:1,reviewReservedRuns:0,reviewReservations:[{phase:'released',remainingRuns:0}]})
  expect(()=>store.reserveReviewRuns('a',0)).toThrow(/结束|consumed|released/)
 })
 it('retains holds through disabling and lowering limits while review respects the absolute run cap',()=>{
  const{store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'review')
  const ordinary=child(store,'ordinary'),epoch=store.beginRun(ordinary.id);settle(store,ordinary.id,epoch)
  store.configureBudget({maxRuns:1,reserveReviewRuns:false},store.budget().revision)
  expect(store.budget()).toMatchObject({reviewReservedRuns:1,ordinaryRemainingRuns:0})
  expect(()=>begin(store,c.id,{key,stage:'review'})).toThrow(/预算|轮次/)
  expect(()=>store.configureBudget({},store.budget().revision)).toThrow(/maxRuns|预留/)
  store.configureBudget({maxRuns:2,reserveReviewRuns:false},store.budget().revision)
  expect(begin(store,c.id,{key,stage:'review'})).toBe(1)
 })
 it('does not bypass token or elapsed constraints with a review hold',()=>{
  const{store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'check'),epoch=begin(store,c.id,{key,stage:'check'})
  settle(store,c.id,epoch)
  store.configureBudget({maxRuns:3,maxElapsedMs:1,reserveReviewRuns:true},store.budget().revision)
  expect(store.admissionBlock({key,stage:'review'},Date.now()+100)).toMatchObject({code:'elapsed'})
 })
 it('recovery holds remain pending even without active children and are resumed explicitly once',()=>{
  const{dir,store}=setup(),key=store.reserveReviewRuns('a',0)!.key
  const restored=new OrchestrationStore(dir,'p')
  expect(restored.budget()).toMatchObject({consumedRuns:0,reviewReservedRuns:1,reviewRecoveryRuns:1,reviewReservations:[{phase:'recovery-check'}]})
  const c=child(restored,'review');expect(()=>begin(restored,c.id,{key,stage:'review'})).toThrow(/核对|恢复/)
  restored.resumeReviewReservation(key);const rev=restored.budget().revision
  restored.resumeReviewReservation(key);expect(restored.budget().revision).toBe(rev)
  const epoch=begin(restored,c.id,{key,stage:'review'});settle(restored,c.id,epoch)
  expect(()=>restored.reserveReviewRuns('a',0)).toThrow()
  expect(new OrchestrationStore(dir,'p').budget()).toMatchObject({consumedRuns:1,reviewRecoveryRuns:0})
 })
 it('recovers an interrupted charge once and a later cycle needs fresh available runs',()=>{
  const{dir,store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'check')
  begin(store,c.id,{key,stage:'check'})
  const restored=new OrchestrationStore(dir,'p');expect(restored.budget()).toMatchObject({consumedRuns:1,unknownRuns:1,inFlight:0,reviewRecoveryRuns:1})
  const twice=new OrchestrationStore(dir,'p');expect(twice.budget().unknownRuns).toBe(1)
  twice.releaseReviewReservation(key)
  expect(twice.reserveReviewRuns('a',1,2)).toMatchObject({phase:'held'})
  expect(()=>twice.reserveReviewRuns('a',2,0)).toThrow() // A verified review-only retry may need one; zero is never valid.
 })
 it('rejects foreign and duplicate reservation keys on cold read without overwriting state',()=>{
  const{dir,store}=setup();store.reserveReviewRuns('a',0)
  const file=join(dir,'orchestration/state.json'),good=JSON.parse(readFileSync(file,'utf8'))
  for(const reservations of [[{...good.budget.reviewReservations[0],key:reviewReservationKey('other','a',0)}],[good.budget.reviewReservations[0],good.budget.reviewReservations[0]]]){
   const text=JSON.stringify({...good,budget:{...good.budget,reviewReservations:reservations}});writeFileSync(file,text)
   expect(()=>new OrchestrationStore(dir,'p')).toThrow();expect(readFileSync(file,'utf8')).toBe(text)
  }
 })
 it('can hold two pipeline reviews without allowing ordinary work to use either final run',()=>{
  const{store}=setup();store.configureBudget({maxRuns:6,reserveReviewRuns:true},store.budget().revision)
  const a=store.reserveReviewRuns('a',0)!,b=store.reserveReviewRuns('b',0)!
  for(let i=0;i<4;i++){const c=child(store,'ordinary-'+i);settle(store,c.id,store.beginRun(c.id))}
  expect(()=>store.beginRun(child(store,'extra').id)).toThrow(/预留/)
  for(const r of [a,b]){const c=child(store,r.key);settle(store,c.id,begin(store,c.id,{key:r.key,stage:'review'}))}
  expect(store.budget()).toMatchObject({consumedRuns:6,reviewReservedRuns:0})
 })
 it('a revised cycle requires fresh analysis and review capacity and keeps all prior charges',()=>{
  const{store}=setup(),old=store.reserveReviewRuns('a',0)!
  for(const stage of ['check','analyze','review'] as const){const c=child(store,stage);settle(store,c.id,begin(store,c.id,{key:old.key,stage}))}
  expect(()=>store.reserveReviewRuns('a',1,2)).toThrow(/预算/)
  store.configureBudget({maxRuns:5,reserveReviewRuns:true},store.budget().revision)
  expect(store.reserveReviewRuns('a',1,2)).toMatchObject({remainingRuns:1,phase:'held'})
  expect(store.budget()).toMatchObject({consumedRuns:3,ordinaryRemainingRuns:1,reviewReservedRuns:1,reviewReservations:[{phase:'consumed'},{phase:'held'}]})
 })
 it('does not create accounting or reservations when the policy is absent',()=>{
  const store=new OrchestrationStore(root(),'p'),before=store.budget()
  expect(store.reserveReviewRuns('a',0)).toBeUndefined();expect(store.budget()).toEqual(before)
  expect(store.budget().reviewReservations).toBeUndefined()
 })
 it('review admission cannot bypass known-token or unknown-usage limits',()=>{
  for(const usage of [{input:1,output:0,cacheRead:0},undefined]){
   const{store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'check'),epoch=begin(store,c.id,{key,stage:'check'})
   store.settleRun(c.id,epoch,{ok:true,output:'',...(usage?{observation:{elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage}}:{})},false)
   store.configureBudget({maxRuns:3,maxTokens:1,reserveReviewRuns:true},store.budget().revision)
   expect(()=>begin(store,child(store,'review').id,{key,stage:'review'})).toThrow(/token|未知用量/)
   expect(store.budget().reviewReservations?.[0]?.phase).toBe('held')
  }
 })
 it('does not publish a consumed hold when the atomic disk write fails',()=>{
  const{dir,store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'review'),admission={key,stage:'review' as const}
  store.bindReviewAdmission(c.id,admission,attemptFor(admission));const before=store.budget()
  rmSync(join(dir,'orchestration'),{recursive:true});writeFileSync(join(dir,'orchestration'),'occupied')
  expect(()=>begin(store,c.id,{key,stage:'review'})).toThrow()
  expect(store.budget()).toEqual(before);expect(store.get(c.id)?.epoch).toBe(0)
 })
 it('refuses consumed reservations without corresponding execution charges on cold read',()=>{
  const{dir,store}=setup();store.reserveReviewRuns('a',0)
  const file=join(dir,'orchestration/state.json'),state=JSON.parse(readFileSync(file,'utf8'))
  state.budget.reviewReservations[0].phase='consumed';state.budget.reviewReservations[0].remainingRuns=0
  writeFileSync(file,JSON.stringify(state));expect(()=>new OrchestrationStore(dir,'p')).toThrow(/accounting|预留/)
 })
 it('owner and revision guards also apply to resume, release and settings without dropping holds',()=>{
  const{store}=setup(),key=store.reserveReviewRuns('a',0)!.key,before=store.budget()
  for(const operation of [()=>store.releaseReviewReservation(reviewReservationKey('other','a',0)),()=>store.resumeReviewReservation(reviewReservationKey('other','a',0)),()=>store.configureBudget({maxRuns:8},0)])expect(operation).toThrow()
  expect(store.budget()).toEqual(before);expect(store.budget().reviewReservations?.[0]?.key).toBe(key)
 })
 it('requires a frozen host-owned attempt binding and rejects a swapped pipeline or revision',()=>{
  const{store}=setup();store.configureBudget({maxRuns:8,reserveReviewRuns:true},store.budget().revision)
  const key=store.reserveReviewRuns('a',0)!.key,other=store.reserveReviewRuns('b',0)!.key,c=child(store,'review'),admission={key,stage:'review' as const},taskAttempt=attemptFor(admission)
  expect(()=>store.beginRun(c.id,taskAttempt,admission)).toThrow(/绑定|binding/)
  store.bindReviewAdmission(c.id,admission,taskAttempt)
  expect(()=>store.bindReviewAdmission(c.id,{key:other,stage:'review'},taskAttempt)).toThrow(/冻结|binding/)
  expect(()=>store.beginRun(c.id,taskAttempt,{key:other,stage:'review'})).toThrow(/绑定|binding/)
  expect(()=>store.beginRun(c.id,taskAttempt)).toThrow(/绑定|binding/)
  expect(()=>store.bindReviewAdmission(c.id,admission,{...taskAttempt,teamId:'foreign'})).toThrow(/owner|team|团队/)
  const epoch=store.beginRun(c.id,taskAttempt,admission);settle(store,c.id,epoch)
  expect(()=>store.beginRun(c.id,taskAttempt,admission)).toThrow(/代次|epoch|admitted/)
  expect(store.budget().consumedRuns).toBe(1)
 })
 it('keeps distinct task bindings for a reused member without allowing old attempts to be charged again',()=>{
  const{store}=setup();store.configureBudget({maxRuns:8,reserveReviewRuns:true},store.budget().revision)
  const a=store.reserveReviewRuns('a',0)!,b=store.reserveReviewRuns('b',0)!,c=child(store,'member')
  const first={key:a.key,stage:'check' as const},second={key:b.key,stage:'check' as const},firstAttempt=attemptFor(first)
  settle(store,c.id,begin(store,c.id,first,firstAttempt));settle(store,c.id,begin(store,c.id,second))
  expect(()=>store.beginRun(c.id,firstAttempt,first)).toThrow(/代次|epoch|admitted/)
  expect(store.budget()).toMatchObject({consumedRuns:2,reviewReservedRuns:2})
 })
 it('rejects malformed, duplicated or uncharged frozen attempt bindings on cold read',()=>{
  const{dir,store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'check'),admission={key,stage:'check' as const}
  store.bindReviewAdmission(c.id,admission,attemptFor(admission))
  const file=join(dir,'orchestration/state.json'),good=JSON.parse(readFileSync(file,'utf8')),binding=good.budget.reviewBindings[0]
  for(const bindings of [[{...binding,taskAttempt:{...binding.taskAttempt,teamId:'foreign'}}],[binding,binding],[{...binding,admittedEpoch:2}]]){
   const text=JSON.stringify({...good,budget:{...good.budget,reviewBindings:bindings}});writeFileSync(file,text)
   expect(()=>new OrchestrationStore(dir,'p')).toThrow(/binding/);expect(readFileSync(file,'utf8')).toBe(text)
  }
  good.children[0].epoch=1;good.budget.reviewBindings[0].admittedEpoch=1
  writeFileSync(file,JSON.stringify(good));expect(()=>new OrchestrationStore(dir,'p')).toThrow(/accounting/)
 })
 it('cannot use an unrelated ordinary charge to claim that a held review reservation was consumed',()=>{
  const{dir,store}=setup();store.reserveReviewRuns('a',0)
  const ordinary=store.register('subagent',['ordinary'],'ordinary');settle(store,ordinary.id,store.beginRun(ordinary.id))
  const file=join(dir,'orchestration/state.json'),state=JSON.parse(readFileSync(file,'utf8'))
  state.budget.reviewReservations[0].phase='consumed';state.budget.reviewReservations[0].remainingRuns=0
  const text=JSON.stringify(state);writeFileSync(file,text)
  expect(()=>new OrchestrationStore(dir,'p')).toThrow(/accounting|reservation|预留/)
  expect(readFileSync(file,'utf8')).toBe(text)
 })
 it('an admitted review binding must correspond to its consumed reservation even after settlement',()=>{
  const{dir,store}=setup(),key=store.reserveReviewRuns('a',0)!.key,c=child(store,'review')
  settle(store,c.id,begin(store,c.id,{key,stage:'review'}))
  const file=join(dir,'orchestration/state.json'),good=JSON.parse(readFileSync(file,'utf8'))
  for(const phase of ['held','recovery-check','released']){
   const state=structuredClone(good),reservation=state.budget.reviewReservations[0]
   reservation.phase=phase;reservation.remainingRuns=phase==='released'?0:1
   const text=JSON.stringify(state);writeFileSync(file,text)
   expect(()=>new OrchestrationStore(dir,'p')).toThrow(/accounting|reservation|预留/)
   expect(readFileSync(file,'utf8')).toBe(text)
  }
 })
 it('requires exactly one admitted review binding for each consumed reservation key',()=>{
  const{dir,store}=setup();store.configureBudget({maxRuns:6,reserveReviewRuns:true},store.budget().revision)
  const a=store.reserveReviewRuns('a',0)!,b=store.reserveReviewRuns('b',0)!
  for(const reservation of [a,b]){const c=child(store,reservation.key);settle(store,c.id,begin(store,c.id,{key:reservation.key,stage:'review'}))}
  const file=join(dir,'orchestration/state.json'),state=JSON.parse(readFileSync(file,'utf8'))
  state.budget.reviewBindings[1].admission.key=a.key
  state.budget.reviewReservations[1].phase='released';state.budget.reviewReservations[1].remainingRuns=0
  const text=JSON.stringify(state);writeFileSync(file,text)
  expect(()=>new OrchestrationStore(dir,'p')).toThrow(/accounting|reservation|预留/)
  expect(readFileSync(file,'utf8')).toBe(text)
 })
 it('waits for the same cycle predecessor to drain before atomically consuming its review hold',()=>{
  const{dir,store}=setup(),key=store.reserveReviewRuns('a',0)!.key,check=child(store,'check'),review=child(store,'review')
  const epoch=begin(store,check.id,{key,stage:'check'})
  expect(()=>begin(store,review.id,{key,stage:'review'})).toThrow(/排空|前序|active/)
  expect(store.budget()).toMatchObject({consumedRuns:1,reviewReservedRuns:1,inFlight:1})
  settle(store,check.id,epoch);begin(store,review.id,{key,stage:'review'})
  expect(()=>new OrchestrationStore(dir,'p')).not.toThrow()
 })
 it('review consumption can coexist with active predecessors of a different reserved cycle',()=>{
  const{dir,store}=setup();store.configureBudget({maxRuns:6,reserveReviewRuns:true},store.budget().revision)
  const a=store.reserveReviewRuns('a',0)!,b=store.reserveReviewRuns('b',0)!
  begin(store,child(store,'check-b').id,{key:b.key,stage:'check'})
  expect(begin(store,child(store,'review-a').id,{key:a.key,stage:'review'})).toBe(1)
  expect(store.budget()).toMatchObject({consumedRuns:2,reviewReservedRuns:1,inFlight:2})
  expect(()=>new OrchestrationStore(dir,'p')).not.toThrow()
 })
})
