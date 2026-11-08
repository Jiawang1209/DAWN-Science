import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import {CollaborationOutcomePanel} from '../../src/ui/collaboration-outcome-panel.js'
import {taskDeliveryNotice} from '../../src/protocol/task-delivery-notice.js'
import type {RunOverview} from '../../src/protocol/run-overview.js'
import {collaborationTaskKey} from '../../src/protocol/collaboration-settlement.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
afterEach(cleanup)
const value=():RunOverview=>({ownerSessionId:'p',source:'live',runs:[]})
it('keeps next action visible while secondary version and budget details are collapsed',()=>{
 render(<CollaborationOutcomePanel snapshot={value()} outcome={{state:'accepted',acceptedPaths:[],artifacts:[],inspectionArtifacts:[],action:'inspect-artifacts',actionTarget:{selectionKey:'r'}}} onInspect={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'查看产物记录'})).toBeTruthy()
 const detail=screen.getByText('成果版本与执行额度').closest('details')
 expect(detail).toBeTruthy();expect(detail?.open).toBe(false)
 fireEvent.click(screen.getByText('成果版本与执行额度'));expect(detail?.open).toBe(true)
})
it('identifies unsubmitted review only from its exact drained failed attempt',()=>{
 const snapshot=value(),contract=TaskContractSchema.parse({submission:'tool',resultType:'review'})
 snapshot.team={id:'t',captainSessionId:'p',name:'team',goal:'review',createdAt:1,members:[],messages:[],taskSeq:1,tasks:[{id:'r',subject:'review',status:'failed',attempt:1,attemptId:'a',createdAt:1,updatedAt:1,dependencies:[],contract}]}
 snapshot.runs=[{id:'child',label:'review',kind:'team',address:['t','member','review'],epoch:2,resultEpoch:2,state:'failed',phase:'drained',updatedAt:1,contract:true,inputVersions:0,outputVersions:0,taskAttempt:{teamId:'t',taskId:'r',attempt:1,attemptId:'a'},observation:{elapsedMs:1,submissionAttempts:0,invalidSubmissions:0}}]
 const selection=collaborationTaskKey('t','r')
 expect(taskDeliveryNotice(snapshot,selection)).toBe('review-unsubmitted')
 snapshot.runs[0]!.taskAttempt!.attemptId='old';expect(taskDeliveryNotice(snapshot,selection)).toBeUndefined()
 snapshot.runs[0]!.taskAttempt!.attemptId='a';snapshot.runs[0]!.phase='stopping';expect(taskDeliveryNotice(snapshot,selection)).toBeUndefined()
 snapshot.runs[0]!.phase='drained';snapshot.source='disk';expect(taskDeliveryNotice(snapshot,selection)).toBeUndefined()
})
