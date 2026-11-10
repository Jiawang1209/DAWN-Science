import {writeFileSync} from 'node:fs'
import {createProposePlanTool} from '../../../src/tools/propose-plan.js'
import {createGetPlanContractsTool} from '../../../src/tools/get-plan-contracts.js'
import {buildPlanningContractContext} from '../../../src/runtime/planning-contract-context.js'
import {TaskContractSchema} from '../../../src/protocol/task-contract.js'
import {必填小节} from '../../../src/protocol/plan.js'
const body=必填小节.map(h=>'## '+h+'\nLocal synthetic demonstration').join('\n')
const block=(id:string,inputs:string[],outputs:string[],dependencies:string[])=>({id,title:id,goal:id,role:id,inputs,outputs,dependencies,review:false,acceptance:'original host checks',execution:{agent:'worker',contract:TaskContractSchema.parse({submission:'tool',inputs,outputs,access:outputs.length?'workspace-write':'read-only'})}})
const arrangement={dispatch:'team-v1',mode:'chain',rationale:'producer then consumer',independentReview:false,questions:[],tasks:[block('analyze',['input.csv'],['result.csv'],[]),block('review',['result.csv'],[],[])]}
let stored=0;const tool=createProposePlanTool({交:()=>({version:++stored})})
const rejected=await tool.execute('bad',{title:'demo',plan:body,arrangement});const storedAfterRejection=stored
arrangement.tasks[1]!.dependencies=['analyze'];const corrected=await tool.execute('corrected',{title:'demo',plan:body,arrangement})
const source={version:1 as const,ownerSessionId:'demo',revision:1,confirmedAt:1,template:{id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'arithmetic mean',units:'mg/g',missingValues:'drop NA'},inputs:['input.csv'],outputRoot:'results',requireExecution:true,independentReview:true}
const query=async(missing:boolean)=>{const context=buildPlanningContractContext({...source,template:{...source.template,...(missing?{units:'',unitStatus:'missing' as const}:{})}});const r=await createGetPlanContractsTool({isPlanning:()=>true,context:()=>context}).execute('q',{});const d=JSON.parse(r.content[0]!.text);return{confirmedFacts:d.confirmedFacts,missingFacts:d.missingFacts,clarificationPolicy:d.clarificationPolicy}}
const proof={kind:'actual tool calls with synthetic input; no model inference or task execution',realModelRequests:0,rejected:{...rejected,stored:storedAfterRejection},corrected:{...corrected,stored},confirmed:await query(false),missingUnit:await query(true)}
writeFileSync(new URL('./tool-effects.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({rejection:rejected.content[0]!.text,storedAfterRejection,correctedStored:stored,missingFacts:proof.missingUnit.missingFacts}))
