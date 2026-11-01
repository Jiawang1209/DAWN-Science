import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { migrate } from '../../src/store/schema.js'
import { ProjectStore } from '../../src/store/projects.js'
import { SessionStore } from '../../src/store/sessions.js'
import { RunStore, type RunInsert } from '../../src/store/runs.js'
import { SessionManager } from '../../src/session/manager.js'
import { ProjectManager } from '../../src/project/manager.js'
import { SessionTranscripts } from '../../src/workbench/events.js'
import { FakeRuntime } from '../../src/runtime/fake.js'
import { createWorkbenchBackend } from '../../src/workbench/backend.js'
import { memoryCredentials } from '../helpers/credentials.js'
import type { ProviderRegistry } from '../../src/config/schema.js'
import type { SessionSnapshot } from '../../src/protocol/events.js'
import { receipt as base } from '../fixtures/skill-read.js'
const receipt={...base,via:'acp' as const}
const dbs:Database.Database[]=[]
afterEach(()=>dbs.splice(0).forEach(db=>db.close()))
function setup() {
  const db=new Database(':memory:');dbs.push(db);migrate(db)
  const registry:ProviderRegistry={agents:{external:{kind:'acp',command:'never-launch',args:[],capabilities:['chat'],remoteCapable:false}}}
  const projectStore=new ProjectStore(db),sessionStore=new SessionStore(db),runs=new RunStore(db)
  projectStore.insert({projectId:'p',name:'isolated',workspace:tmpdir(),createdAt:'2026-11-01T00:00:00Z'})
  sessionStore.insert({id:'s',agentId:'external',workspace:tmpdir(),sessionDir:'/unused',state:'exited',projectId:'p',createdAt:'2026-11-01T00:00:00Z'})
  const runtime=new FakeRuntime(),sessions=new SessionManager({store:sessionStore,registry,runtimes:{native:runtime,pty:runtime,acp:runtime},workspaceRoot:tmpdir()})
  const resume=vi.spyOn(sessions,'resume'),start=vi.spyOn(runtime,'start')
  const events=new SessionTranscripts({terminalMaxChars:1000})
  const backend=createWorkbenchBackend({projectStore,projects:new ProjectManager({projects:projectStore,sessions:sessionStore,runs,registry}),runs,sessions,credentials:memoryCredentials(),registry,events})
  const add=(id:string,change:Partial<RunInsert>={})=>runs.insert({runId:id,projectId:'p',sessionId:'s',origin:'agent',requestType:'acp_tool:dawn_use_skill',status:'completed',hasError:false,startedAt:'2026-11-01T01:00:00Z',finishedAt:'2026-11-01T01:00:01Z',toolCallId:`acp-skill-read:00000000-0000-4000-8000-${id.padStart(12,'0')}`,terminalReason:JSON.stringify({skillRead:receipt}),...change})
  return {db,runs,add,backend,events,sessions,resume,start,sessionStore}
}
describe('read-only ACP Skill receipt history',()=>{
  it('restores only recorded Skill reads with stable ids and exited state, without launching or resuming an agent',async()=>{
    const {add,backend,resume,start}=setup();add('1')
    const snapshot=await backend.subscribeSession({sessionId:'s'}) as SessionSnapshot
    expect(snapshot).toMatchObject({kind:'acp',state:'exited'})
    expect(snapshot.items[0]).toMatchObject({type:'tool',id:'acp-skill-read:00000000-0000-4000-8000-000000000001',status:'ok',name:'acp_skill_read',skillRead:receipt})
    expect(snapshot.items.at(-1)).toMatchObject({type:'notice',text:expect.stringContaining('完整 ACP 对话未恢复')})
    expect(await backend.subscribeSession({sessionId:'s'})).toEqual(snapshot)
    expect(resume).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled()
  })
  it('rejects forged notes, errors, unknown tools, malformed metadata and records from other sessions',async()=>{
    const {add,backend,sessionStore}=setup();add('1')
    sessionStore.insert({id:'other',agentId:'external',workspace:tmpdir(),sessionDir:'/unused-other',state:'exited',projectId:'p',createdAt:'2026-11-01T00:00:00Z'})
    add('10',{sessionId:'other'})
    add('2',{requestType:'acp_tool:dawn_record_note'})
    add('3',{status:'failed',hasError:true})
    add('4',{requestType:'acp_tool:bash'})
    add('5',{terminalReason:JSON.stringify({skillRead:{...receipt,verified:true}})})
    add('6',{terminalReason:JSON.stringify({skillRead:{...receipt,via:'use_skill'}})})
    add('7',{toolCallId:'model-claimed-id'})
    add('8',{origin:'user'})
    add('9',{terminalReason:'not JSON'})
    const snapshot=await backend.subscribeSession({sessionId:'s'}) as SessionSnapshot
    expect(snapshot.items.filter(item=>item.type==='tool')).toHaveLength(1)
  })
  it('reads past the first ledger page and preserves chronology',async()=>{
    const {add,backend}=setup();add('1',{startedAt:'2026-10-01T00:00:00Z'})
    for(let i=2;i<=205;i++)add(String(i),{requestType:'acp_tool:dawn_record_note'})
    add('206')
    const snapshot=await backend.subscribeSession({sessionId:'s'}) as SessionSnapshot
    expect(snapshot.items.filter(item=>item.type==='tool').map(item=>item.id)).toEqual(['acp-skill-read:00000000-0000-4000-8000-000000000001','acp-skill-read:00000000-0000-4000-8000-000000000206'])
  })
  it('keeps the unsupported-resume error when there is no valid host read history',async()=>{
    const {add,backend}=setup();add('1',{requestType:'acp_tool:dawn_record_note'})
    await expect(backend.subscribeSession({sessionId:'s'})).rejects.toMatchObject({workbenchCode:'not_found'})
  })
})
