import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NativeRuntime} from '../../src/runtime/native.js'
import {团队调度器} from '../../src/team/scheduler.js'
import * as versions from '../../src/artifacts/task-versions.js'
// @ts-expect-error local deterministic base plan
import {假方案} from '../../scripts/mock-inference-server.mjs'
const roots:string[]=[]
afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
type Tool={execute:(id:string,params:Record<string,unknown>,signal?:AbortSignal)=>Promise<{content:{type:string;text?:string}[];isError?:boolean}>}
function tool(rt:NativeRuntime,owner:string,name:string){const sessions=Reflect.get(rt,'sessions') as Map<string,{session:{getToolDefinition:(name:string)=>Tool}}> ;return sessions.get(owner)!.session.getToolDefinition(name)}
const selection=()=>({template:{id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'mean',units:'m',missingValues:'block',validation:{version:1 as const,column:'x',metric:'mean' as const,unit:'m',missing:'block' as const}},inputs:['input.csv'],outputRoot:'results/study',dataPath:'input.csv',requireExecution:true,independentReview:false})
async function setup(){
 const root=mkdtempSync(join(tmpdir(),'dawn-product-catalog-'));roots.push(root)
 mkdirSync(join(root,'.dawn/agents'),{recursive:true});writeFileSync(join(root,'.dawn/agents/worker.md'),'---\nname: worker\ndescription: fixture\ntools: read, write, bash\n---\nUse declared inputs and outputs')
 writeFileSync(join(root,'input.csv'),'x\n1\n2\n')
 const rt=new NativeRuntime({subagentChildEntry:'/fixture/not-started.mjs',permissionTier:{取:()=> 'allow-all',设:()=>{},全局:()=> 'allow-all'},credentials:{read:async()=>({type:'api_key' as const,key:'offline'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}}})
 const spec={sessionId:'owner',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}}
 await rt.start(spec)
 return{rt,root,spec}
}
async function publish(rt:NativeRuntime,id='p'){
 const query=await tool(rt,'owner','get_plan_contracts').execute('q',{}),catalog=JSON.parse(query.content[0]!.text!)
 const entry=catalog.catalog.find((x:{reference:string})=>x.reference.startsWith('analyze@'))
 return tool(rt,'owner','propose_plan').execute(id,{...假方案,catalogFingerprint:catalog.fingerprint,arrangement:{dispatch:'team-v1',mode:'single',rationale:'one scientific result',independentReview:false,questions:[],tasks:[{id:'analyze',title:'mean',goal:'mean',role:'analyst',inputs:entry.contract.inputs,outputs:entry.contract.outputs,dependencies:[],acceptance:'host checks',review:false,execution:{agent:'worker',contractRef:entry.reference}}]}})
}
it('changes a live product catalog without session reload and preserves it through restart',async()=>{
 const{rt,root,spec}=await setup()
 try{
  expect(rt.planningSource('owner')).toEqual({revision:0})
  expect((await tool(rt,'owner','get_plan_contracts').execute('off',{})).isError).toBe(true)
  rt.confirmPlanningSource('owner',selection(),0)
  await rt.setConfigOption('owner','dawn.plan','1')
  expect((await publish(rt)).isError).toBeUndefined()
  const before=readFileSync(join(root,'input.csv'),'utf8')
  expect(before).toBe('x\n1\n2\n');expect(rt.runOverview('owner')?.runs).toHaveLength(0)
  const source=rt.planningSource('owner')
  await rt.stop('owner');await rt.start({...spec,resume:true})
  expect(rt.planningSource('owner')).toEqual(source)
  expect((await tool(rt,'owner','get_plan_contracts').execute('restored',{})).isError).toBeUndefined()
 }finally{await rt.stop('owner')}
})
it('rejects an old proposal after source revision changes but keeps an already approved snapshot executable',async()=>{
 vi.spyOn(团队调度器.prototype,'踢一下').mockResolvedValue()
 const{rt,spec}=await setup()
 try{
  rt.confirmPlanningSource('owner',selection(),0);await rt.setConfigOption('owner','dawn.plan','1');await publish(rt)
  rt.confirmPlanningSource('owner',{...selection(),template:{...selection().template,method:'mean after confirmed checks'}},1)
  await expect(rt.answerPlan('owner','p','approve')).rejects.toThrow(/变化|重新安排/)
  expect((await publish(rt,'new')).isError).toBeUndefined()
  const approved=await rt.answerPlan('owner','new','approve')
  const snapshot=JSON.parse(readFileSync(join(spec.sessionDir,'plans.json'),'utf8')).方案们.find((p:{planId:string})=>p.planId==='new').executionSnapshot
  expect(snapshot.frozenTasks[0].description).toContain('用户已批准方法：mean after confirmed checks')
  expect(snapshot.frozenTasks[0].description).toContain('单位规则：m')
  rt.confirmPlanningSource('owner',null,2)
  const started=await rt.answerPlan('owner','new','execute')
  expect(started.executionTeamId).toBe(approved.executionTeamId)
 }finally{await rt.stop('owner')}
})
it('does not replace constraints while approval is awaiting input versions or while cancellation drains',async()=>{
 const{rt}=await setup()
 let release!:()=>void,entered!:()=>void
 const ready=new Promise<void>(r=>{entered=r}),wait=new Promise<void>(r=>{release=r})
 try{
  rt.confirmPlanningSource('owner',selection(),0);await rt.setConfigOption('owner','dawn.plan','1');await publish(rt)
  const real=versions.captureFileVersions
  vi.spyOn(versions,'captureFileVersions').mockImplementationOnce(async(...args)=>{entered();await wait;return real(...args)})
  const pending=rt.answerPlan('owner','p','approve'),failure=expect(pending).rejects.toThrow(/取消/)
  await ready
  expect(()=>rt.confirmPlanningSource('owner',null,1)).toThrow(/处理|排空|运行/)
  await rt.abort('owner');release();await failure
  expect(rt.planningSource('owner').revision).toBe(1)
 }finally{release?.();await rt.stop('owner')}
})

it('does not publish another plan when a later call reuses an earlier model call id',async()=>{
 const{rt,root,spec}=await setup(),plans:string[]=[]
 rt.attach('owner',event=>{if(event.kind==='plan')plans.push(event.plan.planId)})
 try{
  rt.confirmPlanningSource('owner',selection(),0);await rt.setConfigOption('owner','dawn.plan','1')
  expect((await publish(rt,'reused')).isError).toBeUndefined();const before=readFileSync(join(spec.sessionDir,'plans.json'),'utf8')
  const duplicate=await publish(rt,'reused');expect(duplicate.isError).toBe(true);expect(duplicate.content[0]!.text).toContain('标识重复')
  expect(plans).toEqual(['reused']);expect(readFileSync(join(spec.sessionDir,'plans.json'),'utf8')).toBe(before)
  expect(rt.runOverview('owner')?.runs).toHaveLength(0);expect(readFileSync(join(root,'input.csv'),'utf8')).toBe('x\n1\n2\n')
 }finally{await rt.stop('owner')}
})
