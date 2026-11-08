import {expect,it} from 'vitest'
import {collaborationMember} from '../../src/ui/collaboration-member.js'
import type {RunOverview} from '../../src/protocol/run-overview.js'
const run:RunOverview['runs'][number]={id:'c',kind:'subagent',label:'Reader',address:['call', '0'],epoch:1,phase:'drained',state:'completed',updatedAt:1,contract:false,inputVersions:0,outputVersions:0}
const snapshot:RunOverview={ownerSessionId:'p',source:'live',runs:[run]}
it('only derives a safe transcript address from a member of this owner snapshot',()=>{
 expect(collaborationMember(snapshot,run,'p')?.transcriptId).toBe('p#sub:call:0')
 expect(collaborationMember(snapshot,run,'other')).toBeUndefined()
 expect(collaborationMember(snapshot,{...run},'p')).toBeUndefined()
 for(const index of ['-1','1.5','9007199254740992','','1x']){const r={...run,address:['call',index]};expect(collaborationMember({...snapshot,runs:[r]},r,'p')?.transcriptId).toBeUndefined()}
})
function teamFixture(){
 const r={...run,kind:'team' as const,address:['t','alice','new']}
 const team:NonNullable<RunOverview['team']>={id:'t',captainSessionId:'p',name:'team',goal:'goal',createdAt:1,members:[{name:'alice',agent:'Reviewer',role:'Independent review',status:'idle',sessionDir:'unused',turns:1,joinedAt:1,orchestrationId:'new'}],messages:[{id:'m',from:'alice',to:'captain',content:'checked',ts:1}],tasks:[],taskSeq:0}
 return{r,s:{...snapshot,runs:[r],team}}
}
it('binds team role and mailbox only to the exact current member generation',()=>{
 const{r,s}=teamFixture();expect(collaborationMember(s,r,'p')?.role).toBe('Independent review');expect(collaborationMember(s,r,'p')?.messages?.[0]?.content).toBe('checked')
 for(const patch of [{address:['t','alice','old']},{address:['foreign','alice','new']}]){const other={...r,...patch};expect(collaborationMember({...s,runs:[other]},other,'p')?.member).toBeUndefined()}
 s.team!.members[0]!.status='removed';expect(collaborationMember(s,r,'p')?.member).toBeUndefined()
})
it('does not borrow a new task attempt or expose Bot targets across generations',()=>{
 const{r,s}=teamFixture();r.kind='bot' as never;s.team!.members[0]!.botId='bot1'
 expect(collaborationMember(s,r,'p')?.botId).toBe('bot1')
 s.team!.members[0]!.orchestrationId='later';expect(collaborationMember(s,r,'p')?.botId).toBeUndefined()
})
it('excludes mailbox history from a previous incarnation and matches all task attempt fields',()=>{
 const{r,s}=teamFixture();s.team!.members[0]!.joinedAt=10
 s.team!.messages.push({id:'new',from:'alice',to:'captain',content:'current message',ts:11})
 expect(collaborationMember(s,r,'p')?.messages?.map(m=>m.id)).toEqual(['new'])
 r.taskAttempt={teamId:'t',taskId:'task',attemptId:'attempt1',attempt:1}
 s.team!.tasks.push({id:'task',subject:'New assignment',status:'in_progress',assignee:'alice',attempt:2,attemptId:'attempt2',dependencies:[],createdAt:1,updatedAt:1})
 expect(collaborationMember(s,r,'p')?.task).toBeUndefined()
 s.team!.tasks[0]!.attempt=1;s.team!.tasks[0]!.attemptId='attempt1'
 expect(collaborationMember(s,r,'p')?.task?.subject).toBe('New assignment')
})
