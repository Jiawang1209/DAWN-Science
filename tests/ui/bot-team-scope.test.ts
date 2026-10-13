import {expect,it} from "vitest"
import {visibleBotTeam} from "../../src/ui/bot-team-scope.js"
import type {TeamSnapshot} from "../../src/protocol/index.js"
const context={workspace:"/project-a",projectId:"p",connectionId:"ssh",remoteCwd:"/a"}
const team={captainSessionId:"owner",botOriginScopeKey:"scope-a",botOwnerContext:{...context,key:"scope-a"},members:[{botId:"s",botScopeKey:"scope-a",status:"idle"}]} as unknown as TeamSnapshot
it("同 owner 换工作目录不能显示旧团队及其迟到消息",()=>{
 expect(visibleBotTeam(team,"owner",context)).toBe(team)
 expect(visibleBotTeam(team,"owner",{...context,workspace:"/project-b"})).toBeUndefined()
 expect(visibleBotTeam(team,"owner",{...context,remoteCwd:"/b"})).toBeUndefined()
 expect(visibleBotTeam({...team,botOwnerContext:{...context,remoteCwd:"/b",key:"scope-b"}},"owner",{...context,remoteCwd:"/b"})).toBeUndefined()
})
it("团队结束及成员全部移除后，历史仍只属于持久的原始范围",()=>{
 const ended={...team,finishedAt:5,members:team.members.map(m=>({...m,status:"removed" as const}))}
 expect(visibleBotTeam(ended,"owner",context)).toBe(ended)
 const moved={...context,workspace:"/project-b"}
 expect(visibleBotTeam({...ended,botOwnerContext:{...moved,key:"scope-b"}},"owner",moved)).toBeUndefined()
 expect(visibleBotTeam({...ended,botOriginScopeKey:undefined},"owner",context)).toBeUndefined()
})
it("远端无本机目录时依靠已加载的项目、服务器和 CWD 核对，不能借用旧服务器记录",()=>{
 const remote={...context,workspace:undefined}
 expect(visibleBotTeam(team,"owner",remote)).toBe(team)
 expect(visibleBotTeam(team,"owner",{...remote,connectionId:"other"})).toBeUndefined()
 expect(visibleBotTeam(team,"owner",{...remote,projectId:undefined})).toBeUndefined()
 expect(visibleBotTeam(team,"owner",{...remote,remoteCwd:undefined})).toBeUndefined()
})
it("尚未拿到权威上下文和其他主会话都不能显示，移除成员不影响当前范围",()=>{
 expect(visibleBotTeam({...team,botOwnerContext:undefined},"owner",context)).toBeUndefined()
 expect(visibleBotTeam(team,"other",context)).toBeUndefined()
 expect(visibleBotTeam(team,"owner",{...context,workspace:undefined,connectionId:undefined,remoteCwd:undefined})).toBeUndefined()
 const removed={...team,members:[...team.members,{botId:"old",botScopeKey:"other",status:"removed"}]} as unknown as TeamSnapshot
 expect(visibleBotTeam(removed,"owner",context)).toBe(removed)
})
