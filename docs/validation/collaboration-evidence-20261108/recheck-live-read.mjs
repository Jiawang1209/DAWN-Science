/** Offline metric repair, never another model run and never rewriting the frozen report. */
import {readFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {readResearchTranscripts} from '../../../scripts/research-transcripts.ts'
import {collectRouteToolEvidence} from '../../../src/runtime/analysis-route-evidence.ts'
import {TaskResultSchema} from '../../../src/protocol/task-contract.ts'
import {researchTasks,researchInputRead,judgeResearch,summarizeResearch} from '../../../src/evaluation/research-tasks.ts'

const root=resolve(import.meta.dirname,'live-01'),report=JSON.parse(readFileSync(join(root,'research.json'),'utf8'))
const trial=join(root,'unknown-unit-single-y5lXmn')
const read=readResearchTranscripts(trial,[{scopeId:'single:1',relativeDirectory:'single/transcript'}])
if(read.issues.length||read.scopes?.length!==1||!read.scopes[0].complete)throw Error('Incomplete or unsafe transcript; cannot repair metric')
const entries=read.scopes[0].entries,messages=entries.filter(e=>e.type==='message'&&e.message).map(e=>e.message)
const final=messages.findLast(m=>m.role==='toolResult'&&m.toolName==='submit_task_result')
const receipt=JSON.parse(final.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'))
if(!receipt.recorded||receipt.state!=='blocked')throw Error('Missing actual blocked host receipt')
const call=messages.filter(m=>m.role==='assistant').flatMap(m=>m.content??[]).find(c=>c.type==='toolCall'&&c.id===final.toolCallId&&c.name==='submit_task_result')
const submitted=TaskResultSchema.parse(call.arguments),evidence=collectRouteToolEvidence(entries)
const original=report.rows.find(r=>r.caseId==='unknown-unit'&&r.mode==='single'&&r.repeat===2)
if(messages.filter(m=>m.role==='assistant').length!==original.requests)throw Error('Trial/request binding mismatch')
const task=researchTasks().find(t=>t.id==='unknown-unit')
if(readFileSync(join(trial,'input.csv'),'utf8')!==task.csv||existsSync(join(trial,'results/result.json')))throw Error('Input changed or inferred result exists')
const oldRead=evidence.some(e=>e.name==='read'&&e.status==='done'&&e.input?.path==='input.csv')
const normalizedRead=researchInputRead(trial,'input.csv',evidence)
const before=judgeResearch(task,'blocked',undefined,true,{reasons:submitted.blockers,inputRead:oldRead})
const after=judgeResearch(task,'blocked',undefined,true,{reasons:submitted.blockers,inputRead:normalizedRead})
if(before.success!==original.success||before.success||!after.success)throw Error('Observed evidence does not establish the expected metric correction')
const corrected=summarizeResearch(report.rows.map(r=>r===original?{...r,...after}:r),true)
console.log(JSON.stringify({kind:'post-hoc-evaluator-path-fix',modelRequestsAdded:0,originalReport:'live-01/research.json',originalManifestFingerprint:report.manifestFingerprint,sourceCandidateOfModelRun:'v2',correctedEvaluatorCandidate:'v3',caseId:original.caseId,repeat:original.repeat,mode:original.mode,hostReceiptState:receipt.state,originalInputRead:oldRead,normalizedInputRead:normalizedRead,originalSuccess:before.success,correctedSuccess:after.success,matchedAssistantRequests:original.requests,derivedSummary:{completePairs:corrected.completePairs,qualifiedPairs:corrected.qualifiedPairs,delivery:corrected.delivery},limitations:['Original frozen report is retained unchanged; this is an offline metric correction, not a rerun or evidence of a newly improved model.','The complete successful-pair count remains two. Unknown-unit placeholder artifacts and unanswered planning questions retain their original classifications.']},null,2))
