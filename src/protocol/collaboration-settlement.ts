import type {RunOverview} from './run-overview.js'
export type Run=RunOverview['runs'][number]
/** A retained previous result is not a receipt for queued, active or interrupted work. */
export function hasCurrentSettlement(run:Run){return(run.state==='completed'||run.state==='failed')&&!['queued','running','stopping'].includes(run.phase)}
/** Acceptance needs current epoch proof; failed receipts remain inspectable diagnostics. */
export function hasCurrentAcceptance(run:Run){return hasCurrentSettlement(run)&&run.state==='completed'&&run.epoch>0&&run.phase!=='unknown'&&run.resultEpoch!==undefined&&run.resultEpoch===run.epoch&&run.receipt==='accepted'&&(!run.taskReceipt||run.taskReceipt.state==='accepted')}
export function collaborationTaskKey(teamId:string,taskId:string){return `task:${JSON.stringify([teamId,taskId])}`}
