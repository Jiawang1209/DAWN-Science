import { z } from 'zod'
import type { TranscriptItem } from '../protocol/events.js'
import { SkillReadSchema } from '../protocol/skill-reads.js'
import type { RunStore } from '../store/runs.js'

const hostRead = z.object({skillRead:SkillReadSchema}).strict()
const hostReadId = /^acp-skill-read:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
/** Only host-written successful read receipts; this is not ACP conversation replay or resume. */
export function readAcpSkillHistory(runs: Pick<RunStore,'listByProject'>,projectId:string,sessionId:string): TranscriptItem[] {
  const items:TranscriptItem[]=[]
  let after:string|undefined
  for (;;) {
    const page=runs.listByProject(projectId,{sessionId,limit:200,...(after?{after}:{})})
    for(const run of page) {
      if(run.requestType!=='acp_tool:dawn_use_skill' || run.origin!=='agent' || run.status!=='completed' || run.hasError ||
        !run.toolCallId || !hostReadId.test(run.toolCallId) || !run.terminalReason) continue
      let value:unknown
      try {value=JSON.parse(run.terminalReason)} catch {continue}
      const parsed=hostRead.safeParse(value)
      if(!parsed.success || parsed.data.skillRead.via!=='acp')continue
      const startedAt=Date.parse(run.startedAt),endedAt=Date.parse(run.finishedAt??'')
      if(!Number.isSafeInteger(startedAt)||startedAt<0||!Number.isSafeInteger(endedAt)||endedAt<startedAt)continue
      items.push({type:'tool',id:run.toolCallId,name:'acp_skill_read',input:{},status:'ok',result:'',skillRead:parsed.data.skillRead,startedAt,endedAt})
    }
    if(page.length<200)break
    const last=page.at(-1)!.runId
    if(last===after)break
    after=last
  }
  return items.reverse()
}
