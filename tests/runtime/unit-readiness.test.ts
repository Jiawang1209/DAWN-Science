import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync,existsSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ScienceTemplateSchema,scienceTemplate} from '../../src/team/science-templates.js'
import {ConfirmedPlanningSourceSchema,PlanningContractSelectionSchema} from '../../src/protocol/planning-contract-source.js'
import {buildPlanningContractContext,assertPlanningArrangement} from '../../src/runtime/planning-contract-context.js'
import {TaskContractSchema,TaskSettingsSchema,type TaskReceipt} from '../../src/protocol/task-contract.js'
import {stageContract} from '../../src/protocol/science-pipeline.js'
import {createGetPlanContractsTool} from '../../src/tools/get-plan-contracts.js'
import {SubagentExecutor} from '../../src/subagent/executor.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
import {taskInputReceipt} from '../../src/orchestration/task-contract.js'
import {方案簿} from '../../src/runtime/plan-book.js'
import {taskOutputReservation} from '../../src/bot/output-locks.js'
import {TaskArrangementSchema} from '../../src/protocol/task-arrangement.js'
import {runControlledScience} from '../../src/team/science-execution.js'
import {validateScienceAcceptance,validateAcceptanceReceipt} from '../../src/team/science-acceptance.js'
const roots:string[]=[];afterEach(()=>roots.splice(0).forEach(r=>rmSync(r,{recursive:true,force:true})))
const template=()=>({id:'tabular-ecology',version:1,language:'python',method:'arithmetic mean',units:'',unitStatus:'missing',missingValues:'drop NA'})
const selection=()=>({template:template(),inputs:['input.csv'],outputRoot:'results',requireExecution:true,independentReview:false})
function contract(){const recipe=scienceTemplate(ScienceTemplateSchema.parse(template()),'results',['input.csv']);return stageContract({inputs:['input.csv'],outputs:recipe.outputs,acceptance:recipe.acceptance,requireExecution:true},'analyze')}
it('records an explicit missing unit without inventing a unit and cannot combine it with numerical acceptance',()=>{
 expect(PlanningContractSelectionSchema.safeParse(selection()).success).toBe(true)
 expect(ScienceTemplateSchema.safeParse({...template(),unitStatus:undefined}).success).toBe(false)
 expect(ScienceTemplateSchema.safeParse({...template(),units:'mg/g'}).success).toBe(false)
 expect(ScienceTemplateSchema.safeParse({...template(),validation:{version:1,column:'x',metric:'mean',unit:'mg/g',missing:'drop'}}).success).toBe(false)
})
it('keeps missing units in the same source revision and catalog identity and requires a new proposal after filling them',async()=>{
 const s=ConfirmedPlanningSourceSchema.parse({...selection(),version:1,ownerSessionId:'a',revision:1,confirmedAt:1}),c=buildPlanningContractContext(s)
 const task={id:'analyze',title:'analyze',goal:'mean',role:'analyst',inputs:c.contracts.analyze.inputs,outputs:c.contracts.analyze.outputs,dependencies:[],acceptance:'host',review:false,execution:{agent:'analyze',contract:c.contracts.analyze}}
 const p=TaskArrangementSchema.parse({dispatch:'team-v1',mode:'single',rationale:'mean',independentReview:false,questions:[],tasks:[task]})
 expect(()=>assertPlanningArrangement(c,p)).toThrow(/单位/)
 p.questions=['请提供目标列单位'];expect(()=>assertPlanningArrangement(c,p)).not.toThrow()
 const query=await createGetPlanContractsTool({isPlanning:()=>true,context:()=>c}).execute('q',{})
 expect(JSON.parse(query.content[0]!.text)).toMatchObject({missingFacts:['units'],confirmedFacts:{units:null}})
 const filled=ConfirmedPlanningSourceSchema.parse({...s,revision:2,template:{...s.template,unitStatus:undefined,units:'mg/g'}})
 expect(buildPlanningContractContext(filled).fingerprint).not.toBe(c.fingerprint)
 expect(()=>assertPlanningArrangement(buildPlanningContractContext(filled),p)).toThrow(/合同/)
})
it('prevents executable settings and gives a host blocked receipt before any file is read',()=>{
 const c=contract();expect(TaskSettingsSchema.safeParse(resolveTaskSettings(c,'allow-all')).success).toBe(false)
 expect(taskInputReceipt(c,'/nonexistent-workspace')).toMatchObject({state:'blocked',reason:expect.stringContaining('单位')})
 expect(TaskContractSchema.parse(c).acceptance).toHaveProperty('unitStatus','missing')
})
it('never falls through to ordinary execution or accepts files when a known missing unit reaches the scientific backstop',async()=>{
 const c=contract()
 await expect(runControlledScience(c.acceptance,'/nonexistent-workspace',{command:'arbitrary command'})).rejects.toThrow(/单位/)
 expect(await validateScienceAcceptance(c,{version:1,state:'accepted',summary:'claimed',deliverables:[]},'/nonexistent-workspace')).toMatchObject({state:'blocked',reason:expect.stringContaining('单位')})
})
it('discards stale accepted proof and versions when missing-unit readiness blocks receipt reuse',async()=>{
 const old:TaskReceipt={version:1,state:'accepted',summary:'old proof',deliverables:[{stepId:'old',path:'results/result.json',state:'exists'}],versions:{version:1,inputs:[],outputs:[]},acceptance:{version:1,ruleVersion:1,specHash:'a'.repeat(64),state:'passed',numericChecked:false,files:[],checks:[{id:'old',state:'passed'}]}}
 for(const r of [await validateScienceAcceptance(contract(),old,'/nonexistent'),validateAcceptanceReceipt(contract(),old)]){
  expect(r.state).toBe('blocked');expect(r).not.toHaveProperty('versions');expect(r).not.toHaveProperty('acceptance');expect(r.deliverables).toEqual([])
 }
})
it('persists the missing fact through the existing book, isolates owners and invalidates the old proposal when units are filled',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dawn-unit-book-'));roots.push(dir);const path=join(dir,'plans.json'),book=new 方案簿(path)
 const first=book.confirmPlanningSource('a',selection(),0,1);book.收('missing','units','text',{revision:first.revision,fingerprint:first.fingerprint!})
 const restored=new 方案簿(path);expect(restored.planningSourceState('a')).toMatchObject({source:{template:{unitStatus:'missing',units:''}}});expect(restored.planningSourceState('b')).toMatchObject({issue:expect.stringContaining('会话')})
 restored.confirmPlanningSource('a',{...selection(),template:{...template(),unitStatus:undefined,units:'m'}},1,2)
 expect(()=>restored.assertPlanningSource('missing','a')).toThrow(/变化/);expect(restored.找('missing')?.status).toBe('proposed')
})
it('spawns no child and creates no placeholder outputs, even for direct execution with prebuilt settings, then releases its lock',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-missing-unit-'));roots.push(cwd);writeFileSync(join(cwd,'input.csv'),'x\n1\n')
 const c=contract(),settings=resolveTaskSettings(c,'allow-all'),childOf=vi.fn(()=>({command:'must-not-run',args:[]}))
 const executor=new SubagentExecutor({context:{cwd,provider:'fixture',model:'local',agentDirOf:()=>join(cwd,'agent')},prepareTask:()=>settings,childOf})
 const result=(await executor.run({mode:'single',agent:'a',task:'calculate'},[{name:'a',description:'a',systemPrompt:'a',filePath:'/a'}])).results[0]!
 expect(result).toMatchObject({ok:false,receipt:{state:'blocked',reason:expect.stringContaining('单位')}});expect(childOf).not.toHaveBeenCalled()
 for(const file of ['analysis.py','result.json','report.md'])expect(existsSync(join(cwd,'results',file))).toBe(false)
 expect(readFileSync(join(cwd,'input.csv'),'utf8')).toBe('x\n1\n')
 const controller=new AbortController(),release=await taskOutputReservation(cwd,settings,controller.signal);release()
})
it('does not wait for another writer lock when the frozen unit is already known to be missing',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-unit-locked-'));roots.push(cwd);writeFileSync(join(cwd,'input.csv'),'x\n1\n')
 const settings=resolveTaskSettings(contract(),'allow-all'),held=await taskOutputReservation(cwd,settings,new AbortController().signal),controller=new AbortController()
 const childOf=vi.fn(()=>({command:'must-not-run',args:[]})),executor=new SubagentExecutor({context:{cwd,provider:'p',model:'m',agentDirOf:()=>join(cwd,'a')},prepareTask:()=>settings,childOf})
 const pending=executor.run({mode:'single',agent:'a',task:'mean'},[{name:'a',description:'a',systemPrompt:'a',filePath:'/a'}],controller.signal)
 try{expect(await Promise.race([pending.then(r=>r.results[0]?.receipt?.state),new Promise(resolve=>setTimeout(()=>resolve('waiting-for-lock'),100))])).toBe('blocked');expect(childOf).not.toHaveBeenCalled()}
 finally{controller.abort();held();await pending}
})
