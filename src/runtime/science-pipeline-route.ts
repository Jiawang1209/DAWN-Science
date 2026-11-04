/** Compare-and-swap projection of already validated child facts, never model prose. */
import type {团队} from '../team/types.js'
import type {AnalysisRouteBook} from './analysis-route-book.js'
export function projectPipelineRoute(book:AnalysisRouteBook,team:团队):'pending'|'applied'|'conflict' {
 const p=team.pipeline;if(!p||p.status!=='completed')return'pending'
 const current=book.read();if(!current||current.routeId!==p.definition.route.routeId)return'conflict'
 const analysis=[...p.taskIds].reverse().map(id=>team.tasks.find(t=>t.id===id)).find(t=>t?.contract?.resultType==='model-metrics'&&t.receipt?.state==='accepted')
 const review=team.tasks.find(t=>t.id===p.currentTaskId)
 if(!analysis?.receipt?.result||review?.receipt?.state!=='accepted'||review.receipt.result?.data?.kind!=='review'||review.receipt.result.data.verdict!=='pass')return'conflict'
 const step=current.steps.find(s=>s.id===p.definition.stepId);if(!step)return'conflict'
 const marker=`[science-pipeline:${team.id}:${analysis.id}:${review.id}]`
 const verification={...review.receipt.result.verification,note:`${marker} ${review.receipt.result.verification.note}`}
 if(step.notes.includes(marker)&&step.status==='delivered'&&step.verification.note===verification.note&&analysis.receipt.result.deliverables.every(d=>step.deliverables.some(old=>old.path===d.path)))return'applied'
 if(current.revision!==p.definition.route.revision)return'conflict'
 const {routeId:_id,revision,updatedAt:_time,...draft}=current
 const target=draft.steps.find(s=>s.id===p.definition.stepId)!
 target.status='delivered';target.blockers=[];target.deliverables=analysis.receipt.result.deliverables
 target.execution={...analysis.receipt.result.execution,note:`${marker} ${analysis.receipt.result.execution.note}`}
 target.verification=verification;target.needsReview=false;target.notes=[...target.notes,marker,'交付事实来自子任务宿主回执；工具与格式验收不等于科学认证。']
 book.replace(revision,draft,'科研流程已完成，按冻结路线版本写回宿主验收事实')
 return'applied'
}
