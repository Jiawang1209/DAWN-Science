import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { BotPane } from "../../src/ui/bot-pane.js"
import { $bots, clearBotSession, $botSession } from "../../src/ui/state/bots.js"
import type { WorkbenchClient } from "../../src/ui/client.js"
const bot = { id: "b", name: "统计助手", role: "模型检查", instructions: "检查假设", enabled: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
beforeEach(() => { $bots.set([]); clearBotSession() })
afterEach(cleanup)
it("creates a professional Bot then opens only a backend scoped conversation", async () => {
  const get = vi.fn(async (op, input) => {
    if (op === "listBots") return { bots: $bots.get().length ? [bot] : [] }
    if (op === "createBot") { $bots.set([bot]); return { bot } }
    if (op === "openBotConversation") return { session: { sessionId: "direct", title: "Bot", kind: "native", state: "alive" } }
    throw Error(op)
  })
  render(<BotPane client={{ get } as unknown as WorkbenchClient} ownerSessionId="main" models={[]} conversation={() => undefined} />)
  fireEvent.click(await screen.findByRole("button", { name: "创建 Bot" }))
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "统计助手" } })
  fireEvent.change(screen.getByLabelText("专业职责"), { target: { value: "模型检查" } })
  fireEvent.change(screen.getByLabelText("工作指令"), { target: { value: "检查假设" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  fireEvent.click(await screen.findByRole("button", { name: "与统计助手交流" }))
  await waitFor(() => expect($botSession.get()?.sessionId).toBe("direct"))
  expect(get).toHaveBeenCalledWith("openBotConversation", { botId: "b", ownerSessionId: "main" })
})
it("scope switch clears visible old conversation without stopping it", async () => {
  const get = vi.fn(async (_op: string) => ({ bots: [bot] }))
  const p = { client: { get } as unknown as WorkbenchClient, models: [], conversation: () => undefined }
  const view = render(<BotPane {...p} ownerSessionId="a" />)
  await screen.findByRole("button", { name: "与统计助手交流" })
  view.rerender(<BotPane {...p} ownerSessionId="b" />)
  expect($botSession.get()).toBeUndefined()
  expect(get.mock.calls.every(x => x[0] !== "stopSession")).toBe(true)
})

it("archived Bots expose preserved history but cannot open a new direct conversation", async () => {
  const archived = { ...bot, enabled: false, archivedAt: "2026-02-01T00:00:00.000Z" }
  const get = vi.fn(async (op: string) => {
    if (op === "listBots") return { bots: [archived] }
    if (op === "listBotSessions") return { sessions: [{ sessionId: "old", title: "历史分析" }] }
    throw Error(op)
  })
  render(<BotPane client={{ get } as unknown as WorkbenchClient} ownerSessionId="main" models={[]} conversation={() => undefined} />)
  fireEvent.click(screen.getByLabelText("显示已封存 Bot"))
  await screen.findByRole("button", { name: "与统计助手交流" })
  expect((screen.getByRole("button", { name: "与统计助手交流" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: /^历史$/ }))
  fireEvent.click(await screen.findByRole("button", { name: "历史分析" }))
  expect($botSession.get()?.sessionId).toBe("old")
  expect(get).not.toHaveBeenCalledWith("openBotConversation", expect.anything())
})

it("same owner changing workspace scope immediately drops the selected old Bot view", async()=>{
 const state=await import("../../src/ui/state/bots.js")
 const get=vi.fn(async()=>({bots:[bot]}))
 const p={client:{get} as unknown as WorkbenchClient,ownerSessionId:"same",models:[],conversation:()=>undefined}
 const view=render(<BotPane {...p} ownerScope="workspace-A"/>)
 await screen.findByRole("button",{name:"与统计助手交流"})
 state.selectBotSession({sessionId:"old-workspace-member",kind:"native",state:"alive",agentId:"native"} as never,bot.id)
 view.rerender(<BotPane {...p} ownerScope="workspace-B"/>)
 expect(state.$botSession.get()).toBeUndefined()
})
