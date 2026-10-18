import {afterEach,expect,it,vi} from "vitest"
import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react"
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
const bots=[{id:"s",name:"统计助手",role:"统计建模"},{id:"d",name:"数据助手",role:"数据核查"}]
const conversation=[
 {id:"a",role:"bot",from:"stats",botId:"s",content:"第六行 -999 需要核查。",createdAt:1,toBotId:"d",kind:"request"},
 {id:"b",role:"bot",from:"data",botId:"d",content:"你希望排除缺失行，还是进行插补？",createdAt:2,toBotId:"s",kind:"request"},
 {id:"c",role:"user",from:"user",content:"请注明样本量，并保留原始文件。",createdAt:3,kind:"message"},
 {id:"d",role:"bot",from:"stats",botId:"s",content:"保留原始文件，排除该缺失行后拟合。",createdAt:4,toBotId:"d",kind:"reply"},
]
const team={id:"team",name:"分析小组",goal:"分析数据",captainSessionId:"main",createdAt:1,members:[{name:"stats",botId:"s",status:"idle"},{name:"data",botId:"d",status:"working"}],tasks:[],messages:[],taskSeq:0,conversation} as unknown as TeamSnapshot
it("同一条时间线直接显示追问、用户插话及实际回答，无需展开卡片",()=>{
 const open=vi.fn(async()=>{})
 renderDiscussion(<BotCollaboration team={team} ownerSessionId="main" bots={bots} onView={open}/>)
 const log=screen.getByRole("log",{name:"团队消息"})
 expect(within(log).getAllByRole("listitem").map(el=>el.textContent)).toEqual(expect.arrayContaining(conversation.map(x=>expect.stringContaining(x.content))))
 expect(log.textContent!.indexOf(conversation[1]!.content)).toBeLessThan(log.textContent!.indexOf(conversation[2]!.content))
 expect(screen.queryByText("查看交流内容")).toBeNull()
 fireEvent.click(screen.getAllByRole("button",{name:"查看数据助手的协作对话"})[0]!)
 expect(open).toHaveBeenCalledWith("d")
})
it("目标来自当前团队，消息发送后清空草稿，参数含稳定请求 ID",async()=>{
 const send=vi.fn(async()=>{})
 renderDiscussion(<BotCollaboration team={team} ownerSessionId="main" bots={[...bots,{id:"outside",name:"别的项目助手"}]} onView={async()=>{}} onSend={send}/>)
 expect(screen.queryByRole("option",{name:"别的项目助手"})).toBeNull()
 fireEvent.change(screen.getByLabelText("发言对象"),{target:{value:"d"}})
 const input=screen.getByRole("textbox",{name:"给团队发消息"})
 fireEvent.change(input,{target:{value:"请注明样本量"}})
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}))
 await waitFor(()=>expect(send).toHaveBeenCalledWith({requestId:expect.any(String),message:"请注明样本量",toBotId:"d"}))
 await waitFor(()=>expect((input as HTMLTextAreaElement).value).toBe(""))
})
it("系统时钟回拨也按持久追加顺序显示讨论",()=>{
 renderDiscussion(<BotCollaboration team={{...team,conversation:conversation.map((m,i)=>({...m,createdAt:100-i}))} as unknown as TeamSnapshot} ownerSessionId="main" bots={bots} onView={async()=>{}}/>)
 const rows=within(screen.getByRole("log")).getAllByRole("listitem")
 expect(rows.map(el=>el.querySelector(".bot-room-content")?.textContent)).toEqual(conversation.map(m=>m.content))
})
it("每位发言者有独立气泡与固定头像，专业身份在重复发言中保持一致",()=>{
 renderDiscussion(<BotCollaboration team={team} ownerSessionId="main" bots={bots} onView={async()=>{}}/>)
 const rows=within(screen.getByRole("log")).getAllByRole("listitem")
 expect(rows.every(row=>!!row.querySelector(".bot-room-bubble"))).toBe(true)
 const avatars=rows.map(row=>within(row).getByRole("img",{name:/头像/}))
 expect(avatars[0]!.getAttribute("data-identity")).toBe("s")
 expect(avatars[1]!.getAttribute("data-identity")).toBe("d")
 expect(avatars[3]!.getAttribute("data-identity")).toBe("s")
 expect(avatars[0]!.innerHTML).toBe(avatars[3]!.innerHTML)
 expect(avatars[0]!.innerHTML).not.toBe(avatars[1]!.innerHTML)
 expect(within(rows[0]!).getByText("统计建模")).toBeTruthy()
 expect(within(rows[1]!).getByText("数据核查")).toBeTruthy()
 expect(within(rows[2]!).getByRole("img",{name:"你的头像"})).toBeTruthy()
})
it("发送错误保留草稿与请求 ID，重试不会制造重复插话",async()=>{
 const send=vi.fn().mockRejectedValueOnce(Error("连接中断")).mockResolvedValueOnce(undefined)
 renderDiscussion(<BotCollaboration team={team} ownerSessionId="main" bots={bots} onView={async()=>{}} onSend={send}/>)
 const input=screen.getByRole("textbox",{name:"给团队发消息"})
 fireEvent.change(input,{target:{value:"保留原始文件"}})
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}))
 await screen.findByRole("alert")
 expect((input as HTMLTextAreaElement).value).toBe("保留原始文件")
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}))
 await waitFor(()=>expect(send).toHaveBeenCalledTimes(2))
 expect(send.mock.calls[0]![0]).toEqual(send.mock.calls[1]![0])
})
it("同 owner 换项目清除草稿，旧请求迟到不污染新范围",async()=>{
 let resolve!:()=>void
 const send=vi.fn(()=>new Promise<void>(r=>{resolve=r}))
 const props={team,ownerSessionId:"main",bots,onView:async()=>{},onSend:send}
 const view=renderDiscussion(<BotCollaboration {...props} scopeKey="A"/>)
 fireEvent.change(screen.getByRole("textbox",{name:"给团队发消息"}),{target:{value:"旧项目补充"}})
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}))
 view.rerender(<BotCollaboration {...props} scopeKey="B"/>)
 fireEvent.change(screen.getByRole("textbox",{name:"给团队发消息"}),{target:{value:"新项目草稿"}})
 resolve()
 await waitFor(()=>expect((screen.getByRole("textbox",{name:"给团队发消息"}) as HTMLTextAreaElement).value).toBe("新项目草稿"))
})
it("非当前主会话不显示消息或输入，结束的团队保留对话但不能发送",()=>{
 const props={team,ownerSessionId:"other",bots,onView:async()=>{},onSend:async()=>{}}
 const view=renderDiscussion(<BotCollaboration {...props}/>)
 expect(screen.queryByText(conversation[0]!.content)).toBeNull()
 expect(screen.queryByRole("textbox")).toBeNull()
 view.rerender(<BotCollaboration {...props} ownerSessionId="main" team={{...team,finishedAt:5}}/>)
 expect(screen.getByText(conversation[0]!.content)).toBeTruthy()
 expect(screen.queryByRole("textbox")).toBeNull()
 expect(screen.getByText("团队已结束")).toBeTruthy()
})

it("普通卸载后恢复同团队草稿、对象和阅读位置，其他范围隔离",()=>{
 const props={team,ownerSessionId:"main",scopeKey:"scope",bots,onView:async()=>{},onSend:async()=>{}}
 const view=renderDiscussion(<BotCollaboration {...props}/>)
 fireEvent.change(screen.getByRole("textbox",{name:"给团队发消息"}),{target:{value:"保留草稿"}})
 fireEvent.change(screen.getByLabelText("发言对象"),{target:{value:"d"}})
 const log=screen.getByRole("log");Object.defineProperty(log,"scrollHeight",{value:600});Object.defineProperty(log,"clientHeight",{value:100});log.scrollTop=123;fireEvent.scroll(log)
 view.unmount();const again=renderDiscussion(<BotCollaboration {...props}/>)
 expect((screen.getByRole("textbox",{name:"给团队发消息"}) as HTMLTextAreaElement).value).toBe("保留草稿")
 expect((screen.getByLabelText("发言对象") as HTMLSelectElement).value).toBe("d")
 expect(screen.getByRole("log").scrollTop).toBe(123)
 again.rerender(<BotCollaboration {...props} scopeKey="other"/>)
 expect((screen.getByRole("textbox",{name:"给团队发消息"}) as HTMLTextAreaElement).value).toBe("")
})
it("卸载后发送失败重试保留同一幂等 ID",async()=>{
 const send=vi.fn().mockRejectedValueOnce(Error("网络中断")).mockResolvedValueOnce(undefined)
 const props={team,ownerSessionId:"main",scopeKey:"retry-scope",bots,onView:async()=>{},onSend:send}
 const view=renderDiscussion(<BotCollaboration {...props}/>)
 fireEvent.change(screen.getByRole("textbox",{name:"给团队发消息"}),{target:{value:"检查样本量"}})
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}));await screen.findByRole("alert")
 view.unmount();renderDiscussion(<BotCollaboration {...props}/>)
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}));await waitFor(()=>expect(send).toHaveBeenCalledTimes(2))
 expect(send.mock.calls[1]![0]).toEqual(send.mock.calls[0]![0])
})
it("成员状态来自实际团队，发言按钮独立选择对象",()=>{
 const busyTeam={...team,members:[{...team.members[0]!,attention:"permission" as const},team.members[1]!]}
 render(<BotCollaboration team={busyTeam} ownerSessionId="main" bots={bots} onView={async()=>{}} onSend={async()=>{}}/>)
 const members=screen.getByRole("group",{name:"团队成员"})
 expect(within(members).getByText("待批准")).toBeTruthy()
 expect(within(members).getByText("处理中")).toBeTruthy()
 fireEvent.click(within(members).getByRole("button",{name:"向数据助手发言"}))
 expect((screen.getByLabelText("发言对象") as HTMLSelectElement).value).toBe("d")
})
it("用户消息逐成员展示处理状态，不为旧消息虚构送达",()=>{
 const deliveries=[{messageId:"c",member:"stats",botId:"s",status:"replied",updatedAt:5},{messageId:"c",member:"data",botId:"d",status:"failed",reply:"连接中断",updatedAt:6}]
 const props={team:{...team,conversationTurns:deliveries} as TeamSnapshot,ownerSessionId:"main",bots,onView:async()=>{}}
 const view=renderDiscussion(<BotCollaboration {...props}/>)
 const status=screen.getByRole("group",{name:"消息处理状态"})
 expect(within(status).getByText("统计助手 · 已回应")).toBeTruthy()
 expect(within(status).getByText("数据助手 · 处理失败")).toBeTruthy()
 expect(within(status).getByTitle("连接中断")).toBeTruthy()
 view.rerender(<BotCollaboration {...props} team={team}/>)
 expect(screen.queryByRole("group",{name:"消息处理状态"})).toBeNull()
})
it("结果气泡渲染 Markdown 并仅内嵌预览该次任务已校验的产物",async()=>{
 const open=vi.fn(),read=vi.fn(async()=>({kind:"text" as const,mediaType:"text/x-python",text:"print(42)",bytes:9}))
 const resultTeam={...team,tasks:[{id:"t1",subject:"模型",assignee:"stats",status:"completed",attempt:1,attemptId:"a1",dependencies:[],createdAt:1,updatedAt:5,artifacts:["/project/scripts/model.py"]}],conversation:[{id:"result:t1:a1",role:"bot",from:"stats",botId:"s",kind:"result",createdAt:5,content:"**模型完成**\n\n`unverified.py`"},{id:"old",role:"bot",from:"stats",botId:"s",kind:"message",createdAt:6,content:"/project/unknown.py"}]} as TeamSnapshot
 renderDiscussion(<BotCollaboration team={resultTeam} ownerSessionId="main" bots={bots} onView={async()=>{}} readArtifact={read}/>)
 expect(screen.getByText("模型完成").tagName).toBe("STRONG")
 const log=screen.getByRole("log")
 fireEvent.click(within(log).getByRole("button",{name:"查看产物：model.py"}))
 expect(await within(log).findByRole("region",{name:"/project/scripts/model.py"})).toHaveProperty("textContent","print(42)")
 expect(read).toHaveBeenCalledWith("/project/scripts/model.py")
 expect(open).not.toHaveBeenCalled()
 expect(within(log).queryByRole("button",{name:/unknown.py|unverified.py/})).toBeNull()
})
it("选择的成员离队后不能将原定向草稿静默广播",async()=>{
 const send=vi.fn(async()=>{})
 const props={team,ownerSessionId:"main",scopeKey:"removed-recipient",bots,onView:async()=>{},onSend:send}
 const view=renderDiscussion(<BotCollaboration {...props}/>)
 fireEvent.change(screen.getByLabelText("发言对象"),{target:{value:"d"}})
 fireEvent.change(screen.getByRole("textbox",{name:"给团队发消息"}),{target:{value:"只问数据助手"}})
 view.rerender(<BotCollaboration {...props} team={{...team,members:team.members.filter(m=>m.botId!=="d")}}/>)
 expect((screen.getByRole("button",{name:"发表到团队"}) as HTMLButtonElement).disabled).toBe(true)
 expect(screen.getByText("所选成员已离队，请重新选择发言对象")).toBeTruthy()
 expect(send).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText("发言对象"),{target:{value:"s"}})
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}))
 await waitFor(()=>expect(send).toHaveBeenCalledWith(expect.objectContaining({toBotId:"s",message:"只问数据助手"})))
})
it("发表消息收到回执后回到底部，即使后台先前已经追加过消息",async()=>{
 renderDiscussion(<BotCollaboration team={team} ownerSessionId="main" scopeKey="send-scroll" bots={bots} onView={async()=>{}} onSend={async()=>{}}/>)
 const log=screen.getByRole("log");Object.defineProperty(log,"scrollHeight",{value:600});Object.defineProperty(log,"clientHeight",{value:100});log.scrollTop=123;fireEvent.scroll(log)
 fireEvent.change(screen.getByRole("textbox",{name:"给团队发消息"}),{target:{value:"继续"}})
 fireEvent.click(screen.getByRole("button",{name:"发表到团队"}))
 await waitFor(()=>expect((screen.getByRole("textbox",{name:"给团队发消息"}) as HTMLTextAreaElement).value).toBe(""))
 expect(log.scrollTop).toBe(600)
})

const artifactTeam={...team,tasks:[{id:"inline",subject:"模型",assignee:"stats",status:"completed",attempt:1,attemptId:"a",dependencies:[],createdAt:1,updatedAt:5,artifacts:["scripts/model.py","figures/chart.svg","notes/method.md"]}],conversation:[{id:"result:inline:a",role:"bot",from:"stats",botId:"s",kind:"result",createdAt:5,content:"分析完成"}]} as TeamSnapshot
const scriptContent={kind:"text" as const,mediaType:"text/x-python",text:"print(42)",bytes:9}
it("脚本和图片在原气泡展开，× 收起后焦点回到文件且草稿不丢",async()=>{
 const read=vi.fn(async(path:string)=>path.endsWith("svg")?{kind:"image" as const,mediaType:"image/svg+xml",bytes:4,base64:"PHN2Zy8+"}:scriptContent)
 renderDiscussion(<BotCollaboration team={artifactTeam} ownerSessionId="main" scopeKey="inline-close" bots={bots} onView={async()=>{}} onSend={async()=>{}} readArtifact={read}/>)
 const draft=screen.getByRole("textbox",{name:"给团队发消息"});fireEvent.change(draft,{target:{value:"继续核对"}})
 const trigger=screen.getByRole("button",{name:"查看产物：model.py"});fireEvent.click(trigger)
 expect(await screen.findByRole("region",{name:"scripts/model.py"})).toHaveProperty("textContent","print(42)")
 expect(trigger.getAttribute("aria-expanded")).toBe("true")
 fireEvent.click(screen.getByRole("button",{name:"收起预览"}))
 expect(screen.queryByRole("region",{name:"scripts/model.py"})).toBeNull();expect(document.activeElement).toBe(trigger)
 expect((draft as HTMLTextAreaElement).value).toBe("继续核对")
 fireEvent.click(screen.getByRole("button",{name:"查看产物：chart.svg"}))
 expect((await screen.findByRole("img",{name:"预览：figures/chart.svg"})).getAttribute("src")).toBe("data:image/svg+xml;base64,PHN2Zy8+")
 expect(screen.queryByRole("region",{name:"scripts/model.py"})).toBeNull()
 fireEvent.click(screen.getByRole("button",{name:"收起预览"}));expect(screen.queryByRole("img",{name:"预览：figures/chart.svg"})).toBeNull()
})
it("加载中可关闭，迟到读取不复活；快速换文件不会张冠李戴",async()=>{
 const resolve:((value:typeof scriptContent)=>void)[]=[]
 const read=vi.fn(()=>new Promise<typeof scriptContent>(r=>resolve.push(r)))
 renderDiscussion(<BotCollaboration team={artifactTeam} ownerSessionId="main" scopeKey="inline-race" bots={bots} onView={async()=>{}} readArtifact={read}/>)
 fireEvent.click(screen.getByRole("button",{name:"查看产物：model.py"}));await waitFor(()=>expect(read).toHaveBeenCalledTimes(1))
 fireEvent.click(screen.getByRole("button",{name:"收起预览"}));resolve[0]!(scriptContent)
 await waitFor(()=>expect(screen.queryByRole("region",{name:"scripts/model.py"})).toBeNull())
 fireEvent.click(screen.getByRole("button",{name:"查看产物：model.py"}));await waitFor(()=>expect(read).toHaveBeenCalledTimes(2))
 fireEvent.click(screen.getByRole("button",{name:"查看产物：method.md"}));await waitFor(()=>expect(read).toHaveBeenCalledTimes(3))
 resolve[2]!({...scriptContent,mediaType:"text/markdown",text:"**新说明**"});await screen.findByText("新说明")
 resolve[1]!(scriptContent)
 await waitFor(()=>expect(screen.queryByText("print(42)")).toBeNull())
})
it("读取失败在消息内出声并可重试，不触发文件页签",async()=>{
 const open=vi.fn(),read=vi.fn().mockRejectedValueOnce(Error("找不到文件")).mockResolvedValue(scriptContent)
 renderDiscussion(<BotCollaboration team={artifactTeam} ownerSessionId="main" scopeKey="inline-error" bots={bots} onView={async()=>{}} readArtifact={read}/>)
 fireEvent.click(screen.getByRole("button",{name:"查看产物：model.py"}));expect(await screen.findByRole("alert")).toHaveProperty("textContent",expect.stringContaining("找不到文件"))
 fireEvent.click(screen.getByRole("button",{name:"重试"}));await screen.findByRole("region",{name:"scripts/model.py"})
 expect(read).toHaveBeenCalledTimes(2);expect(open).not.toHaveBeenCalled()
})
it("普通导航恢复展开路径，但不同范围不显示旧文件或迟到内容",async()=>{
 let resolve!:(value:typeof scriptContent)=>void
 const read=vi.fn(()=>new Promise<typeof scriptContent>(r=>{resolve=r}))
 const props={team:artifactTeam,ownerSessionId:"main",bots,onView:async()=>{},readArtifact:read}
 const view=renderDiscussion(<BotCollaboration {...props} scopeKey="inline-scope-A"/>)
 fireEvent.click(screen.getByRole("button",{name:"查看产物：model.py"}));await waitFor(()=>expect(read).toHaveBeenCalledTimes(1))
 view.rerender(<BotCollaboration {...props} scopeKey="inline-scope-B"/>);resolve(scriptContent)
 await waitFor(()=>expect(screen.queryByRole("button",{name:"收起预览"})).toBeNull())
 view.rerender(<BotCollaboration {...props} scopeKey="inline-scope-A"/>);await waitFor(()=>expect(read).toHaveBeenCalledTimes(2));resolve(scriptContent)
 await screen.findByRole("region",{name:"scripts/model.py"})
 view.unmount();renderDiscussion(<BotCollaboration {...props} scopeKey="inline-scope-A"/>);await waitFor(()=>expect(read).toHaveBeenCalledTimes(3))
 expect(screen.getByRole("button",{name:"收起预览"})).toBeTruthy()
})
