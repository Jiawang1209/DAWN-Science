import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {prepareApprovedReviewReservations,approvedReviewAdmission,resumeApprovedReviewReservations,releaseApprovedReviewReservations} from '../../src/team/approved-plan-budget.js'
import type {团队} from '../../src/team/types.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
function setup(maxRuns:number){const root=mkdtempSync(join(tmpdir(),'dawn-plan-budget-'));roots.push(root);const service=new OrchestrationService(new OrchestrationStore(root,'owner'),4);service.configureBudget({maxRuns,reserveReviewRuns:true},0);const team:团队={id:'plan_'+'a'.repeat(24),name:'approved',goal:'goal',captainSessionId:'owner',createdAt:1,members:[],tasks:['work','review'].map(id=>({id,subject:id,status:'pending',assignee:id,dependencies:id==='review'?['work']:[],attempt:0,createdAt:1,updatedAt:1})),messages:[],taskSeq:0,approvedPlan:{version:1,owner:'owner',planId:'p',planVersion:1,markdownHash:'b'.repeat(64),teamId:'plan_'+'a'.repeat(24),externalInputs:[],tasks:['work','review'].map(id=>({taskId:id,planTaskId:id,memberName:id,review:id==='review'}))}};return{service,team}}
it('uses the existing ledger to reserve one review turn while workers consume general budget',async()=>{
 const{service,team}=setup(2)
 try{prepareApprovedReviewReservations(team,service);expect(service.budgetSnapshot().reviewReservedRuns).toBe(1);expect(approvedReviewAdmission(team,'work',service)).toBeUndefined();expect(approvedReviewAdmission(team,'review',service)?.stage).toBe('review');prepareApprovedReviewReservations(team,service);expect(service.budgetSnapshot().reviewReservedRuns).toBe(1)}finally{await service.close()}
})
it('does not start an arrangement whose remaining tasks cannot fit beside its review reserve',async()=>{
 const{service,team}=setup(1)
 try{expect(()=>prepareApprovedReviewReservations(team,service)).toThrow(/预算/);expect(service.budgetSnapshot().reviewReservedRuns).toBe(0)}finally{await service.close()}
})
it('a recovered review hold requires explicit revalidation before it becomes spendable',async()=>{
 const{service,team}=setup(2);prepareApprovedReviewReservations(team,service);const root=service.store.sessionDir;await service.close()
 const recovered=new OrchestrationService(new OrchestrationStore(root,'owner'),4)
 try{expect(()=>prepareApprovedReviewReservations(team,recovered)).toThrow(/恢复/);resumeApprovedReviewReservations(team,recovered);expect(()=>prepareApprovedReviewReservations(team,recovered)).not.toThrow()}finally{await recovered.close()}
})
it('ending drained work releases the unused hold without refunding any consumed runs',async()=>{
 const{service,team}=setup(2)
 try{prepareApprovedReviewReservations(team,service);team.finishedAt=Date.now();releaseApprovedReviewReservations(team,service);expect(service.budgetSnapshot().reviewReservedRuns).toBe(0);expect(service.budgetSnapshot().consumedRuns).toBe(0)}finally{await service.close()}
})
