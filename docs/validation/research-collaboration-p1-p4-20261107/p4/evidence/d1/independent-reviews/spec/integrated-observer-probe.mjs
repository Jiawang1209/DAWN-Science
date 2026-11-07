import {OrchestrationService} from './src/orchestration/service.ts'
import {OrchestrationStore} from './src/orchestration/store.ts'
import {currentExecutionContext} from './src/orchestration/execution-context.ts'
import {observeAgentContext} from './src/runtime/agent-context-sampler.ts'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const dir=mkdtempSync(join(tmpdir(),'dawn-d1-spec-observer-')),service=new OrchestrationService(new OrchestrationStore(dir,'owner')),child=service.register('bot',['b'],'b')
let release;const wait=new Promise(r=>release=r);const now=Date.now
try {
 let bind;const run=service.run(child.id,async()=>{bind=currentExecutionContext().bindContextRoute;await wait;return{ok:true,output:''}})
 const message={role:'assistant',provider:'p',model:'m',stopReason:'stop',usage:{totalTokens:20},content:[]}
 const listeners=new Set();const session={state:{model:{provider:'p',id:'m',contextWindow:100},systemPrompt:'',tools:[],messages:[message]},sessionManager:{getBranch:()=>[{type:'message',message}]},getContextUsage:()=>({tokens:20}),subscribe:cb=>{listeners.add(cb);return()=>listeners.delete(cb)}}
 Date.now=()=>10
 const stop1=observeAgentContext(session,bind({provider:'p',model:'m'}));console.log('first observer',service.contextObservation(child.id).reason);stop1()
 const stop2=observeAgentContext(session,bind({provider:'p',model:'m'}));console.log('new observer first reading',service.contextObservation(child.id).reason)
 Date.now=()=>11;for(const cb of listeners)cb({type:'turn_end'});await Promise.resolve();console.log('later unchanged boundary',service.contextObservation(child.id).reason);stop2()
 Date.now=now;release();await run
} finally {Date.now=now;release();await service.close();rmSync(dir,{recursive:true,force:true})}
