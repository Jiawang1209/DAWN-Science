import {useEffect,useRef,useState} from 'react'
import type {TaskArtifact,TaskArtifactCheck} from '../protocol/task-artifacts.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
export type CheckTaskArtifact=(artifact:TaskArtifact)=>Promise<TaskArtifactCheck>
/** Each exact receipt owns its check. Changing owner/epoch/attempt/version remounts the row. */
function TaskArtifactVersion({artifact,check}:{artifact:TaskArtifact;check?:CheckTaskArtifact|undefined}){
 const [result,setResult]=useState<TaskArtifactCheck>(),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const sequence=useRef(0)
 useEffect(()=>()=>{sequence.current++},[])
 const verify=async()=>{
  if(!check||busy)return
  const current=++sequence.current;setBusy(true);setResult(undefined);setError('')
  try{const result=await check(artifact);if(current===sequence.current)setResult(result)}
  catch(e){if(current===sequence.current)setError(e instanceof Error?e.message:String(e))}
  finally{if(current===sequence.current)setBusy(false)}
 }
 const target=artifact.target
 return <article className="task-artifact-version">
  <div><strong>{artifact.acceptance==='historical'?t("历史验收记录"):artifact.scope==='final'?t("最终成果"):t("阶段产物")}</strong><small data-authored="1">{artifact.label||target.id}</small></div>
  <div className="task-artifact-fingerprint"><code data-authored="1">SHA256 {artifact.version.sha256.slice(0,12)}…</code><small>{tf("{0} 字节",artifact.version.bytes)}</small></div>
  <details><summary>{t("验收来源详情")}</summary><code data-authored="1">{artifact.version.sha256}</code><small data-authored="1">{target.kind==='run'?`${target.id} · ${target.epoch}`:`${target.teamId} · ${target.id} · ${target.attemptId}`}</small></details>
  <div className="task-artifact-check"><span role="status">{busy?t("正在核对当前内容"):!result?t("当前内容未核对"):result.state==='matches'?t("本次核对与验收内容一致"):result.state==='changed'?t("当前内容与验收版本不同"):t("当前内容无法核对")}</span>
   {check?<Button variant="text" size="sm" disabled={busy} aria-label={tf("核对当前内容：{0} · {1}",artifact.path,artifact.version.sha256.slice(0,8))} onClick={()=>void verify()}>{t("核对当前内容")}</Button>:null}
  </div>
  {result?<small data-authored="1">{tf("核对时间：{0}",new Date(result.checkedAt).toLocaleString())}</small>:null}
  {result?.reason?<p className="hint" data-authored="1">{result.reason}</p>:null}{error?<p role="alert" data-authored="1">{error}</p>:null}
 </article>
}
/** No automatic file reads, execution, retention writes or owner recovery. */
export function TaskArtifactVersions({artifacts,check}:{artifacts:readonly TaskArtifact[];check?:CheckTaskArtifact|undefined}){
 if(!artifacts.length)return null
 return <section className="task-artifact-versions" aria-label={t("任务验收版本")}>
  <h4>{t("任务验收版本")}</h4><p className="hint">{t("验收记录属于历史结算；预览读取当前工作区内容。")}</p>
  {artifacts.map(artifact=><TaskArtifactVersion key={JSON.stringify(artifact)} artifact={artifact} check={check}/>)}
 </section>
}
