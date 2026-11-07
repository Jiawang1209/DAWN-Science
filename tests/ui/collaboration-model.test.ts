import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {liveRunOverview} from '../../src/orchestration/run-overview.js'
import {expect,it} from 'vitest'
import {usageLabel} from '../../src/ui/collaboration-network.js'
import {acceptance,collaborationCounts,runStatus,settledDuration,type Run} from '../../src/ui/collaboration-model.js'
const run:Run={id:'a',kind:'subagent',label:'reader',address:['call','0'],state:'completed',phase:'drained',epoch:2,updatedAt:1,contract:true,inputVersions:1,outputVersions:0}
it('uses the same token accounting as the host budget, including cache reads',()=>{
 expect(usageLabel({...run,observation:{elapsedMs:1,submissionAttempts:1,invalidSubmissions:0,usage:{input:10,output:20,cacheRead:1000}}})).toBe('累计 1,030 tokens')
 expect(usageLabel({...run,observation:{elapsedMs:1,submissionAttempts:1,invalidSubmissions:0,usage:{input:10,output:20}}})).toBe('累计 30 tokens（部分）')
 expect(usageLabel({...run,observation:{elapsedMs:1,submissionAttempts:1,invalidSubmissions:0,usage:{cacheRead:1000}}})).toBe('累计 1,000 tokens（部分）')
 expect(usageLabel(run)).toBe('用量未记录')
})
it('does not infer acceptance from completion or live execution from disk state',()=>{
 expect(collaborationCounts({ownerSessionId:'p',source:'disk',runs:[{...run,phase:'running',receipt:'blocked'}]})).toEqual({total:1,accepted:0,active:0})
 expect(runStatus({...run,state:'cancelled',phase:'stopping'},true)).toBe('停止中，等待进程排空')
 expect(runStatus({...run,state:'cancelled',phase:'drained'},true)).toBe('已取消并排空')
 expect(runStatus({...run,state:'running',phase:'running'},false)).toContain('历史快照')
 expect(settledDuration(run)).toBe('耗时未知')
})

it('does not reuse an earlier receipt or usage as the result of a new or queued-cancelled execution',()=>{
 for(const state of ['queued','running','cancelled','interrupted'] as const){
  const stale={...run,state,phase:state==='queued'?'queued' as const:state==='running'?'running' as const:'drained' as const,receipt:'accepted' as const,observation:{elapsedMs:1,submissionAttempts:1,invalidSubmissions:0,usage:{input:10,output:20,cacheRead:1000}}}
  expect(collaborationCounts({ownerSessionId:'p',source:'live',runs:[stale]}).accepted).toBe(0)
  expect(acceptance(stale)).not.toBe('宿主验收通过')
  expect(usageLabel(stale)).not.toContain('1,030')
 }
})

it('keeps durable prior results but does not count them while a real coordinator reruns the same child',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-collaboration-receipt-')),store=new OrchestrationStore(root,'p'),service=new OrchestrationService(store,1)
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r})
 try{
  const child=service.register('subagent',['call','0'],'reader')
  await service.run(child.id,async()=>({ok:true,output:'original',receipt:{version:1,state:'accepted',summary:'old result',deliverables:[],versions:{version:1,inputs:[],outputs:[{path:'result.csv',sha256:'a'.repeat(64),bytes:1}]}},observation:{elapsedMs:10,submissionAttempts:1,invalidSubmissions:0,usage:{input:10,output:20,cacheRead:1000}}}))
  expect(collaborationCounts(liveRunOverview(service)).accepted).toBe(1)
  const rerun=service.run(child.id,async()=>{await gate;return{ok:true,output:'next'}})
  const during=liveRunOverview(service)
  expect(store.get(child.id)?.result?.receipt?.state).toBe('accepted')
  expect(during.runs[0]?.epoch).toBe(2)
  expect(collaborationCounts(during).accepted).toBe(0)
  expect(acceptance(during.runs[0]!)).toBe('暂无宿主验收回执')
  expect(usageLabel(during.runs[0]!)).not.toContain('1,030')
  release();await rerun
 }finally{release();await service.close();rmSync(root,{recursive:true,force:true})}
})
