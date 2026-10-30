import{expect,it}from"vitest"
import Database from"better-sqlite3"
import{migrate}from"../../src/store/schema.js"
import{BotStore}from"../../src/store/bots.js"
import{BotDelivery}from"../../src/bot/delivery.js"
it("没有待送结果的普通会话不查询native专用忙碌状态",async()=>{
 const db=new Database(":memory:");migrate(db);const store=new BotStore(db)
 const delivery=new BotDelivery({store,busy:()=>{throw Error("native only")},history:async()=>"",send:async()=>{throw Error("unexpected send")}})
 try{await expect(delivery.flush("kernel-session")).resolves.toBeUndefined()}finally{db.close()}
})
it("忙碌时不发、转录已有结果不重发、送达失败保留待送",async()=>{
 const db=new Database(":memory:");migrate(db);const store=new BotStore(db)
 const bot=store.create({name:"b",role:"r",instructions:"i"});store.enqueueResult({resultId:"r",ownerSessionId:"main",botId:bot.id,teamId:"t",taskId:"task",attemptId:"a",memberSessionId:"s",status:"completed",summary:"result",artifacts:[]})
 let busy=true,calls=0,history="";const delivery=new BotDelivery({store,busy:()=>busy,history:async()=>history,send:async()=>{calls++;throw Error("offline")}})
 try{await delivery.flush("main");expect(calls).toBe(0);busy=false;await delivery.flush("main");expect(calls).toBe(1);expect(store.pendingResults("main")).toHaveLength(1);history="[bot-result:r]";await delivery.flush("main");expect(calls).toBe(1);expect(store.pendingResults("main")).toHaveLength(0)}finally{db.close()}
})
it("预检失败后不被 idle 重试循环触发，明确恢复后重新送达并核对持久回执",async()=>{
 const db=new Database(":memory:");migrate(db);const store=new BotStore(db)
 const bot=store.create({name:"b",role:"r",instructions:"i"});store.enqueueResult({resultId:"r",ownerSessionId:"main",botId:bot.id,teamId:"t",taskId:"task",attemptId:"a",memberSessionId:"s",status:"completed",summary:"result",artifacts:[]})
 let calls=0,history="",fail=true,receipt=false
 const delivery=new BotDelivery({store,busy:()=>false,history:async()=>history,send:async(_id,text)=>{calls++;if(fail)throw Error("model removed");if(receipt)history=text}})
 try{
  await delivery.flush("main");await delivery.flush("main");expect(calls).toBe(1)
  delivery.resume("main");fail=false;await delivery.flush("main");expect(calls).toBe(2);expect(store.pendingResults("main")).toHaveLength(1)
  receipt=true;delivery.resume("main");await delivery.flush("main");expect(calls).toBe(3);expect(store.pendingResults("main")).toHaveLength(0)
  await delivery.flush("main");expect(calls).toBe(3)
 }finally{db.close()}
})
