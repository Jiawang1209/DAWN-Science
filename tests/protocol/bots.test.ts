import { describe, expect, it } from "vitest"
import { OPERATIONS, 只读模式该拦 } from "../../src/protocol/operations.js"
import { BotProfileSchema, BotSessionBindingSchema } from "../../src/protocol/index.js"
import { TeamSnapshotSchema } from "../../src/protocol/events.js"

describe("Bot protocol", () => {
  it("validates owner-derived conversation/dispatch requests and rejects user supplied scope", () => {
    expect(OPERATIONS.openBotConversation.request.parse({ botId: "b", ownerSessionId: "s", newConversation: true }).botId).toBe("b")
    expect(OPERATIONS.listBotSessions.request.parse({ botId: "b", ownerSessionId: "s" }).ownerSessionId).toBe("s")
    expect(() => OPERATIONS.openBotConversation.request.parse({ botId: "b", ownerSessionId: "s", workspace: "/other" })).toThrow()
    expect(() => OPERATIONS.dispatchBotTask.request.parse({ requestId: "r", ownerSessionId: "s", botId: "b", instruction: " " })).toThrow()
    expect(OPERATIONS.dispatchBotTask.response.parse({ teamId: "t", taskId: "x" })).toEqual({ teamId: "t", taskId: "x" })
    expect(只读模式该拦("openBotConversation")).toBe(true)
    expect(只读模式该拦("dispatchBotTask")).toBe(true)
    expect(只读模式该拦("listBots")).toBe(false)
  })
  it("keeps identity server-owned and accepts only explicit configuration fields", () => {
    const profile = { id: "b", name: "x", role: "r", instructions: "i", enabled: true, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z" }
    expect(BotProfileSchema.parse(profile)).toEqual(profile)
    expect(() => OPERATIONS.createBot.request.parse({ name: "x", role: "r", instructions: "i", id: "fake" })).toThrow()
    expect(() => OPERATIONS.updateBot.request.parse({ botId: "b", patch: { createdAt: "fake" } })).toThrow()
    expect(OPERATIONS.updateBot.request.parse({ botId: "b", patch: { model: null } }).patch.model).toBeNull()
    expect(() => BotProfileSchema.parse({ id: "b", name: "x", role: "r", instructions: "i", enabled: true, createdAt: "fake", updatedAt: "fake" })).toThrow()
    expect(() => BotSessionBindingSchema.parse({ botId: "b", scopeKey: "x", kind: "team", sessionId: "s" })).toThrow()
  })
  it("accepts Bot members and retains compatibility with historical non-Bot teams", () => {
    const member = { name: "a", agent: "native", status: "idle", sessionDir: "/s", turns: 0, joinedAt: 1 }
    const team = { id: "t", name: "t", goal: "g", captainSessionId: "s", createdAt: 1, members: [member], tasks: [], messages: [], taskSeq: 0 }
    expect(TeamSnapshotSchema.parse(team).members[0]).not.toHaveProperty("botId")
    expect(TeamSnapshotSchema.parse({ ...team, members: [{ ...member, botId: "b", sessionId: "bot-session" }] }).members[0]?.botId).toBe("b")
  })
})

it("opens a scoped peer execution without pretending it owns an original task",()=>{
 const op=(OPERATIONS as unknown as Record<string,{request:{parse:(v:unknown)=>unknown}}>).openBotMember!
 expect(op.request.parse({ownerSessionId:"main",teamId:"t",botId:"data"})).toEqual({ownerSessionId:"main",teamId:"t",botId:"data"})
 expect(()=>op.request.parse({ownerSessionId:"main",teamId:"t",botId:"data",sessionId:"another"})).toThrow()
})
