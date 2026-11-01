import { describe, expect, it } from "vitest"
import { SkillReadSchema } from "../../src/protocol/skill-reads.js"
import { TranscriptItemSchema, SessionSnapshotSchema } from "../../src/protocol/events.js"

import { receipt } from "../fixtures/skill-read.js"

describe("Skill read receipt contract", () => {
  it("accepts bounded typed metadata and rejects claims, invalid hashes and empty names", () => {
    expect(SkillReadSchema.parse(receipt)).toEqual(receipt)
    for (const change of [{ contentSha256: "not-a-hash" }, { name: "" }, { scope: "remote" }, { via: "claimed" }, { verified: true }, { name: "x".repeat(513) }, { resourcePath: "x".repeat(8193) }]) {
      expect(SkillReadSchema.safeParse({ ...receipt, ...change }).success).toBe(false)
    }
  })
  it("round trips through a strict tool snapshot while legacy tools remain valid", () => {
    const tool = { type: "tool", id: "read-1", name: "use_skill", input: {}, status: "ok", skillRead: receipt }
    expect(TranscriptItemSchema.parse(tool)).toEqual(tool)
    expect(SessionSnapshotSchema.parse({ sessionId: "s", kind: "native", revision: 1, items: [tool], terminal: "", terminalTrimmed: false, state: "alive" }).items[0]).toEqual(tool)
    const { skillRead: _, ...old } = tool
    expect(TranscriptItemSchema.safeParse(old).success).toBe(true)
  })
})
