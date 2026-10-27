import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrate } from "../../src/store/schema.js"
import { ProjectStore } from "../../src/store/projects.js"
import { ArtifactStore } from "../../src/artifacts/store.js"
import { ArtifactCapture } from "../../src/artifacts/capture.js"
import { ArtifactRetention } from "../../src/artifacts/retention.js"
import { KernelRuntime } from "../../src/runtime/kernel.js"
import { 对话内核 } from "../../src/kernel/挂载.js"
import type { SessionId } from "../../src/runtime/types.js"

const python =
    process.env.DAWN_TEST_PYTHON ??
    join(process.cwd(), ".venv-kernel", "bin", "python"),
  r = process.env.DAWN_TEST_R ?? "/usr/local/bin/R"
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn()
})
describe("real Python/R artifact evidence and retained bytes", () => {
  for (const language of ["python", "R"] as const)
    it.skipIf(!existsSync(language === "python" ? python : r))(
      `${language}: real files, declared input, code and retained version`,
      async () => {
        const root = mkdtempSync(join(tmpdir(), "dawn-real-artifact-"))
        cleanups.push(async () =>
          rmSync(root, { recursive: true, force: true }),
        )
        const db = new Database(":memory:")
        cleanups.push(async () => {
          db.close()
        })
        migrate(db)
        new ProjectStore(db).insert({
          projectId: "p",
          name: "test",
          workspace: root,
          createdAt: new Date().toISOString(),
        })
        const scope = { projectId: "p", workspace: root, sessionId: "s" },
          store = new ArtifactStore(db)
        const capture = new ArtifactCapture({ store, scope: () => scope })
        const runtime = new KernelRuntime(),
          kernel = new 对话内核({
            runtime,
            workspaceOf: () => root,
            sessionDirOf: () => join(root, ".dawn", "kernels"),
            interpreterOf: () => (language === "python" ? python : r),
            captureExecution: (q) =>
              capture.begin(q.sessionId, {
                tool: "notebook",
                code: q.code,
                inputPaths: q.inputPaths,
                kernelId: q.kernelId,
                sequence: q.sequence,
                snapshotOutputs: true,
              }),
          })
        cleanups.push(async () => {
          await kernel.收("s" as SessionId)
        })
        mkdirSync(join(root, "data", "raw"), { recursive: true })
        writeFileSync(join(root, "data/raw/input.csv"), "x,y\n1,2\n2,4\n3,6\n")
        const code =
          language === "python"
            ? `import csv\nimport matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\nwith open('data/raw/input.csv') as f: rows=list(csv.DictReader(f))\nwith open('result.csv','w') as f: f.write('n,value\\n3,2\\n')\nplt.plot([1,2,3],[2,4,6]);plt.savefig('figure.png');plt.close()\nx=42`
            : `d <- read.csv('data/raw/input.csv')\nwrite.csv(data.frame(n=3,value=2),'result.csv',row.names=FALSE)\npng('figure.png');plot(d$x,d$y);dev.off()\nx <- 42`
        const run = await kernel.执行("s" as SessionId, language, code, {
          evidence: { inputPaths: ["data/raw/input.csv"] },
        })
        expect(
          run.输出.filter((o) => (o as { kind?: string }).kind === "error"),
        ).toEqual([])
        const output = store.history(scope, "result.csv")[0]!,
          figure = store.history(scope, "figure.png")[0]!
        expect(output.sha256).toMatch(/^[a-f0-9]{64}$/)
        expect(figure.sha256).toMatch(/^[a-f0-9]{64}$/)
        expect(store.execution("p", output.executionId!)?.code).toBe(code)
        expect(store.history(scope, "data/raw/input.csv")[0]?.relation).toBe(
          "declared_input",
        )
        expect(
          readFileSync(join(root, "figure.png")).subarray(0, 8).toString("hex"),
        ).toBe("89504e470d0a1a0a")
        const original = readFileSync(join(root, "result.csv"))
        const retention = new ArtifactRetention({
          store,
          directory: join(root, ".dawn", "retained"),
        })
        const saved = await retention.retain(scope, {
          requestId: "real",
          name: language,
          members: [output, figure].map((o) => ({
            observationId: o.id,
            sha256: o.sha256!,
          })),
        })
        expect(saved.members[0]?.inputs).toMatchObject([
          {
            path: "data/raw/input.csv",
            relation: "declared_input",
            attribution: "declared",
          },
        ])
        writeFileSync(join(root, "result.csv"), "overwritten")
        expect(
          await retention.read("p", saved.id, saved.members[0]!.id),
        ).toEqual(original)
        const again = await kernel.执行(
          "s" as SessionId,
          language,
          language === "python" ? "print(x)" : "print(x)",
        )
        expect(JSON.stringify(again.输出)).toContain("42")
        expect(readFileSync(join(root, "data/raw/input.csv"), "utf8")).toBe(
          "x,y\n1,2\n2,4\n3,6\n",
        )
      },
      60000,
    )
})
