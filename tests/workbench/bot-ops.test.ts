import {expect,it,vi}from"vitest"
import Database from"better-sqlite3"
import{mkdtempSync,rmSync}from"node:fs"
import{tmpdir}from"node:os"
import{join}from"node:path"
import{migrate}from"../../src/store/schema.js"
import{BotStore}from"../../src/store/bots.js"
import{SessionStore}from"../../src/store/sessions.js"
import{ProjectStore}from"../../src/store/projects.js"
import{TaskStore}from"../../src/store/tasks.js"
import{RunStore}from"../../src/store/runs.js"
import{ProjectManager}from"../../src/project/manager.js"
import{SessionManager}from"../../src/session/manager.js"
import{SessionTranscripts}from"../../src/workbench/events.js"
import{FakeRuntime}from"../../src/runtime/fake.js"
import{createWorkbenchBackend}from"../../src/workbench/backend.js"
import{memoryCredentials}from"../helpers/credentials.js"
import type{SessionSpec}from"../../src/runtime/types.js"
import type{BotRuntimeBridge}from"../../src/bot/runtime.js"
import{建团队,加成员,加任务,写团队}from"../../src/team/state.js"
it("真实后端创建、续聊、跨项目隔离并将 Bot 历史留在坞",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"dawn-bot-ops-")),db=new Database(":memory:");migrate(db)
 const specs:SessionSpec[]=[]
 class Runtime extends FakeRuntime {override async start(s:SessionSpec){specs.push(s);return super.start(s)};botModel(){return undefined};botBusy(){return true};botTeamWorking(){return false};async dispatchBotTask(){return{teamId:"t",taskId:"t1"}}}
 const runtime=new Runtime(),registry={agents:{native:{kind:"native" as const,provider:"p",model:"m",capabilities:[]}}},store=new SessionStore(db),projectStore=new ProjectStore(db),runs=new RunStore(db),bots=new BotStore(db)
 const sessions=new SessionManager({store,registry,runtimes:{native:runtime,pty:runtime},workspaceRoot:dir}),projects=new ProjectManager({projects:projectStore,sessions:store,runs,registry})
 let bridge!:BotRuntimeBridge
 const backend=createWorkbenchBackend({bots,configureBots:b=>{bridge=b},tasks:new TaskStore(db),sessions,projects,projectStore,runs,registry,credentials:memoryCredentials(),events:new SessionTranscripts({terminalMaxChars:10000}),scratchRoot:dir})
 try {
  const main=await backend.createTask({workspace:dir,agentId:"native"}) as {sessionId:string}
  const scratch=await backend.createTask({agentId:"native"}) as {sessionId:string;scratchWorkspace:string}
  const taskList=await backend.listTasks({}) as {sessionId:string;workspace?:string;scratchWorkspace?:string}[]
  expect(taskList.find(t=>t.sessionId===scratch.sessionId)).toMatchObject({scratchWorkspace:scratch.scratchWorkspace})
  expect(taskList.find(t=>t.sessionId===scratch.sessionId)?.workspace).toBeUndefined()
  const {bot}=await backend.createBot({name:"统计",role:"统计分析",instructions:"BOT_SENTINEL"}) as {bot:{id:string}}
  // Opening a Bot after app restart must restore the owner before model lookup.
  await sessions.stop(main.sessionId)
  const a=await backend.openBotConversation({botId:bot.id,ownerSessionId:main.sessionId}) as {session:{sessionId:string}}
  const b=await backend.openBotConversation({botId:bot.id,ownerSessionId:main.sessionId}) as typeof a
  expect(a.session.sessionId).toBe(b.session.sessionId);expect(specs.at(-1)?.bot?.instructions).toContain("BOT_SENTINEL");expect(specs.at(-1)?.workspace).toBe(dir)
  Object.assign(runtime,{botMember:()=>({botId:bot.id,botScopeKey:"old-project-scope",sessionId:a.session.sessionId})})
  await expect(backend.openBotMember({ownerSessionId:main.sessionId,teamId:"old-team",botId:bot.id})).rejects.toThrow(/目录|范围|项目/)
  const send=vi.fn(async()=>{})
  Object.assign(runtime,{botCurrentTeam:()=>({members:[{botId:bot.id,status:"idle"}]}),messageBotTeam:send})
  await expect(backend.messageBotTeam({ownerSessionId:main.sessionId,teamId:"old-team",requestId:"user-message",message:"请注明样本量"})).rejects.toThrow(/目录|范围|项目/)
  expect(send).not.toHaveBeenCalled()

  const listed=await backend.listSessions({pageSize:200,projectId:store.get(main.sessionId)!.projectId!}) as {sessionId:string}[];expect(listed.map(s=>s.sessionId)).not.toContain(a.session.sessionId)
  await sessions.stop(a.session.sessionId);await backend.openBotConversation({botId:bot.id,ownerSessionId:main.sessionId});expect(specs.at(-1)?.bot?.instructions).toContain("BOT_SENTINEL")
  await expect(backend.dispatchBotTask({requestId:"nested",ownerSessionId:a.session.sessionId,botId:bot.id,instruction:"nested"})).rejects.toThrow()
  const otherDir=join(dir,"other");const main2=await backend.createTask({workspace:otherDir,agentId:"native"}) as typeof main
  const c=await backend.openBotConversation({botId:bot.id,ownerSessionId:main2.sessionId}) as typeof a;expect(c.session.sessionId).not.toBe(a.session.sessionId)
  const team=建团队({id:"startup-failure",name:"startup",goal:"goal",captainSessionId:main.sessionId})
  const member=加成员(team,{name:"stat",botId:bot.id,agent:"bot"}),task=加任务(team,{subject:"remote startup",assignee:"stat"})
  bots.reserveDispatch({requestId:"preflight",ownerSessionId:main.sessionId,botId:bot.id,scopeKey:"scope",instruction:"remote startup"});bots.updateDispatch("preflight",{teamId:team.id,taskId:task.id,status:"dispatched"})
  task.status="failed";task.attemptId="a1";task.output="SSH disconnected"
  await bridge.result(main.sessionId,{team,member,taskId:task.id,attemptId:"a1",result:{ok:false,output:"",error:task.output}})
  expect(bots.getDispatch("preflight")?.status).toBe("failed");expect(bots.pendingResults(main.sessionId)[0]).toMatchObject({status:"failed",summary:"SSH disconnected"});expect(bots.pendingResults(main.sessionId)[0]?.memberSessionId).toBeUndefined()
  // A crash after task settlement but before outbox persistence recovers once, without rerunning it.
  const completed=加任务(team,{subject:"settled before crash",assignee:"stat"});completed.status="completed";completed.attemptId="a2";completed.output="already executed"
  写团队(join(store.get(main.sessionId)!.sessionDir,"teams",team.id),team)
  await sessions.stop(main.sessionId);await backend.subscribeSession({sessionId:main.sessionId})
  await vi.waitFor(()=>expect(bots.pendingResults(main.sessionId)).toHaveLength(2))
  await backend.unsubscribeSession({sessionId:main.sessionId});await backend.subscribeSession({sessionId:main.sessionId})
  expect(bots.pendingResults(main.sessionId)).toHaveLength(2)
  // Runtime allocation has returned, but receipt persistence fails: never promise rejection.
  vi.spyOn(bots,"updateDispatch").mockImplementationOnce(()=>{throw Error("disk write failed")})
  await expect(backend.dispatchBotTask({requestId:"ambiguous-write",ownerSessionId:main.sessionId,botId:bot.id,instruction:"allocate once"})).rejects.toMatchObject({detail:{dispatchRejected:false}})
 }finally{await sessions.stopAll();db.close();rmSync(dir,{recursive:true,force:true})}
})
