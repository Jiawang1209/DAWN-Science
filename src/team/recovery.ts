/** Reconcile both legacy and managed members; execution with unknown effects is never replayed. */
import {recoverBotTeam} from '../bot/recovery.js'
import type {团队} from './types.js'
import {recoverScienceBatch} from './science-batch.js'
import {recoverPipeline} from './science-pipeline.js'
export function recoverTeamExecution(team: 团队): boolean {
  let changed = recoverScienceBatch(team)||recoverPipeline(team)
  if(team.approvedPlan&&!team.approvedPlanPaused&&team.tasks.some(t=>!['completed','cancelled'].includes(t.status))){team.approvedPlanPaused=true;team.approvedPlanPauseReason='应用已重开；请核对已有产物和文件版本，再显式继续尚未执行的任务。';changed=true}
  changed = recoverBotTeam(team)||changed
  const legacy = new Set(team.members.filter(member => !member.botId).map(member => member.name))
  for (const task of team.tasks) if (task.assignee && legacy.has(task.assignee) && ['claimed', 'in_progress'].includes(task.status)) {
    task.status = 'failed'
    task.output = '应用已重启，成员任务执行中断；请核对已有产物后重新派单，未自动重放。'
    delete task.attemptId
    task.updatedAt = Date.now()
    changed = true
  }
  for (const member of team.members) if (!member.botId && member.status === 'working') {member.status = 'idle'; changed = true}
  return changed
}
