import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { ArtifactStore } from "../../src/artifacts/store.js"
import { ArtifactRetention } from "../../src/artifacts/retention.js"
import { createArtifactOperations } from "../../src/artifacts/operations.js"
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})
function setup(readOnly = false, sourceSupported = true) {
  const workspace = mkdtempSync(join(tmpdir(), "dawn-artifact-api-"))
  cleanup.push(() => rmSync(workspace, { recursive: true, force: true }))
  const db = new Database(":memory:")
  cleanup.push(() => db.close())
  migrate(db)
  new ProjectStore(db).insert({
    projectId: "p",
    name: "p",
    workspace,
    createdAt: new Date().toISOString(),
  })
  const store = new ArtifactStore(db),
    retention = new ArtifactRetention({
      store,
      directory: join(workspace, "managed"),
    })
  const ops = createArtifactOperations({
    store,
    retention,
    readOnly,
    sourceSupported: () => sourceSupported,
    session: (id) => (id === "s" ? { projectId: "p", workspace } : undefined),
  })
  return { workspace, store, retention, ops }
}
describe("artifact API scope and explicit capture", () => {
  it("states the unsupported runtime boundary without mutating its local workspace", async () => {
    const { workspace, store, ops } = setup(false, false)
    writeFileSync(join(workspace, "a.csv"), "n,value\n4,2\n")
    expect(
      await ops.getArtifactHistory({ sessionId: "s", path: "a.csv" }),
    ).toMatchObject({
      supported: false,
      observations: [],
      reason: "此执行位置尚未接入自动来源记录",
    })
    await expect(
      ops.captureAndRetainCurrent({
        sessionId: "s",
        path: "a.csv",
        requestId: "runtime",
        name: "",
      }),
    ).rejects.toThrow()
    expect(store.history({ projectId: "p", workspace }, "a.csv")).toEqual([])
    expect(await ops.listRetainedResults({ sessionId: "s" })).toMatchObject({
      supported: true,
      results: [],
    })
  })
  it("labels late capture, previews saved bytes and never writes history during reads", async () => {
    const { workspace, store, ops } = setup()
    writeFileSync(join(workspace, "a.csv"), "n,value\n4,2\n")
    const group = await ops.captureAndRetainCurrent({
      sessionId: "s",
      path: "a.csv",
      requestId: "late",
      name: "final",
    })
    expect(group.members[0]?.observation.relation).toBe("late_capture")
    writeFileSync(join(workspace, "a.csv"), "changed")
    const read = await ops.readRetainedArtifact({
      sessionId: "s",
      retainedId: group.id,
      memberId: group.members[0]!.id,
    })
    expect(read.content.kind).toBe("table")
    expect(
      (
        await ops.checkArtifactCurrent({
          sessionId: "s",
          observationId: group.members[0]!.observation.id,
        })
      ).state,
    ).toBe("changed")
    expect(store.history({ projectId: "p", workspace }, "a.csv")).toHaveLength(
      1,
    )
    await expect(
      ops.readRetainedArtifact({
        sessionId: "other",
        retainedId: group.id,
        memberId: group.members[0]!.id,
      }),
    ).rejects.toThrow()
  })
  it("rejects mutation on a read-only host and refuses undeclared external paths", async () => {
    const { workspace, ops } = setup(true)
    writeFileSync(join(workspace, "a.csv"), "a")
    await expect(
      ops.captureAndRetainCurrent({
        sessionId: "s",
        path: "a.csv",
        requestId: "late",
        name: "",
      }),
    ).rejects.toThrow()
    expect(
      (await ops.getArtifactHistory({ sessionId: "s", path: "a.csv" }))
        .observations,
    ).toEqual([])
  })
})
