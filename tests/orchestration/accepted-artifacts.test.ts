import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {projectAcceptedArtifacts,checkAcceptedArtifact} from '../../src/orchestration/accepted-artifacts.js'
import type {RunOverview} from '../../src/protocol/run-overview.js'
import {TaskContractSchema} from '../../src/protocol/task-contract.js'
const version={path:'result.csv',sha256:createHash('sha256').update('x\n1').digest('hex'),bytes:3}
const receipt={version:1 as const,state:'accepted' as const,summary:'accepted',deliverables:[],versions:{version:1 as const,inputs:[],outputs:[version]}}
const run:RunOverview['runs'][number]={id:'run',kind:'subagent',label:'analysis',address:['call','0'],state:'completed',phase:'drained',epoch:2,resultEpoch:2,updatedAt:1,contract:true,inputVersions:0,outputVersions:1,receipt:'accepted',taskReceipt:receipt}
const snapshot=():RunOverview=>({ownerSessionId:'owner',source:'live',runs:[structuredClone(run)]})
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true})})
it('projects exact owner and run epoch without creating or mutating runtime state',()=>{
 const s=snapshot(),before=structuredClone(s)
 expect(projectAcceptedArtifacts(s,'owner')).toMatchObject([{path:version.path,version,target:{kind:'run',id:'run',epoch:2},acceptance:'accepted',source:'live'}])
 expect(projectAcceptedArtifacts(s,'foreign')).toEqual([]);expect(s).toEqual(before)
 s.runs[0]!.resultEpoch=1;expect(projectAcceptedArtifacts(s,'owner')).toEqual([])
})
it.each(['running','failed','cancelled','interrupted'] as const)('does not label retained receipts as accepted while %s',state=>{
 const s=snapshot();s.runs[0]!.state=state;s.runs[0]!.phase=state==='running'?'running':'drained';expect(projectAcceptedArtifacts(s,'owner')).toEqual([])
})
it('keeps accepted disk versions as explicitly historical and never labels them current final delivery',()=>{
 const s=snapshot();s.source='disk';s.runs[0]!.phase='unknown'
 expect(projectAcceptedArtifacts(s,'owner')).toMatchObject([{acceptance:'historical',source:'disk',scope:'stage',version}])
})
it('retains two different versions of the same path and binds Team evidence to its own attempt',()=>{
 const s=snapshot();s.team={id:'team',captainSessionId:'owner',name:'team',goal:'goal',createdAt:1,members:[],messages:[],taskSeq:1,tasks:[{id:'task',subject:'produce',dependencies:[],status:'completed',attempt:1,attemptId:'attempt',contract:TaskContractSchema.parse({access:'workspace-write',outputs:[version.path]}),receipt:{...receipt,versions:{...receipt.versions,outputs:[{...version,sha256:'b'.repeat(64)}]}},createdAt:1,updatedAt:1}]}
 const artifacts=projectAcceptedArtifacts(s,'owner');expect(artifacts).toHaveLength(2)
 expect(artifacts.find(a=>a.target.kind==='task')).toMatchObject({target:{kind:'task',teamId:'team',id:'task',attemptId:'attempt'}})
 s.team.tasks[0]!.status='in_progress';expect(projectAcceptedArtifacts(s,'owner')).toHaveLength(1)
 s.team.captainSessionId='foreign';expect(projectAcceptedArtifacts(s,'owner')).toEqual([])
})
it('checks actual content with the existing bounded hash worker and refuses forged receipt identity',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-accepted-'));roots.push(cwd);writeFileSync(join(cwd,version.path),'x\n1')
 const s=snapshot(),artifact=projectAcceptedArtifacts(s,'owner')[0]!,get=()=>s
 expect(await checkAcceptedArtifact(cwd,'owner',artifact,get)).toMatchObject({state:'matches'})
 writeFileSync(join(cwd,version.path),'x\n2');expect(await checkAcceptedArtifact(cwd,'owner',artifact,get)).toMatchObject({state:'changed'})
 expect(await checkAcceptedArtifact(cwd,'owner',{...artifact,version:{...version,path:'secret.txt'}},get)).toMatchObject({state:'unavailable'})
 expect(await checkAcceptedArtifact(cwd,'foreign',artifact,get)).toMatchObject({state:'unavailable'})
})
it('refuses a receipt or execution generation that changes while content verification is pending',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'dawn-accepted-race-'));roots.push(cwd);writeFileSync(join(cwd,version.path),'x\n1')
 const s=snapshot(),artifact=projectAcceptedArtifacts(s,'owner')[0]!;let reads=0
 const result=await checkAcceptedArtifact(cwd,'owner',artifact,()=>{reads++;return reads===1?s:{...s,runs:[{...run,epoch:3,resultEpoch:2}]}})
 expect(result.state).toBe('unavailable')
})

it('fails closed when task history cannot be read without losing the caller operation',async()=>{
 const artifact=projectAcceptedArtifacts(snapshot(),'owner')[0]!
 await expect(checkAcceptedArtifact('/unused','owner',artifact,()=>{throw new Error('corrupt task history')})).resolves.toMatchObject({state:'unavailable'})
})
