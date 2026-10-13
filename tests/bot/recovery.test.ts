import{expect,it}from"vitest"
import{recoverBotTeam}from"../../src/bot/recovery.js"
import{建团队,加成员,加任务,领取,开始做}from"../../src/team/state.js"
it("重启只收尾中断的 Bot 任务，不自动重放写入，旧子 agent 不受影响",()=>{
 const team=建团队({name:"test",goal:"goal",captainSessionId:"main"});加成员(team,{name:"bot",agent:"bot-x",botId:"x"});加成员(team,{name:"old",agent:"old"})
 const t=加任务(team,{subject:"write",assignee:"bot"});const a=领取(team,t.id,"bot");开始做(team,t.id,a.attemptId);const legacy=加任务(team,{subject:"legacy",assignee:"old"});加任务(team,{subject:"queued",assignee:"bot"})
 expect(recoverBotTeam(team)).toBe(true);expect(team.tasks[0]?.status).toBe("failed");expect(team.tasks[0]?.attemptId).toBeUndefined();expect(team.tasks[2]?.status).toBe("failed");expect(legacy.status).toBe("pending");expect(recoverBotTeam(team)).toBe(false)
})
it("纯 Bot 团队的共享排队任务重启后也中断，混合团队保留旧成员共享任务",()=>{
 const team=建团队({name:"test",goal:"goal",captainSessionId:"main"});加成员(team,{name:"bot",agent:"bot-x",botId:"x"});const shared=加任务(team,{subject:"shared write"})
 expect(recoverBotTeam(team)).toBe(true);expect(shared.status).toBe("failed")
 const mixed=建团队({name:"mixed",goal:"goal",captainSessionId:"main"});加成员(mixed,{name:"bot",agent:"bot-x",botId:"x"});加成员(mixed,{name:"old",agent:"old"});const legacy=加任务(mixed,{subject:"shared legacy"});recoverBotTeam(mixed);expect(legacy.status).toBe("pending")
})
it("重启将待送、执行中及未续接的协作标记中断，已消费的历史回复保留且不会重放",()=>{
 const team=建团队({name:"test",goal:"goal",captainSessionId:"main"});加成员(team,{name:"bot",agent:"a",botId:"a"});加成员(team,{name:"peer",agent:"b",botId:"b"})
 team.collaboration=(["queued","working","replied","failed","cancelled"] as const).map((status,i)=>({id:String(i),from:"bot",to:"peer",fromBotId:"a",toBotId:"b",kind:"request",message:"check",status,createdAt:1,updatedAt:1}))
 team.collaboration.push({id:"done",from:"bot",to:"peer",fromBotId:"a",toBotId:"b",kind:"request",message:"check",status:"replied",reply:"verified",createdAt:1,updatedAt:2,resumedAt:3})
 expect(recoverBotTeam(team)).toBe(true)
 expect(team.collaboration.slice(0,5).map(x=>x.status)).toEqual(Array(5).fill("interrupted"))
 expect(team.collaboration[5]).toMatchObject({status:"replied",reply:"verified",resumedAt:3})
 expect(recoverBotTeam(team)).toBe(false)
})

it("interrupts queued and working public user deliveries on restart without replaying or changing public history",()=>{
 const team=建团队({name:"test",goal:"goal",captainSessionId:"main"});加成员(team,{name:"bot",agent:"a",botId:"a"})
 team.conversation=[{id:"user-1",role:"user",from:"user",content:"use dry mass",createdAt:1,kind:"message"}]
 team.conversationTurns=(['queued','working','replied'] as const).map((status,i)=>({messageId:`user-${i}`,member:"bot",botId:"a",status,updatedAt:1}))
 expect(recoverBotTeam(team)).toBe(true)
 expect(team.conversationTurns.map(t=>t.status)).toEqual(["interrupted","interrupted","replied"])
 expect(team.conversation?.[0]).toMatchObject({id:"user-1",role:"user",content:"use dry mass"})
 expect(team.conversation?.filter(m=>m.role==="system")).toHaveLength(2)
 expect(recoverBotTeam(team)).toBe(false)
})
