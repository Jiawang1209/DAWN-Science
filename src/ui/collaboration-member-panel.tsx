import {useState} from 'react'
import type {RunOverview} from '../protocol/run-overview.js'
import {collaborationMember} from './collaboration-member.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
export function CollaborationMemberPanel({snapshot,run,owner,onOpen,onBot,onPrepare}:{snapshot:RunOverview;run:RunOverview['runs'][number];owner:string;onOpen?:((id:string)=>void)|undefined;onBot?:((teamId:string,botId:string)=>Promise<void>)|undefined;onPrepare?:((owner:string,text:string)=>boolean)|undefined}){
 const member=collaborationMember(snapshot,run,owner)
 const[error,setError]=useState(''),[busy,setBusy]=useState(false),[prepared,setPrepared]=useState(false)
 if(!member)return null
 return <section className="collaboration-member-entry" aria-label={t("成员会话与操作")}>
  <header><strong>{t("成员会话与操作")}</strong><span data-authored="1">{member.label}</span></header>
  {member.role?<p data-authored="1">{member.role}</p>:null}
  {member.task?<p data-authored="1">{tf("当前关联任务：{0}",member.task.subject)}</p>:null}
  {member.transcriptId?<>
   <p className="hint">{t("续问、纠偏和停止由成员过程面板按宿主能力提供。")}</p>
   {onOpen?<Button variant="outline" size="sm" onClick={()=>onOpen(member.transcriptId!)}>{t("查看子任务过程")}</Button>:null}
  </>:member.member?<>
   {member.botId?<><p className="hint">{t("成员会话只读；发言和停止仍使用原团队或任务入口。")}</p>{onBot&&member.member.sessionId?<Button variant="outline" size="sm" disabled={busy} onClick={()=>{setBusy(true);setError('');void onBot(member.teamId!,member.botId!).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setBusy(false))}}>{t("打开成员只读对话")}</Button>:<p className="hint">{member.member.sessionId?t("当前入口不支持打开此成员会话"):t("成员会话尚未启动")}</p>}</>:<>
    <details><summary>{t("成员邮箱记录")}</summary><p className="hint">{t("这是团队消息，不是完整的成员逐步转录。")}</p>
     {member.messages?.length?<ul>{member.messages.map(message=><li key={message.id}><small data-authored="1">{message.from} → {message.to}</small><p data-authored="1">{message.content}</p></li>)}</ul>:<p className="hint">{t("当前成员没有邮箱记录")}</p>}
    </details>
    {onPrepare&&member.live?<Button variant="outline" size="sm" disabled={prepared} onClick={()=>{const ok=onPrepare(owner,tf("请协调团队「{0}」的成员「{1}」：请在这里补充目标；继续沿用当前任务契约，不要绕过验收或自动恢复中断任务。",member.teamId!,member.label));setPrepared(ok);setError(ok?'':t("会话已切换，未修改任何草稿。"))}}>{t("准备给队长的指令")}</Button>:null}
    {prepared?<p role="status" className="hint">{t("已追加到所属会话草稿，请检查后发送。")}</p>:null}
   </>}
  </>:<p className="hint">{t("没有可精确关联的当前成员，不能借用同名成员的消息或会话。")}</p>}
  {!member.live?<p className="hint">{t("历史快照只供查看；当前是否可操作需由宿主重新确认。")}</p>:null}
  {error?<p role="alert">{error}</p>:null}
 </section>
}
