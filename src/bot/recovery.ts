import { publishBotInterruptions } from "./collaboration.js"
import type {团队} from "../team/types.js"
/** Reconcile metadata, never replay a possibly completed filesystem effect. */
export function recoverBotTeam(team:团队):boolean {
 let changed=false
 const bots=new Set(team.members.filter(m=>m.botId).map(m=>m.name))
 const onlyBots=team.members.some(m=>m.botId)&&team.members.filter(m=>m.status!=="removed").every(m=>m.botId)
 for(const task of team.tasks){
  if((task.assignee?!bots.has(task.assignee):!onlyBots)||["completed","failed","cancelled"].includes(task.status))continue
  task.status="failed";task.output="应用已重启，该任务中断；请核对已有产物后重新派单，未自动重放操作。";delete task.attemptId;task.updatedAt=Date.now();changed=true
 }
 for(const member of team.members)if(member.botId&&member.status==="working"){member.status="idle";changed=true}
 for(const message of team.messages)if(bots.has(message.to)&&!message.deliveredAt){message.deliveredAt=Date.now();changed=true}
 for(const exchange of team.collaboration??[])if(exchange.resumedAt===undefined&&exchange.status!=="interrupted"){
  exchange.status="interrupted";exchange.reply="应用已重启，协作中断；请核对已有结果后重新派单，未自动重放操作。";exchange.updatedAt=Date.now();changed=true
 }
 for(const turn of team.conversationTurns??[])if(turn.status==="queued"||turn.status==="working"){turn.status="interrupted";turn.reply="应用已重启，公共消息处理中断；未自动重放。";turn.updatedAt=Date.now();changed=true}
 if(changed)publishBotInterruptions(team,Date.now())
 return changed
}
