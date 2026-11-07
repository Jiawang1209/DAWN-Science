import type {RunOverview} from '../protocol/run-overview.js'
import {projectAgentObservation} from './agent-observation.js'
import {t,tf} from './i18n/index.js'
/** Shared metrics only; deliberately cannot fetch or compact any session. */
export function AgentObservation({snapshot,run,owner,details=false}:{snapshot:RunOverview;run:RunOverview['runs'][number];owner?:string|undefined;details?:boolean}){
 const {context:c,usage:u}=projectAgentObservation(snapshot,run,owner),s=c.sample
 return <span className="agent-observation" data-context-current={c.current}>
  <span className="agent-observation-row"><span>{c.label}</span><span className="agent-observation-number">{c.value}</span></span>
  {c.percent!==undefined?<span className="agent-context-bar" role="meter" aria-label={t("当前上下文估算占比")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.percent}><span style={{width:`${c.percent}%`}}/></span>:null}
  <span className="agent-observation-row"><span>{t("已结算累计")}</span><span className="agent-observation-number">{u.value}</span></span>
  {details?<details className="agent-observation-details"><summary>{t("查看观测来源与覆盖")}</summary>
   <span>{c.reason}</span>
   {s?<><span data-authored="1">{s.provider} / {s.model}</span><span>{tf("采样时间：{0}",Math.abs(s.observedAt)<=8.64e15?new Date(s.observedAt).toLocaleString():t("未知时间"))}</span>
    {!c.current&&s.availability==='available'?<span>{tf("历史最后值 · {0} tokens（非当前）",s.usedTokens.toLocaleString())}</span>:null}
    <span>{s.source==='sdk-estimate'?t("来源：SDK估算"):t("来源：未知")}</span>
    {s.contextWindow!==undefined?<span>{tf("模型容量：{0} tokens · 模型配置",s.contextWindow.toLocaleString())}</span>:<span>{t("模型容量未记录；不显示占比")}</span>}
    {s.composition?<span className="agent-composition"><strong>{t("组成估算 · 保留内容字节")}</strong><span>{tf("系统 {0} · 工具 {1} · 消息 {2} 字节",s.composition.systemBytes.toLocaleString(),s.composition.toolBytes.toLocaleString(),s.composition.messageBytes.toLocaleString())}</span><span>{t("不含隐藏推理；不是 token 分解或真实请求字节。")}</span></span>:null}
   </>:null}
   <span>{t("成员跨轮次、跨任务累计；仅已记录的结算输入与输出，不代表本任务费用。")}</span>
   {u.recorded?<span>{t("来源：宿主逐轮结算增量")}</span>:null}<span>{u.coverage}</span>{u.legacy?<span>{t("更早历史未覆盖；已知数值只是下界。")}</span>:null}
   <span>{tf("输入：{0} · 输出：{1}",u.input,u.output)}</span><span>{tf("缓存读取：{0}（单列）",u.cacheRead)}</span><span>{t("费用未记录")}</span>
  </details>:null}
 </span>
}
