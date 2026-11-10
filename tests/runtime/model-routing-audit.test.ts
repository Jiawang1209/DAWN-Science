import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import {sharedTaskOutputLocks,outputLockScope} from '../../src/bot/output-locks.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
async function fixture(){
 const root=mkdtempSync(join(tmpdir(),'dawn-route-audit-'));roots.push(root)
 const initial={provider:'audit-kimi',model:'kimi-fixture'},selected={provider:'audit-deepseek',model:'deepseek-fixture'},modelsPath=join(root,'models.json'),entry=join(root,'child.cjs'),captured=join(root,'child-routes.jsonl')
 writeFileSync(modelsPath,JSON.stringify({providers:Object.fromEntries([initial,selected].map(r=>[r.provider,{baseUrl:'http://127.0.0.1:9/v1',api:'openai-completions',apiKey:'fixture-only',models:[{id:r.model,name:r.model,input:['text'],reasoning:false,contextWindow:8192,maxTokens:512,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}]))}))
 mkdirSync(join(root,'.dawn/agents'),{recursive:true});writeFileSync(join(root,'.dawn/agents/router.md'),'---\nname: router\ndescription: route fixture\ntools: read\n---\nReturn the route only.')
 writeFileSync(entry,`require('node:readline').createInterface({input:process.stdin}).once('line',line=>{const s=JSON.parse(line);require('node:fs').appendFileSync(${JSON.stringify(captured)},JSON.stringify({provider:s.provider,model:s.model})+'\\n');process.stdout.write(JSON.stringify({type:'done',ok:true,output:'route captured'})+'\\n',()=>process.exit(0))})`)
 const rt=new NativeRuntime({modelsPath,subagentChildEntry:entry,subagents:{自带目录:join(root,'empty')},credentials:{read:async id=>[initial.provider,selected.provider].includes(id)?{type:'api_key',key:'fixture-only'}:undefined,list:async()=>[initial,selected].map(r=>({providerId:r.provider,type:'api_key' as const})),modify:async()=>undefined,delete:async()=>{}}})
 const spec={sessionId:'owner',workspace:root,sessionDir:join(root,'session'),native:initial}
 await rt.start(spec)
 return{root,rt,spec,initial,selected,captured,tool:(name:string)=>(rt as any).sessions.get('owner').session.getToolDefinition(name)}
}
it.each([false,true])('keeps the explicitly selected provider across restart (history=%s)',async history=>{
 const{rt,spec,selected}=await fixture()
 try{
  await rt.setModel('owner',selected.provider,selected.model)
  const state=(rt as any).sessions.get('owner')
  if(history)state.sessionManager.appendMessage({role:'assistant',content:[{type:'text',text:'fixture response'}],api:'openai-completions',provider:selected.provider,model:selected.model,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()})
  await state.session.settingsManager?.flush?.()
  await rt.stop('owner');await rt.start({...spec,resume:true})
  expect(rt.currentModel('owner')).toEqual(selected)
 }finally{await rt.stop('owner')}
})
it('a new ordinary subagent inherits the current provider rather than startup configuration',async()=>{
 const{rt,selected,captured,tool}=await fixture()
 try{
  await rt.setModel('owner',selected.provider,selected.model)
  await tool('subagent').execute('new-child',{agent:'router',task:'capture current route'})
  expect(JSON.parse(readFileSync(captured,'utf8').trim())).toEqual(selected)
 }finally{await rt.stop('owner')}
})
it('an admitted subagent keeps its route while waiting for another writer and the parent switches again',async()=>{
 const{root,rt,selected,initial,captured,tool}=await fixture(),controller=new AbortController()
 let release=()=>{},pending:Promise<unknown>|undefined
 try{
  writeFileSync(join(root,'input.csv'),'x\n1\n');await rt.setModel('owner',selected.provider,selected.model)
  release=await sharedTaskOutputLocks.acquire(outputLockScope(root),undefined,controller.signal)
  pending=tool('subagent').execute('queued-child',{agent:'router',task:'capture admitted route',contract:{inputs:['input.csv'],outputs:[],access:'read-only',resultType:'data-summary'}},controller.signal)
  await vi.waitFor(()=>expect(rt.runOverview('owner')?.runs.some((r:any)=>r.activity?.stage==='lock-wait')).toBe(true))
  expect(existsSync(captured)).toBe(false);await rt.setModel('owner',initial.provider,initial.model);release();release=()=>{};await pending
  expect(JSON.parse(readFileSync(captured,'utf8').trim())).toEqual(selected)
 }finally{controller.abort();release();await pending;await rt.stop('owner')}
})
it('model selection stays local to its session and survives a fresh runtime instance',async()=>{
 const{root,rt,spec,initial,selected}=await fixture()
 const other={...spec,sessionId:'other',sessionDir:join(root,'other')}
 try{
  await rt.start(other);await rt.setModel('owner',selected.provider,selected.model)
  expect(rt.currentModel('other')).toEqual(initial)
  await rt.stop('owner');await rt.start({...spec,resume:true})
  expect(rt.currentModel('owner')).toEqual(selected)
  expect(rt.currentModel('other')).toEqual(initial)
 }finally{await rt.stop('owner');await rt.stop('other')}
})
it.each([undefined,{provider:'audit-kimi',model:'kimi-fixture'}])('new team work uses the selected route while explicit member models stay pinned (%j)',async pinned=>{
 const{rt,selected,captured,tool}=await fixture()
 try{
  await rt.setModel('owner',selected.provider,selected.model)
  const created=await tool('team_create').execute('team',{name:'route-team',goal:'capture route',members:[{name:'worker',agent:'router',...(pinned?{model:`${pinned.provider}/${pinned.model}`}:{})}],tasks:[{subject:'capture route',assignee:'worker'}]})
  expect(created.isError,created.content[0]?.text).not.toBe(true)
  await vi.waitFor(()=>expect(existsSync(captured)).toBe(true))
  expect(JSON.parse(readFileSync(captured,'utf8').trim())).toEqual(pinned??selected)
 }finally{await rt.stop('owner')}
})
it('real ordinary team progress resets repeated waits, while timestamp-only updates cannot bypass the loop guard',async()=>{
 const{rt,tool}=await fixture()
 try{
  const result=await tool('team_create').execute('progress',{name:'progress',goal:'finish two real tasks',members:[],tasks:[{id:'t1',subject:'first',assignee:'captain'},{id:'t2',subject:'second',assignee:'captain'}]})
  expect(result.isError,result.content[0]?.text).not.toBe(true)
  const internal=rt as any,team=internal.botTeams.get('owner'),guard=internal.sessions.get('owner').stuck,calls=[{name:'team_wait',input:{timeoutSec:10}}]
  for(let i=0;i<4;i++)expect(guard.check(calls)).toBeUndefined()
  team.scheduler.改(team.current.id,(value:any)=>{value.tasks[0].status='completed'})
  expect(guard.check(calls)).toBeUndefined()
  for(let i=0;i<3;i++)expect(guard.check(calls)).toBeUndefined()
  team.scheduler.改(team.current.id,(value:any)=>{value.updatedAt=Date.now()+1})
  expect(guard.check(calls)).toMatch(/重复调用/)
 }finally{await rt.stop('owner')}
})
it.each(['replace','abort'])('a late model lookup cannot update a cancelled owner or its saved route (%s)',async mode=>{
 const{rt,spec,initial,selected}=await fixture(),internal=rt as any
 const model=await internal.resolveModel(selected.provider,selected.model)
 let finish!:(value:unknown)=>void
 const spy=vi.spyOn(internal,'resolveModel').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const changing=rt.setModel('owner',selected.provider,selected.model).then(()=>undefined,error=>error)
 try{
  if(mode==='replace'){await rt.stop('owner');await rt.start({...spec,resume:true})}
  else await rt.abort('owner')
  finish(model)
  expect(await changing).toBeInstanceOf(Error)
  expect(rt.currentModel('owner')).toEqual(initial)
  await rt.stop('owner');await rt.start({...spec,resume:true})
  expect(rt.currentModel('owner')).toEqual(initial)
 }finally{spy.mockRestore();finish?.(model);await changing;await rt.stop('owner')}
})
