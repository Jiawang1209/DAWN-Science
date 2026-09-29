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

  it("**与续接挑同一个文件**（同一个 `续接哪份`）：不按工作目录挑——header 里是搬家前的旧目录也认；读不出 header 的跳过（2026-09-29）", async () => {
    const d = 新目录()
    const 旧 = 写一段pi记录(d, [{ who: "user", text: "旧" }, { who: "agent", text: "好" }], { cwd: "/proj/new" })
    const 搬家前 = 写一段pi记录(d, [{ who: "user", text: "搬家前" }, { who: "agent", text: "好" }], { cwd: "/tmp/普通对话" })
    utimesSync(旧, new Date("2026-08-01"), new Date("2026-08-01"))
    utimesSync(搬家前, new Date("2026-09-01"), new Date("2026-09-01"))
    const 坏 = join(pi记录目录(d), "坏.jsonl")
    writeFileSync(坏, "不是 JSON\n")
    utimesSync(坏, new Date("2026-09-20"), new Date("2026-09-20"))
    expect((await 最新记录(d))?.path).toBe(搬家前)
    const { 续接或新建 } = await import("../../src/runtime/pi-resume.js")
    expect(续接或新建("/proj/new", pi记录目录(d)).getSessionFile()).toBe(搬家前)
  })

  it("没有目录 / 目录里没有记录 → undefined（这段还没有一轮说完），不抛", async () => {
    const d = 新目录()
    expect(await 最新记录(d)).toBeUndefined()
    mkdirSync(pi记录目录(d), { recursive: true })
    expect(await 最新记录(d)).toBeUndefined()
  })

  it("给了会话目录：簿里有的 `propose_plan` 原位换成方案卡（与续接 `history()` 同一个换法）；簿里没有的照旧是工具行（2026-09-28）", async () => {
    const d = 新目录()
    const f = 写一段pi记录(d, [
      { who: "user", text: "分析肺功能" },
      { who: "agent", text: "我先出一份方案。", 调: { id: "c1", name: "propose_plan", args: { title: "肺功能", plan: "看 FEV1" }, 出: "已交" } },
      { who: "agent", text: "再来", 调: { id: "c2", name: "propose_plan", args: { title: "第二版", plan: "看 FVC" }, 出: "已交" } },
    ])
    writeFileSync(
      join(d, "plans.json"),
      JSON.stringify({
        阶段: "off",
        方案们: [{ planId: "c1", version: 1, title: "肺功能", markdown: "看 FEV1（改过）", status: "approved", savedPath: "analysis/plans/a.md", sha256: "ab", 存档: "/x" }],
      }),
    )
    const 簿前 = readFileSync(join(d, "plans.json"), "utf8")
    const r = await 读记录(f, d)
    expect(r.map((x) => x.kind)).toEqual(["text", "text", "plan", "text", "tool"])
    expect(r[2]).toEqual({ kind: "plan", plan: { planId: "c1", version: 1, title: "肺功能", markdown: "看 FEV1（改过）", status: "approved", savedPath: "analysis/plans/a.md" } })
    expect(readFileSync(join(d, "plans.json"), "utf8"), "搜索绝不写盘").toBe(簿前)
    // 不给会话目录 / 簿读不出来：不编状态，照旧是工具行
    expect((await 读记录(f)).filter((x) => x.kind === "plan")).toEqual([])
    writeFileSync(join(d, "plans.json"), "{坏")
    expect((await 读记录(f, d)).filter((x) => x.kind === "plan")).toEqual([])
  })
})
