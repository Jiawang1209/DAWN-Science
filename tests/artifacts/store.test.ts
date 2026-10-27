import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { RunStore } from "../../src/store/runs.js"
import { ProjectStore } from "../../src/store/projects.js"
import { ArtifactStore } from "../../src/artifacts/store.js"

const dbs: Database.Database[] = []
afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})
export function setupStore() {
  const db = new Database(":memory:")
  dbs.push(db)
  migrate(db)
  new ProjectStore(db).insert({
    projectId: "p",
    name: "p",
    workspace: "/w",
    createdAt: new Date().toISOString(),
  })
  return {
    db,
    store: new ArtifactStore(db),
    scope: { projectId: "p", workspace: "/w", sessionId: "s" },
  }
}
describe("artifact immutable versions and observations", () => {
  it("reuses content versions while preserving each observation and A/B/A ordering", () => {
    const { store, scope } = setupStore()
    const a = store.observe(scope, {
      path: "result.csv",
      sha256: "a".repeat(64),
      bytes: 2,
      relation: "write",
      attribution: "direct",
      gaps: [],
    })
    const b = store.observe(scope, {
      path: "result.csv",
      sha256: "b".repeat(64),
      bytes: 2,
      relation: "changed",
      attribution: "observed",
      gaps: [],
    })
    const again = store.observe(scope, {
      path: "result.csv",
      sha256: "a".repeat(64),
      bytes: 2,
      relation: "write",
      attribution: "direct",
      gaps: [],
    })
    expect(again.versionId).toBe(a.versionId)
    expect(b.versionId).not.toBe(a.versionId)
    expect(store.history(scope, "result.csv")).toHaveLength(3)
    expect(store.history(scope, "result.csv")[0]?.id).toBe(again.id)
  })
  it("separates same named files in different workspace roots and does not invent unhashed versions", () => {
    const { store, scope } = setupStore()
    store.observe(scope, {
      path: "result.csv",
      sha256: "a".repeat(64),
      bytes: 2,
      relation: "write",
      attribution: "direct",
      gaps: [],
    })
    const unknown = store.observe(
      { ...scope, workspace: "/scratch/s" },
      {
        path: "result.csv",
        relation: "changed",
        attribution: "ambiguous",
        gaps: ["hash budget"],
      },
    )
    expect(unknown.versionId).toBeUndefined()
    expect(store.history(scope, "result.csv")).toHaveLength(1)
    expect(() =>
      store.observation({ ...scope, projectId: "other" }, unknown.id),
    ).toThrow()
  })
  it("migration is idempotent and does not synthesize historical observations", () => {
    const { db, store, scope } = setupStore()
    const runs = new RunStore(db)
    runs.insert({
      runId: "old",
      projectId: "p",
      sessionId: "s",
      origin: "agent",
      requestType: "agent_turn",
      status: "completed",
      startedAt: "2026-10-26",
      finishedAt: "2026-10-26",
      hasError: false,
      filesCreated: ["old.csv"],
    })
    const legacy = db.prepare("SELECT * FROM runs WHERE id='old'").get()
    // Recreate the pre-feature v17 shape, with an existing output ledger row.
    db.exec(
      "DROP TABLE artifact_retained; DROP TABLE artifact_retention_requests; DROP TABLE artifact_observations; DROP TABLE artifact_versions; DROP TABLE artifact_files; DROP TABLE artifact_executions;",
    )
    db.prepare("UPDATE schema_meta SET value='17' WHERE key='version'").run()
    migrate(db)
    migrate(db)
    expect(db.prepare("SELECT * FROM runs WHERE id='old'").get()).toEqual(
      legacy,
    )
    expect(store.history(scope, "old.csv")).toEqual([])
    expect(() =>
      store.observe(scope, {
        path: "../outside",
        relation: "read",
        attribution: "observed",
        gaps: [],
      }),
    ).toThrow()
  })
})
