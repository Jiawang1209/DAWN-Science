import {execFileSync} from 'node:child_process'
/** Incremental rows use the same actual-Pi localhost provider and entry as the original paired baseline. */
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path'
import {probeScienceEnvironment} from '../src/team/science-environment.js'
import {NativeRuntime} from '../src/runtime/native.js'
import type {团队调度器} from '../src/team/scheduler.js'
import type {AnalysisRouteBook} from '../src/runtime/analysis-route-book.js'
import {baselineUsage,baselineFingerprint} from '../src/evaluation/science-pipeline.js'
// @ts-expect-error shared deterministic localhost provider
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
// @ts-expect-error shared deterministic fixture
import {scienceTemplateScenario} from './mock-science-template.mjs'
type IncrementalRow={mode:string;scenario:string;phase:string;status:string;modelRequests:number;executedItems:number;reusedItems:number;hostValidationReceipts:number;groundTruthPassed:boolean;expectedBehavior:boolean;sourcePreserved:boolean;inputPreserved:boolean;elapsedMs:number;items:unknown[]}&ReturnType<typeof baselineUsage>
async function until(test:()=>boolean,timeout=35000){const deadline=Date.now()+timeout;while(!test()){if(Date.now()>deadline)throw new Error('增量评测等待超时');await new Promise<void>(r=>setTimeout(r,10))}}
export async function runScienceIncremental(outputDir:string){
 const rows:IncrementalRow[]=[]
 for(const mode of ['full-rerun','derived-rerun'] as const)rows.push(...await run(mode))
 const configuration={provider:'localhost deterministic fixture',actualPiPythonFiles:true,fixture:'two separate CSVs: x=1..5 m',fault:'B writes and declares 999 while host expects 3',maxRevisions:1,parallelism:1,hostRules:'n, mean, unit, JSON/receipt consistency; isolated environment and script binding',comparisonFingerprint:baselineFingerprint({inputs:['x\n1\n2\n3\n4\n5\n','x\n1\n2\n3\n4\n5\n'],method:'mean',fault:'B=999',required:{n:5,mean:3,unit:'m'},stages:['check','analyze','review'],sameFaultSetup:true})}
 const sourceFiles=['src/team/science-reuse.ts','src/team/science-python-bootstrap.ts','src/protocol/science-route-context.ts','src/team/science-environment.ts','src/team/science-execution.ts','src/team/science-acceptance.ts','src/team/science-pipeline-tools.ts','src/team/science-batch.ts','src/runtime/process-tree.ts','src/runtime/native.ts','src/subagent/task-tools.ts','src/orchestration/task-submission.ts','src/artifacts/task-versions.ts','src/files/table.ts','src/protocol/science-acceptance.ts','src/protocol/science-reuse.ts','scripts/evaluate-science-incremental.ts','scripts/mock-science-template.mjs']
 const sourceFingerprint=baselineFingerprint(sourceFiles.map(p=>[p,readFileSync(p,'utf8')])),childBuildFingerprint=baselineFingerprint(readFileSync(resolve('dist/electron/subagent-child.js'),'utf8'))
 const report={version:1,sourceFiles,sourceFingerprint,childBuildFingerprint,generatedAt:new Date().toISOString(),configuration,rows,limitations:['本地确定性夹具的工程路径对照，不是真实模型能力、质量或费用评测。','commonSetup 是共同故障前置成本；recoveryIncrement 仅含修正之后的新请求/执行/宿主开销。','复用历史回执不计为本次新执行或零费用；未上报用量保留 unknown/partial。','实际文件独立验收；复用仅承认历史产物与审阅，不证明科学结论普遍有效。']}
 mkdirSync(outputDir,{recursive:true});writeFileSync(join(outputDir,'incremental.json'),JSON.stringify(report,null,2)+'\n')
 writeFileSync(join(outputDir,'incremental.md'),['# 增量复用对照',...report.limitations,'','| 模式／场景 | 阶段 | 请求 | 新分析项 | 复用项 | 实际数值正确 | 原记录保留 | 耗时 ms | 可见 token（部分） | 未知任务用量 |','|---|---|---:|---:|---:|---|---|---:|---:|---:|',...rows.map(r=>`| ${r.mode}/${r.scenario} | ${r.phase} | ${r.modelRequests} | ${r.executedItems} | ${r.reusedItems} | ${r.groundTruthPassed} | ${r.sourcePreserved} | ${r.elapsedMs} | ${r.visibleTokens} | ${r.unknownUsageTasks} |`)].join('\n')+'\n')
 if(rows.some(r=>!r.expectedBehavior||!r.sourcePreserved))throw new Error('增量评测出现错误放行、错误复用或来源变化，请检查 incremental.json')
 return report
}
async function run(mode:'full-rerun'|'derived-rerun'){
 const root=mkdtempSync(join(tmpdir(),'science-incremental-eval-')),wrong=['b.csv'],server=await startMockInferenceServer({scenario:scienceTemplateScenario({wrongInputs:wrong})}),modelsPath=join(root,'models.json')
 for(const file of ['a.csv','b.csv'])writeFileSync(join(root,file),'x\n1\n2\n3\n4\n5\n');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));mkdirSync(join(root,'.dawn/agents'),{recursive:true});for(const name of ['check','analyze','review'])writeFileSync(join(root,'.dawn/agents',name+'.md'),`---\nname: ${name}\ndescription: fixture\ntools: read, write, bash\n---\nUse frozen contract.`)
 const runtime=new NativeRuntime({modelsPath,credentials:{read:async()=>({type:'api_key',key:'offline-mock'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},subagentChildEntry:resolve('dist/electron/subagent-child.js')})
 const internal=runtime as unknown as {botTeams:Map<string,{current:{id:string};scheduler:团队调度器}>;sessions:Map<string,{session:{getToolDefinition(name:string):{execute(id:string,args:unknown):Promise<{isError?:boolean;content:{text?:string}[]}>}}}>;routeBooks:Map<string,{book:AnalysisRouteBook}>}
 try{
 await runtime.start({sessionId:'eval',workspace:root,sessionDir:join(root,'session'),native:{provider:'deepseek',model:'deepseek-flash'}})
 const book=internal.routeBooks.get('eval')!.book,route=book.replace(0,{title:'fixture',goal:'mean',dataContext:['deterministic software test'],steps:[{id:'s',title:'mean',purpose:'approved mean',inputs:['a.csv','b.csv'],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})
 const start=internal.sessions.get('eval')!.session.getToolDefinition('start_science_batch'),template={id:'tabular-ecology',version:1,language:'python',method:'mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block',absoluteTolerance:1e-9}}
 const args={routeId:route.routeId,stepId:'s',executors:{check:{agent:'check'},analyze:{agent:'analyze'},review:{agent:'review'}},instructions:'approved mean',template,items:[{id:'a',label:'A',inputs:['a.csv'],dataPath:'a.csv'},{id:'b',label:'B',inputs:['b.csv'],dataPath:'b.csv'}],outputRoot:'results',maxRevisions:1}
 const rows:IncrementalRow[]=[]
 const launch=async(scenario:string,phase:string,extra:Record<string,unknown>,expectedModes:string[],blocked=false)=>{
  const before=server.requests.length,began=Date.now(),sourceId=(extra.reuseFrom as {teamId?:string}|undefined)?.teamId,sourceFile=sourceId?join(root,'session/teams',sourceId,'team.json'):undefined,sourceBytes=sourceFile?readFileSync(sourceFile,'utf8'):undefined
  const result=await start.execute(scenario,{...args,revision:book.read()!.revision,...extra});if(result.isError)throw new Error(JSON.stringify(result))
  const c=internal.botTeams.get('eval')!,id=c.current.id
  await until(()=>['blocked','completed'].includes(c.scheduler.读(id).scienceBatch!.status));await until(()=>!c.scheduler.hasActiveTeam(id));if(!blocked)await until(()=>c.scheduler.读(id).pipeline?.routeSync==='applied')
  const t=c.scheduler.读(id),fresh=t.tasks.filter(t=>!t.reusedFrom),b=t.scienceBatch!,actualModes=b.items.map(i=>i.reuse?.mode??'rerun')
  const groundTruthPassed=!blocked&&b.items.every(i=>{try{const p=i.definition.acceptance!,v=JSON.parse(readFileSync(join(root,p.resultPath),'utf8'));return v.n===5&&v.unit==='m'&&Math.abs(v[p.numeric!.metric]-(p.numeric!.metric==='sum'?15:3))<1e-9}catch{return false}})
  const row={mode,scenario,phase,status:b.status,modelRequests:server.requests.length-before,executedItems:fresh.filter(t=>t.contract?.resultType==='model-metrics').length,reusedItems:b.items.filter(i=>i.reuse?.mode==='reused').length,hostValidationReceipts:fresh.filter(t=>t.receipt?.acceptance).length,groundTruthPassed,expectedBehavior:blocked?b.status==='blocked'&&t.tasks.some(t=>t.receipt?.acceptance?.checks.some(c=>c.id==='numeric.mean'&&c.state==='blocked')):b.status==='completed'&&groundTruthPassed&&actualModes.join()===expectedModes.join(),sourcePreserved:!sourceFile||readFileSync(sourceFile,'utf8')===sourceBytes,inputPreserved:readFileSync(join(root,'b.csv'),'utf8')==='x\n1\n2\n3\n4\n5\n',elapsedMs:Date.now()-began,...baselineUsage(fresh.map(t=>t.observation)),items:b.items.map(i=>({id:i.id,decision:i.reuse??{mode:'rerun',reason:'共同故障前置执行'}}))}
  rows.push(row);return t
 }
 const source=await launch('fault','commonSetup',{},['rerun','rerun'],true);wrong.splice(0)
 const derived=await launch('recovery','recoveryIncrement',{reuseFrom:{teamId:source.id,stateRevision:source.scienceBatch!.stateRevision,...(mode==='full-rerun'?{forceRerunItems:['a','b']}:{})}},mode==='full-rerun'?['rerun','rerun']:['reused','rerun'])
 if(mode==='derived-rerun'){
  const repeat=await launch('identical-repeat','increment',{reuseFrom:{teamId:derived.id,stateRevision:derived.scienceBatch!.stateRevision}},['reused','reused'])
  if(rows.at(-1)!.modelRequests!==0)throw new Error('完整复用不应生成新的模型请求')
  writeFileSync(join(root,'a.csv'),'x\n5\n4\n3\n2\n1\n')
  const changed=await launch('input-changed','increment',{reuseFrom:{teamId:repeat.id,stateRevision:repeat.scienceBatch!.stateRevision}},['rerun','reused'])
  const method=await launch('method-changed','increment',{template:{...template,method:'sum',validation:{...template.validation,metric:'sum'}},reuseFrom:{teamId:changed.id,stateRevision:changed.scienceBatch!.stateRevision}},['rerun','rerun'])
  // Explicit fault injection: an old artifact is externally overwritten. No receipt is edited.
  writeFileSync(join(root,method.scienceBatch!.items[0]!.definition.acceptance!.resultPath),JSON.stringify({n:5,sum:999,unit:'m'}))
  const repaired=await launch('artifact-tampered','increment',{template:{...template,method:'sum',validation:{...template.validation,metric:'sum'}},reuseFrom:{teamId:method.id,stateRevision:method.scienceBatch!.stateRevision}},['rerun','reused'])
  const currentRoute=book.read()!,{routeId:_routeId,revision:_revision,updatedAt:_updated,...draft}=currentRoute;draft.steps[0]!.notes.push('新增用户约束：只处理本批批准的 CSV，保持原单位。');book.replace(currentRoute.revision,draft,'用户补充方法约束')
  const constrained=await launch('route-notes-changed','increment',{template:{...template,method:'sum',validation:{...template.validation,metric:'sum'}},reuseFrom:{teamId:repaired.id,stateRevision:repaired.scienceBatch!.stateRevision}},['rerun','rerun'])
  // Actual temporary stdlib-only virtual environment; no installs or network, removed with the fixture.
  const environment=await probeScienceEnvironment('python',root),previousPath=process.env.PATH
  if(!environment.executable)throw new Error('评测缺少实际解释器路径')
  const venv=join(root,'alternate-interpreter');execFileSync(environment.executable,['-I','-m','venv','--without-pip',venv],{timeout:15000});process.env.PATH=join(venv,'bin')+':'+(previousPath??'')
  try{await launch('temporary-environment-changed','increment',{template:{...template,method:'sum',validation:{...template.validation,metric:'sum'}},reuseFrom:{teamId:constrained.id,stateRevision:constrained.scienceBatch!.stateRevision}},['rerun','rerun'])}finally{if(previousPath===undefined)delete process.env.PATH;else process.env.PATH=previousPath}
 }
 return rows
 }finally{await runtime.stop('eval');await server.close();rmSync(root,{recursive:true,force:true})}
}
