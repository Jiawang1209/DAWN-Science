import {useCallback,useEffect,useRef,useState} from 'react'
import type {TaskReceipt} from '../protocol/task-contract.js'
import type {TaskTraceSummary} from '../protocol/task-trace.js'
import type {TaskObservation} from '../protocol/task-observation.js'
import type {WorkbenchClient} from './client.js'
import {Button} from './primitives.js'
import {FilePreview,type FileContent} from './files.js'
import {ArtifactHistoryPanel} from './artifact-history.js'
import {PreviewCloseButton} from './preview-close-button.js'
import {CollaborationToolRecords} from './collaboration-tool-records.js'
import type {ToolRecordTarget} from '../protocol/tool-record.js'
import {t,tf} from './i18n/index.js'
/** Reading UI only: never retries a run or relaxes its frozen contract. */
export function CollaborationEvidence({client,sessionId,receipt,trace,observation,tab,target}:{client:WorkbenchClient;sessionId:string;receipt?:TaskReceipt|undefined;trace?:TaskTraceSummary|undefined;observation?:TaskObservation|undefined;tab:string;target?:ToolRecordTarget|undefined}){
 const [preview,setPreview]=useState<{owner:string;path:string;content?:FileContent;error?:string}>(),[history,setHistory]=useState<string>()
 const sequence=useRef(0),returnFocus=useRef<HTMLButtonElement|null>(null)
 useEffect(()=>{setPreview(undefined);setHistory(undefined);return()=>{sequence.current++}},[sessionId,tab])
 const readFile=useCallback((path:string)=>client.get<FileContent>('readFile',{sessionId,path}),[client,sessionId])
 const open=useCallback(async(path:string,trigger?:HTMLButtonElement)=>{
  const id=++sequence.current;if(trigger)returnFocus.current=trigger;setHistory(undefined);setPreview({owner:sessionId,path})
  try{const content=await readFile(path);if(id===sequence.current)setPreview({owner:sessionId,path,content})}
  catch(error){if(id===sequence.current)setPreview({owner:sessionId,path,error:error instanceof Error?error.message:String(error)})}
 },[readFile,sessionId])
 const openFile=useCallback((path:string)=>void open(path),[open])
 const close=()=>{sequence.current++;setPreview(undefined);returnFocus.current?.focus()}
 const versions=receipt?.versions?.outputs??[],paths=[...new Set([...versions.map(v=>v.path),...(receipt?.deliverables.map(v=>v.path)??[])])]
 return <section className="collaboration-evidence" aria-label={t("任务证据与产物")}>
  {tab==='artifacts'?<>
   {receipt?.reason?<p role="status" data-authored="1">{receipt.reason}</p>:null}
   {receipt?.acceptance?.checks.map(check=><p key={check.id} data-authored="1">{check.id} · {check.state} · {check.reason}{check.expected!==undefined?` · ${check.expected}`:''}{check.actual!==undefined?` → ${check.actual}`:''}</p>)}
   <p className="hint">{t("验收指纹属于历史结算；预览读取当前文件，不代表已验收版本仍有效。")}</p>
   {paths.map(path=>{const file=versions.find(v=>v.path===path);return <div key={path} className="collaboration-artifact-row">
    <strong data-authored="1">{path}</strong>{file?<><small>{tf("验收版本 · {0} 字节",file.bytes)}</small><code data-authored="1">{file.sha256}</code></>:<small>{t("未记录内容版本")}</small>}
    <div><Button variant="text" size="sm" aria-label={tf("预览当前文件：{0}",path)} onClick={event=>void open(path,event.currentTarget)}>{t("预览当前文件")}</Button><Button variant="text" size="sm" aria-label={tf("查看文件留存：{0}",path)} onClick={event=>{returnFocus.current=event.currentTarget;sequence.current++;setPreview(undefined);setHistory(path)}}>{t("查看文件留存")}</Button></div>
   </div>})}
   {preview?.owner===sessionId?<div className="collaboration-file-preview"><p>{t("当前工作区文件预览")}</p>{!preview.content?<PreviewCloseButton onClose={close}/>:null}{preview.error?<p role="alert">{preview.error}</p>:<FilePreview path={preview.path} content={preview.content} readFile={readFile} onOpenFile={openFile} onClosePreview={close}/>}</div>:null}
   {history?<ArtifactHistoryPanel key={`${sessionId}:${history}`} client={client} sessionId={sessionId} paths={paths} filterPath={history} readOnly onClose={()=>{setHistory(undefined);returnFocus.current?.focus()}}/>:null}
  </>:null}
  {tab==='records'?<>
   {observation?<dl className="collaboration-tool-metrics">
    <div><dt>{t("正式提交次数")}</dt><dd>{observation.submissionAttempts}</dd></div>
    <div><dt>{t("退回次数")}</dt><dd>{observation.invalidSubmissions}</dd></div>
    <div><dt>{t("阶段耗时")}</dt><dd>{observation.elapsedMs} <small>ms</small></dd></div>
   </dl>:<p className="hint">{t("此任务未记录提交观测")}</p>}
   {trace?.records.length?<CollaborationToolRecords key={JSON.stringify([sessionId,target])} client={client} sessionId={sessionId} trace={trace} target={target}/>:<p className="hint">{t("此任务没有保留工具证据摘要；可查看原始过程。")}</p>}
  </>:null}
 </section>
}
