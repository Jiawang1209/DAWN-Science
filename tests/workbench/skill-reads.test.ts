import { describe, expect, it } from "vitest"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { 还原成条目 } from "../../src/workbench/restored-items.js"
import { receipt } from "../fixtures/skill-read.js"

describe("Skill reads in live and restored transcripts", () => {
  it("preserves host metadata in emitted updates and reconnect snapshots", () => {
    const hub = new SessionTranscripts({ terminalMaxChars: 1000 })
    hub.track("s", "native")
    hub.subscribe("s")
    const updates: unknown[] = []
    hub.onUpdate(update => updates.push(update))
    hub.ingest("s", { kind: "tool_end", sessionId: "s", toolCallId: "r", toolName: "dawn_use_skill", text: "instructions", isError: false, truncated: false, bytes: 12, skillRead: receipt } as never)
    expect(hub.subscribe("s").items[0]).toMatchObject({ skillRead: receipt })
    expect(updates[0]).toMatchObject({ type: "item", item: { skillRead: receipt } })
  })
  it.each([{ isError: true }, { interrupted: true }, { skillRead: { ...receipt, contentSha256: "invalid" } }])("suppresses unsuccessful or malformed live receipts: %o", change => {
    const hub = new SessionTranscripts({ terminalMaxChars: 1000 })
    hub.track("s", "native")
    hub.ingest("s", { kind: "tool_end", sessionId: "s", toolCallId: "r", toolName: "read", text: "instructions", isError: false, truncated: false, bytes: 12, skillRead: receipt, ...change } as never)
    expect(hub.subscribe("s").items[0]).not.toHaveProperty("skillRead")
  })
  it("restores the same stable receipt id without upgrading failed reads", () => {
    const tool = { kind: "tool", id: "manual-1", name: "skill_read", input: {}, result: "", skillRead: receipt } as const
    expect(还原成条目(tool, 4)).toMatchObject({ id: "manual-1", status: "ok", skillRead: receipt })
    expect(还原成条目({ ...tool, isError: true }, 4)).not.toHaveProperty("skillRead")
  })
})
