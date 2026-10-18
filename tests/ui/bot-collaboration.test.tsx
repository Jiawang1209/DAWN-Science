import {afterEach,expect,it,vi} from "vitest"
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react"
import {BotCollaboration} from "../../src/ui/bot-collaboration.js"
import type {TeamSnapshot} from "../../src/protocol/index.js"
import {botRoomKey,updateBotRoom} from "../../src/ui/state/bot-room.js"
import type {ReactElement,ComponentProps} from "react"
function renderDiscussion(element:ReactElement<ComponentProps<typeof BotCollaboration>>) {
 const p=element.props
 updateBotRoom(botRoomKey(p.ownerSessionId,p.scopeKey,p.team?.id),{page:"discussion"})
 return render(element)
}
afterEach(cleanup)
const exchange={id:"internal-id",from:"stats",to:"data",fromBotId:"s",toBotId:"d",kind:"request",message:"第六行 y=-999 是否是缺失编码？",status:"replied",reply:"是缺失编码，请保留原始数据并排除该行拟合。",taskId:"t1",attemptId:"a1",createdAt:1,updatedAt:2,resumedAt:3}
const team={id:"team",name:"分析",goal:"g",captainSessionId:"main",createdAt:1,members:[],tasks:[],messages:[],taskSeq:0,collaboration:[exchange]} as unknown as TeamSnapshot
const bots=[{id:"s",name:"统计助手"},{id:"d",name:"数据助手"}]
it("旧协作投影为连续请求与实际回应，按稳定 Bot ID 打开执行对话",()=>{
 const open=vi.fn(async()=>{})
 renderDiscussion(<BotCollaboration team={team} ownerSessionId="main" bots={bots} onView={open}/> )
 expect(screen.getByText("统计助手")).toBeTruthy()
 expect(screen.getByText("发给 数据助手")).toBeTruthy()
 expect(screen.queryByText(/internal-id/)).toBeNull()
 expect(within(screen.getByRole("log")).getByText(exchange.message)).toBeTruthy();expect(screen.getByText(exchange.reply)).toBeTruthy()
 fireEvent.click(screen.getByRole("button",{name:"查看数据助手的协作对话"}))
 expect(open).toHaveBeenCalledWith("d")
})
it("切换主会话不能展示其他项目协作，空态明确",()=>{
 renderDiscussion(<BotCollaboration team={team} ownerSessionId="other" bots={bots} onView={async()=>{}}/> )
 expect(screen.queryByText(exchange.message)).toBeNull()
 expect(screen.getByText("当前对话还没有 Bot 协作记录")).toBeTruthy()
})
it("失败与中断明确展示，不能显示已接回",()=>{
 renderDiscussion(<BotCollaboration team={{...team,collaboration:[{...exchange,status:"interrupted",resumedAt:undefined,reply:"应用重启，未自动重放"}] } as unknown as TeamSnapshot} ownerSessionId="main" bots={bots} onView={async()=>{}}/> )
 expect(screen.getAllByText("已中断").length).toBeGreaterThan(0);expect(screen.queryByText("已接回")).toBeNull()
})
