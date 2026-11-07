import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {sessionUsage} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/runtime/session-usage.ts'
import {OrchestrationStore} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/store.ts'
const root=mkdtempSync(join(tmpdir(),'dawn-d2-spec-error-'))
try{
 const store=new OrchestrationStore(root,'owner'),child=store.register('subagent',['call','0'],'reader'),epoch=store.beginRun(child.id)
 const entry=(usage:Record<string,number>,stopReason='stop')=>({type:'message',message:{role:'assistant',stopReason,usage}})
 const usage=sessionUsage([entry({input:10,output:2,cacheRead:1}),entry({input:0,output:0,cacheRead:0},'error')],true)
 store.settleRun(child.id,epoch,{ok:false,output:'',error:'second request failed without usage receipt',observation:{elapsedMs:1,submissionAttempts:0,invalidSubmissions:0,usage}},false)
 const totals=store.get(child.id)!.usageTotals!
 console.log(JSON.stringify({usage,totals,budget:store.budget()},null,2))
 assert.equal(totals.unknownEpochs,1,'SDK error receipt absence must mark the admitted epoch unknown while preserving prior known lower bounds')
 assert.deepEqual(totals.partial,['input','output','cacheRead'])
}finally{rmSync(root,{recursive:true,force:true})}
