import {PlanningSourceStateSchema} from '../../src/protocol/planning-contract-source.js'
import {afterEach,expect,it} from 'vitest'
import Database from 'better-sqlite3'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {migrate} from '../../src/store/schema.js'
import {ProjectStore} from '../../src/store/projects.js'
import {SessionStore} from '../../src/store/sessions.js'
import {RunStore} from '../../src/store/runs.js'
import {TaskStore} from '../../src/store/tasks.js'
import {SessionManager} from '../../src/session/manager.js'
import {ProjectManager} from '../../src/project/manager.js'
import {SessionTranscripts} from '../../src/workbench/events.js'
import {createWorkbenchBackend} from '../../src/workbench/backend.js'
import {FakeRuntime} from '../../src/runtime/fake.js'
import {方案簿} from '../../src/runtime/plan-book.js'
import {memoryCredentials} from '../helpers/credentials.js'
import type {ProviderRegistry} from '../../src/config/schema.js'
const cleanup:Array<()=>void>=[]
afterEach(()=>{for(const close of cleanup.splice(0))close()})
class PlanningRuntime extends FakeRuntime {
 readonly books=new Map<string,方案簿>()
 private book(owner:string){let book=this.books.get(owner);if(!book){book=new 方案簿(undefined);this.books.set(owner,book)}return book}
 planningSource(owner:string){return this.book(owner).planningSourceState(owner)}
 confirmPlanningSource(owner:string,value:unknown,revision:number){return this.book(owner).confirmPlanningSource(owner,value,revision)}
}
function setup(runtime:FakeRuntime=new PlanningRuntime()){
 const root=mkdtempSync(join(tmpdir(),'dawn-contract-source-backend-')),db=new Database(':memory:');migrate(db)
 cleanup.push(()=>{db.close();rmSync(root,{recursive:true,force:true})})
 const registry:ProviderRegistry={agents:{a:{kind:'native',provider:'deepseek',model:'m',capabilities:['chat']}}}
 const projectStore=new ProjectStore(db),store=new SessionStore(db),runs=new RunStore(db)
 const sessions=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:root})
 const backend=createWorkbenchBackend({projectStore,projects:new ProjectManager({projects:projectStore,sessions:store,runs,registry}),runs,sessions,registry,credentials:memoryCredentials(),events:new SessionTranscripts({terminalMaxChars:10000}),tasks:new TaskStore(db),scratchRoot:root,trashItem:async()=>{}})
 return{backend,sessions,root,runtime}
}
const selection=()=>({template:{id:'tabular-ecology' as const,version:1 as const,language:'python' as const,method:'mean',units:'m',missingValues:'block'},inputs:['input.csv'],outputRoot:'results/study',requireExecution:true,independentReview:false})
it('requires user write ownership only for confirmation and isolates both sessions',async()=>{
 const{backend,sessions,root}=setup()
 const a=await backend.createTask({agentId:'a',workspace:root}) as {sessionId:string},b=await backend.createTask({agentId:'a',workspace:root}) as {sessionId:string}
 const owner=a.sessionId,other=b.sessionId
 expect(await backend.getPlanningContractSource({sessionId:owner})).toEqual({revision:0})
 sessions.leases.release(owner)
 await expect(backend.confirmPlanningContractSource({sessionId:owner,expectedRevision:0,selection:selection()})).rejects.toThrow(/租约|写权/)
 expect(await backend.getPlanningContractSource({sessionId:owner})).toEqual({revision:0})
 await backend.acquireLease({sessionId:owner,holder:'user'})
 const confirmed=PlanningSourceStateSchema.parse(await backend.confirmPlanningContractSource({sessionId:owner,expectedRevision:0,selection:selection()}))
 expect(confirmed.source?.ownerSessionId).toBe(owner)
 expect(await backend.getPlanningContractSource({sessionId:other})).toEqual({revision:0})
 await expect(backend.confirmPlanningContractSource({sessionId:owner,expectedRevision:0,selection:selection()})).rejects.toThrow(/版本/)
 await expect(backend.getPlanningContractSource({sessionId:'unknown'})).rejects.toThrow()
})
it('reports unsupported runtimes rather than making an empty usable catalog',async()=>{
 const{backend,root}=setup(new FakeRuntime()),task=await backend.createTask({agentId:'a',workspace:root}) as {sessionId:string}
 await expect(backend.getPlanningContractSource({sessionId:task.sessionId})).rejects.toThrow(/不支持/)
})
