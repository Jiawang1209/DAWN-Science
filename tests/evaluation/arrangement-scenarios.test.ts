import {expect,it} from 'vitest'
import {arrangementScenarios,evaluateArrangement} from '../../src/evaluation/arrangement-scenarios.js'
import type {TaskArrangement} from '../../src/protocol/task-arrangement.js'
const task=(id:string,inputs:string[],outputs:string[],dependencies:string[]=[],review=false)=>({id,title:id,goal:id,role:review?'independent reviewer':id,inputs,outputs,dependencies,acceptance:'declared evidence',review})
export const validScenarioPlans:Record<string,TaskArrangement>={
 'simple-result':{mode:'single',rationale:'one result',independentReview:false,questions:[],tasks:[task('mean',['input.csv'],['mean.csv'])]},
 'independent-inputs':{mode:'parallel',rationale:'independent outputs',independentReview:false,questions:[],tasks:[task('left',['left.csv'],['left-summary.csv']),task('right',['right.csv'],['right-summary.csv'])]},
 'dependent-results':{mode:'chain',rationale:'requires cleaned output',independentReview:false,questions:[],tasks:[task('clean',['input.csv'],['clean.csv']),task('analyze',['clean.csv'],['metrics.csv'],['clean'])]},
 'independent-review':{mode:'science',rationale:'explicit review',independentReview:true,questions:[],tasks:[task('analyze',['input.csv'],['metrics.csv']),task('review',['metrics.csv'],[],['analyze'],true)]},
 'missing-information':{mode:'single',rationale:'ask for units',independentReview:false,questions:['请确认carbon列的单位'],tasks:[task('check',['input.csv'],[])]},
 'read-only-inspection':{mode:'single',rationale:'read only',independentReview:false,questions:[],tasks:[task('read',['notes.md'],[])]},
}
it('checks six distinct task requirements without treating three blocks as a default',()=>{
 const scenarios=arrangementScenarios();expect(scenarios).toHaveLength(6)
 expect(scenarios.map(s=>evaluateArrangement(s,validScenarioPlans[s.id]))).toEqual(scenarios.map(s=>expect.objectContaining({scenarioId:s.id,passed:true})))
 expect(evaluateArrangement(scenarios[0]!,validScenarioPlans['simple-result']).taskCount).toBe(1)
})
it('detects semantically wasteful decomposition even when the plan schema is valid',()=>{
 const p=structuredClone(validScenarioPlans['simple-result']!);p.mode='parallel';p.tasks.push(task('extra',['input.csv'],['extra.csv']))
 expect(evaluateArrangement(arrangementScenarios()[0]!,p)).toMatchObject({validStructure:true,passed:false})
})
it('requires separate declared units to map to distinct independent tasks',()=>{
 const p=structuredClone(validScenarioPlans['independent-inputs']!);p.tasks[0]!.inputs=['left.csv','right.csv'];p.tasks[0]!.outputs=['left-summary.csv','right-summary.csv'];p.tasks[1]!.inputs=[];p.tasks[1]!.outputs=[]
 expect(evaluateArrangement(arrangementScenarios()[1]!,p)).toMatchObject({validStructure:true,passed:false})
})
it('detects missing producer dependency and incomplete independent review coverage',()=>{
 const p=structuredClone(validScenarioPlans['dependent-results']!);p.tasks[1]!.dependencies=[]
 expect(evaluateArrangement(arrangementScenarios()[2]!,p).passed).toBe(false)
 const r=structuredClone(validScenarioPlans['independent-review']!);r.tasks.push(task('unchecked',['input.csv'],[]))
 expect(evaluateArrangement(arrangementScenarios()[3]!,r).passed).toBe(false)
})
it('reports review coverage separately from overall validity without inventing a review for other tasks',()=>{
 const scenarios=arrangementScenarios(),review=scenarios.find(s=>s.id==='independent-review')!
 expect(evaluateArrangement(review,validScenarioPlans['independent-review'])).toMatchObject({passed:true,reviewCovered:true})
 const unchecked=structuredClone(validScenarioPlans['independent-review']!);unchecked.tasks.push(task('unchecked',['input.csv'],[]))
 expect(evaluateArrangement(review,unchecked)).toMatchObject({validStructure:true,passed:false,reviewCovered:false})
 const absent=structuredClone(validScenarioPlans['simple-result']!);absent.mode='chain';absent.tasks[0]!.outputs=['metrics.csv']
 expect(evaluateArrangement(review,absent)).toMatchObject({validStructure:true,passed:false,reviewCovered:false})
 expect(evaluateArrangement(scenarios[0]!,validScenarioPlans['simple-result'])).toMatchObject({passed:true,reviewCovered:null})
 expect(evaluateArrangement(review,null)).toMatchObject({validStructure:false,reviewCovered:null})
})
it('requires clarification and forbids proposed write outputs in the read-only scenario',()=>{
 const p=structuredClone(validScenarioPlans['missing-information']!);p.questions=[]
 expect(evaluateArrangement(arrangementScenarios()[4]!,p).passed).toBe(false)
 const r=structuredClone(validScenarioPlans['read-only-inspection']!);r.tasks[0]!.outputs=['changed.md']
 expect(evaluateArrangement(arrangementScenarios()[5]!,r).passed).toBe(false)
})
it('rejects malformed/shared-write arrangements and does not mutate valid proposals',()=>{
 const s=arrangementScenarios()[1]!,p=structuredClone(validScenarioPlans['independent-inputs']!),before=structuredClone(p)
 evaluateArrangement(s,p);expect(p).toEqual(before)
 p.tasks[1]!.outputs=['left-summary.csv'];expect(evaluateArrangement(s,p)).toMatchObject({validStructure:false,passed:false})
 expect(evaluateArrangement(s,null)).toMatchObject({validStructure:false,passed:false})
})
