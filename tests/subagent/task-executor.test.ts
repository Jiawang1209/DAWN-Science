import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {SubagentExecutor} from '../../src/subagent/executor.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
import {TaskContractSchema} from '../../src/orchestration/task-contract.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
const output={summary:'file checked',blockers:[],deliverables:[{path:'out.txt'}],execution:{state:'not_run',note:'no code run'},verification:{state:'unreviewed',note:'no scientific review'}}
const definitions=[{name:'a',description:'a',systemPrompt:'a',filePath:'/a'}]
it('the parent refuses a tool-mode child that reports plain JSON without a host submission marker',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-missing-submit-'));roots.push(cwd)
 const contract=TaskContractSchema.parse({submission:'tool'}),answer={...output,deliverables:[]}
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run')},prepareTask:()=>resolveTaskSettings(contract,'allow-all'),childOf:()=>({command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'done',ok:true,output:${JSON.stringify(JSON.stringify(answer))}})))`]})})
 expect((await executor.run({mode:'single',agent:'a',task:'check'},definitions)).results[0]).toMatchObject({ok:false,error:expect.stringContaining('提交')})
})
it('accepts a real-file receipt and persists structured meaning rather than only a text result',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-task-executor-'));roots.push(cwd);writeFileSync(join(cwd,'out.txt'),'result')
 const contract=TaskContractSchema.parse({access:'workspace-write',outputs:['out.txt']})
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run')},
 prepareTask:()=>resolveTaskSettings(contract,'allow-all'),
 childOf:()=>({command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'done',ok:true,output:${JSON.stringify(JSON.stringify(output))}})))`]})})
 const result=(await executor.run({mode:'single',agent:'a',task:'write'},definitions)).results[0]!
 expect(result.ok).toBe(true);expect(result.receipt?.state).toBe('accepted');expect(result.receipt?.deliverables[0]?.state).toBe('exists')
})
it('an invalid structured result fails a chain without running its downstream task',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-task-chain-'));roots.push(cwd);let spawns=0
 const contract=TaskContractSchema.parse({})
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:i=>join(cwd,String(i))},prepareTask:()=>resolveTaskSettings(contract,'allow-all'),
 childOf:()=>{spawns++;return{command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'done',ok:true,output:'not JSON'})))`]}}})
 const result=await executor.run({mode:'chain',chain:[{agent:'a',task:'first'},{agent:'a',task:'second'}]},definitions)
 expect(result.results[0]?.receipt?.state).toBe('invalid');expect(result.results[0]?.ok).toBe(false);expect(spawns).toBe(1)
})

it('declared missing inputs block a task before any subprocess is started',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-task-input-'));roots.push(cwd);let spawns=0
 const contract=TaskContractSchema.parse({inputs:['missing.csv']})
 const output={summary:'done',blockers:[],deliverables:[],execution:{state:'not_run',note:'no computation'},verification:{state:'unreviewed',note:'not reviewed'}}
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run')},prepareTask:()=>resolveTaskSettings(contract,'allow-all'),
 childOf:()=>{spawns++;return{command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'done',ok:true,output:${JSON.stringify(JSON.stringify(output))}})))`]}}})
 const result=(await executor.run({mode:'single',agent:'a',task:'read'},definitions)).results[0]!
 expect(result.ok).toBe(false);expect(result.receipt?.state).toBe('blocked');expect(spawns).toBe(0)
})
it.each(['missing','changed','matching'] as const)('verifies sealed content proof in the parent for %s submission',async mode=>{
 const {captureFileVersions}=await import('../../src/artifacts/task-versions.js')
 const cwd=mkdtempSync(join(tmpdir(),'dawn-parent-version-'));roots.push(cwd);writeFileSync(join(cwd,'in.csv'),'x\n1');writeFileSync(join(cwd,'out.txt'),'before')
 const contract=TaskContractSchema.parse({submission:'tool',access:'workspace-write',inputs:['in.csv'],outputs:['out.txt']}),inputs=await captureFileVersions(cwd,contract.inputs),outputs=await captureFileVersions(cwd,contract.outputs)
 const done={type:'done',ok:true,submitted:true,output:JSON.stringify(output),...(mode==='missing'?{}:{versions:{version:1,inputs,outputs}})}
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run')},prepareTask:()=>({...resolveTaskSettings(contract,'allow-all'),versions:{version:1,inputs}}),childOf:()=>({command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>{${mode==='changed'?`require('fs').writeFileSync(${JSON.stringify(join(cwd,'out.txt'))},'change')`:''};console.log(JSON.stringify(${JSON.stringify(done)}))})`]})})
 const result=(await executor.run({mode:'single',agent:'a',task:'produce'},definitions)).results[0]!
 expect(result.ok).toBe(mode==='matching');expect(result.receipt?.state).toBe(mode==='matching'?'accepted':'blocked')
})
it('retains a child failure trace as diagnostics without accepting its output or receipt',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-failed-trace-'));roots.push(cwd)
 const trace={records:[{toolCallId:'real-read',name:'read',status:'done',execution:'not_observed',path:'in.csv'}],omitted:0}
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run')},childOf:()=>({command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify(${JSON.stringify({type:'done',ok:false,error:'quota',trace})})))`]})})
 const r=(await executor.run({mode:'single',agent:'a',task:'read'},definitions)).results[0]!
 expect(r).toMatchObject({ok:false,output:'',trace});expect(r.receipt).toBeUndefined()
})
it('keeps an already received failure trace while cancellation drains the owned process',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-stopped-trace-'));roots.push(cwd);const controller=new AbortController();let ready=false
 const trace={records:[{toolCallId:'read-before-stop',name:'read',status:'done',execution:'not_observed'}],omitted:0}
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run')},onProgress:event=>{if(event.type==='event'&&event.event.kind==='thinking')ready=true},childOf:()=>({command:process.execPath,args:['-e',`process.stdin.once('data',()=>{console.log(JSON.stringify(${JSON.stringify({type:'done',ok:false,error:'stopped',trace})}));console.log(JSON.stringify({type:'event',event:{kind:'thinking',delta:'ready'}}))});setInterval(()=>{},1000)`]})})
 const pending=executor.run({mode:'single',agent:'a',task:'read'},definitions,controller.signal)
 const deadline=Date.now()+3000;while(!ready&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5))
 expect(ready).toBe(true);controller.abort();const r=(await pending).results[0]!
 expect(r).toMatchObject({ok:false,output:'',trace});expect(r.receipt).toBeUndefined()
})
it('keeps diagnostic done buffered after abort while refusing a buffered late authorization RPC',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-buffered-trace-'));roots.push(cwd);const controller=new AbortController();let calls=0
 const trace={records:[{toolCallId:'buffered-read',name:'read',status:'done',execution:'not_observed'}],omitted:0}
 const lines=[{type:'event',event:{kind:'thinking',delta:'abort-now'}},{type:'call',id:'late',name:'task_authorize',params:{name:'write',params:{path:'late'}}},{type:'done',ok:false,error:'quota',trace}].map(v=>JSON.stringify(v)).join('\n')+'\n'
 const executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'run'),authorize:async()=>{calls++;return undefined}},onProgress:event=>{if(event.type==='event'&&event.event.kind==='thinking')controller.abort()},childOf:()=>({command:process.execPath,args:['-e',`process.stdin.once('data',()=>process.stdout.write(${JSON.stringify(lines)}));setInterval(()=>{},1000)`]})})
 const r=(await executor.run({mode:'single',agent:'a',task:'read'},definitions,controller.signal)).results[0]!
 expect(calls).toBe(0);expect(r).toMatchObject({ok:false,output:'',trace});expect(r.receipt).toBeUndefined()
})
