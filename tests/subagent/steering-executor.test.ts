import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {SubagentExecutor} from '../../src/subagent/executor.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
const roots:string[]=[];afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
async function until(test:()=>boolean){const end=Date.now()+3000;while(!test()){if(Date.now()>end)throw Error('child ready timeout');await new Promise<void>(r=>setTimeout(r,5))}}
it.each(['persistence','oversized'] as const)('guards %s failure in actual child stdout acknowledgement callbacks and drains the child',async mode=>{
 const root=mkdtempSync(join(tmpdir(),'steer-ack-'));roots.push(root);const store=new OrchestrationStore(root,'parent'),service=new OrchestrationService(store),child=service.register('subagent',['call','0'],'reader')
 const script=`const rl=require('readline').createInterface({input:process.stdin});let spec;rl.on('line',line=>{const input=JSON.parse(line);if(!spec){spec=input;console.log(JSON.stringify({type:'steer_ready',...spec.steering}));return;}console.log(JSON.stringify({type:${JSON.stringify(mode==='persistence'?'steer_applied':'steer_failed')},...spec.steering,id:input.id${mode==='oversized'?`,error:'x'.repeat(3000)`:''}}));setTimeout(()=>{console.log(JSON.stringify({type:'done',ok:true,output:'must not succeed'}));process.exit(0)},100)})`
 const executor=new SubagentExecutor({orchestration:{service,addressOf:()=>['call','0']},context:{cwd:root,provider:'offline',model:'offline',agentDirOf:()=>join(root,'run')},childOf:()=>({command:process.execPath,args:['-e',script],supportsSteering:true})})
 const run=executor.run({mode:'single',agent:'reader',task:'run'},[{name:'reader',description:'reader',systemPrompt:'reader',filePath:'/reader'}])
 await until(()=>service.canSteer(child.id));const spy=mode==='persistence'?vi.spyOn(store,'settleSteering').mockImplementation(()=>{throw Error('disk unavailable')}):undefined
 await service.steer(child.id,'correct','correct',1);const result=(await run).results[0]!
 expect(result.ok).toBe(false);expect(result.error).toMatch(/纠偏回执/);expect(service.canSteer(child.id)).toBe(false)
 spy?.mockRestore();if(mode==='persistence')await expect(service.close()).rejects.toThrow(/persistence/);else await service.close()
})
it('ignores non-string stdout message types without throwing outside the executor',async()=>{
 const root=mkdtempSync(join(tmpdir(),'steer-noise-'));roots.push(root);const service=new OrchestrationService(new OrchestrationStore(root,'p'))
 const script=`require('readline').createInterface({input:process.stdin}).once('line',line=>{for(const type of [123,{},[]])console.log(JSON.stringify({type}));console.log(JSON.stringify({type:'done',ok:true,output:'valid result'}));setTimeout(()=>process.exit(0),10)})`
 const executor=new SubagentExecutor({orchestration:{service,addressOf:()=>['call','0']},context:{cwd:root,provider:'offline',model:'offline',agentDirOf:()=>join(root,'run')},childOf:()=>({command:process.execPath,args:['-e',script],supportsSteering:true})})
 try{expect((await executor.run({mode:'single',agent:'reader',task:'run'},[{name:'reader',description:'reader',systemPrompt:'reader',filePath:'/reader'}])).results[0]).toMatchObject({ok:true,output:'valid result'})}finally{await service.close()}
})
