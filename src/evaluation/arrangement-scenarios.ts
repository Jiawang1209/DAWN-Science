/** Read-only evaluation of declared task structure; never a scheduler or permission decision. */
import {TaskArrangementSchema,type TaskArrangement} from '../protocol/task-arrangement.js'
export interface ArrangementScenario {
 id:string
 prompt:string
 modes:TaskArrangement['mode'][]
 outputs:string[]
 independentUnits?:{input:string;output:string}[]
 artifactDependency?:{producer:string;consumer:string}
 independentReview?:boolean
 clarification?:boolean
 readOnly?:boolean
}
export function arrangementScenarios():ArrangementScenario[]{return[
 {id:'simple-result',prompt:'读取input.csv并计算一次均值，保存mean.csv；没有独立审阅要求，不需要拆分额外工作。',modes:['single'],outputs:['mean.csv']},
 {id:'independent-inputs',prompt:'分别统计left.csv和right.csv，分别保存left-summary.csv和right-summary.csv。两份输入互不依赖，独立处理，不合并成一个计算任务。',modes:['parallel'],outputs:['left-summary.csv','right-summary.csv'],independentUnits:[{input:'left.csv',output:'left-summary.csv'},{input:'right.csv',output:'right-summary.csv'}]},
 {id:'dependent-results',prompt:'先清洗input.csv为clean.csv，再根据clean.csv建模为metrics.csv；后一步必须使用前一步产物。',modes:['chain'],outputs:['clean.csv','metrics.csv'],artifactDependency:{producer:'clean.csv',consumer:'metrics.csv'}},
 {id:'independent-review',prompt:'分析input.csv，保存metrics.csv，再由独立角色只读审阅该产物。审阅必须覆盖全部工作依赖。',modes:['chain','science'],outputs:['metrics.csv'],independentReview:true},
 {id:'missing-information',prompt:'读取input.csv的carbon列后报告带单位均值，但没有提供单位；请先询问单位，不猜测或启动执行。',modes:['single'],outputs:[],clarification:true},
 {id:'read-only-inspection',prompt:'仅阅读notes.md并在对话里列出问题。明确禁止修改文件，不生成新文件。',modes:['single'],outputs:[],readOnly:true},
]}
export interface ArrangementJudgement {scenarioId:string;validStructure:boolean;passed:boolean;mode:TaskArrangement['mode']|null;taskCount:number;reviewCovered:boolean|null;findings:string[]}
export function evaluateArrangement(scenario:ArrangementScenario,raw:unknown):ArrangementJudgement {
 const parsed=TaskArrangementSchema.safeParse(raw)
 if(!parsed.success)return{scenarioId:scenario.id,validStructure:false,passed:false,mode:null,taskCount:0,reviewCovered:null,findings:parsed.error.issues.map(i=>i.message)}
 const plan=parsed.data,findings:string[]=[]
 if(!scenario.modes.includes(plan.mode))findings.push('执行方式不符合本题声明的任务关系')
 const actualOutputs=plan.tasks.flatMap(t=>t.outputs)
 if(scenario.outputs.some(path=>!actualOutputs.includes(path)))findings.push('缺少本题声明的输出')
 if(actualOutputs.some(path=>!scenario.outputs.includes(path)))findings.push('建议了本题范围以外的输出')
 const ancestors=(id:string,seen=new Set<string>()):Set<string>=>{
  for(const dep of plan.tasks.find(t=>t.id===id)?.dependencies??[])if(!seen.has(dep)){seen.add(dep);ancestors(dep,seen)}
  return seen
 }
 if(scenario.independentUnits){
  const owners=scenario.independentUnits.map(unit=>plan.tasks.filter(t=>t.inputs.includes(unit.input)&&t.outputs.includes(unit.output)))
  if(owners.some(rows=>rows.length!==1)||new Set(owners.flat().map(t=>t.id)).size!==scenario.independentUnits.length)findings.push('独立输入与产物未交给各自独立的任务')
 }
 if(scenario.artifactDependency){
  const edge=scenario.artifactDependency,producers=plan.tasks.filter(t=>t.outputs.includes(edge.producer)),consumers=plan.tasks.filter(t=>t.outputs.includes(edge.consumer))
  if(producers.length!==1||consumers.length!==1||!consumers[0]!.inputs.includes(edge.producer)||!ancestors(consumers[0]!.id).has(producers[0]!.id))findings.push('产物交接缺少真实输入与前置依赖')
 }
 const reviews=plan.tasks.filter(t=>t.review),workers=plan.tasks.filter(t=>!t.review)
 // Null is not applicable (or unjudgeable for invalid structure), never a successful review.
 const reviewCovered=scenario.independentReview||plan.independentReview?plan.independentReview&&reviews.length>0&&workers.length>0&&workers.every(t=>reviews.some(r=>ancestors(r.id).has(t.id))):null
 if(scenario.independentReview){
  if(!reviewCovered)findings.push('独立审阅没有覆盖全部工作依赖')
  if(reviews.some(t=>t.execution&&(t.execution.contract.access!=='read-only'||t.execution.contract.resultType!=='review')))findings.push('审阅执行声明不是只读审阅契约')
 }
 if(scenario.clarification&&!plan.questions.length)findings.push('缺少必要澄清，不能猜测缺失信息')
 if(scenario.readOnly&&(actualOutputs.length||plan.tasks.some(t=>t.execution&&t.execution.contract.access!=='read-only')))findings.push('只读任务包含写入或执行建议')
 return{scenarioId:scenario.id,validStructure:true,passed:!findings.length,mode:plan.mode,taskCount:plan.tasks.length,reviewCovered,findings}
}
