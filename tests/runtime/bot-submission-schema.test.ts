import {expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {AgentSession} from '@earendil-works/pi-coding-agent'
import type {CredentialStore} from '@earendil-works/pi-ai'
import {validateToolArguments} from '@earendil-works/pi-ai/utils/validation'
import {NativeRuntime} from '../../src/runtime/native.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
// @ts-expect-error shared deterministic localhost inference
import {startMockInferenceServer,mockModelsJson} from '../../scripts/mock-inference-server.mjs'
const credentials:CredentialStore={read:async()=>({type:'api_key',key:'offline-only'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}}
const spec=(root:string)=>({sessionId:'bot',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'},bot:{instructions:'scope schema fixture',member:true}})
const sessionOf=(runtime:NativeRuntime)=>(runtime as unknown as{sessions:Map<string,{session:AgentSession}>}).sessions.get('bot')!.session
const review=(paths:string[])=>({summary:'review',blockers:[],deliverables:[],execution:{state:'not_run',note:'no execution'},verification:{state:'unreviewed',note:'schema check only'},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:paths}})
it('updates both actual Bot declarations and cached SDK validation for successive frozen scopes',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-bot-schema-')),server=await startMockInferenceServer({reply:'schema fixture'})
 const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const runtime=new NativeRuntime({credentials,modelsPath})
 try{
  await runtime.start(spec(root));const session=sessionOf(runtime)
  const original=session.getToolDefinition('submit_task_result')!.parameters
  const active=()=>session.agent.state.tools.find(t=>t.name==='submit_task_result')!
  const originalActive=active().parameters
  for(const paths of [['a.csv'],['b.csv','c.csv']]){
   for(const p of paths)writeFileSync(join(root,p),'x\n1\n')
   await runtime.runWithTaskScope('bot',resolveTaskSettings(TaskContractSchema.parse({resultType:'review',inputs:paths}),'allow-all'),async()=>{
    const parameters=active().parameters as any
    expect(parameters.properties.data.properties?.kind?.const).toBe('review')
    expect(parameters.properties.data.properties.reviewedPaths.items.enum).toEqual(paths)
    expect(session.getToolDefinition('submit_task_result')!.parameters).toBe(parameters)
    session.setActiveToolsByName(session.getActiveToolNames())
    expect(active().parameters).toBe(parameters)
    const validate=(files:string[])=>validateToolArguments(active(),{type:'toolCall',id:'test',name:'submit_task_result',arguments:review(files)})
    expect(()=>validate(paths)).not.toThrow();expect(()=>validate(['old.csv'])).toThrow()
    await session.prompt('observe current scoped schema')
    const declaration=server.requests.at(-1).body.tools.find((t:any)=>t.function?.name==='submit_task_result').function.parameters
    expect(declaration.properties.data.properties.reviewedPaths.items.enum).toEqual(paths)
    return{ok:true,output:'schema observed'}
   })
   expect(session.getToolDefinition('submit_task_result')!.parameters).toBe(original)
   expect(active().parameters).toBe(originalActive)
   session.setActiveToolsByName(session.getActiveToolNames())
   expect(active().parameters).toBe(originalActive)
  }
 }finally{await runtime.stop('bot');await server.close();rmSync(root,{recursive:true,force:true})}
},15000)
it('restores generic Bot schemas after failed work and does not persist a previous task on reopen',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-bot-schema-reopen-'));writeFileSync(join(root,'a.csv'),'x\n1\n')
 let runtime=new NativeRuntime({credentials})
 try{
  await runtime.start(spec(root));let session=sessionOf(runtime)
  const original=session.getToolDefinition('submit_task_result')!.parameters
  const originalActive=session.agent.state.tools.find(t=>t.name==='submit_task_result')!.parameters
  const settings=resolveTaskSettings(TaskContractSchema.parse({resultType:'review',inputs:['a.csv']}),'allow-all')
  await expect(runtime.runWithTaskScope('bot',settings,async()=>{throw new DOMException('cancelled','AbortError')})).rejects.toThrow('cancelled')
  expect(session.getToolDefinition('submit_task_result')!.parameters).toBe(original)
  expect(session.agent.state.tools.find(t=>t.name==='submit_task_result')!.parameters).toBe(originalActive)
  await runtime.runWithTaskScope('bot',settings,async()=>({ok:false,output:'cancelled'}))
  expect(session.getToolDefinition('submit_task_result')!.parameters).toBe(original)
  await runtime.stop('bot');runtime=new NativeRuntime({credentials});await runtime.start(spec(root));session=sessionOf(runtime)
  expect(session.getToolDefinition('submit_task_result')!.parameters).toEqual(original)
  await runtime.runWithTaskScope('bot',resolveTaskSettings(TaskContractSchema.parse({resultType:'data-summary',inputs:['a.csv']}),'allow-all'),async()=>{
   expect((session.agent.state.tools.find(t=>t.name==='submit_task_result')!.parameters as any).properties.data.properties?.kind?.const).toBe('data-summary')
   return{ok:false,output:'no scientific result'}
  })
 }finally{await runtime.stop('bot');rmSync(root,{recursive:true,force:true})}
},15000)
