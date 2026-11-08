import type {RunOverview} from '../protocol/run-overview.js'
import {t,tf} from './i18n/index.js'
import {stageLabel} from './run-explanation.js'
export type Run=RunOverview['runs'][number]
export function runStatus(run:Run,live:boolean){
 if(!live||run.phase==='unknown')return t("历史快照；当前进程状态未知")
 if(run.phase==='stopping')return t("停止中，等待进程排空")
 if(run.phase==='queued')return t("等待统一编排调度")
 if(run.phase==='running')return run.activity?stageLabel(run.activity.stage):t("执行中；内部等待原因未知")
 if(run.state==='interrupted')return t("执行已中断；恢复前需核对产物")
 if(run.state==='cancelled')return run.phase==='drained'&&run.epoch>0&&run.resultEpoch===run.epoch?t("已取消并排空"):t("已取消，排空尚未核验")
 if(run.state==='failed')return t("执行失败")
 if(run.state==='completed')return t("执行完成")
 return t("尚未执行")
}
export {hasCurrentSettlement,hasCurrentAcceptance,collaborationTaskKey} from '../protocol/collaboration-settlement.js'
import {hasCurrentSettlement,hasCurrentAcceptance} from '../protocol/collaboration-settlement.js'
export function acceptance(run:Run){if(!hasCurrentSettlement(run))return t("暂无宿主验收回执");return run.receipt==='accepted'?(hasCurrentAcceptance(run)?t("宿主验收通过"):t("暂无宿主验收回执")):run.receipt==='blocked'?t("宿主验收阻塞"):run.receipt==='invalid'?t("宿主验收未通过"):t("暂无宿主验收回执")}
export function collaborationCounts(snapshot:RunOverview){
 return{total:snapshot.runs.length,accepted:snapshot.source==='live'?snapshot.runs.filter(hasCurrentAcceptance).length:0,active:snapshot.source==='live'?snapshot.runs.filter(r=>r.phase==='running'||r.phase==='queued'||r.phase==='stopping').length:0}
}
/** Settled stage durations only. updatedAt is not a start time. */
export function settledDuration(run:Run){
 if(!run.timing)return t("耗时未知")
 const ms=Object.values(run.timing).reduce<number>((a,b)=>a+(b??0),0)
 return tf("累计结算 {0} 秒",(ms/1000).toFixed(1))
}
