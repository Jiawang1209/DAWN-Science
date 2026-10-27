import { afterEach, describe, expect, it, vi } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { ArtifactStore } from "../../src/artifacts/store.js"
import { ArtifactCapture } from "../../src/artifacts/capture.js"
const cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const fn of cleanup.splice(0).reverse()) fn()
})
function setup() {
  const workspace = mkdtempSync(join(tmpdir(), "dawn-capture-"))
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
    scope = { projectId: "p", workspace, sessionId: "s" }
  const capture = new ArtifactCapture({
    store,
    scope: (id) => (id === "s" ? scope : undefined),
  })
  return { workspace, store, scope, capture }
}
describe("execution source capture", () => {
  it("keeps declared large-file metadata without inventing a full content version", async () => {
    const { workspace, store, scope, capture } = setup()
    capture.limits.hashBytes = 2
    writeFileSync(join(workspace, "large.csv"), "large input")
    const handle = await capture.begin("s", {
      tool: "run_code",
      code: "read_large()",
      inputPaths: ["large.csv"],
    })
    handle!.dispatched()
    await handle!.finish({ failed: false })
    const input = store.history(scope, "large.csv")[0]
    expect(input?.bytes).toBe(11)
    expect(input?.sha256).toBeUndefined()
    expect(input?.versionId).toBeUndefined()
  })
  it("budgets hashing time separately from a long-running analysis", async () => {
    const { workspace, store, scope, capture } = setup()
    const clock = Date.now.bind(Date)
    let offset = 0
    vi.spyOn(Date, "now").mockImplementation(() => clock() + offset)
    const handle = await capture.begin("s", {
      tool: "run_code",
      code: "long_analysis()",
    })
    handle!.dispatched()
    offset = 60000
    writeFileSync(join(workspace, "long.csv"), "done")
    await handle!.finish({ paths: ["long.csv"], failed: false })
    expect(store.history(scope, "long.csv")[0]?.sha256).toMatch(
      /^[a-f0-9]{64}$/,
    )
  })
  it("keeps submitted code, declared input identity and output observation separately", async () => {
    const { workspace, store, scope, capture } = setup()
    writeFileSync(join(workspace, "input.csv"), "n\n4\n")
    const handle = await capture.begin("s", {
      tool: "run_code",
      code: 'df.to_csv("result.csv")',
      inputPaths: ["input.csv"],
      kernelId: "k",
      sequence: 1,
    })
    writeFileSync(join(workspace, "result.csv"), "answer\n2\n")
    await handle!.finish({
      paths: ["result.csv"],
      failed: false,
      ambiguous: true,
    })
    const result = store.history(scope, "result.csv")[0]!,
      source = store.execution("p", result.executionId!)!
    expect(source.code).toBe('df.to_csv("result.csv")')
    expect(source.gaps.join(" ")).toContain("变量")
    expect(result.attribution).toBe("ambiguous")
    expect(store.history(scope, "input.csv")[0]?.relation).toBe(
      "declared_input",
    )
  })
  it("does not claim consumed inputs, detects changed inputs and keeps failed outputs", async () => {
    const { workspace, store, scope, capture } = setup()
    writeFileSync(join(workspace, "input.csv"), "old")
    const handle = await capture.begin("s", {
      tool: "run_code",
      code: "raise Exception()",
      inputPaths: ["input.csv"],
    })
    handle!.dispatched()
    writeFileSync(join(workspace, "input.csv"), "new")
    writeFileSync(join(workspace, "partial.csv"), "partial")
    await handle!.finish({ paths: ["partial.csv"], failed: true })
    const result = store.history(scope, "partial.csv")[0]!,
      source = store.execution("p", result.executionId!)!
    expect(source.dispatch).toBe("failed")
    expect(source.gaps.join(" ")).toContain("输入在执行期间发生变化")
    expect(store.history(scope, "input.csv")).toHaveLength(1)
    expect(
      await capture.begin("foreign", { tool: "run_code", code: "x" }),
    ).toBeUndefined()
  })
})
