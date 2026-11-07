import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {createSubagentOrchestration} from '../../src/subagent/orchestration.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
import {TaskContractSchema} from '../../src/orchestration/task-contract.js'
import {prepareSubagentTask} from '../../src/subagent/tool.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
it('rebuilds the new index from legacy run metadata without dropping the frozen task scope',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-task-restore-'));roots.push(root)
 const run=(call:string,index:number)=>join(root,'subagents',call,String(index))
 const settings=resolveTaskSettings(TaskContractSchema.parse({}),'deny-risky',['read'])
 mkdirSync(run('call',0),{recursive:true})
 writeFileSync(join(run('call',0),'meta.json'),JSON.stringify({agent:'a',task:'check',status:'ok',startedAt:1,result:{text:'existing'},settings}))
 const service=new OrchestrationService(new OrchestrationStore(root,'p'))
 const control=createSubagentOrchestration({sessionId:'p',projectRoot:root,运行目录:run,emit:()=>{},childOf:()=>({command:'unused',args:[]}),context:{cwd:root,provider:'p',model:'m',agentDirOf:i=>run('_',i)}},service,()=>{},()=>{})
 expect(service.store.list()[0]?.settings).toEqual(settings)
 expect(service.store.list()[0]?.usageTotals).toMatchObject({legacyHistory:true,settledEpochs:0,unknownEpochs:0,partial:['input','output','cacheRead']})
 expect(prepareSubagentTask({taskStore:service.store,taskPolicy:()=> 'allow-all',sessionId:'p',projectRoot:root,运行目录:run,emit:()=>{},childOf:()=>({command:'unused',args:[]}),context:{cwd:root,provider:'p',model:'m',agentDirOf:i=>run('_',i)}},'call',0,{agent:'a'},['*'])).toEqual(settings)
 await control.mailbox.close()
})

it.each([
 {state:'accepted',partial:false},{state:'blocked',partial:false},
 {state:'accepted',partial:true},{state:'blocked',partial:true},
] as const)('restores a terminal $state receipt with partial index=$partial',async({state,partial})=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-task-receipt-restore-'));roots.push(root)
 const run=(call:string,index:number)=>join(root,'subagents',call,String(index))
 const receipt={version:1,state,summary:'host acceptance',deliverables:[]}
 mkdirSync(run('call',0),{recursive:true})
 writeFileSync(join(run('call',0),'meta.json'),JSON.stringify({agent:'a',task:'check',status:state==='accepted'?'ok':'error',startedAt:1,
  ...(state==='accepted'?{result:{text:'existing'}}:{error:'input missing'}),receipt}))
 const service=new OrchestrationService(new OrchestrationStore(root,'p'))
 if(partial)service.register('subagent',['call','0'],'a')
 const control=createSubagentOrchestration({sessionId:'p',projectRoot:root,运行目录:run,emit:()=>{},childOf:()=>({command:'unused',args:[]}),context:{cwd:root,provider:'p',model:'m',agentDirOf:i=>run('_',i)}},service,()=>{},()=>{})
 try{
  expect(service.store.list()[0]?.result).toMatchObject({ok:state==='accepted',receipt,...(state==='blocked'?{error:'input missing'}:{})})
  expect(new OrchestrationStore(root,'p').list()[0]?.result?.receipt).toEqual(receipt)
 }finally{await control.mailbox.close()}
})

it('rejects a malformed persisted receipt on every reopen instead of inferring acceptance',()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-task-bad-receipt-'));roots.push(root)
 const run=(call:string,index:number)=>join(root,'subagents',call,String(index))
 mkdirSync(run('call',0),{recursive:true})
 writeFileSync(join(run('call',0),'meta.json'),JSON.stringify({agent:'a',task:'check',status:'ok',startedAt:1,result:{text:'existing'},receipt:{version:1,state:'accepted'}}))
 for(let attempt=0;attempt<2;attempt++){
  const service=new OrchestrationService(new OrchestrationStore(root,'p'))
  expect(()=>createSubagentOrchestration({sessionId:'p',projectRoot:root,运行目录:run,emit:()=>{},childOf:()=>({command:'unused',args:[]}),context:{cwd:root,provider:'p',model:'m',agentDirOf:i=>run('_',i)}},service,()=>{},()=>{})).toThrow()
  expect(service.store.list()).toEqual([])
 }
})

it('keeps a newer indexed result instead of replacing it with the original run metadata',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-task-newer-index-'));roots.push(root)
 const run=(call:string,index:number)=>join(root,'subagents',call,String(index))
 mkdirSync(run('call',0),{recursive:true})
 writeFileSync(join(run('call',0),'meta.json'),JSON.stringify({agent:'a',task:'check',status:'ok',startedAt:1,result:{text:'original'},receipt:{version:1,state:'accepted',summary:'original acceptance',deliverables:[]}}))
 const service=new OrchestrationService(new OrchestrationStore(root,'p')),child=service.register('subagent',['call','0'],'a')
 const newer={ok:false,output:'',error:'new followup blocked',receipt:{version:1 as const,state:'blocked' as const,summary:'newer',deliverables:[]}}
 service.store.update(child.id,{state:'failed',epoch:2,result:newer})
 const control=createSubagentOrchestration({sessionId:'p',projectRoot:root,运行目录:run,emit:()=>{},childOf:()=>({command:'unused',args:[]}),context:{cwd:root,provider:'p',model:'m',agentDirOf:i=>run('_',i)}},service,()=>{},()=>{})
 try{expect(service.store.get(child.id)?.result).toEqual(newer)}finally{await control.mailbox.close()}
})
