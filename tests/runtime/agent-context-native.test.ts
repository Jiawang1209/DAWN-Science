import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {liveRunOverview} from '../../src/orchestration/run-overview.js'
const gate=()=>{let release!:()=>void;const promise=new Promise<void>(r=>release=r);return{promise,release}}
it('managed Native captures ordinary task ALS at send time; callbacks survive outside that scope and match main API producer',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dawn-p14-d1-native-')),runtime=new NativeRuntime({}),service=new OrchestrationService(new OrchestrationStore(join(dir,'parent'),'owner'))
 const child=service.register('bot',['t','bot','1'],'bot'),produce=gate(),finish=gate(),started=gate()
 try{
  await runtime.start({sessionId:'member',workspace:dir,sessionDir:join(dir,'member'),native:{provider:'deepseek',model:'deepseek-flash'}})
  const session=(runtime as unknown as {sessions:Map<string,{session:import('@earendil-works/pi-coding-agent').AgentSession}>}).sessions.get('member')!.session
  const actual=session.model!
  session.prompt=async()=>{
   started.release();await produce.promise
   const message={role:'assistant',provider:actual.provider,model:actual.id,api:actual.api,stopReason:'stop',timestamp:Date.now(),content:[{type:'text',text:'visible reply'},{type:'thinking',thinking:'PRIVATE REASONING'}],usage:{input:22,output:8,cacheRead:0,cacheWrite:0,totalTokens:30,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}
   session.agent.state.messages=[message] as never
   session.sessionManager.appendMessage(message as never)
   ;(session as unknown as {_emit(event:unknown):void})._emit({type:'message_end',message})
   await finish.promise
  }
  const run=service.run(child.id,async()=>{runtime.write('member','hello');await runtime.waitForIdle('member');return{ok:true,output:'done'}})
  await started.promise
  expect(service.contextObservation(child.id)).toMatchObject({current:true,sample:{sample:{availability:'unknown',reason:'no-current-route-anchor'}}})
  // Deliberately produce the event from this test's outer scope, not the service's ALS work callback.
  produce.release();await new Promise<void>(resolve=>setTimeout(resolve,5))
  const bound=service.contextObservation(child.id).sample!,main=runtime.contextUsage('member')!
  expect(bound.sample).toMatchObject({availability:'available',source:'sdk-estimate',provider:actual.provider,model:actual.id,usedTokens:main.usedTokens,contextWindow:main.contextWindow})
  expect(bound.sample.composition).toMatchObject({systemBytes:main.bytes.system,toolBytes:main.bytes.tools,messageBytes:main.bytes.history});expect(JSON.stringify(liveRunOverview(service))).not.toContain('PRIVATE REASONING')
  finish.release();await run;expect(service.contextObservation(child.id).current).toBe(false)
 }finally{produce.release();finish.release();await service.close();await runtime.stop('member');rmSync(dir,{recursive:true,force:true})}
})
