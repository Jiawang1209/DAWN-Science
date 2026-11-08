import {adviseMode,type Mode,type ModeBrief} from '../orchestration/mode-advice.js'
const base:ModeBrief={blocks:3,dependency:'independent',sharedWrites:false,independentReview:false}
export function evaluateModeAdvice(){
 const cases:{id:string;brief:ModeBrief;expected:Mode|undefined;valid:boolean}[]=[
  {id:'small',brief:{...base,blocks:1},expected:'single',valid:true},
  {id:'independent-two',brief:{...base,blocks:2},expected:'parallel',valid:true},
  {id:'independent-eight',brief:{...base,blocks:8},expected:'parallel',valid:true},
  {id:'dependent',brief:{...base,dependency:'sequential'},expected:'chain',valid:true},
  {id:'shared-output',brief:{...base,sharedWrites:true},expected:'chain',valid:true},
  {id:'review',brief:{...base,independentReview:true},expected:'science',valid:true},
  {id:'explicit-single',brief:{...base,preferred:'single'},expected:'parallel',valid:true},
  {id:'explicit-chain',brief:{...base,preferred:'chain'},expected:'parallel',valid:true},
  {id:'unsafe-parallel',brief:{...base,preferred:'parallel',sharedWrites:true},expected:'chain',valid:false},
  {id:'review-cannot-downgrade',brief:{...base,preferred:'single',independentReview:true},expected:'science',valid:false},
  {id:'missing-blocks',brief:{...base,blocks:undefined},expected:undefined,valid:false},
  {id:'missing-dependencies',brief:{...base,dependency:'unknown'},expected:undefined,valid:false},
 ]
 const rows=cases.map(({id,brief,expected,valid})=>{const actual=adviseMode(brief);return{id,brief,expected,...actual,passed:actual.recommended===expected&&actual.valid===valid&&(!brief.independentReview||actual.reviewRequired)}})
 return{version:1,rows,modelRequests:0,limitations:['Deterministic planning-rule coverage only; no model execution or performance comparison.','Recommendations prepare a draft. Runtime tools and frozen contracts enforce execution.','Historical paid-model results and intermittent shutdown timeouts remain separate evidence.']}
}
