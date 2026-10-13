import { afterEach, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { SessionSpec } from "../../src/runtime/types.js"
import type {CredentialStore} from "@earendil-works/pi-ai"
import {建团队,加成员,加任务}from"../../src/team/state.js"
import type{团队调度器}from"../../src/team/scheduler.js"
it("停止纯 Bot 团队同时取消未分配任务，不在当前轮收尾后重新执行",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"bot-stop-shared-"));dirs.push(dir)
 const rt=new NativeRuntime({credentials:memoryCredentials(),subagentChildEntry:"/unused/child.js"});let runs=0
 rt.configureBots({list:()=>[{id:"b",name:"b",role:"r",instructions:"i",enabled:true}],run:async(_owner,request)=>{runs++;await new Promise<void>(resolve=>request.signal.addEventListener("abort",()=>resolve(),{once:true}));return{ok:false,output:"",error:"stopped"}},result:()=>{}})
 try{
  await rt.start({sessionId:"main",workspace:dir,sessionDir:join(dir,"main"),native:{provider:"deepseek",model:"deepseek-flash"}})
  const dispatched=await rt.dispatchBotTask("main","b","hold")
  await vi.waitFor(()=>expect(runs).toBe(1))
  const control=(rt as unknown as{botTeams:Map<string,{scheduler:团队调度器}>}).botTeams.get("main")!
  let shared="";control.scheduler.改(dispatched.teamId,t=>{shared=加任务(t,{subject:"queued write"}).id})
  rt.stopBotTeam("main")
  await vi.waitFor(()=>expect(control.scheduler.读(dispatched.teamId).tasks.find(t=>t.id===shared)?.status).toBe("cancelled"))
  await new Promise(resolve=>setTimeout(resolve,20));expect(runs).toBe(1)
  await rt.dispatchBotTask("main","b","explicit new work")
  await vi.waitFor(()=>expect(runs).toBe(2))
  rt.stopBotTeam("main")
 }finally{await rt.stop("main")}
})
const memoryCredentials = (): CredentialStore => ({read: async () => ({type: "api_key", key: "offline"}), list: async () => [], modify: async () => undefined, delete: async () => {}})
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
it("团队快照携带实时 owner 范围，迟到旧成员不能冒充新项目",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"bot-owner-context-"));dirs.push(dir)
 const rt=new NativeRuntime({credentials:memoryCredentials(),subagentChildEntry:"/unused/child.js"})
 let current={key:"scope-a",workspace:dir},finish!:(r:{ok:boolean;output:string})=>void
 const events:AgentEvent[]=[];rt.attach("main",e=>events.push(e))
 rt.configureBots({list:()=>[{id:"b",name:"统计",role:"统计",instructions:"i",enabled:true}],scopeKey:()=>current.key,ownerContext:()=>current,run:()=>new Promise(r=>{finish=r}),result:()=>{}})
 try{
  await rt.start({sessionId:"main",workspace:dir,sessionDir:join(dir,"main"),native:{provider:"deepseek",model:"deepseek-flash"}})
  await rt.dispatchBotTask("main","b","分析数据")
  await vi.waitFor(()=>expect(finish).toBeTypeOf("function"))
  expect(events.filter(e=>e.kind==="team_changed").at(-1)).toMatchObject({team:{botOwnerContext:{key:"scope-a",workspace:dir}}})
  current={key:"scope-b",workspace:join(dir,"new")};finish({ok:true,output:"old result"})
  await vi.waitFor(()=>expect(events.filter(e=>e.kind==="team_changed").at(-1)).toMatchObject({team:{botOriginScopeKey:"scope-a",members:[expect.objectContaining({botScopeKey:"scope-a"})]}}))
  const changed=events.filter((e):e is Extract<AgentEvent,{kind:"team_changed"}>=>e.kind==="team_changed").at(-1)!
  expect(changed.team.botOwnerContext).toBeUndefined()
 }finally{await rt.stop("main")}
})
it("Bot 使用普通 Native 会话工具，身份指令隔离且成员不能递归委派", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-bot-native-")); dirs.push(dir)
  const rt = new NativeRuntime({ credentials: memoryCredentials(), subagentChildEntry: "/unused/child.js" })
  const start = (id: string, bot?: { instructions: string; member: boolean }) => rt.start({
    sessionId: id, workspace: dir, sessionDir: join(dir, id), native: { provider: "deepseek", model: "deepseek-flash" }, ...(bot ? { bot: {...bot,ownerSessionId:"main",teamId:"team",memberName:"stats"} } : {}),
  } as SessionSpec)
  try {
    await start("main")
    await start("bot", { instructions: "你是长期统计助手 BOT_ROLE_SENTINEL", member: true })
    const sessions = (rt as unknown as { sessions: Map<string, { session: { systemPrompt: string; getActiveToolNames(): string[] } }> }).sessions
    const main = sessions.get("main")!.session, bot = sessions.get("bot")!.session
    expect(bot.systemPrompt).toContain("BOT_ROLE_SENTINEL")
    expect(main.systemPrompt).not.toContain("BOT_ROLE_SENTINEL")
    expect(bot.getActiveToolNames()).toContain("read")
    expect(bot.getActiveToolNames()).toContain("bot_message")
    expect(bot.getActiveToolNames()).toContain("bot_colleagues")
    expect(bot.getActiveToolNames()).toContain("bot_say")
    expect(bot.getActiveToolNames()).not.toContain("team_send")
    const metadata=(bot as unknown as {getAllTools(): {name:string;parameters:{additionalProperties?:boolean}}[]}).getAllTools().find(t=>t.name==="bot_message")!
    expect(metadata.parameters.additionalProperties).toBe(false)

    expect(bot.getActiveToolNames()).not.toContain("team_create")
    expect(bot.getActiveToolNames()).not.toContain("subagent")
    expect(main.getActiveToolNames()).toContain("team_create")
  } finally { await rt.stop("bot"); await rt.stop("main") }
})
it("主对话能从固定 Bot 名册派单，并按 Bot 原配置运行", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-bot-dispatch-")); dirs.push(dir)
  const rt = new NativeRuntime({ credentials: memoryCredentials(), subagentChildEntry: "/unused/child.js" })
  const seen: string[] = []
  ;(rt as unknown as { configureBots(bridge: unknown): void }).configureBots({
    list: () => [{ id: "stat", name: "统计", role: "统计分析", instructions: "检查模型", enabled: true }],
    run: async (_owner: string, req: { onSession(id: string): void }) => { req.onSession("member-stat"); seen.push("run"); return { ok: true, output: "已检查模型" } },
    result: () => { seen.push("result") },
  })
  try {
    await rt.start({ sessionId: "main", workspace: dir, sessionDir: join(dir, "main"), native: { provider: "deepseek", model: "deepseek-flash" } })
    const out = await (rt as unknown as { dispatchBotTask(owner: string, botId: string, instruction: string): Promise<{teamId:string;taskId:string}> }).dispatchBotTask("main", "stat", "检查模型")
    expect(out.taskId).toBeTruthy()
    for (let i=0;i<50 && !seen.includes("result");i++) await new Promise(r=>setTimeout(r,5))
    expect(seen).toEqual(["run", "result"])
    await rt.setConfigOption("main", "dawn.plan", "1")
    await expect((rt as unknown as { dispatchBotTask(owner:string,botId:string,instruction:string):Promise<unknown> }).dispatchBotTask("main", "stat", "写文件")).rejects.toThrow(/方案/)
  } finally { await rt.stop("main") }
})

// @ts-expect-error -- Shared deterministic inference server is a JavaScript module.
import {startMockInferenceServer, mockModelsJson} from "../../scripts/mock-inference-server.mjs"
import type {AgentEvent} from "../../src/runtime/types.js"
it("Bot 真实结构化问题只由对应会话回答，主会话不能代答",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"bot-question-"));dirs.push(dir)
 const server=await startMockInferenceServer({toolCall:(body:{messages:Array<{role:string}>})=>body.messages.at(-1)?.role==="user"?{toolName:"ask_user_question",args:{questions:[{id:"method",question:"选择方法",options:[{label:"OLS"},{label:"GLM"}]}]}}:undefined})
 const modelsPath=join(dir,"models.json");writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const runtime=new NativeRuntime({modelsPath}),events:AgentEvent[]=[]
 try{
  for(const id of ["main","bot"]){runtime.attach(id,e=>events.push(e));await runtime.start({sessionId:id,workspace:dir,sessionDir:join(dir,id),native:{provider:"deepseek",model:"deepseek-flash"},...(id==="bot"?{bot:{instructions:"统计Bot",member:true}}:{})})}
  runtime.write("bot","选择分析方法")
  await vi.waitFor(()=>expect(events.some(e=>e.kind==="question"&&e.sessionId==="bot"&&e.question.state==="pending")).toBe(true))
  const event=events.find((e):e is Extract<AgentEvent,{kind:"question"}>=>e.kind==="question"&&e.question.state==="pending")!
  const answer={answers:[{id:"method",selected:["OLS"]}]}
  expect(()=>runtime.answerQuestion("main",event.question.requestId,answer)).toThrow()
  runtime.answerQuestion("bot",event.question.requestId,answer);await runtime.waitForIdle("bot")
  expect(events.some(e=>e.kind==="question"&&e.sessionId==="bot"&&e.question.state==="answered")).toBe(true)
  expect(events.some(e=>e.kind==="question"&&e.sessionId==="main")).toBe(false)
 }finally{for(const id of ["main","bot"])await runtime.stop(id);await server.close()}
})
it("真实 pi 工具与权限请求按会话隔离，错误会话不能回答 Bot 的权限", {timeout: 30000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),"dawn-bot-permission-"));dirs.push(dir)
 const server=await startMockInferenceServer({toolCall:(body:{messages:Array<{role:string;content:string}>})=>{
  const last=body.messages.at(-1);if(last?.role!=="user")return undefined
  return {toolName:"write",args:{path:JSON.stringify(last.content).includes("BOT_PROBE")?"bot-probe.txt":"main-probe.txt",content:JSON.stringify(last.content)}}
 }})
 const modelsPath=join(dir,"models.json");writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)))
 const runtime=new NativeRuntime({modelsPath,gate:()=>({kind:"ask",reason:"test write",类别:"workspace_outside"} as never)})
 const events:AgentEvent[]=[]
 for(const id of ["main","bot","side"]){runtime.attach(id,e=>events.push(e));await runtime.start({sessionId:id,workspace:dir,sessionDir:join(dir,id),native:{provider:"deepseek",model:"deepseek-flash"},...(id==="bot"?{bot:{instructions:"BOT_ROLE",member:true}}:{})})}
 try {
  runtime.write("main","MAIN_PROBE");runtime.write("bot","BOT_PROBE")
  await vi.waitFor(()=>expect(events.filter(e=>e.kind==="permission_request"), JSON.stringify(events.filter(e=>e.kind==="notice"))).toHaveLength(2),{timeout:10000})
  const permissions=events.filter((e):e is Extract<AgentEvent,{kind:"permission_request"}>=>e.kind==="permission_request")
  const bot=permissions.find(e=>e.sessionId==="bot")!,main=permissions.find(e=>e.sessionId==="main")!
  runtime.answerPermission("side",bot.requestId,"allow_once")
  expect(events.filter(e=>e.kind==="permission_settled"&&e.sessionId==="bot")).toHaveLength(0)
  runtime.answerPermission("main",main.requestId,"allow_once");runtime.answerPermission("bot",bot.requestId,"reject")
  await Promise.all([runtime.waitForIdle("main"),runtime.waitForIdle("bot")])
  expect(existsSync(join(dir,"main-probe.txt"))).toBe(true);expect(existsSync(join(dir,"bot-probe.txt"))).toBe(false)
  expect(events.filter(e=>e.sessionId==="side").some(e=>e.kind==="permission_request"||e.kind==="output")).toBe(false)
 }finally{for(const event of events)if(event.kind==="permission_request")runtime.answerPermission(event.sessionId,event.requestId,"reject");for(const id of ["main","bot","side"])await runtime.stop(id);await server.close()}
})

it("finished all-removed teams retain their origin when the same owner moves project, including compatible legacy records",()=>{
 const rt=new NativeRuntime({credentials:memoryCredentials(),subagentChildEntry:"/unused/child.js"})
 let current={key:"scope-a",workspace:"/project-a"}
 rt.configureBots({list:()=>[],scopeKey:()=>current.key,ownerContext:()=>current,run:async()=>({ok:true,output:"unused"}),result:()=>{}})
 const team=建团队({name:"Analysis",goal:"Analyze",captainSessionId:"main"})
 加成员(team,{name:"stats",agent:"a",botId:"a",botScopeKey:"scope-a"});team.members[0]!.status="removed";team.finishedAt=2
 team.conversation=[{id:"old",role:"bot",from:"stats",botId:"a",content:"private-to-project-a result",createdAt:1,kind:"result"}]
 type StoredTeam=typeof team
 const snapshot=(rt as unknown as {botTeamSnapshot(owner:string,input:StoredTeam):StoredTeam&{botOwnerContext?:{key:string}}}).botTeamSnapshot.bind(rt)
 expect(snapshot("main",team)).toMatchObject({botOriginScopeKey:"scope-a",botOwnerContext:{key:"scope-a"}})
 current={key:"scope-b",workspace:"/project-b"}
 const moved=snapshot("main",team)
 expect(moved.botOriginScopeKey).toBe("scope-a");expect(moved.botOwnerContext).toBeUndefined()
 delete team.botOriginScopeKey
 const legacy=snapshot("main",team)
 expect(legacy.botOriginScopeKey).toBe("scope-a");expect(legacy.botOwnerContext).toBeUndefined()
 delete team.members[0]!.botScopeKey
 expect(snapshot("main",team).botOwnerContext).toBeUndefined()
})

it("取消排队任务不会停止同一 Bot 正在执行的任务或公共消息", async()=>{
 const dir=mkdtempSync(join(tmpdir(),"bot-stop-one-"));dirs.push(dir)
 const rt=new NativeRuntime({credentials:memoryCredentials(),subagentChildEntry:"/unused/child.js"})
 let activeSignal:AbortSignal|undefined,finish!:()=>void
 rt.configureBots({list:()=>[{id:"b",name:"b",role:"r",instructions:"i",enabled:true}],run:async(_owner,request)=>{
  activeSignal=request.signal;await new Promise<void>(r=>{finish=r;request.signal.addEventListener("abort",r as ()=>void,{once:true})});return{ok:true,output:"A完成"}
 },result:()=>{}})
 try{
  await rt.start({sessionId:"main",workspace:dir,sessionDir:join(dir,"main"),native:{provider:"deepseek",model:"deepseek-flash"}})
  const a=await rt.dispatchBotTask("main","b","A")
  await vi.waitFor(()=>expect(activeSignal).toBeDefined())
  const control=(rt as unknown as{botTeams:Map<string,{scheduler:团队调度器}>}).botTeams.get("main")!
  let b="";control.scheduler.改(a.teamId,t=>{b=加任务(t,{subject:"B",assignee:t.members[0]!.name}).id})
  control.scheduler.messageTeam(a.teamId,{id:"user-note",message:"核对数据",toBotId:"b"})
  rt.stopBotTask("main",a.teamId,b)
  expect(activeSignal!.aborted).toBe(false)
  expect(control.scheduler.读(a.teamId).conversationTurns?.[0]?.status).toBe("queued")
  finish()
  await vi.waitFor(()=>expect(control.scheduler.读(a.teamId).tasks.find(t=>t.id===a.taskId)?.status).toBe("completed"))
 }finally{rt.stopBotTeam("main");finish?.();await rt.stop("main")}
})

it("并发 Bot 的开始与结束事件按同一轮次配对",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"bot-turn-pair-"));dirs.push(dir)
 const rt=new NativeRuntime({credentials:memoryCredentials(),subagentChildEntry:"/unused/child.js"})
 const events:AgentEvent[]=[];rt.attach("main",e=>events.push(e))
 const finishes=new Map<string,()=>void>()
 rt.configureBots({list:()=>["a","b"].map(id=>({id,name:id,role:"r",instructions:"i",enabled:true})),run:async(_owner,request)=>{
  await new Promise<void>(r=>{finishes.set(request.member.botId!,r);request.signal.addEventListener("abort",r as ()=>void,{once:true})});return{ok:true,output:"done"}
 },result:()=>{}})
 try{
  await rt.start({sessionId:"main",workspace:dir,sessionDir:join(dir,"main"),native:{provider:"deepseek",model:"deepseek-flash"}})
  await rt.dispatchBotTask("main","a","A");await rt.dispatchBotTask("main","b","B")
  await vi.waitFor(()=>expect(finishes.size).toBe(2))
  finishes.get("a")!();await vi.waitFor(()=>expect(events.filter(e=>e.kind==="subagent_end")).toHaveLength(1))
  finishes.get("b")!();await vi.waitFor(()=>expect(events.filter(e=>e.kind==="subagent_end")).toHaveLength(2))
  const starts=events.filter(e=>e.kind==="subagent_start").map(e=>e.index)
  const ends=events.filter(e=>e.kind==="subagent_end").map(e=>e.index)
  expect(starts).toHaveLength(2);expect(ends).toEqual(starts)
 }finally{rt.stopBotTeam("main");for(const f of finishes.values())f();await rt.stop("main")}
})
