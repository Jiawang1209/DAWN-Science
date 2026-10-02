import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorkbenchBackend } from "../../src/workbench/backend.js"
import { memoryCredentials } from "../helpers/credentials.js"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-transfer-test-"))
  dirs.push(dir)
  const pending: { path: string; finish: () => void; fail: (e: Error) => void }[] = []
  const backend = createWorkbenchBackend({
    projects: {} as never, projectStore: {} as never, runs: {} as never,
    sessions: {} as never, registry: { agents: {} }, credentials: memoryCredentials(),
    events: { onAnyUpdate: () => () => {}, on回合收尾: () => () => {} } as never,
    downloadsDir: dir,
    remote: {
      store: {} as never,
      manager: { executorOf: () => ({
        stat: async () => { throw new Error("not found") },
        upload: (_local: string, path: string, opts: { signal: AbortSignal }) => new Promise<void>((finish, fail) => {
          pending.push({ path, finish, fail })
          opts.signal.addEventListener("abort", () => fail(new Error("cancelled")), { once: true })
        }),
        download: (_source: string, path: string, opts: { signal: AbortSignal }) => {
        return new Promise<void>((finish, fail) => {
          pending.push({ path, finish, fail })
          opts.signal.addEventListener("abort", () => fail(new Error("cancelled")), { once: true })
        })
      } }) } as never,
    },
  })
  const start = () => backend.startDownload({ connectionId: "c", path: "/data/result.csv" }) as Promise<{ transferId: string; target: string }>
  return { dir, pending, backend, start }
}

describe("下载的目标预留", () => {
  it("目标还没有落盘时，相同文件名的两次下载也必须分开", async () => {
    const { start, pending } = setup()
    const [a, b] = await Promise.all([start(), start()])
    try {
      expect(a.target).not.toBe(b.target)
      expect(b.target).toMatch(/result \(1\)\.csv$/)
    } finally { pending.forEach(p => p.finish()) }
  })

  it("已有文件与进行中的下载都占名字", async () => {
    const { dir, start, pending } = setup()
    writeFileSync(join(dir, "result.csv"), "keep")
    const a = await start()
    const b = await start()
    try {
      expect(a.target).toBe(join(dir, "result (1).csv"))
      expect(b.target).toBe(join(dir, "result (2).csv"))
    } finally { pending.forEach(p => p.finish()) }
  })

  it("失败或取消后释放尚未落盘的预留名", async () => {
    const { backend, start, pending } = setup()
    const a = await start()
    pending[0]!.fail(new Error("network lost"))
    await expect.poll(async () => (await backend.transferStatus({ transferId: a.transferId }) as { state: string }).state).toBe("failed")
    const b = await start()
    expect(b.target).toBe(a.target)
    await backend.cancelTransfer({ transferId: b.transferId })
    await expect.poll(async () => (await backend.transferStatus({ transferId: b.transferId }) as { state: string }).state).toBe("cancelled")
    const c = await start()
    expect(c.target).toBe(a.target)
    pending.at(-1)!.finish()
  })
})

describe("上传中的目标也参与冲突判定", () => {
  it("目标尚未落盘，ask仍提示冲突，keepBoth改用未被预留的名字", async () => {
    const { dir, backend, pending } = setup()
    const localPath = join(dir, "result.csv")
    writeFileSync(localPath, "data")
    const request = { connectionId: "c", dir: "/data", localPath, onConflict: "ask" as const }
    const first = await backend.startUpload(request)
    try {
      expect(first).toMatchObject({ kind: "started", target: "/data/result.csv" })
      expect(await backend.startUpload(request)).toMatchObject({ kind: "conflict" })
      expect(await backend.startUpload({ ...request, onConflict: "keepBoth" })).toMatchObject({ kind: "started", target: "/data/result (1).csv" })
    } finally { pending.forEach(p => p.finish()) }
  })

  it("overwrite不许覆盖正在传输的目标，但其他服务器的同名文件不冲突", async () => {
    const { dir, backend, pending } = setup()
    const localPath = join(dir, "result.csv")
    writeFileSync(localPath, "data")
    const request = { connectionId: "c", dir: "/data", localPath, onConflict: "overwrite" as const }
    await backend.startUpload(request)
    try {
      await expect(backend.startUpload(request)).rejects.toMatchObject({ workbenchCode: "conflict" })
      expect(await backend.startUpload({ ...request, connectionId: "other" })).toMatchObject({ kind: "started", target: "/data/result.csv" })
    } finally { pending.forEach(p => p.finish()) }
  })
})
