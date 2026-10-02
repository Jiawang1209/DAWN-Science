import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MemoryStore } from "../../src/memory/store.js"
import { SuggestionQueue } from "../../src/memory/queue.js"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function make() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-memory-resolve-"))
  dirs.push(dir)
  const workspace = join(dir, "project")
  mkdirSync(workspace)
  const queue = new SuggestionQueue(join(dir, "SUGGESTIONS.jsonl"))
  const store = new MemoryStore(join(dir, "memory"))
  const backend = createWorkbenchBackend({
    projects: {} as never, projectStore: {} as never, runs: {} as never,
    sessions: {} as never, registry: { agents: {} }, credentials: memoryCredentials(),
    events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
    memory: { queue, store, pending: {} as never },
  })
  queue.propose("key", "原始数据只读", "retain on failure", { workspace, branches: ["main"] })
  const entry = queue.list()[0]!
  return { dir, workspace, queue, store, backend, entry }
}

describe("memoryResolve 保留失败建议", () => {
  for (const decision of ["approve", "archive"] as const) {
    it(`${decision}: 真实 ENOTDIR 保留完整建议，修复目录后可重试`, async () => {
      const ctx = make()
      writeFileSync(join(ctx.workspace, ".dawn"), "blocked directory")
      await expect(ctx.backend.memoryResolve({ kind: "suggestion", id: ctx.entry.id, decision })).rejects.toMatchObject({ code: "ENOTDIR" })
      expect(ctx.queue.list()).toEqual([ctx.entry])
      rmSync(join(ctx.workspace, ".dawn"))
      await expect(ctx.backend.memoryResolve({ kind: "suggestion", id: ctx.entry.id, decision })).resolves.toMatchObject({ ok: true })
      expect(ctx.queue.list()).toEqual([])
      const entries = decision === "approve" ? ctx.store.entries("key", { workspace: ctx.workspace }) : ctx.store.archived("key", { workspace: ctx.workspace })
      expect(entries.join("\n")).toContain("原始数据只读")
      if (decision === "archive") expect(ctx.store.entries("key", { workspace: ctx.workspace })).toEqual([])
    })

    it(`${decision}: 回滚失败也传递原写入异常`, async () => {
      const ctx = make()
      const original = new Error("store lock failed")
      vi.spyOn(ctx.store, decision === "approve" ? "add" : "addArchived").mockImplementation(() => { throw original })
      const rollback = vi.spyOn(ctx.queue, "putBack").mockImplementation(() => { throw new Error("queue lock failed") })
      await expect(ctx.backend.memoryResolve({ kind: "suggestion", id: ctx.entry.id, decision })).rejects.toBe(original)
      expect(rollback).toHaveBeenCalledWith(ctx.entry)
    })
  }

  it("普通校验失败仍放回，拒绝与成功采纳移出队列", async () => {
    const ctx = make()
    await expect(ctx.backend.memoryResolve({ kind: "suggestion", id: ctx.entry.id, decision: "approve", content: "" })).resolves.toMatchObject({ ok: false })
    expect(ctx.queue.list()).toEqual([ctx.entry])
    await expect(ctx.backend.memoryResolve({ kind: "suggestion", id: ctx.entry.id, decision: "reject" })).resolves.toMatchObject({ ok: true })
    expect(ctx.queue.list()).toEqual([])
  })
})
