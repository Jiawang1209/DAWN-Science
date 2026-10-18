import {expect,it} from "vitest"
import type {TeamSnapshot} from "../../src/protocol/index.js"
import {summarizeBotTeam} from "../../src/ui/bot-team-summary.js"
const task={id:"t",subject:"拟合",assignee:"stats",status:"completed",attempt:1,attemptId:"a",updatedAt:10,createdAt:1,dependencies:[],artifacts:["/w/model.csv","/w/fig.svg"]}
const team={id:"team",captainSessionId:"owner",name:"分析",goal:"分析",members:[{name:"stats",botId:"s",status:"idle"},{name:"data",botId:"d",status:"idle"}],tasks:[task],conversation:[{id:"r",role:"bot",botId:"d",kind:"reply",content:"核查已回应",createdAt:11}],messages:[],taskSeq:1} as unknown as TeamSnapshot
it("completed task and available member coexist; peer replies do not become completed tasks",()=>{
 const s=summarizeBotTeam(team)
 expect(s.returned).toBe(1);expect(s.total).toBe(1)
 expect(s.members[0]).toMatchObject({state:"completed",available:true})
 expect(s.members[1]).toMatchObject({state:"replied",available:true})
})
it("only current completed attempts expose deduplicated verified artifacts, never prose paths",()=>{
 const s=summarizeBotTeam({...team,tasks:[{...team.tasks[0]!,output:"/secret.png"},{...team.tasks[0]!,id:"t2",artifacts:["/w/model.csv"]},{...team.tasks[0]!,id:"bad",status:"failed",artifacts:["/w/old.png"]},{...team.tasks[0]!,id:"legacy",attemptId:undefined,artifacts:["/w/legacy.png"]}]})
 expect(s.files.map(f=>f.path)).toEqual(["/w/model.csv","/w/fig.svg"])
 expect(s.files[0]!.sources).toHaveLength(2)
})
it("attention and unresolved current-attempt exchanges have precise states; stale attempts cannot block",()=>{
 const x={id:"x",fromBotId:"s",toBotId:"d",from:"stats",to:"data",taskId:"t",attemptId:"a",status:"replied",createdAt:1,updatedAt:2,kind:"request",message:"核查"} as const
 expect(summarizeBotTeam({...team,tasks:[{...team.tasks[0]!,status:"in_progress"}],collaboration:[x]}).members[0]!.state).toBe("resuming")
 expect(summarizeBotTeam({...team,tasks:[{...team.tasks[0]!,status:"in_progress",attemptId:"b"}],collaboration:[x]}).members[0]!.state).toBe("working")
 expect(summarizeBotTeam({...team,members:[{...team.members[0]!,attention:"question"}]}).members[0]!.state).toBe("question")
})
it("cancelled, failed and text-only results remain distinct, removed members do not leak files",()=>{
 expect(summarizeBotTeam({...team,tasks:[{...team.tasks[0]!,status:"cancelled"}]}).members[0]!.state).toBe("cancelled")
 expect(summarizeBotTeam({...team,tasks:[{...team.tasks[0]!,status:"failed"}]}).returned).toBe(0)
 expect(summarizeBotTeam({...team,tasks:[{...team.tasks[0]!,artifacts:[]}]}).files).toEqual([])
 expect(summarizeBotTeam({...team,members:[{...team.members[0]!,status:"removed"}]}).files).toEqual([])
})
it("failed peer work without an assigned task is actionable, not an available successful reply",()=>{
 const peer={id:"peer",from:"stats",to:"data",fromBotId:"s",toBotId:"d",kind:"request",message:"核查",status:"interrupted",createdAt:1,updatedAt:15} as const
 expect(summarizeBotTeam({...team,collaboration:[peer]}).members[1]!.state).toBe("interrupted")
 expect(summarizeBotTeam({...team,collaboration:[{...peer,status:"queued"}]}).members[1]!.state).toBe("queued")
})
