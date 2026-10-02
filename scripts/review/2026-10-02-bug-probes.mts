/** Regression probes. Assert corrected behavior after the code-review fixes.
 * Run: npx tsx scripts/review/2026-10-02-bug-probes.mts
 * All writes occur inside a disposable OS temporary directory.
 */
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 下一次, 本地时刻转UTC } from "../../src/schedule/recurrence.js"
import { 读成表 } from "../../src/files/table.js"
import { 比两张表 } from "../../src/files/table-diff.js"
import { 摘要 } from "../../src/tools/run-code.js"
import { MemoryStore } from "../../src/memory/store.js"
import { SuggestionQueue } from "../../src/memory/queue.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"

const temp = mkdtempSync(join(tmpdir(), "dawn-review-"))
const evidence: Record<string, unknown> = {}
try {
  const future = 下一次({ kind: "everyDays", everyDays: 2, start: "2026-11-01", time: "09:00", timeZone: "Asia/Shanghai" }, "2026-10-02T00:00:00Z")
  assert.equal(future, "2026-11-01T01:00:00.000Z")
  evidence.futureStart = { expected: "2026-11-01T01:00:00.000Z", actual: future }

  const dst = 本地时刻转UTC(2026, 3, 8, 2, 30, "America/New_York")
  assert.equal(dst, "2026-03-08T07:30:00.000Z")
  evidence.dstGap = { expectedLocal: "03:30 (advance through missing hour)", actualUtc: dst, actualLocal: "03:30 (advanced through missing hour)" }

  const csv = 读成表('"id;group;note",value\na,1\nb,2', true)
  assert.equal(csv.delimiter, ",")
  assert.equal(csv.columns.length, 2)
  evidence.quotedDelimiter = { expectedColumns: 2, actual: csv }

  const diff = 比两张表(读成表("x\n0\n1\n2", true), 读成表("x\n999\n1000\n2000", true))
  assert.equal(diff.整列缩放.length, 0)
  assert.equal(diff.单元格总数, 3)
  evidence.zeroCellDiff = { expected: "Report 0 -> 999 separately; not a uniform scale", actual: diff }

  const summary = 摘要([{ kind: "result", mediaType: "text/plain", data: "42" }])
  assert.equal(summary.文字.includes("42"), true)
  evidence.kernelResult = { expected: "42 present in tool result", actual: summary }

  const queue = new SuggestionQueue(join(temp, "SUGGESTIONS.jsonl"))
  queue.propose("key", "原始数据只读", "project A", { workspace: "/project-A", branches: ["main"] })
  queue.propose("key", "原始数据只读", "project B", { workspace: "/project-B", branches: ["dev"] })
  assert.equal(queue.list().length, 2)
  assert.equal(queue.list()[0]?.workspace, "/project-A")
  evidence.memoryScope = { expected: "Two separately scoped suggestions", actual: queue.list() }

  const downloads: string[] = []
  const backend = createWorkbenchBackend({
    projects: {} as never, projectStore: {} as never, runs: {} as never,
    sessions: {} as never, registry: { agents: {} } as never,
    credentials: { get: () => undefined, configured: () => [], isEncrypted: () => true, set: () => {}, delete: () => {} },
    events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
    downloadsDir: temp,
    remote: {
      store: {} as never,
      manager: { executorOf: () => ({ download: (_source: string, dest: string) => {
        downloads.push(dest)
        // Both transfers remain in flight, like a slow server; no network required.
        return new Promise<void>(() => {})
      } }) } as never,
    },
  })
  const first = await backend.startDownload({ connectionId: "c1", path: "/server-A/result.csv" }) as { target: string }
  const second = await backend.startDownload({ connectionId: "c1", path: "/server-B/result.csv" }) as { target: string }
  assert.notEqual(first.target, second.target)
  evidence.concurrentDownloads = { expected: "Distinct reserved paths", actual: downloads }

  // A real filesystem failure: .dawn is a file, so the key directory cannot be created.
  for (const queued of queue.list()) queue.take(queued.id)
  const blockedProject = join(temp, "blocked-project")
  mkdirSync(blockedProject)
  writeFileSync(join(blockedProject, ".dawn"), "existing file")
  queue.propose("key", "原始数据只读", "filesystem failure probe", { workspace: blockedProject })
  const item = queue.list()[0]!
  const memoryBackend = createWorkbenchBackend({
    projects: {} as never, projectStore: {} as never, runs: {} as never,
    sessions: {} as never, registry: { agents: {} } as never,
    credentials: { get: () => undefined, configured: () => [], isEncrypted: () => true, set: () => {}, delete: () => {} },
    events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
    memory: { queue, pending: {} as never, store: new MemoryStore(join(temp, "memory-root")) },
  })
  await assert.rejects(memoryBackend.memoryResolve({ kind: "suggestion", id: item.id, decision: "approve" }), /ENOTDIR|EEXIST/)
  assert.equal(queue.list().length, 1)
  evidence.memoryIoFailure = { expected: "Keep suggestion after storage exception", actualPending: queue.list().length }
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
