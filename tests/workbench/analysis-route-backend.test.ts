/**
 * 先出方案的后端一侧（spec §4.5）：`answerPlan` 分码与租约、非 native、中枢的 `plan` 条目与 `propose_plan` 不画工具行。
 *
 * 真 `createWorkbenchBackend` + 真 `SessionManager`；运行时是 `FakeRuntime` 的替身（`make()` 照 `redirect-backend.test.ts`）。
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { SessionStore } from "../../src/store/sessions.js"
import { RunStore } from "../../src/store/runs.js"
import { TaskStore } from "../../src/store/tasks.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectManager } from "../../src/project/manager.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import type { SessionId } from "../../src/runtime/types.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"
import type { ProviderRegistry } from "../../src/config/schema.js"

import { AnalysisRouteBook } from '../../src/runtime/analysis-route-book.js'
import { OPERATIONS, SessionSnapshotSchema, SessionUpdateSchema } from '../../src/protocol/index.js'
import type { AnalysisRouteActionRequest } from '../../src/protocol/analysis-route.js'
const draft=()=>({title:'r',goal:'g',dataContext:[],steps:[{id:'S',title:'S',purpose:'p',inputs:[],outputs:[],dependencies:[],status:'pending' as const,blockers:[],cases:[],deliverables:[],execution:{state:'not_run' as const,note:'n'},verification:{state:'unreviewed' as const,note:'n'},needsReview:false,notes:[]}]})
class RouteRuntime extends FakeRuntime {
 book=new AnalysisRouteBook(undefined)
 code:string|undefined
 getAnalysisRoute(_id:string,_dir:string,history=false){return {supported:true,route:this.book.read(),...(history?{history:this.book.history()}:{})}}
 actOnAnalysisRoute(_id:string,req:AnalysisRouteActionRequest){if(this.code)throw Object.assign(new Error(this.code),{routeCode:this.code});return {route:this.book.read(),message:'request'}}
}
const registry: ProviderRegistry = { agents: { "ds-chat": { kind: "native", provider: "deepseek", model: "m", capabilities: ["chat"] } } }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function make(runtime: FakeRuntime = new RouteRuntime()) {
  const db = new Database(":memory:")
  migrate(db)
  const sessionStore = new SessionStore(db)
  const runStore = new RunStore(db)
  const sessions = new SessionManager({ store: sessionStore, registry, runtimes: { native: runtime, pty: runtime }, workspaceRoot: tmpdir() })
  const projects = new ProjectManager({ projects: new ProjectStore(db), sessions: sessionStore, runs: runStore, registry })
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 })
  const scratch = mkdtempSync(join(tmpdir(), "dawn-scratch-"))
  const repo = mkdtempSync(join(tmpdir(), "dawn-plan-"))
  dirs.push(scratch, repo)
  const backend = createWorkbenchBackend({
    projects, projectStore: new ProjectStore(db), runs: runStore, sessions, credentials: memoryCredentials(), registry,
    events, tasks: new TaskStore(db),
    scratchRoot: scratch,
    trashItem: async (p) => { rmSync(p, { recursive: true, force: true }) },
  })
  const 开一段 = async () => {
    const { sessionId } = (await backend.createTask({ agentId: "ds-chat", workspace: repo })) as { sessionId: string }
    await backend.acquireLease({ sessionId, holder: "user" })
    return sessionId
  }
  return { backend, runtime, repo, 开一段, sessions, events }
}

describe('analysis route backend contract',()=>{
 it('declares strict read/write operations and validates selection shapes',()=>{
  expect(OPERATIONS.getAnalysisRoute.mutating).toBe(false)
  expect(OPERATIONS.actOnAnalysisRoute.mutating).toBe(true)
  expect(OPERATIONS.getAnalysisRoute.request.safeParse({sessionId:'s',includeHistory:true,extra:1}).success).toBe(false)
  expect(OPERATIONS.actOnAnalysisRoute.request.safeParse({sessionId:'s',routeId:'r',expectedRevision:1,stepId:'S',action:'select'}).success).toBe(false)
 })
 it('reads without lease, requires lease for every action, forwards without sending a model request',async()=>{
  const ctx=make();const {sessionId}=await ctx.backend.createTask({agentId:'ds-chat',workspace:ctx.repo}) as {sessionId:string}
  expect(await ctx.backend.getAnalysisRoute({sessionId,includeHistory:true})).toMatchObject({supported:true,history:[]})
  const req={sessionId,routeId:'r',expectedRevision:1,stepId:'S',action:'view' as const}
  await expect(ctx.backend.actOnAnalysisRoute(req)).rejects.toMatchObject({workbenchCode:'conflict',detail:{code:'LEASE_CONFLICT'}})
  await ctx.backend.acquireLease({sessionId,holder:'user'})
  expect(await ctx.backend.actOnAnalysisRoute(req)).toMatchObject({message:'request'})
 })
 it.each(['UNSUPPORTED','SESSION_BUSY','STALE_ROUTE','ROUTE_BLOCKED','ROUTE_ERROR'])('exposes structured fault code %s',async code=>{
  const ctx=make();const sessionId=await ctx.开一段();(ctx.runtime as RouteRuntime).code=code
  await expect(ctx.backend.actOnAnalysisRoute({sessionId,routeId:'r',expectedRevision:1,stepId:'S',action:'continue'})).rejects.toMatchObject({detail:{code}})
 })
 it('unsupported runtimes report capability absence and reject mutation',async()=>{
  const ctx=make(new FakeRuntime());const sessionId=await ctx.开一段()
  expect(await ctx.backend.getAnalysisRoute({sessionId})).toMatchObject({supported:false})
  await expect(ctx.backend.actOnAnalysisRoute({sessionId,routeId:'r',expectedRevision:1,stepId:'S',action:'skip'})).rejects.toMatchObject({workbenchCode:'invalid_request',detail:{code:'UNSUPPORTED'}})
 })
 it('publishes complete route snapshots and keeps subscribed/resync reads consistent',()=>{
  const hub=new SessionTranscripts({terminalMaxChars:1000});hub.track('s','native');hub.subscribe('s');const seen:unknown[]=[];hub.onUpdate(u=>seen.push(u))
  const route=new AnalysisRouteBook(undefined).replace(0,draft())
  hub.ingest('s',{kind:'analysis_route',sessionId:'s',route})
  expect(hub.subscribe('s').analysisRoute).toEqual(route)
  expect(SessionSnapshotSchema.safeParse(hub.subscribe('s')).success).toBe(true)
  expect(seen).toHaveLength(2);expect(SessionUpdateSchema.safeParse(seen[0]).success).toBe(true)
  expect(seen[1]).toMatchObject({type:'artifactsChanged',sessionId:'s'})
 })
})
