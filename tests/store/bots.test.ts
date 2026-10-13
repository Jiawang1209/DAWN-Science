import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BotStore } from "../../src/store/bots.js"
import { migrate, SCHEMA_VERSION } from "../../src/store/schema.js"

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).reverse().forEach((f) => f()))
function open(path = ":memory:") {
  const db = new Database(path)
  cleanup.push(() => db.open && db.close())
  migrate(db)
  return { db, store: new BotStore(db) }
}
const input = { name: "统计", role: "统计专家", instructions: "解释方法并给出可复现脚本" }

describe("Bot identity and durable bindings", () => {
  it("persists failed startup and queued cancellation without inventing a member session", () => {
    const {store}=open();const bot=store.create(input)
    for(const status of ["failed","cancelled"] as const){
      const record={resultId:status,ownerSessionId:"owner",botId:bot.id,teamId:"team",taskId:"task",attemptId:"a",status,summary:"never started",artifacts:[]}
      expect(store.enqueueResult(record)).toBe(true);expect(store.getResult(status)?.memberSessionId).toBeUndefined();expect(store.enqueueResult(record)).toBe(false)
    }
  })
  it("upgrades a v16 database twice without changing existing session records", () => {
    const { db } = open()
    db.exec("DROP TABLE bot_results; DROP TABLE bot_dispatches; DROP TABLE bot_session_bindings; DROP TABLE bots")
    db.prepare("UPDATE schema_meta SET value='16' WHERE key='version'").run()
    db.prepare("INSERT INTO sessions (id,agent_id,workspace,session_dir,state,created_at,pinned,sort_order) VALUES ('old','native','/w','/s','exited','2026-01-01T00:00:00Z',1,42)").run()
    const before = db.prepare("SELECT * FROM sessions WHERE id='old'").get()
    migrate(db)
    const store = new BotStore(db)
    const bot = store.create(input)
    migrate(db)
    expect(db.prepare("SELECT * FROM sessions WHERE id='old'").get()).toEqual(before)
    expect(store.get(bot.id)).toEqual(bot)
  })

  it("rolls a failed v17 migration back before retrying it", () => {
    const { db } = open()
    db.exec("DROP TABLE bot_results; DROP TABLE bot_dispatches; DROP TABLE bot_session_bindings; DROP TABLE bots; CREATE TABLE bot_results (wrong_column TEXT)")
    db.prepare("UPDATE schema_meta SET value='16' WHERE key='version'").run()
    expect(() => migrate(db)).toThrow()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='bots'").get()).toBeUndefined()
    expect(db.prepare("SELECT value FROM schema_meta WHERE key='version'").get()).toEqual({ value: "16" })
    db.exec("DROP TABLE bot_results")
    migrate(db)
    expect(new BotStore(db).create(input).name).toBe(input.name)
  })

  it("renames without changing identity; archive hides profile but preserves history", () => {
    const { db, store } = open()
    const bot = store.create(input)
    expect(bot.enabled).toBe(true)
    const old = { botId: bot.id, scopeKey: "scope", kind: "direct" as const, sessionId: "old" }
    store.setBinding(old)
    store.setBinding({ ...old, sessionId: "new" })
    expect(store.update(bot.id, { name: "模型检查" }).id).toBe(bot.id)
    expect(store.getBinding(old)?.sessionId).toBe("new")
    expect(store.bindingOfSession("old")).toEqual(old)
    expect(store.listBindings({ botId: bot.id })).toHaveLength(2)
    const archived = store.archive(bot.id)
    expect(archived.archivedAt).toBeTruthy()
    expect(archived.enabled).toBe(false)
    expect(store.list()).toEqual([])
    expect(store.list({ includeArchived: true })).toEqual([archived])
    migrate(db)
    expect(store.bindingOfSession("old")).toEqual(old)
    expect(db.prepare("SELECT value FROM schema_meta WHERE key='version'").get()).toEqual({ value: String(SCHEMA_VERSION) })
  })

  it("separates scopes, direct history and each team; rejects reassignment of an existing session", () => {
    const { store } = open()
    const bot = store.create(input)
    const base = { botId: bot.id, scopeKey: "p1", kind: "direct" as const, sessionId: "direct" }
    store.setBinding(base)
    store.setBinding({ ...base, scopeKey: "p2", sessionId: "other" })
    store.setBinding({ ...base, kind: "team", teamId: "t1", ownerSessionId: "owner", sessionId: "team1" })
    store.setBinding({ ...base, kind: "team", teamId: "t2", ownerSessionId: "owner", sessionId: "team2" })
    expect(store.getBinding(base)?.sessionId).toBe("direct")
    expect(store.getBinding({ ...base, kind: "team", teamId: "t1" })?.sessionId).toBe("team1")
    expect(() => store.setBinding({ ...base, scopeKey: "p2" })).toThrow()
    expect(() => store.setBinding({ ...base, kind: "team", sessionId: "invalid" })).toThrow()
    expect(store.listBindings({ scopeKey: "p2" })).toHaveLength(1)
  })

  it("validates create and patches strictly; can clear model without erasing instructions", () => {
    const { store } = open()
    expect(() => store.create({ ...input, name: "  " })).toThrow()
    const bot = store.create({ ...input, model: { provider: "p", model: "m" } })
    expect(store.update(bot.id, { model: null }).model).toBeUndefined()
    expect(store.get(bot.id)?.instructions).toBe(input.instructions)
    expect(() => store.update(bot.id, { id: "replacement" } as never)).toThrow()
    expect(() => store.update("missing", { name: "x" })).toThrow()
  })

  it("reopens durable dispatch deduplication and result outbox, including delivery acknowledgements", () => {
    const dir = mkdtempSync(join(tmpdir(), "dawn-bots-"))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const path = join(dir, "store.db")
    const first = open(path)
    const bot = first.store.create(input)
    const request = { requestId: "r", ownerSessionId: "owner", botId: bot.id, scopeKey: "scope", instruction: "检查模型" }
    expect(first.store.reserveDispatch(request).created).toBe(true)
    expect(first.store.reserveDispatch(request).created).toBe(false)
    expect(() => first.store.reserveDispatch({ ...request, ownerSessionId: "other" })).toThrow()
    first.store.updateDispatch("r", { status: "dispatched", teamId: "team", taskId: "task", memberSessionId: "member" })
    first.store.enqueueResult({ resultId: "res", requestId: "r", ownerSessionId: "owner", botId: bot.id, teamId: "team", taskId: "task", attemptId: "a1", memberSessionId: "member", status: "completed", summary: "已检查", artifacts: ["analysis/result.R"] })
    first.db.close()
    const second = open(path)
    expect(second.store.reserveDispatch(request).record.memberSessionId).toBe("member")
    const result = second.store.pendingResults("owner")[0]!
    expect(result.summary).toBe("已检查")
    expect(result.deliveredAt).toBeUndefined()
    expect(second.store.pendingResults("other")).toEqual([])
    expect(second.store.enqueueResult(result)).toBe(false)
    second.store.markResultDelivered("res")
    expect(second.store.pendingResults("owner")).toEqual([])
    expect(second.store.getResult("res")?.deliveredAt).toBeTruthy()
    expect(second.store.getDispatch("r")?.taskId).toBe("task")
  })

  it("lists recovery dispatches by owner and finds their allocated team/task", () => {
    const { store } = open()
    const bot = store.create(input)
    const base = { requestId: "r1", ownerSessionId: "owner1", botId: bot.id, scopeKey: "scope", instruction: "check" }
    store.reserveDispatch(base)
    store.reserveDispatch({ ...base, requestId: "r2", ownerSessionId: "owner2" })
    store.updateDispatch("r1", { teamId: "team", taskId: "task", status: "dispatched" })
    expect(store.listDispatches("owner1").map((d) => d.requestId)).toEqual(["r1"])
    expect(store.dispatchForTask("team", "task")?.requestId).toBe("r1")
    expect(store.dispatchForTask("team", "unknown")).toBeUndefined()
  })

  it.each(["teamId", "taskId", "memberSessionId"] as const)("requires explicitly replayed %s to match the allocated dispatch", (field) => {
    const { store } = open()
    const bot = store.create(input)
    const request = { requestId: "replay", ownerSessionId: "owner", botId: bot.id, scopeKey: "scope", instruction: "check" }
    store.reserveDispatch(request)
    const allocated = store.updateDispatch(request.requestId, { status: "dispatched", teamId: "team", taskId: "task", memberSessionId: "member" })
    expect(store.reserveDispatch(request)).toEqual({ created: false, record: allocated })
    expect(store.reserveDispatch({ ...request, [field]: allocated[field] })).toEqual({ created: false, record: allocated })
    expect(() => store.reserveDispatch({ ...request, [field]: "different" })).toThrow(/conflict/)
    expect(store.getDispatch(request.requestId)).toEqual(allocated)
    expect(store.listDispatches(request.ownerSessionId)).toHaveLength(1)
  })

  it.each(["teamId", "taskId", "memberSessionId"] as const)("rejects a replay that newly supplies unallocated %s", (field) => {
    const { store } = open()
    const bot = store.create(input)
    const request = { requestId: "pending", ownerSessionId: "owner", botId: bot.id, scopeKey: "scope", instruction: "check" }
    const reserved = store.reserveDispatch(request).record
    expect(() => store.reserveDispatch({ ...request, [field]: "injected" })).toThrow(/conflict/)
    expect(store.getDispatch(request.requestId)).toEqual(reserved)
  })

  it("rejects conflicting result retries and keeps first delivery acknowledgement", () => {
    const { store } = open()
    const bot = store.create(input)
    const result = { resultId: "r", ownerSessionId: "owner", botId: bot.id, teamId: "t", taskId: "task", attemptId: "a", memberSessionId: "m", status: "completed" as const, summary: "first", artifacts: [] }
    store.enqueueResult(result)
    expect(() => store.enqueueResult({ ...result, summary: "rewritten" })).toThrow(/conflict/)
    store.markResultDelivered("r")
    const time = store.getResult("r")?.deliveredAt
    store.markResultDelivered("r")
    expect(store.getResult("r")?.deliveredAt).toBe(time)
  })
})
