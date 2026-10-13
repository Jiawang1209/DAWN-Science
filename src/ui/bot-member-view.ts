import type {坞格对话回调} from "./side-chat.js"
import {t} from "./i18n/index.js"
/** Viewing a managed peer run never acquires execution controls. Explicit user questions remain answerable. */
export function readOnlyBotCallbacks(c:坞格对话回调):坞格对话回调 {
 return {
  disabled:true,readOnlyReason:t("协作执行对话，仅供查看"),allowBotDispatch:false,canRedirect:false,
  onSend:async()=>{throw Error(t("协作执行对话仅供查看，请在主对话调遣或补充任务"))},
  model:c.model,agentLabel:c.agentLabel,serviceLabel:c.serviceLabel,
  loadLocalImage:c.loadLocalImage,loadGalleryRoots:c.loadGalleryRoots,
  onOpenReference:c.onOpenReference,onOpenWeb:c.onOpenWeb,onOpenSubagent:c.onOpenSubagent,
  onExport:c.onExport,取上下文用量:c.取上下文用量,
  待答权限:c.待答权限,onAnswerPermission:c.onAnswerPermission,onAnswerQuestion:c.onAnswerQuestion,
 }
}
