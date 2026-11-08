import {writeFileSync} from 'node:fs'
import {createProposePlanTool} from '../../../src/tools/propose-plan.js'
import {TaskContractSchema} from '../../../src/protocol/task-contract.js'
import {TaskSubmission} from '../../../src/orchestration/task-submission.js'
import {parseTaskArrangement} from '../../../src/protocol/task-arrangement.js'
const c=TaskContractSchema.parse({resultType:'model-metrics',submission:'tool',access:'workspace-write',inputs:['input.csv'],outputs:['analysis.py','result.json','report.md'],acceptance:{version:1,kind:'tabular-ecology',scriptPath:'analysis.py',resultPath:'result.json',reportPath:'report.md',numeric:{version:1,dataPath:'input.csv',column:'x',metric:'mean',unit:'m',missing:'block'}}})
let persisted=''
const tool=createProposePlanTool({contracts:()=>({analyze:c}),交:(_id,p)=>{persisted=p.plan;return{version:1}}})
const reference=tool.promptGuidelines.join('\n').match(/analyze@[a-f0-9]{64}/)![0]
const result=await tool.execute('demo-plan',{title:'引用已有科学契约',plan:'## 问题与假设\n均值\n## 数据与切分\ninput.csv\n## 统计检验与模型\n均值\n## 图\n无\n## 产物\n`result.json`',arrangement:{dispatch:'team-v1',mode:'single',rationale:'一个科学结果',independentReview:false,questions:[],tasks:[{id:'analyze',title:'均值',goal:'均值',role:'分析',inputs:c.inputs,outputs:c.outputs,dependencies:[],acceptance:'宿主复核',review:false,execution:{agent:'analyst',contractRef:reference}}]}})
const read=parseTaskArrangement(persisted)
const observed={source:'actual host tool calls; no inference',modelRequests:0,reference,published:!result.isError,persistedCompleteContract:read.state==='valid'&&JSON.stringify(read.arrangement.tasks[0]!.execution!.contract)===JSON.stringify(c),guide:new TaskSubmission(c,'/tmp',()=>[]).checkpoint().deliveryGuide}
writeFileSync(new URL('./'+(process.argv[2]??'stage-a-effect.json'),import.meta.url),JSON.stringify(observed,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(observed,null,2))
