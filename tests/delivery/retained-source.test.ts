import { afterEach, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { DeliveryService } from "../../src/delivery/service.js"
const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})
it("organizes immutable retained bytes rather than a same-named changed live file", async () => {
  const root = mkdtempSync(join(tmpdir(), "dawn-retained-delivery-"))
  roots.push(root)
  const original = Buffer.from("n,value\n4,2\n"),
    sha256 = createHash("sha256").update(original).digest("hex")
  writeFileSync(join(root, "result.csv"), "n,value\n999,999\n")
  const ask = vi.fn(async () => ({
    model: "test",
    text: JSON.stringify({
      readme: "# Re-run instructions\nInputs unavailable",
      interpretation:
        "# Results\nThe retained table has n=4 and value=2. No causal conclusion.",
      scripts: [],
      gaps: ["inputs unavailable"],
    }),
  }))
  const service = new DeliveryService({
    workspace: root,
    sessionId: "s",
    sessionDir: join(root, "session"),
    skills: "rules",
    ask,
    readRetained: async () => ({
      bytes: original,
      observationId: "o",
      versionId: "v",
    }),
  })
  const record = await service.create({
    requestId: "r",
    name: "retained",
    paths: ["result.csv"],
    references: [],
    mode: "organize",
    retained: [{ path: "result.csv", retainedId: "g", memberId: "m", sha256 }],
  })
  expect(record.evidence[0]?.sha256).toBe(sha256)
  expect(record.evidence[0]?.retained?.observationId).toBe("o")
  expect(readFileSync(join(root, record.evidence[0]!.copyPath!), "utf8")).toBe(
    original.toString(),
  )
  expect(record.verification.state).toBe("not_run")
  expect(readFileSync(join(root, "result.csv"), "utf8")).toContain("999")
})
