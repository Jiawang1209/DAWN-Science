/** Real Native propose_plan path with deterministic localhost replies; no paid-model quality claim. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {NativeRuntime} from '../src/runtime/native.js'
import {autoArrangementPrompt,parseTaskArrangement,type TaskArrangement} from '../src/protocol/task-arrangement.js'
import {TaskContractSchema} from '../src/protocol/task-contract.js'
import {arrangementScenarios,evaluateArrangement,type ArrangementScenario,type ArrangementJudgement} from '../src/evaluation/arrangement-scenarios.js'
// @ts-expect-error shared localhost fixture
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
function fixture(s:ArrangementScenario):TaskArrangement {
 const t=(id:string,inputs:string[],outputs:string[],dependencies:string[]=[],review=false)=>({id,title:id,goal:id,role:review?'independent reviewer':id,inputs,outputs,dependencies,acceptance:'声明输入、输出及证据必须可核对',review,
  execution:{agent:review?'scenario-reviewer':'scenario-worker',contract:TaskContractSchema.parse({access:outputs.length?'workspace-write':'read-only',inputs,outputs,resultType:review?'review':outputs.length?'model-metrics':'data-summary',submission:'tool'})}})
 const tasks=s.id==='simple-result'?[t('mean',['input.csv'],['mean.csv'])]
  :s.id==='independent-inputs'?[t('left',['left.csv'],['left-summary.csv']),t('right',['right.csv'],['right-summary.csv'])]
  :s.id==='dependent-results'?[t('clean',['input.csv'],['clean.csv']),t('analyze',['clean.csv'],['metrics.csv'],['clean'])]
  :s.id==='independent-review'?[t('analyze',['input.csv'],['metrics.csv']),t('review',['metrics.csv'],[],['analyze'],true)]
  :[t('read',[s.id==='read-only-inspection'?'notes.md':'input.csv'],[])]
 return{dispatch:'team-v1',mode:s.modes[0]!,rationale:'本地夹具按此场景的明确输入、依赖和审阅要求安排，不代表真实模型规划质量。',independentReview:!!s.independentReview,questions:s.clarification?['请确认carbon列的单位']:[],tasks}
}
interface Row extends ArrangementJudgement {proposalRecorded:boolean;tasksExecuted:0;modelRequests:number}
export async function runArrangementScenarioEvaluation(destination:string){
 if(existsSync(join(destination,'arrangement-scenarios.json')))throw new Error('场景结果已存在，不覆盖旧证据')
 mkdirSync(destination,{recursive:true})
 const rows:Row[]=[]
 for(const scenario of arrangementScenarios()){
  const dir=join(destination,scenario.id),workspace=join(dir,'workspace'),sessionDir=join(dir,'session')
  mkdirSync(workspace,{recursive:true});mkdirSync(join(workspace,'.pi'),{recursive:true});mkdirSync(join(sessionDir,'pi'),{recursive:true})
  const settings=JSON.stringify({retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off'})
  writeFileSync(join(workspace,'.pi/settings.json'),settings);writeFileSync(join(sessionDir,'pi/settings.json'),settings)
  for(const name of ['input.csv','left.csv','right.csv'])writeFileSync(join(workspace,name),'carbon\n1\n2\n3\n')
  writeFileSync(join(workspace,'notes.md'),'# Synthetic notes\nRead only.\n')
  mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  for(const name of ['scenario-worker','scenario-reviewer'])writeFileSync(join(workspace,'.dawn/agents',name+'.md'),`---\nname: ${name}\ndescription: isolated planning fixture\ntools: read,write\n---\nOnly the frozen task contract permits later execution.\n`)
  const arrangement=fixture(scenario)
  const server=await startMockInferenceServer({scenario:{toolCall(body:{messages?:{role:string}[];tools?:{function?:{name?:string}}[]}){
   if(body.tools?.some(t=>t.function?.name==='propose_plan')&&!body.messages?.some(m=>m.role==='tool'))return{toolName:'propose_plan',args:{title:scenario.id,plan:'## 问题与假设\n隔离规划场景\n## 数据与切分\n自制输入\n## 统计检验与模型\n只规划不执行\n## 图\n未执行\n## 产物\n等待采纳',arrangement}}
  },reply:()=> '本地模拟方案已提交，等待用户采纳。'}})
  const modelsPath=join(dir,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
  const empty=join(dir,'empty-resources');mkdirSync(empty,{recursive:true})
  let proposal:{markdown:string}|undefined
  const runtime=new NativeRuntime({modelsPath,subagents:{全局目录:empty,自带目录:empty},skills:{全局目录:empty,自带目录:empty},
   credentials:{read:async()=>({type:'api_key' as const,key:'localhost-fixture'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}},
   gate:(tool,args)=>tool==='propose_plan'||tool==='read'&&['input.csv','left.csv','right.csv','notes.md'].some(p=>typeof args.path==='string'&&resolve(workspace,p)===resolve(workspace,args.path))?{kind:'allow'}:{kind:'deny',reason:'This isolated scenario only plans and reads synthetic inputs; it cannot start work or write files.'},
  })
  try{
   runtime.attach(scenario.id,event=>{if(event.kind==='plan')proposal=event.plan})
   await runtime.start({sessionId:scenario.id,workspace,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}})
   await runtime.setConfigOption(scenario.id,'dawn.plan','1')
   runtime.write(scenario.id,autoArrangementPrompt(scenario.prompt))
   await new Promise<void>(r=>setImmediate(r))
   const deadline=Date.now()+15000
   while(runtime.terminalBusy(scenario.id)){if(Date.now()>deadline)throw new Error('本地规划场景未按时结束');await new Promise(r=>setTimeout(r,10))}
   const read=parseTaskArrangement(proposal?.markdown??'')
   const result=evaluateArrangement(scenario,read.state==='valid'?read.arrangement:undefined)
   if(proposal)writeFileSync(join(dir,'proposed-plan.md'),proposal.markdown+'\n')
   rows.push({...result,proposalRecorded:!!proposal,tasksExecuted:0,modelRequests:server.requests.length})
  }finally{try{await runtime.stop(scenario.id)}finally{await server.close()}}
 }
 const report={version:1,inference:'localhost-fixture' as const,paidModelRequests:0,rows,limitations:['Real Native runtime and propose_plan, deterministic model replies; not evidence of live model quality.','Checks declared task relationships, outputs and review coverage; does not judge arbitrary natural-language scientific intent.','No proposal was approved and no task was executed.']}
 writeFileSync(join(destination,'arrangement-scenarios.json'),JSON.stringify(report,null,2)+'\n')
 writeFileSync(join(destination,'arrangement-scenarios.md'),['# 自动安排场景验收',...report.limitations,'','| 场景 | 模式 | 任务块 | 审阅覆盖 | 声明检查 | 实际规划请求 |','|---|---|---:|---|---|---:|',...rows.map(r=>`| ${r.scenarioId} | ${r.mode} | ${r.taskCount} | ${r.reviewCovered===null?r.validStructure?'无需审阅':'结构无效，未知':r.reviewCovered?'覆盖完整':'覆盖不足'} | ${r.passed?'通过':r.findings.join('；')} | ${r.modelRequests} |`)].join('\n')+'\n')
 if(rows.some(r=>!r.passed||!r.proposalRecorded))throw new Error('本地自动安排场景存在失败；查看保留报告')
 return report
}
