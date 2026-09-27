/**
 * 会话全文搜索的搜索器（2026-09-27，spec §3 / §6）。直接喂会话记录，不起后端。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 会话全文搜索, 单次时限毫秒 } from "../../src/workbench/session-search.js"
import { 读记录, pi记录目录, 最新记录 } from "../../src/runtime/pi-record.js"
import type { SessionRecord } from "../../src/store/sessions.js"
import { 写一段pi记录, type 一句 } from "../helpers/pi-record.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

let 序 = 0
function 一段(句们: 一句[] | undefined, over: Partial<SessionRecord> = {}): SessionRecord {
  const d = mkdtempSync(join(tmpdir(), "dawn-cs-"))
  dirs.push(d)
  // 每段都往后挪一天（没写记录的也挪）：建的先后与记录里的时刻一致，「先搜新建的」「按时刻排」才验得出来
  序++
  // header 的 cwd = 这段的工作目录：搜索与续接一样按它挑文件（`最新记录`）
  if (句们) 写一段pi记录(d, 句们, { cwd: d, 起: Date.parse("2026-08-01T00:00:00Z") + 序 * 86_400_000 })
  return {
    id: `s${序}-${Math.random().toString(36).slice(2, 6)}`,
    agentId: "ds",
    workspace: d,
    sessionDir: d,
    state: "exited",
    createdAt: new Date(Date.parse("2026-08-01T00:00:00Z") + 序 * 86_400_000).toISOString(),
    pinned: false,
    sortOrder: 序,
    ...over,
  }
}

const 造 = (records: SessionRecord[], over: Partial<ConstructorParameters<typeof 会话全文搜索>[0]> = {}) =>
  new 会话全文搜索({
    records: () => records,
    kindOf: (agentId) => (agentId === "ds" ? "native" : agentId === "sh" ? "pty" : undefined),
    placeOf: (r) => (r.connectionId ? { kind: "server", name: "gs191" } : r.projectId === "p1" ? { kind: "project", name: "lung" } : undefined),
    ...over,
  })

describe("会话全文搜索 · 找什么", () => {
  it("你说的、agent 回的、工具参数、工具输出都搜得到；片段与 where 对得上；itemId 与续接同一套", async () => {
    const a = 一段([
      { who: "user", text: "帮我做个 Cox 回归" },
      { who: "agent", text: "好", 调: { id: "c1", name: "run_code", args: { language: "R", code: "fit <- coxph(Surv(t, s) ~ age)" }, 出: "HR = 1.02, p = 0.003" } },
    ])
    const s = 造([a])
    const 用户 = await s.搜("cox 回归", 30)
    expect(用户.sessions[0]!.hits[0]).toMatchObject({ itemId: "r0", nth: 0, where: "user" })
    const 代码 = await s.搜("coxph", 30)
    expect(代码.sessions[0]!.hits[0]).toMatchObject({ itemId: "c1", where: "toolInput", toolName: "run_code" })
    const 输出 = await s.搜("0.003", 30)
    expect(输出.sessions[0]!.hits[0]).toMatchObject({ itemId: "c1", where: "toolResult" })
    expect(输出.sessions[0]!.hits[0]!.at).toMatch(/^2026-/)
  })

  it("每段最多列 3 处，其余记进 moreHits；nth 按转录顺序数", async () => {
    const a = 一段(Array.from({ length: 5 }, (_, i) => [{ who: "user" as const, text: `第${i}次 Cox` }, { who: "agent" as const, text: "好" }]).flat())
    const r = await 造([a]).搜("cox", 30)
    expect(r.sessions[0]!.hits.map((h) => h.nth)).toEqual([0, 1, 2])
    expect(r.sessions[0]!.moreHits).toBe(2)
  })

  it("卡按命中的最新时刻排，新的在上；带标题、所在、归档", async () => {
    const 旧 = 一段([{ who: "user", text: "Cox 旧的" }, { who: "agent", text: "好" }], { projectId: "p1", title: "旧那段" })
    const 新 = 一段([{ who: "user", text: "Cox 新的" }, { who: "agent", text: "好" }], { connectionId: "c1", archivedAt: "2026-09-01T00:00:00Z" })
    const r = await 造([旧, 新]).搜("cox", 30)
    expect(r.sessions.map((x) => x.sessionId)).toEqual([新.id, 旧.id])
    expect(r.sessions[0]).toMatchObject({ archived: true, place: { kind: "server", name: "gs191" } })
    expect(r.sessions[1]).toMatchObject({ archived: false, title: "旧那段", place: { kind: "project", name: "lung" } })
  })
})

describe("会话全文搜索 · 压缩过的对话（2026-09-28）", () => {
  it("压缩前说的话照样搜得到（点开也看得到）；压缩摘要不算说过的话；itemId 与续接同一套下标", async () => {
    const a = 一段([{ who: "user", text: "压缩前 Cox" }, { who: "agent", text: "好" }])
    const f = (await 最新记录(a.sessionDir))!.path
    const { SessionManager } = await import("@earendil-works/pi-coding-agent")
    const sm = SessionManager.open(f, pi记录目录(a.sessionDir))
    const 首条 = sm.getBranch().find((e) => e.type === "message")!
    sm.appendCompaction("摘要里提到 Cox 和 摘要词", 首条.id, 9000)
    sm.appendMessage({ role: "user", content: "压缩后 Cox", timestamp: Date.parse("2026-12-01T00:00:00Z") } as never)
    sm.appendMessage({ role: "assistant", content: [{ type: "text", text: "嗯" }], stopReason: "stop", timestamp: Date.parse("2026-12-01T00:01:00Z") } as never)
    const s = 造([a])
    const r = await s.搜("cox", 30)
    expect(r.sessions[0]!.hits.map((h) => [h.itemId, h.nth])).toEqual([["r0", 0], ["r3", 1]])
    expect((await s.搜("摘要词", 30)).sessions).toEqual([])
  })
})

describe("会话全文搜索 · 不搜的与截断都要说出来", () => {
  it("非 native 计进 notSearchable；还没落盘的不计；坏文件计进 unreadable；超过 32 MB 计进 tooLarge", async () => {
    const 终端 = 一段(undefined, { agentId: "sh" })
    const 没说完 = 一段(undefined)
    const 坏 = 一段(undefined)
    mkdirSync(pi记录目录(坏.sessionDir), { recursive: true })
    writeFileSync(join(pi记录目录(坏.sessionDir), "x.jsonl"), "")
    const 大 = 一段([{ who: "user", text: "Cox" }, { who: "agent", text: "好" }])
    const r = await 造([终端, 没说完, 坏, 大], { 单文件上限字节: 10 }).搜("cox", 30)
    expect(r).toMatchObject({ notSearchable: 1, tooLarge: 1, total: 4 })
    expect(r.sessions).toEqual([])
    // 空文件：pi 的 inMemory 读它会给一段只有 header 的新对话——没有条目，不是「读不了」
    expect(r.unreadable).toBe(0)
  })

  it("读记录抛错 → unreadable，别的照搜", async () => {
    const 好 = 一段([{ who: "user", text: "Cox" }, { who: "agent", text: "好" }])
    const 坏 = 一段([{ who: "user", text: "Cox" }, { who: "agent", text: "好" }])
    const r = await 造([好, 坏], { 读: async (p) => (p.includes(坏.sessionDir) ? Promise.reject(new Error("EACCES")) : 读记录(p)) }).搜("cox", 30)
    expect(r.unreadable).toBe(1)
    expect(r.sessions.map((x) => x.sessionId)).toEqual([好.id])
  })

  it("超过 limit 段：列前 limit 段，truncated = sessions，matchedSessions 是真总数", async () => {
    const 段们 = Array.from({ length: 4 }, () => 一段([{ who: "user", text: "Cox" }, { who: "agent", text: "好" }]))
    const r = await 造(段们).搜("cox", 2)
    expect(r.sessions).toHaveLength(2)
    expect(r).toMatchObject({ truncated: "sessions", matchedSessions: 4 })
  })

  it("到了时限：停下，交回已经搜过的，truncated = time，scanned < total；**先搜新建的**", async () => {
    const 段们 = Array.from({ length: 3 }, () => 一段([{ who: "user", text: "Cox" }, { who: "agent", text: "好" }]))
    let t = 0
    const r = await 造(段们, { now: () => (t += 单次时限毫秒 / 2) }).搜("cox", 30)
    expect(r.truncated).toBe("time")
    expect(r.scanned).toBeLessThan(r.total)
    expect(r.sessions[0]!.sessionId).toBe(段们[2]!.id)
  })
})

describe("会话全文搜索 · 缓存", () => {
  it("文件没变不重读；变了（续接追加）才重读；删掉的会话从缓存里扔掉", async () => {
    const a = 一段([{ who: "user", text: "Cox" }, { who: "agent", text: "好" }])
    const 读 = vi.fn(读记录)
    const records = [a]
    const s = 造(records, { 读 })
    await s.搜("cox", 30)
    await s.搜("回归", 30)
    expect(读).toHaveBeenCalledTimes(1)
    写一段pi记录(a.sessionDir, [{ who: "user", text: "又说了一句 回归" }, { who: "agent", text: "好" }], { cwd: a.workspace, 起: Date.parse("2026-12-01T00:00:00Z") })
    const r = await s.搜("回归", 30)
    expect(读).toHaveBeenCalledTimes(2)
    expect(r.sessions).toHaveLength(1)
    records.length = 0
    await s.搜("cox", 30)
    expect(s.已缓存段数).toBe(0)
  })
})
