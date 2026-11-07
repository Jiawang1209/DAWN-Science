import type {ReactNode} from "react"
import type {RunOverview} from "../protocol/run-overview.js"
import type {OutcomeAction,OutcomeArtifact,OutcomeView} from "./collaboration-outcome.js"
import {Button} from "./primitives.js"
import {msgid,t,tf} from "./i18n/index.js"
const states={active:msgid("协作进行中"),accepted:msgid("本轮成果已验收"),blocked:msgid("协作需要核对"),failed:msgid("执行未完成"),stopping:msgid("正在停止，等待执行排空"),history:msgid("历史记录，当前状态未核验"),unverified:msgid("当前成果尚未核验"),cancelled:msgid("协作已取消")}
const actions:Record<OutcomeAction,string>={"inspect-feedback":msgid("查看提交反馈"),"inspect-inputs":msgid("查看交接输入"),"inspect-findings":msgid("查看审阅产物"),"inspect-artifacts":msgid("查看验收成果"),"wait-for-drain":msgid("查看执行收尾"),"inspect-recovery":msgid("查看恢复检查")}
export function outcomeLabel(outcome:OutcomeView){return outcome.state==="active"&&outcome.pendingReview&&outcome.artifacts.length?t("分析阶段已验收，等待独立审阅"):t(states[outcome.state])}
function ArtifactCard({artifact,onInspect,inspection=false}:{artifact:OutcomeArtifact;onInspect:(key:string,action:OutcomeAction,trigger:HTMLButtonElement)=>void;inspection?:boolean}){
 const version=artifact.version
 return <div className="collaboration-outcome-file"><Button variant="outline" size="card-compact" className="collaboration-outcome-artifact" onClick={event=>onInspect(artifact.selectionKey,"inspect-artifacts",event.currentTarget)}>
  <span className="collaboration-outcome-artifact-head"><strong data-authored="1">{version.path}</strong><small>{inspection?t("留存版本，仅供检查"):artifact.scope==="final"?t("最终成果"):t("阶段产物")}</small></span>
  <span className="hint" data-authored="1">SHA256 {version.sha256.slice(0,12)}… · {tf("{0} 字节",version.bytes)}</span>
 </Button><details className="collaboration-outcome-version"><summary>{t("版本定位详情")}</summary><code data-authored="1">{version.versionId??t("宿主内容指纹")} · SHA256 {version.sha256}</code>
  <small className="hint" data-authored="1">{artifact.runId?tf("执行 {0} · 代次 {1}",artifact.runId,artifact.epoch??t("未知")):tf("任务 {0} · 尝试 {1}",artifact.taskId??t("未知"),artifact.attemptId??t("未知"))}</small>
 </details></div>
}
/** Presentation only. Acceptance, scopes and navigation locators come from the pure selector. */
export function CollaborationOutcomePanel({snapshot,outcome,onInspect,children,compact=false}:{snapshot:RunOverview;outcome:OutcomeView;onInspect:(key:string|undefined,action:OutcomeAction,trigger:HTMLButtonElement)=>void;children?:ReactNode;compact?:boolean}){
 const team=snapshot.team?.captainSessionId===snapshot.ownerSessionId?snapshot.team:undefined
 const stage=team?.pipeline?.stage
 const stageLabel=stage==="check"?t("数据核查"):stage==="analyze"?t("分析"):stage==="review"?t("独立审阅"):undefined
 const budget=snapshot.budget,known=(n:number|undefined)=>n===undefined?t("未知"):String(n)
 const nextAction=outcome.action?<div className="collaboration-outcome-next"><span className="hint">{outcome.actionTarget?t("下一步 · 查看对应任务的证据与记录"):t("下一步 · 查看会话执行记录")}</span><Button variant="outline" size="sm" onClick={event=>onInspect(outcome.actionTarget?.selectionKey,outcome.action!,event.currentTarget)}>{!outcome.actionTarget?t("查看会话执行记录"):outcome.state==="active"&&!outcome.blocker&&outcome.action==="inspect-feedback"?t("查看当前任务"):outcome.state==="active"&&outcome.pendingReview&&!outcome.blocker&&outcome.action==="inspect-findings"?t("查看审阅任务"):outcome.action==="inspect-artifacts"&&!outcome.artifacts.length?t("查看产物记录"):t(actions[outcome.action])}</Button></div>:null
 const artifacts=<div className="collaboration-outcome-artifacts"><h4>{t("验收成果与版本")}</h4>{outcome.artifacts.length?<div className="collaboration-outcome-files">{outcome.artifacts.map((artifact,i)=><ArtifactCard key={`${artifact.selectionKey}:${artifact.version.path}:${i}`} artifact={artifact} onInspect={onInspect}/>)}</div>:<p className="hint">{t("尚无本轮已验收成果。")}</p>}
   {outcome.inspectionArtifacts.length?<details><summary>{t("留存版本，仅供检查")}</summary><div className="collaboration-outcome-files">{outcome.inspectionArtifacts.map((artifact,i)=><ArtifactCard key={i} artifact={artifact} inspection onInspect={onInspect}/>)}</div></details>:null}
  </div>
 return <section className="collaboration-outcome" data-compact={compact} aria-label={t("协作成果")} data-outcome={outcome.state}>
  <div className="collaboration-outcome-goal"><span className="collaboration-eyebrow">{t("任务目标")}</span><h3 data-authored="1">{team?.goal||t("本会话协作")}</h3>{stageLabel?<span className="collaboration-stage">{tf("当前阶段 · {0}",stageLabel)}</span>:null}</div>
  <div className="collaboration-outcome-result"><h4>{outcomeLabel(outcome)}</h4><p className="hint">{outcome.state==="accepted"?t("验收对应宿主回执中的内容版本。"):outcome.state==="active"&&outcome.pendingReview?t("已有阶段产物；本轮交付仍待独立审阅通过。"):outcome.state==="history"?t("磁盘记录只读；查看不会启动或恢复任务"):outcome.state==="stopping"?t("停止请求已接收；当前执行的收尾尚未完成。"):outcome.state==="unverified"?t("保留的记录不作为本轮验收通过。"):outcome.state==="cancelled"?(outcome.drainVerified?t("宿主已核验执行排空。"):t("排空尚未核验，请检查执行记录。")):t("查看当前任务与宿主反馈，核对下一步。")}</p></div>
  {outcome.blocker?<div className="collaboration-outcome-blocker"><strong>{t("当前阻碍")}</strong><p data-authored="1">{outcome.blocker}</p></div>:null}
  {outcome.routeSync==="pending"||outcome.routeSync==="conflict"?<p className="collaboration-route-note" role="status">{outcome.routeSync==="pending"?t("路线回写待同步；与成果验收分别记录。"):t("路线回写存在冲突；与成果验收分别记录。")}</p>:null}
  {compact?<details className="collaboration-outcome-inspection"><summary>{t("展开成果版本与检查入口")}</summary>{nextAction}{artifacts}</details>:<>{nextAction}{artifacts}</>}
  <p className="hint collaboration-outcome-narrow-hint">{t("窄面板显示摘要；展开可查看完整目标和成果版本。")}</p>
  <div className="collaboration-outcome-footer"><p className="hint collaboration-outcome-budget">{budget?<>{budget.limits.maxRuns===undefined?t("执行轮次未设上限"):tf("普通可用 {0}",known(budget.ordinaryRemainingRuns))}{" · "}{!budget.limits.reserveReviewRuns&&!budget.reviewReservedRuns&&!budget.reviewRecoveryRuns?t("审阅预留未启用"):tf("审阅预留 {0}",known(budget.reviewReservedRuns))}{budget.reviewRecoveryRuns?<> · {tf("恢复待核对 {0}",budget.reviewRecoveryRuns)}</>:null}{" · "}{tf("在途 {0}",budget.inFlight)}</>:t("执行额度尚未记录")}{" · "}{t("费用未记录")}</p>{children}</div>
 </section>
}
