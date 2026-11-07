import {useEffect,useId,useRef,useState} from 'react'
import type {TaskTraceSummary} from '../protocol/task-trace.js'
import type {ToolRecordResponse,ToolRecordTarget} from '../protocol/tool-record.js'
import type {WorkbenchClient} from './client.js'
import {三角图标} from './icons.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'

const pageSize=12
export function CollaborationToolRecords({client,sessionId,trace,target}:{client:WorkbenchClient;sessionId:string;trace:TaskTraceSummary;target?:ToolRecordTarget|undefined}){
 const panelId=useId()
 const [failedOnly,setFailedOnly]=useState(false),[limit,setLimit]=useState(pageSize)
 const [opened,setOpened]=useState<{client:WorkbenchClient;call:string;response?:ToolRecordResponse}>()
 const request=useRef(0)
 useEffect(()=>{setOpened(undefined);return()=>{request.current++}},[client])
 const close=()=>{request.current++;setOpened(undefined)}
 const open=async(call:string)=>{
  if(!target)return
  const id=++request.current;setOpened({client,call})
  try{
   const response=await client.get<ToolRecordResponse>('getToolRecord',{sessionId,target,toolCallId:call})
   if(id===request.current)setOpened({client,call,response})
  }catch{if(id===request.current)setOpened({client,call,response:{state:'unavailable'}})}
 }
 const ids=new Map<string,number>()
 for(const row of trace.records)ids.set(row.toolCallId,(ids.get(row.toolCallId)??0)+1)
 const failures=trace.records.filter(row=>row.status==='error')
 const rows=failedOnly?failures:trace.records
 return <div className="collaboration-tools">
  <div className="collaboration-filter" role="group" aria-label={t("工具记录筛选")}>
   <Button variant="ghost" size="sm" aria-pressed={!failedOnly} onClick={()=>{close();setFailedOnly(false);setLimit(pageSize)}}>{t("全部工具记录")} <span>{trace.records.length}</span></Button>
   <Button variant="ghost" size="sm" aria-pressed={failedOnly} onClick={()=>{close();setFailedOnly(true);setLimit(pageSize)}}>{t("只看失败工具")} <span>{failures.length}</span></Button>
  </div>
  {rows.length?<ul className="collaboration-tool-list">{rows.slice(0,limit).map((record,i)=>{
   const canOpen=target&&record.toolCallId&&ids.get(record.toolCallId)===1
   const active=canOpen&&opened?.client===client&&opened.call===record.toolCallId?opened:undefined
   const label=<><code className="collaboration-tool-name" data-authored="1">{record.name}</code>
    {record.path?<span className="collaboration-tool-path" data-authored="1" title={record.path}>{record.path}</span>:null}
    <span className="collaboration-tool-status" data-status={record.status}>{record.status==='done'?t("已完成"):record.execution==='failed'?t("执行失败"):t("调用失败")}</span></>
   return <li key={`${record.toolCallId}:${i}`} className="collaboration-tool-card">
    {canOpen?<Button variant="ghost" size="sm" className="collaboration-tool-header" aria-expanded={!!active} aria-controls={active?panelId:undefined}
     aria-label={active?t("收起原始工具记录"):tf("查看原始工具记录：{0}",record.toolCallId)}
     onClick={event=>{if(active)close();else void open(record.toolCallId);event.currentTarget.focus()}}>{label}<三角图标/></Button>
     :<div className="collaboration-tool-header">{label}</div>}
    {active?<div className="collaboration-tool-original" id={panelId}>
     {!active.response?<p role="status">{t("正在读取原始工具记录")}</p>:active.response.state==='unavailable'?<p role="status">{t("无法核对原始工具记录；保留上方摘要。")}</p>:<>
      <div className="collaboration-tool-result">
       <div className="collaboration-tool-section-label">{t("记录中的工具结果")}</div>
       {active.response.output?<pre tabIndex={0} aria-label={t("记录中的工具结果")} data-authored="1">{active.response.output}</pre>:<p className="hint">{t("没有可显示的文本输出")}</p>}
      </div>
      <details><summary>{t("调用参数")}</summary><pre tabIndex={0} aria-label={t("调用参数")} data-authored="1">{active.response.input}</pre></details>
      <details><summary>{t("证据与调用标识")}</summary><code data-authored="1">{record.toolCallId}</code>
       {active.response.evidenceTag?<pre tabIndex={0} aria-label={t("宿主证据标签")} data-authored="1">{active.response.evidenceTag}</pre>:null}
      </details>
      {active.response.clipped?<p className="hint">{t("仅显示有界文本；过长或非文本内容已省略。")}</p>:null}
     </>}
    </div>:!canOpen?<code className="collaboration-tool-fallback" data-authored="1">{record.toolCallId}</code>:null}
   </li>
  })}</ul>:<p className="hint">{t("此任务没有失败工具记录")}</p>}
  {rows.length>limit?<Button variant="outline" size="sm" onClick={()=>setLimit(n=>n+pageSize)}>{tf("显示更多工具记录（{0} 条）",rows.length-limit)}</Button>:null}
  {trace.omitted?<p className="hint">{tf("已省略 {0} 条早期工具摘要；完整过程仍在原始记录。",trace.omitted)}</p>:null}
  <p className="hint collaboration-tool-note">{t("宿主记录的工具证据；工具成功不等于科学结论正确。")}</p>
 </div>
}
