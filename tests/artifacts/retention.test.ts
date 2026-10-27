import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { projectDirectory } from "../../src/artifacts/blobs.js"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { ArtifactStore } from "../../src/artifacts/store.js"
import { ArtifactRetention } from "../../src/artifacts/retention.js"

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const f of cleanup.splice(0).reverse()) f()
})
function setup(limits = {}) {
  const root = mkdtempSync(join(tmpdir(), "dawn-retain-"))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const workspace = join(root, "workspace")
  mkdirSync(workspace)
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
  const retention = new ArtifactRetention({
    store,
    directory: join(root, "managed"),
    limits,
  })
  const seed = (path: string, text: string) => {
    writeFileSync(join(workspace, path), text)
    return store.observe(scope, {
      path,
      bytes: Buffer.byteLength(text),
      sha256: createHash("sha256").update(text).digest("hex"),
      relation: "write",
      attribution: "direct",
      gaps: [],
    })
  }
  return { root, workspace, store, scope, retention, seed }
}
describe("selected immutable result retention", () => {
  it.each(["read", "delete"] as const)(
    "refuses a redirected managed object directory during %s",
    async (operation) => {
      const { root, store, scope, retention, seed } = setup()
      const o = seed("a.csv", "protected")
      const group = await retention.retain(scope, {
        requestId: "redirect",
        name: "",
        members: [{ observationId: o.id, sha256: o.sha256! }],
      })
      const objects = join(
          projectDirectory(retention.options.directory, "p"),
          "objects",
        ),
        outside = join(root, "outside")
      renameSync(objects, join(root, "objects-before-redirect"))
      mkdirSync(outside)
      const externalFile = join(outside, o.sha256!)
      writeFileSync(externalFile, "protected")
      symlinkSync(outside, objects, "dir")
      await expect(
        operation === "read"
          ? retention.read("p", group.id, group.members[0]!.id)
          : retention.delete("p", group.id),
      ).rejects.toThrow()
      expect(readFileSync(externalFile, "utf8")).toBe("protected")
      expect(store.retained("p", group.id).state).toBe("ready")
    },
  )

  it("freezes the selected execution's declared input identities in its source manifest", async () => {
    const { store, scope, retention, seed } = setup()
    store.putExecution({
      ...scope,
      id: "e",
      createdAt: "2026-10-27",
      tool: "run_code",
      code: "analyze()",
      codeSha256: "c".repeat(64),
      status: "partial",
      dispatch: "completed",
      gaps: ["dynamic inputs not captured"],
    })
    const input = store.observe(scope, {
      path: "data.csv",
      executionId: "e",
      sha256: "a".repeat(64),
      bytes: 3,
      relation: "declared_input",
      attribution: "declared",
      gaps: ["declaration does not establish consumption"],
    })
    const file = seed("result.csv", "n\n4\n")
    const output = store.observe(scope, {
      path: file.path,
      sha256: file.sha256!,
      bytes: file.bytes!,
      executionId: "e",
      relation: "changed",
      attribution: "observed",
      gaps: [],
    })
    const group = await retention.retain(scope, {
      requestId: "inputs",
      name: "with input identity",
      members: [{ observationId: output.id, sha256: output.sha256! }],
    })
    expect(group.members[0]).toMatchObject({ inputs: [input] })
    store.observe(scope, {
      path: "data.csv",
      sha256: "b".repeat(64),
      bytes: 3,
      relation: "declared_input",
      attribution: "declared",
      gaps: [],
    })
    expect(retention.list(scope.projectId)[0]?.members[0]).toMatchObject({
      inputs: [input],
    })
  })
  it("reads the saved bytes after workspace overwrite/deletion; request retries cannot change members", async () => {
    const { workspace, scope, retention, seed } = setup()
    const observation = seed("result.csv", "n,value\n4,2\n")
    const request = {
      requestId: "req",
      name: "baseline",
      members: [{ observationId: observation.id, sha256: observation.sha256! }],
    }
    const group = await retention.retain(scope, request)
    writeFileSync(join(workspace, "result.csv"), "changed")
    expect(
      (
        await retention.read(scope.projectId, group.id, group.members[0]!.id)
      ).toString(),
    ).toBe("n,value\n4,2\n")
    rmSync(join(workspace, "result.csv"))
    expect((await retention.retain(scope, request)).id).toBe(group.id)
    await expect(
      retention.retain(scope, { ...request, name: "different" }),
    ).rejects.toThrow()
    expect(retention.list(scope.projectId)).toHaveLength(1)
  })
  it("rejects drift and symlinks without publishing a partial group", async () => {
    const { root, workspace, scope, retention, seed } = setup()
    const a = seed("a.csv", "a"),
      b = seed("b.csv", "b")
    writeFileSync(join(workspace, "b.csv"), "different")
    await expect(
      retention.retain(scope, {
        requestId: "drift",
        name: "",
        members: [a, b].map((o) => ({
          observationId: o.id,
          sha256: o.sha256!,
        })),
      }),
    ).rejects.toThrow()
    expect(retention.list("p")).toEqual([])
    expect(existsSync(retention.objectPath("p", a.sha256!))).toBe(false)
    rmSync(join(workspace, "a.csv"))
    writeFileSync(join(root, "secret"), "a")
    symlinkSync(join(root, "secret"), join(workspace, "a.csv"))
    await expect(
      retention.retain(scope, {
        requestId: "link",
        name: "",
        members: [{ observationId: a.id, sha256: a.sha256! }],
      }),
    ).rejects.toThrow()
  })
  it("enforces limits, rejects corrupt saved objects and deletes only managed copies", async () => {
    const { workspace, scope, retention, seed } = setup({
      fileBytes: 4,
      groupBytes: 8,
      projectBytes: 8,
    })
    const a = seed("a.csv", "old"),
      large = seed("large.csv", "too large")
    await expect(
      retention.retain(scope, {
        requestId: "large",
        name: "",
        members: [{ observationId: large.id, sha256: large.sha256! }],
      }),
    ).rejects.toThrow()
    const group = await retention.retain(scope, {
      requestId: "ok",
      name: "",
      members: [{ observationId: a.id, sha256: a.sha256! }],
    })
    writeFileSync(retention.objectPath("p", a.sha256!), "bad")
    await expect(
      retention.read("p", group.id, group.members[0]!.id),
    ).rejects.toThrow()
    await retention.delete("p", group.id)
    expect(retention.list("p")).toEqual([])
    expect(readFileSync(join(workspace, "a.csv"), "utf8")).toBe("old")
  })
  it("cancels a queued copy and coalesces concurrent retries of the same selection", async () => {
    const { scope, retention, seed } = setup(),
      o = seed("a.csv", "a")
    let release!: () => void, entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const blocker = retention.locked(
      "p",
      () =>
        new Promise<void>((resolve) => {
          release = resolve
          entered()
        }),
    )
    await started
    const request = {
      requestId: "queued",
      name: "",
      members: [{ observationId: o.id, sha256: o.sha256! }],
    }
    const queued = retention.retain(scope, request)
    expect(retention.cancel("p", "queued")).toBe(true)
    release()
    await blocker
    await expect(queued).rejects.toBeTruthy()
    expect(retention.list("p")).toEqual([])
    const next = { ...request, requestId: "retry" }
    const [a, b] = await Promise.all([
      retention.retain(scope, next),
      retention.retain(scope, next),
    ])
    expect(a.id).toBe(b.id)
    expect(retention.list("p")).toHaveLength(1)
  })
  it("recovers only the recorded interrupted temporary directory", async () => {
    const { scope, store, retention } = setup()
    await retention.ready
    const key = randomUUID(),
      pending = join(
        projectDirectory(retention.options.directory, "p"),
        "pending",
        key,
      )
    mkdirSync(pending, { recursive: true })
    writeFileSync(join(pending, "partial"), "partial")
    store.beginRequest(scope.projectId, "interrupted", "f", "{}", key)
    store.recover()
    await retention.recoverStorage()
    expect(existsSync(pending)).toBe(false)
    expect(store.request("p", "interrupted")?.state).toBe("interrupted")
  })
})
