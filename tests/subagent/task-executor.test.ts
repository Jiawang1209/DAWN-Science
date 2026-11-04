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
