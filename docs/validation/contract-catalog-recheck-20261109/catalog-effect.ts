/** Host-only demonstration; no model, credentials, filesystem analysis or task execution. */
import {writeFileSync} from 'node:fs'
import {ConfirmedPlanningSourceSchema} from '../../../src/protocol/planning-contract-source.js'
import {buildPlanningContractContext,assertPlanningArrangement} from '../../../src/runtime/planning-contract-context.js'
import {TaskArrangementSchema} from '../../../src/protocol/task-arrangement.js'
const source=ConfirmedPlanningSourceSchema.parse({version:1,ownerSessionId:'isolated-demo',revision:1,confirmedAt:1,template:{id:'tabular-ecology',version:1,language:'python',method:'arithmetic mean',units:'m',missingValues:'block',validation:{version:1,column:'x',metric:'mean',unit:'m',missing:'block'}},inputs:['input.csv'],outputRoot:'results/study',dataPath:'input.csv',requireExecution:true,independentReview:false})
const context=buildPlanningContractContext(source),contract=context.contracts.analyze
const arrangement=TaskArrangementSchema.parse({dispatch:'team-v1',mode:'single',rationale:'one requested statistical result',independentReview:false,questions:[],tasks:[{id:'analyze',title:'均值',goal:'均值',role:'分析',inputs:contract.inputs,outputs:contract.outputs,dependencies:[],acceptance:'原科学验收',review:false,execution:{agent:'analyst',contract}}]})
assertPlanningArrangement(context,arrangement)
writeFileSync(new URL('./b-product/catalog-effect.json',import.meta.url),JSON.stringify({kind:'actual pure host functions',realModelRequests:0,executionStarted:false,source,context,taskCount:arrangement.tasks.length,mode:arrangement.mode,independentReviewRequired:source.independentReview,description:'三个可选目录条目，不强制三个任务；完整合同仍由原pipelineStageContract生成。'},null,2)+'\n')
