import type {方案} from '../protocol/plan.js'
import {parseTaskArrangement} from '../protocol/task-arrangement.js'
import {t,tf} from './i18n/index.js'
export function arrangementModeLabel(mode:string){switch(mode){case'single':return t("单任务");case'parallel':return t("并行委派");case'chain':return t("串行交接");default:return t("科研流水线")}}
export function TaskArrangementView({markdown,status='proposed'}:{markdown:string;status?:方案['status']}){
 const read=parseTaskArrangement(markdown)
 if(read.state==='absent')return null
 if(read.state==='invalid')return <p role="alert">{t("任务安排需要修正")}：<span data-authored="1">{read.reason}</span></p>
 const plan=read.arrangement
 const note=status==='approved'
  ?plan.dispatch?t("方案已批准，任务与执行范围已冻结；实际执行与验收以协作记录为准。"):t("方案已批准；实际执行与验收以协作记录为准。")
  :status==='superseded'?t("这版方案已被替代；不会据此启动新的执行。")
  :status==='discarded'?t("这版方案未采用；不会据此启动执行。")
  :plan.dispatch?t("采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。"):t("这是方案中的任务划分，不代表已启动这些 Agent。")
 return <section className="task-arrangement-result" data-plan-status={status} aria-label={t("任务安排结果")}>
  <header><strong><output aria-label={t("任务块数")}>{tf("{0} 个任务块",plan.tasks.length)}</output></strong><span>{arrangementModeLabel(plan.mode)}</span></header>
  <p data-authored="1">{plan.rationale}</p>
  <p className="hint task-arrangement-state">{note}</p>
  <ol>{plan.tasks.map(task=><li key={task.id} data-arrangement-task={task.id}>
   <header><strong data-authored="1">{task.title}</strong>{task.review?<span>{t("独立审阅")}</span>:null}</header>
   <p data-authored="1">{task.goal}</p><p><small>{t("分工")}：</small><span data-authored="1">{task.role}</span></p>
   {task.execution?<p><small>{t("执行者")}：</small><span data-authored="1">{task.execution.agent}</span><span className="hint"> · {task.execution.contract.access==='read-only'?t("只读"):task.execution.contract.access==='workspace-write'?t("限定产物写入"):t("允许执行，受现有权限控制")}</span></p>:null}
   <small data-authored="1">{t("依赖")}：{task.dependencies.map(id=>plan.tasks.find(t=>t.id===id)?.title??id).join(' · ')||t("没有前置")}</small>
   <details><summary>{t("文件与验收条件")}</summary><dl>
    <dt>{t("输入")}</dt><dd data-authored="1">{task.inputs.join(' · ')||t("未声明文件")}</dd>
    <dt>{t("输出")}</dt><dd data-authored="1">{task.outputs.join(' · ')||t("未声明文件")}</dd>
    <dt>{t("验收")}</dt><dd data-authored="1">{task.acceptance}</dd>
   </dl></details>
  </li>)}</ol>
  {plan.questions.length?<><h4>{t("待确认事项")}</h4><ul>{plan.questions.map((q,i)=><li key={i} data-authored="1">{q}</li>)}</ul></>:null}
 </section>
}
