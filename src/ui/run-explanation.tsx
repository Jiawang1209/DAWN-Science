import type {RunOverview} from '../protocol/run-overview.js'
import type {ExecutionStage,RunEvent} from '../protocol/run-explanation.js'
import {t,tf} from './i18n/index.js'
export function stageLabel(stage:ExecutionStage){
 switch(stage){case 'lock-wait':return t("等待产物锁");case 'preflight':return t("核验冻结输入");case 'execution':return t("后端执行");case 'acceptance':return t("宿主验收")}
}
export function eventLabel(event:RunEvent){
 switch(event.type){
 case 'registered':return t("建立子任务");case 'queued':return t("进入调度队列");case 'started':return t("开始执行");
 case 'stage':return event.stage?stageLabel(event.stage):t("阶段更新");case 'cancel-requested':return t("已请求停止");
 case 'settled':return t("执行已结算");case 'recovered':return t("重启后暂停，等待核对");case 'budget-configured':return t("预算限制已调整");case 'budget-blocked':return t("预算阻止继续执行")
 }
}
export function RunActivity({run,live,compact=false}:{run:RunOverview['runs'][number];live:boolean;compact?:boolean}){
 const activity=run.activity
 return <>
  {activity?<div className="run-activity">
   <p>{live?stageLabel(activity.stage):tf("历史阶段：{0}；当前占用未知",stageLabel(activity.stage))}</p>
   {activity.stage==='lock-wait'?<>
    {activity.resources?.map(path=><p data-authored="1" key={path}>{path==='*'?t("等待工作区独占执行"):path}</p>)}
    {activity.blockers?.map(owner=><p data-authored="1" key={`${owner.ownerSessionId}:${owner.childId}:${owner.epoch}`}>{compact?tf("{0} · 代次 {1}",owner.label,owner.epoch):tf("{0} · 代次 {1} · 会话 {2}",owner.label,owner.epoch,owner.ownerSessionId)}</p>)}
    {activity.unknownBlockers?<p>{t("部分占用者身份未知")}</p>:null}
   </>:null}
  </div>:null}
  {run.timing&&!compact?<p>{tf("已结算耗时：锁等待 {0} 秒 · 输入核验 {1} 秒 · 执行 {2} 秒 · 验收 {3} 秒",...(['lockWaitMs','preflightMs','executionMs','acceptanceMs'] as const).map(key=>((run.timing?.[key]??0)/1000).toFixed(2)))}</p>:null}
 </>
}
export function RunHistory({snapshot}:{snapshot:RunOverview}){
 const history=snapshot.history
 if(!history)return null
 const names=new Map(snapshot.runs.map(run=>[run.id,run.label]))
 return <details className="run-history"><summary>{t("关键执行历史")}</summary>
  {history.truncated?<p>{t("较早历史已省略；显示最近 256 条")}</p>:null}
  {history.events.length===0?<p>{t("暂无可核验历史；旧记录不倒推")}</p>:<ol>{history.events.map(event=><li key={event.seq}>
   <time>{new Date(event.at).toLocaleTimeString()}</time>{' · '}<span>{eventLabel(event)}</span>
   {event.childId?<span data-authored="1">{` · ${names.get(event.childId)??event.childId} · ${event.epoch??0}`}</span>:null}
   {event.receipt?<span>{event.receipt==='accepted'?t(" · 宿主验收通过"):event.receipt==='blocked'?t(" · 宿主验收阻塞"):t(" · 宿主验收未通过")}</span>:null}
  </li>)}</ol>}
 </details>
}
