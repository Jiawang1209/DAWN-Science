/** Isolated synthetic-task planning through the product's real propose_plan path. */
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {NativeRuntime} from '../src/runtime/native.js'
import type {SubagentDefinition} from '../src/subagent/definitions.js'
import {TaskContractSchema,type TaskContract} from '../src/protocol/task-contract.js'
import {autoArrangementRequestPrefix,parseTaskArrangement,validateArrangementEdit,type TaskArrangement} from '../src/protocol/task-arrangement.js'
import type {方案} from '../src/protocol/plan.js'
import type {ResearchArrangementMetrics} from '../src/evaluation/research-tasks.js'
export async function generateResearchArrangement(opts:{workspace:string;sessionDir:string;modelsPath:string;provider:string;model:string;credential:string;definitions:SubagentDefinition[];contracts:Record<'check'|'analyze'|'review',TaskContract>;instructions:string;requests:()=>number;prepareSettings:(path:string,scope:'project'|'agent')=>void;signal:AbortSignal}):Promise<{markdown:string;arrangement:TaskArrangement;metrics:ResearchArrangementMetrics}>{
 const scratch=mkdtempSync(join(tmpdir(),'dawn-research-planning-')),before=opts.requests()
 mkdirSync(opts.sessionDir,{recursive:true})
 const metrics:ResearchArrangementMetrics={requests:0,taskCount:0,valid:false,reviewCovered:false}
 let proposal:方案|undefined
 const rt=new NativeRuntime({modelsPath:opts.modelsPath,subagentChildEntry:resolve('dist/electron/subagent-child.js'),skills:{},subagents:{},
  credentials:{read:async()=>({type:'api_key' as const,key:opts.credential}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},
  gate:(tool,args)=>tool==='propose_plan'||tool==='read'&&typeof args.path==='string'&&opts.contracts.analyze.inputs.some(path=>resolve(scratch,path)===resolve(scratch,args.path as string))?{kind:'allow'}:{kind:'deny',reason:'评测规划只读已声明的自制输入，不访问其他文件或执行任务。'},
 })
 const cancel=()=>{void rt.abort('research-planner')}
 opts.signal.addEventListener('abort',cancel,{once:true})
 try{
  if(opts.signal.aborted)throw new Error('自动安排已取消')
  for(const path of opts.contracts.analyze.inputs){mkdirSync(dirname(join(scratch,path)),{recursive:true});copyFileSync(join(opts.workspace,path),join(scratch,path))}
  mkdirSync(join(scratch,'.dawn/agents'),{recursive:true})
  for(const def of opts.definitions)writeFileSync(join(scratch,'.dawn/agents',def.name+'.md'),`---\nname: ${def.name}\ndescription: ${def.description}\ntools: ${(def.tools??[]).join(', ')}\n---\n${def.systemPrompt}`)
  opts.prepareSettings(join(opts.sessionDir,'project-settings.json'),'project');mkdirSync(join(scratch,'.pi'),{recursive:true});copyFileSync(join(opts.sessionDir,'project-settings.json'),join(scratch,'.pi/settings.json'));opts.prepareSettings(join(opts.sessionDir,'pi/settings.json'),'agent')
  rt.attach('research-planner',event=>{if(event.kind==='plan')proposal=event.plan})
  await rt.start({sessionId:'research-planner',workspace:scratch,sessionDir:opts.sessionDir,native:{provider:opts.provider,model:opts.model}})
  if(opts.signal.aborted)throw new Error('自动安排已取消')
  await rt.setConfigOption('research-planner','dawn.plan','1')
  if(opts.signal.aborted)throw new Error('自动安排已取消')
  rt.write('research-planner',autoArrangementRequestPrefix+'\n[research_automatic_arrangement]\n'+opts.instructions+'\n这是自制数据的同预算评测。由任务决定是否需要额外核查，不预设任务块数。保留独立只读审阅，必须覆盖分析依赖。方法、单位、正式提交及以下科学契约不可降低；可选核查使用 check 契约，唯一产物分析任务使用 analyze 契约，审阅使用 review 契约。不要执行任务，交给 propose_plan。\n冻结科学契约：'+JSON.stringify(opts.contracts))
  await new Promise<void>(r=>setImmediate(r))
  while(rt.terminalBusy('research-planner')){if(opts.signal.aborted){cancel();throw new Error('自动安排已取消')}await new Promise(r=>setTimeout(r,20))}
  if(opts.signal.aborted)throw new Error('自动安排已取消')
  if(!proposal)throw new Error('模型未交付可批准的自动安排')
  writeFileSync(join(opts.sessionDir,'proposed-plan.json'),JSON.stringify(proposal,null,2)+'\n',{flag:'wx'})
  validateArrangementEdit(proposal.markdown,proposal.markdown)
  const parsed=parseTaskArrangement(proposal.markdown)
  if(parsed.state!=='valid'||!parsed.arrangement.dispatch)throw new Error('自动安排缺少可执行绑定')
  const arrangement=parsed.arrangement;metrics.taskCount=arrangement.tasks.length
  if(!arrangement.independentReview||!arrangement.tasks.some(t=>t.review))throw new Error('自动安排未保留独立审阅')
  if(arrangement.tasks.filter(t=>t.execution?.contract.resultType==='model-metrics'&&!t.review).length!==1)throw new Error('本题需要且只允许一个冻结科学分析产物任务')
  for(const task of arrangement.tasks){
   const stage=task.review?'review':task.execution?.contract.resultType==='model-metrics'?'analyze':'check'
   if(JSON.stringify(TaskContractSchema.parse(task.execution?.contract))!==JSON.stringify(opts.contracts[stage]))throw new Error('自动安排改变了冻结科学契约')
   if(!opts.definitions.some(def=>def.name===task.execution?.agent))throw new Error('自动安排使用未声明执行者')
  }
  const ancestors=(id:string):Set<string>=>new Set(arrangement.tasks.find(task=>task.id===id)!.dependencies.flatMap(dep=>[dep,...ancestors(dep)]))
  metrics.reviewCovered=arrangement.tasks.filter(task=>!task.review).every(task=>arrangement.tasks.some(review=>review.review&&ancestors(review.id).has(task.id)))
  if(!metrics.reviewCovered)throw new Error('自动安排的独立审阅未覆盖全部工作依赖')
  metrics.valid=true
  return{markdown:proposal.markdown,arrangement,metrics}
 }catch(error){metrics.reason=error instanceof Error?error.message:String(error);throw error}
 finally{
  opts.signal.removeEventListener('abort',cancel)
  try{
   // Abort/drain first, but read while the owning session still exists; stop removes it.
   if(rt.terminalBusy('research-planner'))await rt.abort('research-planner')
   try{metrics.usage=rt.sessionUsage('research-planner')}catch{metrics.usageIssue='unavailable'}
  }finally{try{await rt.stop('research-planner')}finally{
   metrics.requests=opts.requests()-before
   try{writeFileSync(join(opts.sessionDir,'automatic-arrangement.json'),JSON.stringify({mode:'model-generated',...metrics},null,2)+'\n')}
   finally{rmSync(scratch,{recursive:true,force:true})}
  }}
 }
}
