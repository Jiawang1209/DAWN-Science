import type { AnalysisRoute, AnalysisRouteEvidence, RouteAction, RouteStep } from '../protocol/analysis-route.js'
import { localizedRouteBlockers } from './state/analysis-route.js'
import { mapStateLabel } from './analysis-route-map.js'
import { routeMapState } from './route-map-model.js'
import type { RouteTab } from './state/route-navigation.js'
import { 勾图标 } from './icons.js'
import { Button } from './primitives.js'
import { 类型图标 } from './files.js'
import { 文件类按名字 } from './file-kind.js'
import { 详情地址 } from './case-cards.js'
import { t, tf } from './i18n/index.js'

export const routeProgress = (status: RouteStep['status']) => ({
  pending:t("待开始"), in_progress:t("进行中"), blocked:t("已阻塞"), delivered:t("已交付"), skipped:t("已跳过"),
})[status]
const execution = (state: RouteStep['execution']['state']) => ({
  not_run:t("未运行"), partial:t("部分运行"), completed:t("记录为运行完成"), failed:t("运行失败"),
})[state]
const review = (state: RouteStep['verification']['state']) => ({
  unreviewed:t("未审查"), reviewed:t("记录为已审查"), issues:t("审查发现问题"),
})[state]
const fileFact = (state: AnalysisRouteEvidence['deliverables'][number]['state']) => ({
  observed:t("观察到工具生成"), exists:t("文件存在"), missing:t("文件缺失"), unknown:t("存在性未知"),
})[state]
type Selection = {server:string;caseId:string}

export function AnalysisRouteStep({route,step,tab,onTab,historical,locked,evidence,roots,rootsError,onRetryRoots,onAction,onFile,onOpenWeb,onTool,canLocateTool,workingStepId,awaitingInput}: {
  workingStepId:string|undefined; awaitingInput:boolean
  route:AnalysisRoute; step:RouteStep; tab:RouteTab; onTab:(tab:RouteTab)=>void
  historical:boolean; locked:boolean; evidence:AnalysisRouteEvidence|undefined
  roots:Record<string,string>; rootsError:string|undefined; onRetryRoots:()=>void
  onAction:(action:RouteAction,selection?:Selection)=>void; onFile:(path:string)=>void
  onOpenWeb:(url:string)=>void; onTool:((id:string)=>void)|undefined
  canLocateTool:((id:string)=>boolean)|undefined
}) {
  const blockers = localizedRouteBlockers(route,step.id)
  const observed = (historical ? [] : evidence?.tools ?? []).filter(tool=>tool.stepId===step.id)
  const selected = step.cases.find(candidate=>candidate.server===step.selectedCase?.server && candidate.caseId===step.selectedCase?.caseId)
  const finished = step.status==='delivered' || step.status==='skipped'
  const groups = [
    {label:t("报告"),kinds:['markdown','text']}, {label:t("图表"),kinds:['image','pdf']},
    {label:t("数据"),kinds:['table']}, {label:t("复现脚本"),kinds:['code','shell','notebook']},
    {label:t("其他文件"),kinds:[]},
  ]
  const known = new Set(groups.flatMap(group=>group.kinds))
  const fileRow = (file:RouteStep['deliverables'][number]) => <li key={file.path}>
    <Button variant="ghost" className="route-file-row" aria-label={file.path} onClick={()=>onFile(file.path)}>
      <类型图标 类={文件类按名字(file.path, "file")}/>
      <span className="route-file-label"><span className="route-file-name">{file.path.split('/').pop()}</span></span>
      <span aria-hidden="true">›</span>
    </Button>
    <span className="route-file-fact">{historical ? t("历史文件引用（未保存当时文件事实）") : fileFact(evidence?.deliverables.find(fact=>fact.stepId===step.id && fact.path===file.path)?.state ?? 'unknown')}</span>
    {file.note ? <details className="route-file-note"><summary>{t("文件说明")}</summary><p>{file.note}</p></details> : null}
  </li>
  return <>
    <div className="route-detail-heading">
      <h3>{step.title}</h3>
      <span className="route-status">{mapStateLabel(routeMapState(route,step,workingStepId,awaitingInput))}</span>
    </div>
    <p className="route-purpose">{step.purpose}</p>
    <div className="route-performer"><span className="route-agent-avatar" aria-hidden="true">D</span>{t("执行者 · 主 Agent")}</div>
    {!historical ? <div className="route-actions">
      {!finished ? <Button size="sm" disabled={locked || blockers.length>0} onClick={()=>onAction('continue')}>{t("继续这一步")}</Button> : null}
      <Button size="sm" variant="ghost" disabled={locked || step.status==='in_progress'} onClick={()=>onAction(step.status==='skipped'||step.status==='delivered'?'restore':'skip')}>{step.status==='skipped'||step.status==='delivered'?t("恢复此步"):t("跳过此步")}</Button>
    </div> : null}
    {blockers.length>(finished ? 1 : 0) ? <details className="route-blockers" open={!finished}>
      <summary>{t("继续前需处理")}</summary><ul>{blockers.map(text=><li key={text}>{text}</li>)}</ul>
    </details> : null}
    <div className="route-detail-tabs" role="tablist" aria-label={t("步骤内容")} onKeyDown={event=>{
      const tabs=['log','files'] as const
      const index=tab==='files'?1:0
      const next=event.key==='ArrowRight'||event.key==='ArrowLeft' ? (index+1)%2 : event.key==='Home' ? 0 : event.key==='End' ? 1 : undefined
      if(next===undefined)return
      event.preventDefault();onTab(tabs[next]!);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
    }}>
      {(['log','files'] as const).map(item=><Button key={item} id={`route-tab-${item}`} variant="ghost" role="tab" aria-selected={item==='files'?tab==='files':tab!=='files'} aria-controls="route-step-panel" onClick={()=>onTab(item)}>{item==='files'?tf("本步产物 {0}",step.deliverables.length):t("执行动态")}</Button>)}
    </div>
    <div id="route-step-panel" role="tabpanel" aria-labelledby={`route-tab-${tab==='files'?'files':'log'}`}>
      {tab==='files' ? <div className="route-deliverables">
        {step.deliverables.length===0 ? <p className="caveat">{t("尚无交付文件")}</p> : groups.map(group=>{
          const files=step.deliverables.filter(file=>group.kinds.length ? group.kinds.includes(文件类按名字(file.path, "file")) : !known.has(文件类按名字(file.path, "file")))
          if(!files.length) return null
          const pdfs=files.filter(file=>/\.pdf$/i.test(file.path))
          const foldPdf=pdfs.length>0 && pdfs.length<files.length
          return <section className="route-file-group" key={group.label}>
            <h3>{group.label}<span>{files.length}</span></h3>
            <ul>{(foldPdf?files.filter(file=>!pdfs.includes(file)):files).map(fileRow)}</ul>
            {foldPdf ? <details><summary>{tf("PDF 版本 · {0} 个文件",pdfs.length)}</summary><ul>{pdfs.map(fileRow)}</ul></details> : null}
          </section>
        })}
      </div> : <div className="route-evidence">
        <div className="route-event"><span className="route-agent-avatar" aria-hidden="true">D</span><div>
          <div className="route-event-head"><strong>{t("主 Agent")}</strong><span>{t("Agent 执行记录")}</span></div>
          <p>{execution(step.execution.state)} · {step.execution.note}</p>
          {step.deliverables.slice(0,1).map(file=><Button key={file.path} size="sm" variant="outline" className="route-event-file" aria-label={file.path} onClick={()=>onFile(file.path)}><类型图标 类={文件类按名字(file.path,"file")}/>{file.path.split('/').pop()}</Button>)}
        </div></div>
        {!historical?<div className="route-event"><span className="route-agent-avatar route-observed-avatar" aria-hidden="true"><勾图标/></span><div>
          <div className="route-event-head"><strong>{t("应用观察到的工具事实")}</strong></div>
          <p>{observed.some(tool=>tool.execution==='ran'||tool.execution==='failed')?t("已观察到本步运行"):t("未观察到本步运行")}</p>
          <details><summary>{tf("工具记录 {0}",observed.length)}</summary><ul>{observed.map(tool=><li key={tool.toolCallId}>{tool.name} · {tool.status==='error'?t("工具失败"):t("工具返回")} · {tool.execution==='ran'?t("实际运行"):tool.execution==='failed'?t("运行失败"):t("未观察到运行")}
            <span className="route-tool-id">{tool.toolCallId}</span>
            {onTool&&canLocateTool?.(tool.toolCallId)?<Button size="sm" variant="ghost" onClick={()=>onTool(tool.toolCallId)}>{t("定位工具记录")}</Button>:null}
          </li>)}</ul></details>
        </div></div>:null}
        <details className="route-review-record"><summary>{t("审查记录")}</summary><p>{review(step.verification.state)} · {step.verification.note}</p>
          {step.execution.toolCallIds?.length||step.verification.toolCallIds?.length?<p className="route-file-fact">{t("Agent 引用的工具索引")}：{[...new Set([...(step.execution.toolCallIds??[]),...(step.verification.toolCallIds??[])])].join('、')}</p>:null}
          {step.notes.map((note,i)=><p key={i}>{note}</p>)}
          <p>{t("交付不代表已运行；工具运行不代表科学结论正确。")}</p>
        </details>
      </div>}
    </div>
    <details className="route-extra" open={tab==='info'}><summary>{t("输入与参考")}</summary>
<div className="route-conditions-info">
        <h3>{t("这一步做什么")}</h3><p className="route-purpose">{step.purpose}</p>
        <dl className="route-conditions">
          <dt>{t("输入")}</dt><dd>{step.inputs.join('；')||t("尚未记录")}</dd>
          <dt>{t("预期输出")}</dt><dd>{step.outputs.join('；')||t("尚未记录")}</dd>
          <dt>{t("依赖步骤")}</dt><dd>{step.dependencies.join('、')||t("无前置步骤")}</dd>
        </dl>
        {!historical ? <div className="route-actions">
          <Button size="sm" variant="ghost" disabled={locked} onClick={()=>onAction('view')}>{t("查看步骤")}</Button>
          <Button size="sm" variant="ghost" disabled={locked} onClick={()=>onAction('search')}>{t("补找案例")}</Button>
        </div> : null}
        <h3>{t("参考案例")}</h3>
        <p className="route-selected">{t("你选的参考")}：{selected?`${selected.title} · ${selected.server} / ${selected.caseId}`:t("尚未选择")}</p>
        {step.cases.length ? <ul className="route-cases">{step.cases.map(candidate=>{
          const root=roots[candidate.server]
          return <li key={JSON.stringify([candidate.server,candidate.caseId])}>
            <strong>{candidate.title}</strong><p className="route-case-id">{candidate.server} / {candidate.caseId}{candidate.language?` · ${candidate.language}`:''}</p>
            <p>{candidate.coverage}</p><span className="route-case-evidence">{candidate.evidence==='content_checked'?t("正文已读取"):t("仅元数据")}</span>
            <div className="route-actions"><Button size="sm" variant="ghost" disabled={!root} onClick={()=>root&&onOpenWeb(详情地址(root,{case_id:candidate.caseId}))}>{t("看案例详情")}</Button>
              {!historical ? <Button size="sm" variant="secondary" disabled={locked || selected===candidate} onClick={()=>onAction('select',{server:candidate.server,caseId:candidate.caseId})}>{selected===candidate?t("已选参考"):t("选为参考")}</Button> : null}
            </div>{!root?<span className="caveat">{t("案例图廊暂不可用")}</span>:null}
          </li>
        })}</ul> : <p className="caveat">{t("尚无候选案例，可补找案例")}</p>}
        {rootsError ? <p className="caveat">{rootsError}<Button size="sm" variant="ghost" onClick={onRetryRoots}>{t("重新连接图廊")}</Button></p> : null}
      </div>
    </details>
  </>
}
