import { expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { BotStore } from "../../src/store/bots.js"
import { BotDispatchRejected, BotService } from "../../src/bot/service.js"
it("固定 Bot 按项目续聊，团队会话不复用私聊", async () => {
 const db=new Database(":memory:");migrate(db);const store=new BotStore(db);const bot=store.create({name:"统计",role:"统计",instructions:"先检查"})
 let next=0; const rows=new Map<string,unknown>();const owner={id:"main",workspace:"/tmp/a",projectId:"p",agentId:"native",sessionDir:"/tmp/main",state:"alive",createdAt:new Date().toISOString(),pinned:false,sortOrder:0} as const
 const service=new BotService({store,owner:(id: string)=>id==="main"?owner:undefined,create:async()=>{const session={sessionId:"b"+(++next)};rows.set(session.sessionId,session);return session},open:async (id: string)=>rows.get(id),dispatch:async()=>({teamId:"t",taskId:"t1"})} as never)
 try { const a=await service.open(bot.id,"main"); const b=await service.open(bot.id,"main");expect(a.sessionId).toBe(b.sessionId);const c=await service.open(bot.id,"main",true);expect(c.sessionId).not.toBe(a.sessionId);expect(store.listBindings()).toHaveLength(2) } finally {db.close()}
})
it("派单 requestId 重试只建立一次任务", async () => {
 const db=new Database(":memory:");migrate(db);const store=new BotStore(db);const bot=store.create({name:"统计",role:"统计",instructions:"先检查"});let calls=0
 const service=new BotService({store,owner:()=>({id:"main",workspace:"/tmp/a",agentId:"native"}),dispatch:async()=>{calls++;await Promise.resolve();return{teamId:"team",taskId:"t1"}}} as never)
 try {const req={requestId:"r",ownerSessionId:"main",botId:bot.id,instruction:"检查"};const result=await Promise.all([service.dispatch(req),service.dispatch(req)]);expect(calls).toBe(1);expect(result[0]).toEqual(result[1]);await expect(service.dispatch({...req,instruction:"其他任务"})).rejects.toThrow();store.update(bot.id,{enabled:false});expect(await service.dispatch(req)).toEqual(result[0]);expect(calls).toBe(1)}finally{db.close()}
})

it("分配结果不明时停用 Bot 也不能把旧请求变成明确拒绝", async () => {
 const db=new Database(":memory:");migrate(db);const store=new BotStore(db);const bot=store.create({name:"统计",role:"统计",instructions:"先检查"});let calls=0
 const service=new BotService({store,owner:()=>({id:"main",workspace:"/tmp/a",agentId:"native"}),dispatch:async()=>{calls++;throw Error("allocation receipt lost")}} as never)
 const req={requestId:"uncertain",ownerSessionId:"main",botId:bot.id,instruction:"检查"}
 try {
  await expect(service.dispatch(req)).rejects.toThrow("allocation receipt lost")
  store.update(bot.id,{enabled:false})
  try {await service.dispatch(req);throw Error("should reject")} catch(error){expect(error).not.toBeInstanceOf(BotDispatchRejected);expect(String(error)).toContain("allocation receipt lost")}
  expect(calls).toBe(1)
 } finally {db.close()}
})
