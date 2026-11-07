import type {RunOverview} from '../protocol/run-overview.js'
import {t,tf} from './i18n/index.js'
import {handoffRouteLines} from './handoff-route.js'
export function CollaborationHandoff({run}:{run:RunOverview['runs'][number]}){return <>{run.handoff?<details className="run-handoff"><summary>{tf("已冻结交接：{0} 条正文 · {1} 字节",run.handoff.entries.length,run.handoff.bytes)}</summary>
      <p>{tf("来源会话：{0}",run.handoff.sourceSessionId)}</p><code>{run.handoff.sha256}</code>
      <p className="hint">{t("仅包含选中的正文；不含工具结果、思考、图片或额外权限")}</p>
      {run.handoff.entries.map(entry=><div key={entry.id}><small>{entry.role} · {entry.id}</small><pre data-authored="1">{entry.text}</pre></div>)}
      {run.handoff.version===2?<>
       <p className="hint">{t("路线仅是记录，不代表批准；历史版本尚未重新核验，不授予额外权限")}</p>
       <p>{tf("历史证据引用 {0} 项 · 交接总计 {1} 字节",run.handoff.references.length,run.handoff.envelopeBytes)}</p>
       {run.handoff.references.map((ref,i)=><div key={i}>{ref.kind==='route'?<>
        <small>{tf("路线 {0} · 修订 {1} · 步骤 {2}",ref.routeId,ref.revision,ref.stepId)}</small>
        {handoffRouteLines(ref.text).map((line,n)=><p key={n} data-authored="1">{line}</p>)}
        <details><summary>{t("查看引用原文")}</summary><pre data-authored="1">{ref.text}</pre></details>
       </>:<>
        <small>{tf("历史验收任务 {0} · 执行代次 {1}",ref.childId,ref.epoch)}</small>
        {ref.versions.outputs.map(file=><p key={file.path} data-authored="1">{file.path} · {file.sha256}</p>)}
       </>}</div>)}
      </>:null}
    </details>:run.handoffIssue?<p role="alert" data-authored="1">{run.handoffIssue}</p>:null}{!run.handoff&&!run.handoffIssue?<p className="hint">{t("这项任务没有冻结的对话交接")}</p>:null}</>}
