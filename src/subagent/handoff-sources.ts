/** Host-only source resolution. References are historical facts, never permissions or live file proofs. */
import {createHash} from 'node:crypto'
import {HandoffSelectionSchema,ContextHandoffSchema,type HandoffSelection,type ContextHandoff} from '../protocol/context-handoff.js'
import {AnalysisRouteSchema,type AnalysisRoute} from '../protocol/analysis-route.js'
import {scienceStepContext} from '../protocol/science-route-context.js'
import {TaskReceiptSchema} from '../protocol/task-contract.js'
import {childIdentity,type ChildRecord} from '../orchestration/store.js'
import {captureHandoff,evidenceFingerprint,visibleHandoffEntries} from './context-handoff.js'
export interface HandoffSources {route?:AnalysisRoute|undefined;children?:readonly ChildRecord[]}
function accepted(owner:string,child:ChildRecord){return child.id===childIdentity(child.kind,child.address,owner)&&child.state==='completed'&&child.epoch>0&&child.result?.ok===true&&child.result.receipt?.state==='accepted'&&!!child.result.receipt.versions}
export function handoffSources(owner:string,branch:readonly unknown[],sources:HandoffSources){
 const entries=visibleHandoffEntries(branch)
 return{messages:entries.slice(-64).map(e=>({id:e.id,role:e.role,preview:e.text.slice(0,240),bytes:Buffer.byteLength(e.text)})),olderMessagesOmitted:Math.max(0,entries.length-64),
 route:sources.route?{routeId:sources.route.routeId,revision:sources.route.revision,steps:sources.route.steps.slice(0,64).map(s=>({id:s.id,title:s.title})),state:'record-not-approval' as const}:undefined,
 receipts:(sources.children??[]).filter(c=>accepted(owner,c)).slice(-32).map(c=>({childId:c.id,epoch:c.epoch,outputs:c.result!.receipt!.versions!.outputs,state:'historical-current-unverified' as const}))}
}
export function captureEvidenceHandoff(owner:string,branch:readonly unknown[],raw:HandoffSelection,sources:HandoffSources):ContextHandoff{
 const selection=HandoffSelectionSchema.parse(raw)
 if(!selection.messageIds&&!selection.routeStepId&&!selection.acceptedChildIds)return captureHandoff(owner,branch,selection.recentMessages)
 const visible=visibleHandoffEntries(branch),ids=selection.messageIds
 const entries=ids?ids.map(id=>{const matches=visible.filter(e=>e.id===id);if(matches.length!==1)throw new Error('指定正文不存在、重复或不是已完成可见消息');return matches[0]!}):visible.slice(-selection.recentMessages)
 if(!entries.length)throw new Error('没有可交接的已完成正文消息')
 const bytes=Buffer.byteLength(entries.map(e=>e.text).join(''),'utf8');if(bytes>16384)throw new Error('交接正文超过 16 KiB 上限')
 const references:Extract<ContextHandoff,{version:2}>['references']=[]
 if(selection.routeStepId){
  if(!sources.route)throw new Error('当前会话没有路线来源')
  const route=AnalysisRouteSchema.parse(sources.route),step=route.steps.find(s=>s.id===selection.routeStepId);if(!step)throw new Error('当前路线步骤不存在')
  references.push({kind:'route',routeId:route.routeId,revision:route.revision,stepId:step.id,text:JSON.stringify({title:route.title,goal:route.goal,dataContext:route.dataContext,step:scienceStepContext(step)}),state:'record-not-approval'})
 }
 for(const id of selection.acceptedChildIds??[]){
  const child=sources.children?.find(c=>c.id===id)
  if(!child||!accepted(owner,child))throw new Error('引用任务不属于当前父会话、尚未结束或没有已验收版本')
  const receipt=TaskReceiptSchema.parse(child.result!.receipt)
  references.push({kind:'receipt',childId:child.id,epoch:child.epoch,receiptSha256:createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),versions:receipt.versions!,state:'historical-current-unverified'})
 }
 let capsule=ContextHandoffSchema.parse({version:2,sourceSessionId:owner,createdAt:Date.now(),requestedMessages:selection.recentMessages,entries,bytes,sha256:'0'.repeat(64),selection,references,envelopeBytes:1}) as Extract<ContextHandoff,{version:2}>
 for(let i=0;i<4;i++)capsule={...capsule,envelopeBytes:Buffer.byteLength(JSON.stringify(capsule),'utf8')}
 capsule=ContextHandoffSchema.parse(capsule) as typeof capsule
 return{...capsule,sha256:evidenceFingerprint(capsule)}
}
