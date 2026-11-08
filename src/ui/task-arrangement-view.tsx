import {parseTaskArrangement} from '../protocol/task-arrangement.js'
import {t,tf} from './i18n/index.js'
export function arrangementModeLabel(mode:string){switch(mode){case'single':return t("单任务");case'parallel':return t("并行委派");case'chain':return t("串行交接");default:return t("科研流水线")}}
export function TaskArrangementView({markdown}:{markdown:string}){
 const read=parseTaskArrangement(markdown)
 if(read.state==='absent')return null
 if(read.state==='invalid')return <p role="alert">{t("任务安排需要修正")}：<span data-authored="1">{read.reason}</span></p>
 const plan=read.arrangement
 return <section className="task-arrangement-result" aria-label={t("任务安排结果")}>
  <header><strong><output aria-label={t("任务块数")}>{tf("{0} 个任务块",plan.tasks.length)}</output></strong><span>{arrangementModeLabel(plan.mode)}</span></header>
  <p data-authored="1">{plan.rationale}</p>
  <p className="hint">{t("这是方案中的任务划分，不代表已启动这些 Agent。")}</p>
  <ol>{plan.tasks.map(task=><li key={task.id} data-arrangement-task={task.id}>
   <header><strong data-authored="1">{task.title}</strong>{task.review?<span>{t("独立审阅")}</span>:null}</header>
   <p data-authored="1">{task.goal}</p><p><small>{t("分工")}：</small><span data-authored="1">{task.role}</span></p>
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
