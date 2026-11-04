import {expect,it} from 'vitest'
import {TaskContractSchema,TaskReceiptSchema} from '../../src/protocol/task-contract.js'
import {TeamSnapshotSchema} from '../../src/protocol/events.js'
import {taskTeamSnapshot} from '../../src/team/task-snapshot.js'
import {建团队,加成员,加任务} from '../../src/team/state.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
it('publishes task contracts and receipts without leaking private execution settings into strict UI snapshots',()=>{
 const team=建团队({name:'t',goal:'g',captainSessionId:'p'}),member=加成员(team,{name:'a',agent:'a'})
 const contract=TaskContractSchema.parse({}),task=加任务(team,{subject:'check',contract})
 const settings=resolveTaskSettings(contract,'deny-risky',['read'])
 task.settings=settings;member.taskSettings=settings
 task.receipt=TaskReceiptSchema.parse({version:1,state:'accepted',summary:'checked',deliverables:[]})
 const snapshot=taskTeamSnapshot(team)
 expect(TeamSnapshotSchema.safeParse(snapshot).success).toBe(true)
 expect(snapshot.tasks[0]).not.toHaveProperty('settings');expect(snapshot.members[0]).not.toHaveProperty('taskSettings')
 expect(snapshot.tasks[0]?.receipt?.state).toBe('accepted')
 expect(task.settings).toEqual(settings)
})
