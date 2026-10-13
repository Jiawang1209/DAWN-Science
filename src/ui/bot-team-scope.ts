import type {TeamSnapshot} from "../protocol/index.js"
export interface BotOwnerContext {
  workspace?:string|undefined;projectId?:string|undefined;connectionId?:string|undefined;remoteCwd?:string|undefined
}
/** Compare server-derived canonical member scope AND current raw owner identity; never canonicalize paths in the browser. */
export function visibleBotTeam(team:TeamSnapshot|undefined,owner:string|undefined,current:BotOwnerContext):TeamSnapshot|undefined {
  const context=team?.botOwnerContext
  if(!team||!owner||team.captainSessionId!==owner||!context)return undefined
  // Remote ordinary sessions have no local task path; their loaded project/server/CWD
  // plus the origin-matching server stamp still identify the owner unambiguously.
  if(!current.workspace&&!(current.projectId&&current.connectionId&&current.remoteCwd))return undefined
  if(team.botOriginScopeKey!==context.key)return undefined
  if((current.workspace&&context.workspace!==current.workspace)||context.projectId!==current.projectId||context.connectionId!==current.connectionId||context.remoteCwd!==current.remoteCwd)return undefined
  if(team.members.some(m=>m.botId&&m.status!=="removed"&&m.botScopeKey!==context.key))return undefined
  return team
}
