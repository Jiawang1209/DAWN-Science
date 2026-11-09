import {expect,it} from 'vitest'
import {ConfirmedPlanningSourceSchema,PlanningContractSelectionSchema} from '../../src/protocol/planning-contract-source.js'
import {buildPlanningContractContext,resolvePlanningContractContext} from '../../src/runtime/planning-contract-context.js'
import {scienceTemplate} from '../../src/team/science-templates.js'
import {pipelineStageContract} from '../../src/team/science-pipeline.js'
import {planContractCatalog} from '../../src/tools/plan-contract-bindings.js'
import {AnalysisRouteSchema} from '../../src/protocol/analysis-route.js'

const selection=()=>({template:{id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'arithmetic mean',units:'mg/g',missingValues:'drop NA',validation:{version:1 as const,column:'carbon',metric:'mean' as const,unit:'mg/g',missing:'drop' as const,absoluteTolerance:1e-9}},inputs:['input.csv'],outputRoot:'results/study',dataPath:'input.csv',requireExecution:true,independentReview:true})
const source=()=>ConfirmedPlanningSourceSchema.parse({version:1,ownerSessionId:'owner-a',revision:1,confirmedAt:1,...selection()})
const route=()=>AnalysisRouteSchema.parse({routeId:'route',revision:1,updatedAt:1,title:'analysis',goal:'mean',dataContext:[],steps:[{id:'s',title:'mean',purpose:'confirmed method',inputs:['input.csv'],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'pending'},verification:{state:'unreviewed',note:'pending'},needsReview:true,notes:[]}]})

it('derives exactly the existing pipeline contracts without creating execution state',()=>{
 const s=source(),context=buildPlanningContractContext(s),recipe=scienceTemplate(s.template,s.outputRoot,s.inputs,s.dataPath)
 const definition={inputs:s.inputs,outputs:recipe.outputs,acceptance:recipe.acceptance,requireExecution:s.requireExecution}
 expect(context).toMatchObject({ownerSessionId:'owner-a',revision:1})
 for(const stage of ['check','analyze','review'] as const)expect(context.contracts[stage]).toEqual(pipelineStageContract(definition,stage))
 expect(context.catalog).toEqual(planContractCatalog(context.contracts))
 expect(context.fingerprint).toMatch(/^[a-f0-9]{64}$/)
 expect(context).not.toHaveProperty('team');expect(context).not.toHaveProperty('tasks')
})
it('returns no directory until a host source has been confirmed',()=>{
 expect(resolvePlanningContractContext('owner-a',undefined)).toBeUndefined()
 expect(PlanningContractSelectionSchema.safeParse({...selection(),ownerSessionId:'forged',revision:8}).success).toBe(false)
 expect(()=>buildPlanningContractContext({...selection(),version:1,revision:1,confirmedAt:1} as never)).toThrow()
})
it.each([
 {inputs:['input.csv','input.csv']},
 {dataPath:'elsewhere.csv'},
 {dataPath:undefined},
 {outputRoot:'../outside'},
 {inputs:['/private/input.csv']},
 {inputs:['results/study/result.json'],dataPath:'results/study/result.json'},
 {template:{...selection().template,units:'different unit'}},
 {template:{...selection().template,language:'r'}},
])('rejects an inconsistent or unsupported confirmed selection: %j',patch=>{
 expect(PlanningContractSelectionSchema.safeParse({...selection(),...patch}).success).toBe(false)
})
it('isolates owners and binds route identity, revision, active step and declared inputs',()=>{
 expect(()=>resolvePlanningContractContext('owner-b',source())).toThrow(/会话/)
 const s={...source(),route:{routeId:'route',revision:1,stepId:'s'}}
 expect(resolvePlanningContractContext('owner-a',s,route())?.revision).toBe(1)
 expect(()=>resolvePlanningContractContext('owner-a',s)).toThrow(/路线/)
 expect(()=>resolvePlanningContractContext('owner-a',s,{...route(),revision:2})).toThrow(/路线/)
 const skipped=route();skipped.steps[0]!.status='skipped'
 expect(()=>resolvePlanningContractContext('owner-a',s,skipped)).toThrow(/步骤/)
 const other=route();other.steps[0]!.inputs=['other.csv']
 expect(()=>resolvePlanningContractContext('owner-a',s,other)).toThrow(/输入/)
})
it('does not share mutable values and changes identity when confirmed requirements change',()=>{
 const s=source(),first=buildPlanningContractContext(s),hash=first.fingerprint
 first.contracts.analyze.outputs.push('injected.csv')
 expect(s.inputs).toEqual(['input.csv'])
 expect(buildPlanningContractContext(s).contracts.analyze.outputs).not.toContain('injected.csv')
 expect(buildPlanningContractContext(s).fingerprint).toBe(hash)
 expect(buildPlanningContractContext({...s,revision:2}).fingerprint).not.toBe(hash)
 expect(buildPlanningContractContext({...s,independentReview:false}).fingerprint).not.toBe(hash)
 expect(buildPlanningContractContext({...s,template:{...s.template,method:'approved sum'}}).fingerprint).not.toBe(hash)
 s.template.validation!.unit='changed'
 expect(first.contracts.analyze.acceptance?.numeric?.unit).toBe('mg/g')
})
