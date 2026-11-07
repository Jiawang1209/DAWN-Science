import {CollaborationEvidence} from './collaboration-evidence.js'
import type {WorkbenchClient} from './client.js'
import type {TeamSnapshot} from '../protocol/index.js'
import {ScienceAcceptanceStatus} from './science-acceptance-status.js'
import {t,tf} from './i18n/index.js'
type Task=TeamSnapshot['tasks'][number]
export function CollaborationTaskDetail({task,tab,client,sessionId,teamId,inspectToolRecord}:{inspectToolRecord?:boolean;teamId?:string|undefined;task:Task;tab:string;client?:WorkbenchClient|undefined;sessionId?:string|undefined}){
 const settled=task.status==='completed'||task.status==='failed'
 const receipt=settled?task.receipt:undefined
 return <div className="collaboration-team-task" data-task-detail={task.id}>
  {tab==='process'?<><p data-authored="1">{task.description??task.subject}</p><p>{tf("任务状态：{0}",task.status)}</p><p>{tf("依赖：{0}",task.dependencies.join(' · ')||t("没有前置"))}</p>{task.output?<pre data-authored="1">{task.output}</pre>:<p className="hint">{t("还没有结果")}</p>}</>:null}
  {tab==='handoff'?<><p>{task.contract?t("已冻结任务契约"):t("普通委派任务")}</p>{task.contract?<><p data-authored="1">{tf("契约输入 {0} 项 · 声明输出 {1} 项",task.contract.inputs.length,task.contract.outputs.length)}</p><p className="hint">{t("冻结契约决定执行边界；查看不会批准、改写或重启任务。")}</p></>:null}</>:null}
  {tab==='artifacts'?<><p>{receipt?.state==='accepted'?t("宿主验收通过"):receipt?.state==='blocked'?t("宿主验收阻塞"):receipt?.state==='invalid'?t("宿主验收未通过"):t("暂无宿主验收回执")}</p>
   <p className="hint">{t("声明产物与验收版本分别列出；历史版本不代表当前文件仍有效。")}</p>
   {task.artifacts?.length?<ul>{task.artifacts.map(file=><li key={file} data-authored="1">{file} · {t("声明产物")}</li>)}</ul>:null}
   {receipt?.versions?.outputs.length?<ul>{receipt.versions.outputs.map(file=><li key={file.path} data-authored="1">{file.path}<details><summary>{t("内容版本")}</summary><code>{file.sha256}</code></details></li>)}</ul>:null}
   <ScienceAcceptanceStatus tasks={settled?[task]:[]}/>
  </>:null}
  {tab==='records'?<><details className="collaboration-execution-id"><summary>{tf("第 {0} 次",task.attempt)} <span>{t("执行标识")}</span></summary><code data-authored="1">{task.id} · {task.attemptId??t("无代次标识")}</code></details>{receipt?.reason?<p data-authored="1">{receipt.reason}</p>:null}</>:null}
  {client&&sessionId&&(task.status==='completed'||task.status==='failed')&&(tab==='artifacts'||tab==='records')?<CollaborationEvidence key={`${sessionId}:${task.id}:${task.attemptId}`} client={client} sessionId={sessionId} receipt={receipt} trace={task.trace} observation={task.observation} tab={tab} target={inspectToolRecord&&teamId&&task.attemptId?{kind:"task",teamId,id:task.id,attemptId:task.attemptId}:undefined}/>:null}
 </div>
}
