/** Planning advice only: no admission, state writes, model calls or authority changes. */
export type Mode='single'|'parallel'|'chain'|'science'
export interface ModeBrief {
 blocks:number|undefined
 dependency:'independent'|'sequential'|'unknown'
 sharedWrites:boolean
 independentReview:boolean
 preferred?:Mode|undefined
}
export type AdviceReason='blocks-required'|'dependencies-required'|'independent-review'|'one-block'|'shared-writes'|'ordered-steps'|'independent-blocks'|'review-conflict'|'parallel-conflict'
export function adviseMode(brief:ModeBrief){
 const reasons:AdviceReason[]=[]
 const validBlocks=Number.isSafeInteger(brief.blocks)&&brief.blocks!>=1&&brief.blocks!<=8
 if(!validBlocks)reasons.push('blocks-required')
 if(brief.dependency==='unknown')reasons.push('dependencies-required')
 if(reasons.length)return{recommended:undefined,selected:brief.preferred,reasons,valid:false,reviewRequired:brief.independentReview||brief.preferred==='science'}
 const recommended:Mode=brief.independentReview?'science':brief.blocks===1?'single':brief.sharedWrites||brief.dependency==='sequential'?'chain':'parallel'
 reasons.push(brief.independentReview?'independent-review':brief.blocks===1?'one-block':brief.sharedWrites?'shared-writes':brief.dependency==='sequential'?'ordered-steps':'independent-blocks')
 const selected=brief.preferred??recommended
 if(brief.independentReview&&selected!=='science')reasons.push('review-conflict')
 if(selected==='parallel'&&(brief.sharedWrites||brief.dependency!=='independent'))reasons.push('parallel-conflict')
 const valid=validBlocks&&brief.dependency!=='unknown'&&!reasons.includes('review-conflict')&&!reasons.includes('parallel-conflict')
 return{recommended,selected,reasons,valid,reviewRequired:brief.independentReview||selected==='science'}
}
