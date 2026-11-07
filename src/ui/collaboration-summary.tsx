import type {WorkbenchClient} from './client.js'
import {useRunOverview} from './use-run-overview.js'
import {collaborationCounts,runStatus} from './collaboration-model.js'
import {对话图标} from './icons.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
export function CollaborationSummary({client,sessionId,onOpen}:{client:WorkbenchClient;sessionId:string;onOpen:()=>void}){
 const{snapshot,error}=useRunOverview(client,sessionId)
 if(error)return <div className="collaboration-summary"><Button variant="ghost" size="sm" onClick={onOpen}>{t("协作状态读取失败，打开查看")}</Button></div>
 if(!snapshot||!snapshot.runs.length)return null
 const c=collaborationCounts(snapshot),active=snapshot.runs.find(r=>r.phase==='stopping')??snapshot.runs.find(r=>r.phase==='running')??snapshot.runs.find(r=>r.phase==='queued')
 return <div className="collaboration-summary"><Button variant="ghost" size="sm" onClick={onOpen} aria-label={tf("打开协作：{0} 项任务 · {1} 项验收通过",c.total,c.accepted)}>
  <对话图标 className="collaboration-mark"/><strong>{t("协作")}</strong>
  <span>{snapshot.source!=='live'?t("历史记录"):active?runStatus(active,true):snapshot.budget?.blocked?t("额度阻止继续执行"):snapshot.runs.some(r=>r.phase==='unknown')?t("历史记录"):snapshot.runs.every(r=>r.phase==='drained')?t("执行已结算"):t("尚未执行")}</span>
  <span className="collaboration-summary-count">{tf("{0} 项任务 · {1} 项验收通过",c.total,c.accepted)}</span><span aria-hidden="true">›</span>
 </Button></div>
}
