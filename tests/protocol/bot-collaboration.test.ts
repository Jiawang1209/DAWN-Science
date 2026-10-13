import {expect,it} from "vitest"
import {TeamSnapshotSchema} from "../../src/protocol/events.js"
import {OPERATIONS,只读模式该拦} from "../../src/protocol/operations.js"
const base={id:"team",name:"分析",goal:"分析",captainSessionId:"main",createdAt:1,members:[],tasks:[],messages:[],taskSeq:0}
const exchange={id:"r1",from:"stats",to:"data",fromBotId:"s",toBotId:"d",kind:"request",message:"核查异常值",status:"queued",taskId:"t1",attemptId:"a1",createdAt:2,updatedAt:2}
it("协作记录通过严格快照，旧团队仍兼容",()=>{
 expect(TeamSnapshotSchema.safeParse(base).success).toBe(true)
 expect(TeamSnapshotSchema.safeParse({...base,collaboration:[exchange]}).success).toBe(true)
 expect(TeamSnapshotSchema.safeParse({...base,collaboration:[{...exchange,status:"replied",reply:"编码值",resumedAt:4}]}).success).toBe(true)
})
it("拒绝虚构状态及未知协作字段",()=>{
 expect(TeamSnapshotSchema.safeParse({...base,collaboration:[{...exchange,status:"success-ish"}]}).success).toBe(false)
 expect(TeamSnapshotSchema.safeParse({...base,collaboration:[{...exchange,hiddenContext:"private"}]}).success).toBe(false)
})
it("用户可以在当前团队发言，但不能冒充 Bot 或指定项目范围",()=>{
 const op=(OPERATIONS as unknown as Record<string,{request:{parse:(v:unknown)=>unknown}}>).messageBotTeam!
 const input={ownerSessionId:"main",teamId:"team",requestId:"stable-id",message:"请在图中注明样本量",toBotId:"plot"}
 expect(op).toBeDefined()
 expect(op.request.parse(input)).toEqual(input)
 expect(()=>op.request.parse({...input,from:"stats"})).toThrow()
 expect(()=>op.request.parse({...input,scopeKey:"other"})).toThrow()
 expect(()=>op.request.parse({...input,message:"  "})).toThrow()
 expect(只读模式该拦("messageBotTeam" as never)).toBe(true)
})
it("多轮公开消息与当前 owner 范围经过严格快照校验",()=>{
 const snapshot={...base,botOwnerContext:{key:"scope",workspace:"/work"},collaboration:[{...exchange,parentExchangeId:"parent",rootOwner:"stats",rootOwnerBotId:"s"}],conversation:[{id:"user",role:"user",from:"user",content:"样本量",createdAt:1,kind:"message"}],conversationTurns:[{messageId:"user",member:"stats",botId:"s",scopeKey:"scope",status:"queued",updatedAt:1}]}
 expect(TeamSnapshotSchema.safeParse(snapshot).success).toBe(true)
 expect(TeamSnapshotSchema.safeParse({...snapshot,conversation:[{...snapshot.conversation[0],privateHistory:"leak"}]}).success).toBe(false)
 expect(TeamSnapshotSchema.safeParse({...snapshot,botOwnerContext:{...snapshot.botOwnerContext,secret:"no"}}).success).toBe(false)
})

it("accepts compatible stable team origin scope and rejects an empty origin",()=>{
 expect(TeamSnapshotSchema.safeParse({...base,botOriginScopeKey:"scope-a"}).success).toBe(true)
 expect(TeamSnapshotSchema.safeParse({...base,botOriginScopeKey:""}).success).toBe(false)
})
