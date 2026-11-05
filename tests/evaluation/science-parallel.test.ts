import {expect,it} from 'vitest'
import {summarizeTaskIntervals,summarizeParallelPair,scienceBatchControl,assertWorkspaceLockExclusion} from '../../scripts/evaluate-science-parallel.js'

it('rejects an actual whole-workspace reservation overlapping any readonly holder, even with zero analysis-analysis overlap',()=>{
 expect(()=>assertWorkspaceLockExclusion([{paths:['*'],grantedAt:10,releasedAt:30},{paths:['input.csv'],grantedAt:20,releasedAt:40}])).toThrow(/workspace.*overlap/)
 expect(()=>assertWorkspaceLockExclusion([{paths:['*'],grantedAt:10}])).toThrow(/undrained/)
})
it('permits disjoint readonly overlap, sequential workspace grants and cancelled waiters',()=>{
 expect(assertWorkspaceLockExclusion([{paths:['a.csv'],grantedAt:0,releasedAt:10},{paths:['b.csv'],grantedAt:0,releasedAt:10},{paths:['*'],grantedAt:10,releasedAt:20},{paths:['waiting.csv']}])).toEqual({workspaceReservations:1,checkedReservations:3})
})

it('counts actual backend overlap separately from queue and lock waiting',()=>{
 const result=summarizeTaskIntervals([
  {taskId:'a',stage:'check',member:'check',queuedAt:0,backendStartedAt:10,endedAt:30},
  {taskId:'b',stage:'check',member:'check-2',queuedAt:0,backendStartedAt:20,endedAt:40},
  {taskId:'c',stage:'analyze',member:'analyze',queuedAt:25,backendStartedAt:40,endedAt:60},
 ])
 expect(result).toMatchObject({maxBackendConcurrent:2,actualOverlapMs:10,analysisOverlapMs:0})
 expect(result.overlaps).toEqual([{left:'a',right:'b',elapsedMs:10}])
})
it('does not invent backend execution from a queued attempt or unknown end',()=>{
 expect(summarizeTaskIntervals([{taskId:'waiting',stage:'analyze',member:'a',queuedAt:0,endedAt:20},{taskId:'unknown',stage:'review',member:'r',queuedAt:0,backendStartedAt:10}])).toMatchObject({maxBackendConcurrent:0,actualOverlapMs:0})
})
it('requires comparable accepted numeric outputs and reports slower bounded execution honestly',()=>{
 const serial={concurrency:1,comparisonFingerprint:'same',elapsedMs:100,modelRequests:26,groundTruthPassed:true,accepted:true,numericOutputs:[{n:5,mean:3,unit:'m'}]}
 const bounded={...serial,concurrency:2,elapsedMs:120}
 expect(summarizeParallelPair(serial,bounded)).toMatchObject({wallTimeDifferenceMs:20,serialToBoundedRatio:100/120,sameNumericOutputs:true,sameRequestCount:true})
 expect(()=>summarizeParallelPair(serial,{...bounded,comparisonFingerprint:'different'})).toThrow(/comparable/)
 expect(()=>summarizeParallelPair(serial,{...bounded,groundTruthPassed:false})).toThrow(/accepted/)
})

it('uses dedicated batch controls for actual cancellation and resumption',async()=>{
 const requested:string[]=[]
 const registry={getToolDefinition(name:string){requested.push(name);return{async execute(){if(!['resume_science_batch','cancel_science_batch'].includes(name))throw new Error('批量任务请使用 science_batch 专用入口');return{content:[{text:'batch control accepted'}]}}}}}
 for(const action of ['resume','cancel'] as const)await expect(scienceBatchControl(registry,action).execute(action,{})).resolves.toEqual({content:[{text:'batch control accepted'}]})
 expect(requested).toEqual(['resume_science_batch','cancel_science_batch'])
})
