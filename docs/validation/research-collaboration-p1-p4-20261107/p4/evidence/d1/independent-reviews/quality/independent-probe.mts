import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/store.ts'
import {OrchestrationService} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/service.ts'
import {currentExecutionContext} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/execution-context.ts'
import {observeAgentContext} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/runtime/agent-context-sampler.ts'
import {liveRunOverview,readRunOverview} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/run-overview.ts'
async function main(){
const dir=mkdtempSync(join(tmpdir(),'dawn-d1-independent-quality-'))
const store=new OrchestrationStore(dir,'quality-owner'),service=new OrchestrationService(store,2)
let release!:()=>void;const gate=new Promise<void>(r=>release=r)
const reporters=new Map<string,(sample:unknown)=>void>()
const children=['a','b'].map(name=>store.register('subagent',[name],name))
const sample=(usedTokens:number,observedAt=10)=>({version:1,availability:'available',source:'sdk-estimate',provider:'p',model:'m',observedAt,usedTokens})
const runs=children.map(child=>service.run(child.id,async()=>{reporters.set(child.id,currentExecutionContext()!.bindContextRoute!({provider:'p',model:'m'}));await gate;return {ok:true,output:''}}))
try{
reporters.get(children[0]!.id)!(sample(11));reporters.get(children[1]!.id)!(sample(22));
assert.equal(service.contextObservation(children[0]!.id).sample?.sample.availability,'available')
assert.equal((service.contextObservation(children[0]!.id).sample?.sample as any).usedTokens,11)
assert.equal((service.contextObservation(children[1]!.id).sample?.sample as any).usedTokens,22)
const file=join(dir,'orchestration/state.json'),before=readFileSync(file,'utf8'),stamp=service.observation,revision=service.revision,budget=store.budget()
for(let i=0;i<20;i++){liveRunOverview(service);readRunOverview(dir,'quality-owner')}
assert.equal(readFileSync(file,'utf8'),before);assert.deepEqual(service.observation,stamp);assert.equal(service.revision,revision)
const afterBudget=store.budget();delete (afterBudget as any).elapsedMs;delete (budget as any).elapsedMs;assert.deepEqual(afterBudget,budget)
reporters.get(children[0]!.id)!({...sample(100,20),ownerSessionId:'forged',childId:children[1]!.id});reporters.get(children[0]!.id)!(sample(100,9))
assert.equal(readFileSync(file,'utf8'),before)
service.interrupt(children[0]!.id);assert.equal(service.contextObservation(children[0]!.id).current,false);assert.equal(service.contextObservation(children[1]!.id).current,true)
reporters.get(children[0]!.id)!(sample(999,999));assert.equal((service.contextObservation(children[0]!.id).sample?.sample as any).usedTokens,11)
console.log('PASS concurrent child isolation, strict payload, older rejection, cancellation isolation, read-only bytes/revision/budget')
}finally{release();await Promise.all(runs);await service.close();rmSync(dir,{recursive:true,force:true})}
let listener!:(event:unknown)=>void,reads=0,unsubscribes=0,reports=0
const message={role:'assistant',provider:'p',model:'m',stopReason:'stop',usage:{totalTokens:10},content:[{type:'text',text:'public'}]}
const sdk={state:{model:{provider:'p',id:'m',contextWindow:100},systemPrompt:'s',tools:[],messages:[message]},getContextUsage:()=>({tokens:10}),sessionManager:{getBranch:()=>{reads++;return [{type:'message',message}]}},subscribe:(cb:typeof listener)=>{listener=cb;return()=>{unsubscribes++}}}
const stop=observeAgentContext(sdk,()=>reports++);assert.equal(reports,1)
listener({type:'message_end'});stop();await Promise.resolve();assert.equal(reads,1);assert.equal(reports,1);assert.equal(unsubscribes,1)
const stopAgain=observeAgentContext(sdk,()=>reports++);assert.equal(reports,2);stopAgain();assert.equal(unsubscribes,2)
console.log('PASS pending microtask disposal and per-observer semantic reset')
console.log('ALL INDEPENDENT QUALITY PROBES PASS')
}
main().catch(error=>{console.error(error);process.exitCode=1})
