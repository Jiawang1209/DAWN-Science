/** Revalidate persisted handoff links before aggregating or publishing a completed batch. */
import {validateAcceptanceReceipt} from './science-acceptance.js'
import type {团队} from './types.js'
import {sameFileVersions} from '../protocol/file-versions.js'
export function acceptedBatchFacts(team:团队){
 const b=team.scienceBatch;if(!b)throw new Error('当前不是批量任务')
 return b.items.map(item=>{
  const p=item.completed
  if(p?.status!=='completed')throw new Error('批量项未全部验收')
  const analysis=[...p.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)).find(t=>t?.contract?.resultType==='model-metrics'&&t.receipt?.state==='accepted'),review=team.tasks.find(t=>t.id===p.currentTaskId)
  if(!analysis?.receipt?.versions||!analysis.receipt.result||!review?.receipt?.versions||review.receipt.state!=='accepted'||review.receipt.result?.data?.kind!=='review'||review.receipt.result.data.verdict!=='pass'||!sameFileVersions(analysis.receipt.versions.outputs,review.receipt.versions.inputs))throw new Error('批量分析与独立审阅缺少匹配的内容版本回执')
  if(validateAcceptanceReceipt(analysis.contract,analysis.receipt).state!=='accepted')throw new Error('批量项宿主可执行验收证明不匹配')
  return{item,analysis,review}
 })
}
