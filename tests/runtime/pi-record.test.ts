/**
 * 只读地读 pi 记录（2026-09-27，会话全文搜索 spec §4）。
 * 最要紧的一条：**读完文件一个字节都不变**——它此刻可能正被一段活着的会话追加。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pi记录目录, 最新记录, 读记录 } from "../../src/runtime/pi-record.js"
import { 写一段pi记录 } from "../helpers/pi-record.js"

const dirs: string[] = []
const 新目录 = () => {
  const d = mkdtempSync(join(tmpdir(), "dawn-pirec-"))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe("pi 记录 · 只读", () => {
  it("读出来是还原好的条目（与续接同一个 `还原历史`）", async () => {
    const d = 新目录()
    const f = 写一段pi记录(d, [
      { who: "user", text: "做个 Cox 回归" },
      { who: "agent", text: "好", 调: { id: "c1", name: "bash", args: { command: "echo coxph" }, 出: "coxph" } },
    ])
    const r = await 读记录(f)
    expect(r.map((x) => x.kind)).toEqual(["text", "text", "tool"])
    expect(r[2]).toMatchObject({ kind: "tool", id: "c1", name: "bash", result: "coxph" })
  })

  it("**读完文件字节不变**——连「旧版本、pi 会迁移」的记录也不改写", async () => {
    const d = 新目录()
    const 目录 = pi记录目录(d)
    mkdirSync(目录, { recursive: true })
    const f = join(目录, "old.jsonl")
    // 旧版本：header 没有 version、条目没有 id / parentId。pi 的 `open()` 读它会迁移并重写文件
    const 旧 = [
      JSON.stringify({ type: "session", id: "old", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/w" }),
      JSON.stringify({ type: "message", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "老记录里的 Cox 回归", timestamp: 1 } }),
      JSON.stringify({ type: "message", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "好" }], timestamp: 2 } }),
    ].join("\n") + "\n"
    writeFileSync(f, 旧)
    const r = await 读记录(f)
    expect(readFileSync(f, "utf8"), "搜索绝不写盘").toBe(旧)
    expect(r.map((x) => (x.kind === "text" ? x.text : x.kind))).toEqual(["老记录里的 Cox 回归", "好"])
  })

  it("空文件：读出来没有条目，**也不被写进一个 header**（`open()` 会写）", async () => {
    const d = 新目录()
    mkdirSync(pi记录目录(d), { recursive: true })
    const f = join(pi记录目录(d), "empty.jsonl")
    writeFileSync(f, "")
    expect(await 读记录(f)).toEqual([])
    expect(readFileSync(f, "utf8")).toBe("")
  })

  it("走完整的那条路径（与续接同一个 `getBranch()`）：压缩前的话照样读得到，压缩处是一条标记", async () => {
    const d = 新目录()
    const 目录 = pi记录目录(d)
    const f = 写一段pi记录(d, [
      { who: "user", text: "压缩前说的 Cox" },
      { who: "agent", text: "好" },
    ])
    // 用 pi 自己的 API 在这份记录后面记一次压缩（夹具走写入口；被测的 `读记录` 不写）
    const { SessionManager } = await import("@earendil-works/pi-coding-agent")
    const sm = SessionManager.open(f, 目录)
    const 首条 = sm.getBranch().find((e) => e.type === "message")!
    sm.appendCompaction("## Goal", 首条.id, 9000)
    sm.appendMessage({ role: "user", content: "压缩后", timestamp: Date.parse("2026-08-21T00:00:00Z") } as never)
    sm.appendMessage({ role: "assistant", content: [{ type: "text", text: "嗯" }], stopReason: "stop", timestamp: Date.parse("2026-08-21T00:01:00Z") } as never)
    const r = await 读记录(f)
    expect(r.map((x) => (x.kind === "text" ? x.text : x.kind))).toEqual(["压缩前说的 Cox", "好", "compaction", "压缩后", "嗯"])
  })

  it("挑 mtime 最新的那个 `.jsonl`（续接时 pi 读的就是它）；别的后缀不认", async () => {
    const d = 新目录()
    const 旧 = 写一段pi记录(d, [{ who: "user", text: "旧" }, { who: "agent", text: "旧" }])
    const 新 = 写一段pi记录(d, [{ who: "user", text: "新" }, { who: "agent", text: "新" }])
    utimesSync(旧, new Date("2026-08-01"), new Date("2026-08-01"))
    utimesSync(新, new Date("2026-09-01"), new Date("2026-09-01"))
    writeFileSync(join(pi记录目录(d), "zzz.txt"), "不是记录")
    const f = await 最新记录(d)
    expect(f?.path).toBe(新)
    expect(f?.size).toBeGreaterThan(0)
  })

  it("没有目录 / 目录里没有记录 → undefined（这段还没有一轮说完），不抛", async () => {
    const d = 新目录()
    expect(await 最新记录(d)).toBeUndefined()
    mkdirSync(pi记录目录(d), { recursive: true })
    expect(await 最新记录(d)).toBeUndefined()
  })
})
