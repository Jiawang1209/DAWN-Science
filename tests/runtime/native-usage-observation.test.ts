import {it,expect} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {建团队,加成员,写团队} from '../../src/team/state.js'
it('local ordinary Bot usage is one scoped delta across reused sessions and teams without task permissions or schema changes',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-p14-d2-native-')),runtime=new NativeRuntime({}),store=new OrchestrationStore(join(root,'parent'),'owner'),service=new OrchestrationService(store)
 try{
  await runtime.start({sessionId:'bot',workspace:root,sessionDir:join(root,'bot'),native:{provider:'deepseek',model:'deepseek-flash'}})
  const session=(runtime as unknown as {sessions:Map<string,{session:import('@earendil-works/pi-coding-agent').AgentSession}>}).sessions.get('bot')!.session
  const tools=session.agent.state.tools,schemas=tools.map(tool=>tool.parameters),scopes=(runtime as unknown as {taskScopes:Map<string,unknown>}).taskScopes
  const append=(input:number)=>{const model=session.model!;session.sessionManager.appendMessage({role:'assistant',provider:model.provider,model:model.id,api:model.api,stopReason:'stop',timestamp:Date.now(),content:[{type:'text',text:'done'}],usage:{input,output:2,cacheRead:1,cacheWrite:0,totalTokens:input+3,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}})}
  append(1000)
  const a=service.register('bot',['team-a','bot','g1'],'bot'),b=service.register('bot',['team-b','bot','g1'],'bot')
  for(const [child,input] of [[a,5],[a,7],[b,11]] as const){
   const result=await service.run(child.id,()=>runtime.runWithUsageObservation('bot',async()=>{expect(scopes.size).toBe(0);append(input);return{ok:true,output:'done'}}))
   expect(result.observation?.usage).toEqual({input,output:2,cacheRead:1})
  }
  expect(store.get(a.id)?.usageTotals).toMatchObject({input:12,output:4,cacheRead:2,settledEpochs:2,unknownEpochs:0})
  expect(store.get(b.id)?.usageTotals).toMatchObject({input:11,output:2,cacheRead:1,settledEpochs:1,unknownEpochs:0})
  expect(runtime.sessionUsage('bot').input).toBe(1023)
  expect(service.budgetSnapshot()).toMatchObject({knownTokens:32,consumedRuns:3,unknownRuns:0})
  expect(session.agent.state.tools).toBe(tools);for(const [i,tool] of tools.entries())expect(tool.parameters).toBe(schemas[i])
  expect(scopes.size).toBe(0)
  const empty=await runtime.runWithUsageObservation('bot',async()=>({ok:false,output:''}));expect(empty.observation.usage).toBeUndefined()
  const failure=new Error('same failure');await expect(runtime.runWithUsageObservation('bot',async()=>{throw failure})).rejects.toBe(failure)
 }finally{await service.close();await runtime.stop('bot');rmSync(root,{recursive:true,force:true})}
})
it('restored team history outside the orchestration ledger is explicitly legacy, never fresh zero-history coverage',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-p14-d2-native-restore-')),runtime=new NativeRuntime({subagentChildEntry:'/unused/child.js'}),sessionDir=join(root,'parent')
 const team=建团队({id:'old-team',name:'old team',goal:'read',captainSessionId:'owner'}),member=加成员(team,{name:'reader',agent:'scout'});member.turns=2
 写团队(join(sessionDir,'teams',team.id),team);writeFileSync(join(sessionDir,'teams','current'),team.id)
 try{
  await runtime.start({sessionId:'owner',workspace:root,sessionDir,resume:true,native:{provider:'deepseek',model:'deepseek-flash'}})
  const service=(runtime as unknown as {orchestrations:Map<string,OrchestrationService>}).orchestrations.get('owner')!,child=service.store.list().find(child=>child.kind==='team')!
  expect(child.usageTotals).toEqual({source:'host-epoch-deltas',legacyHistory:true,partial:['input','output','cacheRead'],settledEpochs:0,unknownEpochs:0})
  expect(service.budgetSnapshot().consumedRuns).toBe(0)
 }finally{await runtime.stop('owner');rmSync(root,{recursive:true,force:true})}
})
