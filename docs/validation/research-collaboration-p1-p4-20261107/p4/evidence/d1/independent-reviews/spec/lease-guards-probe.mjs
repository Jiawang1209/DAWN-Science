import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationService} from './src/orchestration/service.ts'
import {OrchestrationStore} from './src/orchestration/store.ts'
import {currentExecutionContext} from './src/orchestration/execution-context.ts'
const dir=mkdtempSync(join(tmpdir(),'dawn-d1-spec-lease-')),store=new OrchestrationStore(dir,'owner'),service=new OrchestrationService(store),child=service.register('bot',['b'],'b')
let release;const wait=new Promise(r=>release=r);let bind
const s={version:1,availability:'available',source:'sdk-estimate',observedAt:10,provider:'p',model:'m',usedTokens:20}
try {
 const run=service.run(child.id,async()=>{bind=currentExecutionContext().bindContextRoute;await wait;return{ok:true,output:''}})
 const old=bind({provider:'p',model:'m'});old(s)
 const fresh=bind({provider:'p',model:'m'}),file=join(dir,'orchestration/state.json'),bytes=readFileSync(file,'utf8'),obs=service.observation.revision,rev=service.revision,budget=store.budget().revision
 old(s);old({...s,observedAt:100,usedTokens:999});fresh({...s,observedAt:9,usedTokens:999});fresh({...s,provider:'other'});
 assert.equal(service.contextObservation(child.id).current,false);assert.equal(service.observation.revision,obs);assert.equal(readFileSync(file,'utf8'),bytes)
 fresh(s);assert.equal(service.contextObservation(child.id).current,true);assert.equal(service.observation.revision,obs+1);assert.equal(readFileSync(file,'utf8'),bytes)
 fresh(s);old(s);assert.equal(service.observation.revision,obs+1);assert.equal(service.revision,rev);assert.equal(store.budget().revision,budget);assert.equal(readFileSync(file,'utf8'),bytes)
 release();await run;fresh(s);assert.equal(service.contextObservation(child.id).current,false)
 console.log('PASS: stale lease/older/wrong-route cannot admit; fresh exact duplicate becomes current once; repeated duplicate no write/invalidation/execution/budget change; ended scope rejects')
} finally {release();await service.close();rmSync(dir,{recursive:true,force:true})}
