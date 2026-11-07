/** Synthetic research pilot only: a model request reserve, not the product's token/run budget. */
import type {EvaluationQuota} from './evaluation-request-gate.js'
import type {ResearchTrial} from './evaluate-research.js'

export const RESEARCH_STAGE_PROVIDERS={work:'dawn-evaluation-work',review:'dawn-evaluation-review'} as const
export const RESEARCH_STAGE_LIMITS=Object.freeze({work:11,review:4})
export function researchBudgetTrial(arm:EvaluationQuota,mode:'single'|'multi',model:string):ResearchTrial{
 const base={credential:arm.token,requests:()=>arm.stats().forwarded,stats:arm.stats,close:arm.close}
 if(mode==='single')return base
 if(arm.stats().limit!==RESEARCH_STAGE_LIMITS.work+RESEARCH_STAGE_LIMITS.review)throw new Error('Staged pilot requires the approved 15-request arm')
 const work=arm.partition(RESEARCH_STAGE_LIMITS.work),review=arm.partition(RESEARCH_STAGE_LIMITS.review)
 const workRoute={provider:RESEARCH_STAGE_PROVIDERS.work,model,credential:work.token}
 return{...base,stageRoutes:{check:workRoute,analyze:workRoute,review:{provider:RESEARCH_STAGE_PROVIDERS.review,model,credential:review.token}},
 stageStats:()=>({work:work.stats(),review:review.stats()}),
 stageGuidance:stage=>{
  const quota=stage==='review'?review.stats():work.stats()
  return stage==='review'
   ?`评测审阅独享最多 4 次模型请求，当前剩余 ${Math.max(0,quota.limit-quota.reserved)} 次。先真实读取全部声明输入，尽可能并行读取，再基于证据正式提交。不得省略独立审阅或猜测 ID。`
   :`评测核查与分析共享最多 11 次模型请求，当前剩余 ${Math.max(0,quota.limit-quota.reserved)} 次；另 4 次只留给独立审阅，不可借用。只做本阶段契约要求的工作，避免读取未生成产物或重复无关检查。必要证据齐备后及时提交；不足时如实阻塞，不能伪造结果。`
 }}
}
