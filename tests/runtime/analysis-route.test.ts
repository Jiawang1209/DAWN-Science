import { 执行指令, 仅讨论 } from '../../src/policy/execution-boundary.js'
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeRuntime } from '../../src/runtime/native.js'
import { routeActionMessage, type AnalysisRouteDraft } from '../../src/protocol/analysis-route.js'
import type { SessionManager } from '@earendil-works/pi-coding-agent'
import type { AgentEvent, SessionSpec } from '../../src/runtime/types.js'
const draft = (): AnalysisRouteDraft => ({ title:'路线', goal:'核对数据', dataContext:[], steps:[{id:'S1',title:'检查',purpose:'说明数据',inputs:[],outputs:['报告'],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'未运行'},verification:{state:'unreviewed',note:'未审查'},needsReview:false,notes:[]}] })
type Result = { isError?:boolean; content:{text:string}[] }
type Pi = { getAllTools():{name:string}[]; getToolDefinition(name:string):{execute(...args:unknown[]):Promise<Result>} }
async function setup(bot = false, dir = mkdtempSync(join(tmpdir(),'dawn-route-')), resume=false) {
 const rt = new NativeRuntime({checkpoints:false,credentials:{read:async()=>({type:'api_key',key:'offline'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}}})
 const events:AgentEvent[]=[]; rt.attach('route', e=>events.push(e))
 const spec:SessionSpec={sessionId:'route',workspace:dir,sessionDir:join(dir,'.session'),native:{provider:'deepseek',model:'deepseek-flash'},resume,...(bot?{bot:{instructions:'bot',member:false}}:{})}
 await rt.start(spec)
 const state=(rt as unknown as {sessions:Map<string,{session:Pi;sessionManager:SessionManager;inFlight:number;回退中:boolean}>}).sessions.get('route')!
 const say=(text:string)=>state.sessionManager.appendMessage({role:'user',content:[{type:'text',text}],timestamp:Date.now()})
 const call=(name:string,args:Record<string,unknown>,id='call')=>state.session.getToolDefinition(name).execute(id,args,undefined,undefined,undefined)
 return {rt,dir,spec,state,say,call,events}
}
describe('native analysis route',()=>{
 it('registers metadata tools on ordinary native sessions; UI and tool use a single CAS book',async()=>{
  const x=await setup();try {
   expect(x.state.session.getAllTools().map(t=>t.name)).toEqual(expect.arrayContaining(['get_analysis_route','update_analysis_route']))
   const r=await x.call('update_analysis_route',{expectedRevision:0,route:draft()});expect(r.isError).toBeFalsy()
   const first=x.rt.getAnalysisRoute!('route',x.spec.sessionDir,true).route!
   expect(first.revision).toBe(1)
   const ui=x.rt.actOnAnalysisRoute!('route',{routeId:first.routeId,expectedRevision:1,stepId:'S1',action:'skip'})
   expect(ui.route?.revision).toBe(2)
   expect((await x.call('update_analysis_route',{expectedRevision:1,route:draft()})).isError).toBe(true)
   expect(x.events.filter(e=>e.kind==='analysis_route')).toHaveLength(2)
  }finally {await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })
 it('does not register route tools for bots',async()=>{const x=await setup(true);try {expect(x.state.session.getAllTools().map(t=>t.name)).not.toContain('update_analysis_route');expect(x.rt.getAnalysisRoute!('route',x.spec.sessionDir).supported).toBe(false)}finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}})
 it('view/search restrict only the latest actual user turn and preserve earlier discussion boundaries',async()=>{
  const x=await setup();try {
   await x.call('update_analysis_route',{expectedRevision:0,route:draft()})
   const route=x.rt.getAnalysisRoute!('route',x.spec.sessionDir).route!
   x.say('开始执行分析数据。');x.say(routeActionMessage(route,'S1','view'))
   expect((await x.call('bash',{command:'true'})).isError).toBe(true)
   expect((await x.call('write',{path:'denied.txt',content:'bad'})).isError).toBe(true)
   expect((await x.call('update_analysis_route',{expectedRevision:1,route:draft()})).isError).toBe(true)
   expect((await x.call('get_analysis_route',{})).isError).toBeFalsy()
   x.say(routeActionMessage(route,'S1','search'))
   expect((await x.call('update_analysis_route',{expectedRevision:1,route:draft()})).isError).toBeFalsy()
   expect((await x.call('write',{path:'denied.txt',content:'bad'})).isError).toBe(true)
   x.say('这个怎么理解？');expect((await x.call('write',{path:'allowed.txt',content:'ok'})).isError).toBeFalsy()
   x.say('先别执行，只讨论。');x.say(routeActionMessage(route,'S1','continue'))
   expect((await x.call('write',{path:'denied.txt',content:'bad'})).isError).toBe(true)
  }finally {await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })
 it('allows controlled route metadata in planning/discussion but does not grant scientific write permission',async()=>{
  const x=await setup();try{x.say('只讨论');await x.rt.setConfigOption('route','dawn.plan','1');expect((await x.call('update_analysis_route',{expectedRevision:0,route:draft()})).isError).toBeFalsy();expect((await x.call('write',{path:'denied',content:'bad'})).isError).toBe(true)}finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })
 it('rejects invented candidates, scientific execution and human selections without matching user request',async()=>{
  const x=await setup();try{
   const forged=draft();forged.steps[0]!.cases=[{server:'mlai',caseId:'full/id',title:'Fake',coverage:'x',evidence:'metadata'}]
   expect((await x.call('update_analysis_route',{expectedRevision:0,route:forged})).isError).toBe(true)
   const claimed=draft();claimed.steps[0]!.execution={state:'completed',note:'done',toolCallIds:['invented']}
   expect((await x.call('update_analysis_route',{expectedRevision:0,route:claimed})).isError).toBe(true)
  }finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })
 it('blocks stale identities, dependencies, busy writes, and interrupts live steps only on lifecycle boundaries',async()=>{
  const x=await setup();try{
   const d=draft();d.steps[0]!.status='in_progress';await x.call('update_analysis_route',{expectedRevision:0,route:d})
   const route=x.rt.getAnalysisRoute!('route',x.spec.sessionDir).route!;expect(route.steps[0]!.status).toBe('in_progress')
   expect(()=>x.rt.actOnAnalysisRoute!('route',{routeId:'stale',expectedRevision:1,stepId:'S1',action:'view'})).toThrow()
   expect(()=>x.rt.actOnAnalysisRoute!('route',{routeId:route.routeId,expectedRevision:1,stepId:'S1',action:'continue'})).toThrow()
   x.state.inFlight=1;expect(()=>x.rt.actOnAnalysisRoute!('route',{routeId:route.routeId,expectedRevision:1,stepId:'S1',action:'skip'})).toThrow();x.state.inFlight=0
   await x.rt.stop('route');expect(x.rt.getAnalysisRoute!('route',x.spec.sessionDir).route!.steps[0]!.status).toBe('blocked')
   const recovered=await setup(false,x.dir,true);try{expect(recovered.rt.getAnalysisRoute!('route',x.spec.sessionDir,true).history!.length).toBeGreaterThan(1)}finally{await recovered.rt.stop('route')}
  }finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })
 it('reports corrupt metadata without overwriting it or preventing ordinary chat tools',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'dawn-route-corrupt-'));mkdirSync(join(dir,'.session'));const file=join(dir,'.session','analysis-route.json');writeFileSync(file,'broken')
  const x=await setup(false,dir);try{expect(x.rt.getAnalysisRoute!('route',x.spec.sessionDir).error?.code).toBe('ROUTE_ERROR');expect((await x.call('write',{path:'ok.txt',content:'ok'})).isError).toBeFalsy();expect((await x.call('update_analysis_route',{expectedRevision:0,route:draft()})).isError).toBe(true);expect(readFileSync(file,'utf8')).toBe('broken')}finally{await x.rt.stop('route');rmSync(dir,{recursive:true,force:true})}
 })
 it('revalidates action messages at actual send time without marking execution in advance',async()=>{
  const x=await setup();try{
   await x.call('update_analysis_route',{expectedRevision:0,route:draft()})
   const route=x.rt.getAnalysisRoute('route',x.spec.sessionDir).route!
   const message=x.rt.actOnAnalysisRoute('route',{routeId:route.routeId,expectedRevision:route.revision,stepId:'S1',action:'continue'}).message!
   x.rt.actOnAnalysisRoute('route',{routeId:route.routeId,expectedRevision:route.revision,stepId:'S1',action:'skip'})
   expect(()=>x.rt.write('route',message)).toThrow(/版本|路线/)
   expect(x.rt.getAnalysisRoute('route',x.spec.sessionDir).route!.steps[0]!.status).toBe('skipped')
  }finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })

 it('canonical actions do not persist new authorization; appended human restrictions still apply',async()=>{
  const x=await setup();try{
   await x.call('update_analysis_route',{expectedRevision:0,route:draft()});const route=x.rt.getAnalysisRoute('route',x.spec.sessionDir).route!
   for(const action of ['view','search','continue'] as const){const message=routeActionMessage(route,'S1',action);expect(执行指令(message)).toBeUndefined();expect(执行指令(message+'\n先不要运行，只讨论。')).toBe(true)}
   const prior=[{type:'message',message:{role:'user',content:'先不要运行。'}},{type:'message',message:{role:'user',content:routeActionMessage(route,'S1','continue')}}]
   expect(仅讨论(prior)).toBe(true)
  }finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })

 it('distinguishes a denied shell call from actual execution failure and persists observed tool types',async()=>{
  const x=await setup();try{
   x.say('先不要运行。');const denied=await x.call('bash',{command:'true'},'denied-shell');expect(denied.isError).toBe(true)
   const d=draft();d.steps[0]!.execution={state:'failed',note:'失败',toolCallIds:['denied-shell']}
   expect((await x.call('update_analysis_route',{expectedRevision:0,route:d})).isError).toBe(true)
   x.say('开始执行分析数据。');expect((await x.call('bash',{command:'exit 7'},'actual-shell')).isError).toBe(true)
   d.steps[0]!.execution.toolCallIds=['actual-shell'];expect((await x.call('update_analysis_route',{expectedRevision:0,route:d})).isError).toBeFalsy()
   expect(x.rt.getAnalysisRoute('route',x.spec.sessionDir).evidence?.tools).toContainEqual({toolCallId:'actual-shell',name:'bash',status:'error',execution:'failed'})
  }finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })

 it('search metadata updates only candidates, not fabricated progress or changed scientific input',async()=>{
  const x=await setup();try{
   await x.call('update_analysis_route',{expectedRevision:0,route:draft()});const route=x.rt.getAnalysisRoute('route',x.spec.sessionDir).route!;x.say(routeActionMessage(route,'S1','search'))
   const changed=draft();changed.steps[0]!.status='delivered';expect((await x.call('update_analysis_route',{expectedRevision:1,route:changed})).isError).toBe(true)
   changed.steps[0]!.status='pending';changed.goal='篡改目标';expect((await x.call('update_analysis_route',{expectedRevision:1,route:changed})).isError).toBe(true)
  }finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })

 it('does not reuse prior execution evidence when a repeated toolCallId is later denied',async()=>{
  const x=await setup();try{
   x.say('开始执行。');expect((await x.call('bash',{command:'true'},'reused-id')).isError).toBeFalsy()
   x.say('先不要运行。');expect((await x.call('bash',{command:'true'},'reused-id')).isError).toBe(true)
   const d=draft();d.steps[0]!.execution={state:'failed',note:'被拒绝不是运行',toolCallIds:['reused-id']}
   expect((await x.call('update_analysis_route',{expectedRevision:0,route:d},'metadata')).isError).toBe(true)
  }finally{await x.rt.stop('route');rmSync(x.dir,{recursive:true,force:true})}
 })

})
