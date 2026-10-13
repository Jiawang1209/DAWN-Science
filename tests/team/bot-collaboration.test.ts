import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 团队调度器, type BotMemberRun } from "../../src/team/scheduler.js"
import { 建团队, 加成员, 加任务, 写团队, 取消任务, 转派, 移除成员 } from "../../src/team/state.js"

const dirs: string[] = []
const runnerAssertions: unknown[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); expect(runnerAssertions.splice(0)).toEqual([]) })
const pause = () => new Promise<void>(r => setTimeout(r, 2))
async function until(check: () => boolean) { for (let i = 0; i < 200 && !check(); i++) await pause(); expect(check()).toBe(true) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
type Result = { ok: boolean; output: string; error?: string }
function setup(runner: (req: BotMemberRun) => Promise<Result>) {
 const dir = mkdtempSync(join(tmpdir(), "dawn-collaboration-")); dirs.push(dir)
 const results: string[] = []
 const scheduler = new 团队调度器({ sessionDir: dir, 定义: () => [], 跑: { childOf: (() => { throw Error("legacy runner") }) as never, context: { cwd: dir, provider: "p", model: "m" } } as never, onChange: () => {}, memberRunner: async req => { try { return await runner(req) } catch (error) { if (error instanceof Error && error.name === "AssertionError") runnerAssertions.push(error); throw error } }, onResult: e => { results.push(e.taskId) } })
 const team = 建团队({ name: "Analysis", goal: "summarize data", captainSessionId: "main" })
 加成员(team, { name: "analyst", agent: "a", botId: "bot-a", botScopeKey: "scope" })
 加成员(team, { name: "reviewer", agent: "b", botId: "bot-b", botScopeKey: "scope" })
 加成员(team, { name: "plotter", agent: "c", botId: "bot-c", botScopeKey: "scope" })
 加任务(team, { id: "analysis", subject: "Analyze", assignee: "analyst" })
 写团队(scheduler.dir(team.id), team)
 return { scheduler, team, results }
}

describe("managed Bot request/reply/resume", () => {
 it("exposes an authenticated Bot request operation", () => {
  const { scheduler, team } = setup(async () => ({ ok: true, output: "done" }))
  expect(typeof scheduler.requestBot).toBe("function")
  expect(() => scheduler.requestBot(team.id, "analyst", { id: "x", to: "bot-b", message: "Review" })).toThrow(/active|正在|执行/)
 })
 it.each(["request", "handoff"] as const)("%s yields the original task, runs a peer, then resumes the original attempt exactly once", async kind => {
  const peer = deferred<Result>(); const source = deferred<Result>(); const calls: BotMemberRun[] = []
  const { scheduler, team, results } = setup(async req => {
   calls.push(req)
   if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "review", to: "bot-b", message: "Check mean 3", kind }); return source.promise }
   if (req.collaboration.phase === "request") return peer.promise
   expect(req.taskId).toBe("analysis"); expect(req.prompt).toContain("mean verified: 3")
   return { ok: true, output: "confirmed mean 3" }
  })
  await scheduler.踢一下(team.id)
  expect(scheduler.读(team.id).tasks[0]?.status).toBe("in_progress")
  const attemptId = scheduler.读(team.id).tasks[0]?.attemptId
  source.resolve({ ok: true, output: "waiting for review" })
  await until(() => calls.some(r => r.collaboration?.phase === "request"))
  expect(results).toEqual([]); expect(scheduler.读(team.id).tasks[0]?.status).toBe("in_progress")
  expect(calls[1]?.taskId).toBeUndefined(); expect(calls[1]?.prompt).toContain("Check mean 3")
  peer.resolve({ ok: true, output: "mean verified: 3" })
  await until(() => results.length === 1)
  expect(calls.map(r => r.collaboration?.phase ?? "task")).toEqual(["task", "request", "reply"])
  expect(scheduler.读(team.id).tasks[0]).toMatchObject({ status: "completed", attemptId, output: "confirmed mean 3" })
  expect(scheduler.读(team.id).collaboration?.[0]).toMatchObject({ status: "replied", kind, reply: "mean verified: 3", resumedAt: expect.any(Number) })
  await scheduler.踢一下(team.id); expect(calls).toHaveLength(3)
 })
})

it("rejects invalid targets, scope mismatch, oversized content, changed ids and enforces finite request limits", async () => {
 const calls: BotMemberRun[] = []
 const { scheduler, team } = setup(async req => {
  calls.push(req)
  if (req.collaboration?.phase === "request") {
   return { ok: true, output: "reviewed" }
  }
  if (req.collaboration) return { ok: true, output: "confirmed" }
  for (const to of ["bot-a", "unknown"]) expect(() => scheduler.requestBot(team.id, "analyst", { id: "bad", to, message: "ask" })).toThrow()
  expect(() => scheduler.requestBot(team.id, "analyst", { id: "empty", to: "bot-b", message: " " })).toThrow(/空/)
  expect(() => scheduler.requestBot(team.id, "analyst", { id: "large", to: "bot-b", message: "中".repeat(6000) })).toThrow(/上限/)
  scheduler.改(team.id, t => { t.members[2]!.botScopeKey = "other" })
  expect(() => scheduler.requestBot(team.id, "analyst", { id: "scope", to: "bot-c", message: "ask" })).toThrow(/范围/)
  const first = scheduler.requestBot(team.id, "analyst", { id: "same", to: "reviewer", message: "check" })
  expect(scheduler.requestBot(team.id, "analyst", { id: "same", to: "bot-b", message: "check" })).toEqual(first)
  expect(() => scheduler.requestBot(team.id, "analyst", { id: "same", to: "bot-b", message: "changed" })).toThrow(/不能改变/)
  for (let i = 1; i < 8; i++) scheduler.requestBot(team.id, "analyst", { id: `r${i}`, to: "bot-b", message: "check" })
  expect(() => scheduler.requestBot(team.id, "analyst", { id: "ninth", to: "bot-b", message: "check" })).toThrow(/8/)
  return { ok: true, output: "waiting" }
 })
 await scheduler.踢一下(team.id)
 await until(() => scheduler.读(team.id).tasks[0]?.status === "completed")
 expect(scheduler.读(team.id).collaboration).toHaveLength(8)
 expect(calls.filter(r => r.collaboration?.phase === "request")).toHaveLength(8)
})

it("routes peer failure back to the original task instead of claiming premature success", async () => {
 const { scheduler, team, results } = setup(async req => {
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "failure", to: "bot-b", message: "check source" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") throw Error("dataset missing")
  expect(req.prompt).toContain("dataset missing")
  return { ok: false, output: "", error: "cannot validate without dataset" }
 })
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 expect(scheduler.读(team.id).tasks[0]).toMatchObject({ status: "failed", output: "cannot validate without dataset" })
 expect(scheduler.读(team.id).collaboration?.[0]).toMatchObject({ status: "failed", resumedAt: expect.any(Number) })
})

it.each(["cancel", "reassign"])("%s invalidates a pending exchange and drops a late peer result", async mode => {
 const peer = deferred<Result>(); let resumes = 0
 const { scheduler, team } = setup(async req => {
  if (!req.collaboration) { if (req.member.name !== "analyst") return { ok: true, output: "replacement" }; scheduler.requestBot(team.id, "analyst", { id: "stale", to: "bot-b", message: "check" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") return peer.promise
  resumes++; return { ok: true, output: "stale" }
 })
 await scheduler.踢一下(team.id); await until(() => scheduler.读(team.id).collaboration?.[0]?.status === "working")
 scheduler.改(team.id, t => { if (mode === "cancel") 取消任务(t, "analysis"); else 转派(t, "analysis", "plotter") })
 expect(scheduler.读(team.id).collaboration?.[0]?.status).toBe("cancelled")
 peer.resolve({ ok: true, output: "late" }); await until(() => scheduler.几个在跑() === 0)
 expect(resumes).toBe(0); expect(scheduler.读(team.id).collaboration?.[0]?.resumedAt).toBeUndefined()
 expect(scheduler.读(team.id).tasks[0]?.output).not.toBe("stale")
})

it("recipient removal resumes a valid sender with an explicit cancellation and ignores late success", async () => {
 const peer = deferred<Result>(); let resumes = 0
 const { scheduler, team, results } = setup(async req => {
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "removed", to: "bot-b", message: "check" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") return peer.promise
  resumes++; expect(req.prompt).toContain("取消"); return { ok: false, output: "", error: "review cancelled" }
 })
 await scheduler.踢一下(team.id); await until(() => scheduler.读(team.id).collaboration?.[0]?.status === "working")
 scheduler.中止(team.id, "reviewer"); scheduler.改(team.id, t => { 移除成员(t, "reviewer") }); await scheduler.踢一下(team.id)
 await until(() => results.length === 1)
 peer.resolve({ ok: true, output: "late review" }); await until(() => scheduler.几个在跑() === 0)
 expect(resumes).toBe(1); expect(scheduler.读(team.id).collaboration?.[0]?.reply).not.toBe("late review")
})

it("two waiting task owners can service each other's requests without overwriting their original tasks", async () => {
 const calls: BotMemberRun[] = []; const { scheduler, team, results } = setup(async req => {
  calls.push(req)
  if (!req.collaboration) { scheduler.requestBot(team.id, req.member.name, { id: req.member.name, to: req.member.name === "analyst" ? "bot-b" : "bot-a", message: "check" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") { expect(req.taskId).toBeUndefined(); return { ok: true, output: "checked" } }
  return { ok: true, output: "confirmed " + req.member.name }
 })
 scheduler.改(team.id, t => { 加任务(t, { id: "review", subject: "Review", assignee: "reviewer" }) })
 await scheduler.踢一下(team.id); await until(() => results.length === 2)
 expect(scheduler.读(team.id).tasks.map(t => t.status)).toEqual(["completed", "completed"])
 expect(calls.filter(c => c.collaboration?.phase === "request")).toHaveLength(2)
 expect(calls.filter(c => c.collaboration?.phase === "reply")).toHaveLength(2)
})

it("a stopped team with no active runs cancels queued requests without replaying the source", async () => {
 const { scheduler, team } = setup(async () => ({ ok: true, output: "unexpected" }))
 scheduler.改(team.id, t => {
  const task = t.tasks[0]!; task.status = "in_progress"; task.attemptId = "token"
  t.collaboration = [{ id: "queued", from: "analyst", to: "reviewer", fromBotId: "bot-a", toBotId: "bot-b", kind: "request", message: "check", taskId: task.id, attemptId: "token", status: "queued", createdAt: 1, updatedAt: 1 }]
 })
 scheduler.中止全部(team.id)
 expect(scheduler.读(team.id).collaboration?.[0]?.status).toBe("cancelled")
 await scheduler.踢一下(team.id); await pause()
 expect(scheduler.读(team.id).collaboration?.[0]?.resumedAt).toBeUndefined()
 expect(scheduler.读(team.id).tasks[0]?.status).toBe("in_progress")
})

it("allows a resumed owner to request another peer and settles the original task only after both replies", async () => {
 const calls: BotMemberRun[] = []; const { scheduler, team, results } = setup(async req => {
  calls.push(req)
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "first", to: "bot-b", message: "validate rows" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") return { ok: true, output: `verified ${req.member.name}` }
  if (req.collaboration.exchangeId === "first") { scheduler.requestBot(team.id, "analyst", { id: "second", to: "bot-c", message: "validate plot" }); return { ok: true, output: "waiting again" } }
  return { ok: true, output: "both verified" }
 })
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 expect(calls.map(c => c.collaboration?.exchangeId ?? "task")).toEqual(["task", "first", "first", "second", "second"])
 expect(scheduler.读(team.id).tasks[0]?.attempt).toBe(1)
 expect(scheduler.读(team.id).tasks[0]?.output).toBe("both verified")
})

it("历史协作不耗尽新任务容量，原任务总请求预算仍然有效", async () => {
 const { scheduler, team, results } = setup(async req => {
  if(req.collaboration?.phase === "request") return {ok:true,output:"checked"}
  if(req.collaboration) return {ok:true,output:"done"}
  scheduler.改(team.id, t => { t.collaboration = Array.from({ length: 64 }, (_, i) => ({ id: `past-${i}`, from: "analyst", to: "reviewer", fromBotId: "bot-a", toBotId: "bot-b", message: "historical", kind: "request", status: "replied", taskId: `past-task-${i}`, createdAt: 1, updatedAt: 1, resumedAt: 1 })) })
  scheduler.requestBot(team.id,"analyst",{id:"fresh",to:"bot-b",message:"check"})
  return {ok:true,output:"waiting"}
 })
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 expect(scheduler.读(team.id).tasks[0]?.status).toBe("completed")
 expect(scheduler.读(team.id).collaboration).toHaveLength(65)
})

it("stopping a paused source prevents a peer's late result from resuming it", async () => {
 const peer = deferred<Result>(); let resumes = 0
 const { scheduler, team } = setup(async req => {
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "stopped", to: "bot-b", message: "check" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") return peer.promise
  resumes++; return { ok: true, output: "should not resume" }
 })
 await scheduler.踢一下(team.id); await until(() => scheduler.读(team.id).collaboration?.[0]?.status === "working")
 scheduler.stopTask(team.id, "analysis"); await scheduler.踢一下(team.id)
 expect(scheduler.读(team.id).tasks[0]?.status).toBe("cancelled")
 peer.resolve({ ok: true, output: "late" }); await until(() => scheduler.几个在跑() === 0)
 expect(resumes).toBe(0); expect(scheduler.读(team.id).collaboration?.[0]?.resumedAt).toBeUndefined()
})

it("never runs two members concurrently in the same persistent session", async () => {
 const first = deferred<Result>(); const calls: string[] = []
 const { scheduler, team, results } = setup(async req => { calls.push(req.member.name); return req.member.name === "analyst" ? first.promise : { ok: true, output: "reviewed" } })
 scheduler.改(team.id, t => { t.members[0]!.sessionId = "same-session"; t.members[1]!.sessionId = "same-session"; 加任务(t, { id: "review", subject: "Review", assignee: "reviewer" }) })
 await scheduler.踢一下(team.id)
 expect(calls).toEqual(["analyst"])
 first.resolve({ ok: true, output: "analyzed" }); await until(() => results.length === 2)
 expect(calls).toEqual(["analyst", "reviewer"])
})


it("accepts opaque provider call ids and replays the same receipt after the recipient disappears", async () => {
 const { scheduler, team, results } = setup(async req => {
  if (req.collaboration) return { ok: true, output: "handled cancellation" }
  const input = { id: "call_a|item:b", to: "bot-b", message: "check" }
  scheduler.requestBot(team.id, "analyst", input)
  scheduler.改(team.id, t => { 移除成员(t, "reviewer") })
  expect(scheduler.requestBot(team.id, "analyst", input)).toMatchObject({ id: input.id, status: "cancelled" })
  for (const id of ["", " ", "a\nb", "marker]", "x".repeat(201)]) expect(() => scheduler.requestBot(team.id, "analyst", { ...input, id })).toThrow(/id/)
  return { ok: true, output: "waiting" }
 })
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 expect(scheduler.读(team.id).tasks[0]?.output).toBe("handled cancellation")
 expect(scheduler.读(team.id).collaboration).toHaveLength(1)
})

it("explicit intentional dispatch can resume a stopped unfinished team", async () => {
 const calls: string[] = []
 const { scheduler, team, results } = setup(async req => { calls.push(req.taskId!); return { ok: true, output: "done" } })
 scheduler.改(team.id, t => { 取消任务(t, "analysis") })
 scheduler.中止全部(team.id)
 await scheduler.踢一下(team.id); expect(calls).toEqual([])
 scheduler.resumeTeam(team.id)
 scheduler.改(team.id, t => { 加任务(t, { id: "new-dispatch", subject: "Intentional new work", assignee: "reviewer" }) })
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 expect(calls).toEqual(["new-dispatch"])
})

it.each(["cancel", "reassign"])("source %s aborts its running peer request tools immediately", async mode => {
 const peer = deferred<Result>(); let peerSignal: AbortSignal | undefined
 const { scheduler, team } = setup(async req => {
  if (!req.collaboration) { if (req.member.name !== "analyst") return { ok: true, output: "replacement" }; scheduler.requestBot(team.id, "analyst", { id: "abort-helper", to: "bot-b", message: "check" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") { peerSignal = req.signal; return peer.promise }
  return { ok: true, output: "should not resume" }
 })
 await scheduler.踢一下(team.id); await until(() => !!peerSignal)
 scheduler.改(team.id, t => { if (mode === "cancel") 取消任务(t, "analysis"); else 转派(t, "analysis", "plotter") })
 const aborted = peerSignal!.aborted
 peer.resolve({ ok: true, output: "late" }); await until(() => scheduler.几个在跑() === 0)
 expect(aborted).toBe(true)
 expect(scheduler.读(team.id).collaboration?.[0]?.resumedAt).toBeUndefined()
})

it("resuming new work after stop-all never consumes an old cancelled source exchange", async () => {
 const calls: BotMemberRun[] = []
 const { scheduler, team, results } = setup(async req => { calls.push(req); return { ok: true, output: "new work done" } })
 scheduler.改(team.id, t => {
  const task = t.tasks[0]!; task.status = "in_progress"; task.attemptId = "old-token"
  t.collaboration = [{ id: "old-exchange", from: "analyst", to: "reviewer", fromBotId: "bot-a", toBotId: "bot-b", kind: "request", message: "old request", taskId: task.id, attemptId: task.attemptId, status: "queued", createdAt: 1, updatedAt: 1 }]
 })
 scheduler.中止全部(team.id)
 scheduler.改(team.id, t => { 加任务(t, { id: "fresh", subject: "Fresh intentional work", assignee: "plotter" }) })
 scheduler.resumeTeam(team.id)
 await scheduler.踢一下(team.id); await until(() => results.includes("fresh")); await until(() => scheduler.几个在跑() === 0)
 expect(calls.map(c => c.taskId)).toEqual(["fresh"])
 expect(results).toEqual(["fresh"])
 expect(scheduler.读(team.id).collaboration?.[0]).toMatchObject({ status: "cancelled" })
 expect(scheduler.读(team.id).collaboration?.[0]?.resumedAt).toBeUndefined()
 expect(scheduler.读(team.id).tasks[0]?.status).toBe("in_progress")
})


it.each(["bot-a", "bot-c"])("allows a peer to consult %s then resumes its handling before the root task", async target => {
 const calls: BotMemberRun[] = []
 const { scheduler, team, results } = setup(async req => {
  calls.push(req)
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "parent", to: "bot-b", message: "Review source" }); return { ok: true, output: "root waiting filler" } }
  if (req.collaboration.exchangeId === "parent" && req.collaboration.phase === "request") {
   scheduler.requestBot(team.id, "reviewer", { id: "child", to: target, message: "Clarify units" }); return { ok: true, output: "peer waiting filler" }
  }
  if (req.collaboration.exchangeId === "child" && req.collaboration.phase === "request") return { ok: true, output: "units are kg" }
  if (req.collaboration.exchangeId === "child") { expect(req.taskId).toBeUndefined(); expect(req.member.name).toBe("reviewer"); expect(req.prompt).toContain("Review source"); expect(req.prompt).toContain("units are kg"); return { ok: true, output: "reviewed with kg" } }
  expect(req.member.name).toBe("analyst"); expect(req.prompt).toContain("reviewed with kg"); return { ok: true, output: "final verified" }
 })
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 const saved = scheduler.读(team.id)
 expect(calls.map(c => c.collaboration?.exchangeId ?? "task")).toEqual(["task", "parent", "child", "child", "parent"])
 expect(saved.collaboration?.[1]).toMatchObject({ parentExchangeId: "parent", rootOwner: "analyst", taskId: "analysis", status: "replied" })
 expect(saved.tasks[0]?.output).toBe("final verified")
 expect(saved.conversation?.[0]).toMatchObject({role: "captain", kind: "request", toBotId: "bot-a", content: "请负责：Analyze"})
 expect(saved.conversation?.slice(1).map(m => m.content)).toEqual(["Review source", "Clarify units", "units are kg", "reviewed with kg", "final verified"])
 expect(saved.conversation?.map(m => m.kind)).toEqual(["request", "request", "request", "reply", "reply", "result"])
 await scheduler.踢一下(team.id); expect(results).toEqual(["analysis"])
})

it("queues idempotent user intervention behind a busy task and records the actual answer without settling its paused task", async () => {
 const peer = deferred<Result>(); const answering = deferred<Result>(); const calls: BotMemberRun[] = []
 const { scheduler, team, results } = setup(async req => {
  calls.push(req)
  if (req.conversation) { expect(req.taskId).toBeUndefined(); expect(req.prompt).toContain("Use dry mass"); return answering.promise }
  if (!req.collaboration) { scheduler.sayBot(team.id, "analyst", { id: "public-note", message: "I will verify units" }); scheduler.requestBot(team.id, "analyst", { id: "review", to: "bot-b", message: "Check units" }); return { ok: true, output: "waiting" } }
  if (req.collaboration.phase === "request") return peer.promise
  expect(req.prompt).toContain("Use dry mass"); return { ok: true, output: "dry mass verified" }
 })
 await scheduler.踢一下(team.id); await until(() => scheduler.读(team.id).collaboration?.[0]?.status === "working")
 const input = { id: "user-1", message: "Use dry mass", toBotId: "bot-a" }
 const message = scheduler.messageTeam(team.id, input)
 expect(scheduler.messageTeam(team.id, input)).toEqual(message)
 expect(() => scheduler.messageTeam(team.id, { ...input, message: "changed" })).toThrow(/不能改变/)
 await until(() => calls.some(c => c.conversation))
 expect(scheduler.读(team.id).tasks[0]?.status).toBe("in_progress"); expect(results).toEqual([])
 answering.resolve({ ok: true, output: "Understood dry mass" })
 await until(() => scheduler.读(team.id).conversation?.some(m => m.content === "Understood dry mass") ?? false)
 peer.resolve({ ok: true, output: "units checked" }); await until(() => results.length === 1)
 const saved = scheduler.读(team.id)
 expect(saved.conversation?.filter(m => m.id === "user-1")).toHaveLength(1)
 expect(saved.conversation?.filter(m => m.content === "Understood dry mass")).toHaveLength(1)
 expect(saved.tasks[0]?.output).toBe("dry mass verified")
 expect(calls.filter(c => c.conversation)).toHaveLength(1)
 expect(() => scheduler.sayBot(team.id, "reviewer", { id: "forged", message: "hi" })).toThrow(/活动|正在/)
})

it("cancels a whole nested consultation when its root task is cancelled and never revives it", async () => {
 const child = deferred<Result>(); let signal: AbortSignal | undefined; let resumes = 0
 const { scheduler, team, results } = setup(async req => {
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "parent", to: "bot-b", message: "review" }); return { ok: true, output: "wait" } }
  if (req.collaboration.exchangeId === "parent" && req.collaboration.phase === "request") { scheduler.requestBot(team.id, "reviewer", { id: "child", to: "bot-c", message: "consult" }); return { ok: true, output: "wait" } }
  if (req.collaboration.phase === "request") { signal = req.signal; return child.promise }
  resumes++; return { ok: true, output: "stale" }
 })
 await scheduler.踢一下(team.id); await until(() => !!signal)
 scheduler.改(team.id, t => { 取消任务(t, "analysis") })
 expect(signal!.aborted).toBe(true)
 child.resolve({ ok: true, output: "late" }); await until(() => scheduler.几个在跑() === 0)
 expect(scheduler.读(team.id).collaboration?.map(x => x.status)).toEqual(["cancelled", "cancelled"])
 expect(resumes).toBe(0); expect(results).toEqual([])
})

it("lets a user-message handler ask a peer and continue its own reply without completing a paused original task", async () => {
 const originalPeer = deferred<Result>(); const calls: BotMemberRun[] = []
 const { scheduler, team, results } = setup(async req => {
  calls.push(req)
  if (req.collaboration?.exchangeId === "original-check" && req.collaboration.phase === "request") return originalPeer.promise
  if (req.conversation && !req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "user-check", to: "bot-c", message: "Verify user units" }); return { ok: true, output: "user waiting filler" } }
  if (req.collaboration?.exchangeId === "user-check" && req.collaboration.phase === "request") return { ok: true, output: "user units kg" }
  if (req.conversation) { expect(req.prompt).toContain("user units kg"); return { ok: true, output: "user answer verified" } }
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "original-check", to: "bot-b", message: "Original review" }); return { ok: true, output: "original waiting filler" } }
  return { ok: true, output: "original final" }
 })
 await scheduler.踢一下(team.id); await until(() => scheduler.读(team.id).collaboration?.[0]?.status === "working")
 scheduler.messageTeam(team.id, { id: "user-root", message: "What units?", toBotId: "bot-a" })
 await until(() => scheduler.读(team.id).conversation?.some(m => m.content === "user answer verified") ?? false)
 expect(results).toEqual([]); expect(scheduler.读(team.id).tasks[0]?.status).toBe("in_progress")
 expect(scheduler.读(team.id).collaboration?.[1]).toMatchObject({ rootOwner: "analyst", rootMessageId: "user-root", status: "replied" })
 expect(scheduler.读(team.id).conversation?.some(m => m.content === "user waiting filler")).toBe(false)
 originalPeer.resolve({ ok: true, output: "original checked" }); await until(() => results.length === 1)
 expect(scheduler.读(team.id).tasks[0]?.output).toBe("original final")
})

it("public broadcasts reach each current scoped Bot once, and bounded context names the number omitted", async () => {
 const calls: BotMemberRun[] = []
 const { scheduler, team } = setup(async req => { calls.push(req); return { ok: true, output: `heard ${req.member.name}` } })
 scheduler.改(team.id, t => {
  取消任务(t, "analysis")
  t.conversation = Array.from({length: 50}, (_,i) => ({id: `history-${i}`,role: "system" as const,from: "system",content: `public note ${i}`,createdAt: i,kind: "status" as const}))
 })
 const input = {id: "broadcast", message: "Discuss units"}
 scheduler.messageTeam(team.id, input); scheduler.messageTeam(team.id, input)
 await until(() => scheduler.读(team.id).conversationTurns?.filter(t => t.status === "replied").length === 3)
 expect(calls).toHaveLength(3)
 expect(calls[0]?.prompt).toContain("已省略较早的 11 条公共消息")
 expect(calls[0]?.prompt).not.toContain("public note 0")
 expect(scheduler.读(team.id).conversation?.filter(m => m.role === "bot")).toHaveLength(3)
 scheduler.改(team.id, t => { t.members[2]!.botScopeKey = "other" })
 expect(() => scheduler.messageTeam(team.id, {id: "bad-scope", message: "bad"})).toThrow(/范围/)
 expect(() => scheduler.messageTeam(team.id, {id: "bad-target", message: "bad", toBotId: "unknown"})).toThrow(/活动/)
 scheduler.中止全部(team.id)
 expect(() => scheduler.messageTeam(team.id, {id: "stopped", message: "bad"})).toThrow(/停止/)
})

it.each(["remove", "scope", "stop"])("nested recipient %s preserves parent handling and never publishes a stale reply", async mode => {
 const child = deferred<Result>(); let childSignal: AbortSignal | undefined
 const { scheduler, team, results } = setup(async req => {
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", { id: "parent", to: "bot-b", message: "review" }); return { ok: true, output: "wait" } }
  if (req.collaboration.exchangeId === "parent" && req.collaboration.phase === "request") { scheduler.requestBot(team.id, "reviewer", { id: "child", to: "bot-c", message: "consult" }); return { ok: true, output: "wait" } }
  if (req.collaboration.phase === "request") { childSignal = req.signal; return child.promise }
  if (req.collaboration.exchangeId === "child") { expect(req.prompt).toContain("取消"); return { ok: true, output: "reviewed despite cancelled consultation" } }
  return { ok: true, output: "root finished explicitly" }
 })
 await scheduler.踢一下(team.id); await until(() => !!childSignal)
 if (mode === "stop") scheduler.中止(team.id, "plotter")
 else scheduler.改(team.id, t => { if (mode === "remove") 移除成员(t, "plotter"); else t.members[2]!.botScopeKey = "other" })
 expect(childSignal!.aborted).toBe(true)
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 child.resolve({ ok: true, output: "late child" }); await until(() => scheduler.几个在跑() === 0)
 const saved = scheduler.读(team.id)
 expect(saved.tasks[0]?.output).toBe("root finished explicitly")
 expect(saved.collaboration?.[0]?.reply).toBe("reviewed despite cancelled consultation")
 expect(saved.collaboration?.[1]?.reply).not.toBe("late child")
 expect(saved.conversation?.some(m => m.content === "late child")).toBe(false)
})

it("queues user input until a busy Bot's safe next round and aborts its answer if project scope changes", async () => {
 const task = deferred<Result>(); const answer = deferred<Result>(); let answerSignal: AbortSignal | undefined; let calls = 0
 const { scheduler, team, results } = setup(async req => {
  calls++
  if (req.conversation) { answerSignal = req.signal; return answer.promise }
  return task.promise
 })
 await scheduler.踢一下(team.id)
 scheduler.messageTeam(team.id, {id: "busy-user", message: "question", toBotId: "bot-a"})
 expect(calls).toBe(1); expect(scheduler.读(team.id).conversationTurns?.[0]?.status).toBe("queued")
 task.resolve({ ok: true, output: "original completed" }); await until(() => !!answerSignal)
 expect(results).toEqual(["analysis"])
 scheduler.改(team.id, t => { t.members[0]!.botScopeKey = "changed" })
 expect(answerSignal!.aborted).toBe(true)
 answer.resolve({ ok: true, output: "stale answer" }); await until(() => scheduler.几个在跑() === 0)
 expect(scheduler.读(team.id).conversationTurns?.[0]?.status).toBe("cancelled")
 expect(scheduler.读(team.id).conversation?.some(m => m.content === "stale answer")).toBe(false)
})

it("user-controlled room IDs cannot suppress automatic peer replies or final task settlement", async () => {
 const { scheduler, team, results } = setup(async req => {
  if (!req.collaboration) {
   scheduler.sayBot(team.id, "analyst", {id: "reply:collision", message: "public statement using an opaque id"})
   scheduler.requestBot(team.id, "analyst", {id: "collision", to: "bot-b", message: "review"})
   return {ok: true, output: "wait"}
  }
  return {ok: true, output: req.collaboration.phase === "request" ? "real peer reply" : "real final"}
 })
 await scheduler.踢一下(team.id); await until(() => results.length === 1)
 expect(scheduler.读(team.id).conversation?.some(m => m.content === "real peer reply")).toBe(true)
 expect(scheduler.读(team.id).tasks[0]?.output).toBe("real final")
})

it("stopping a waiting intermediate handler cancels its descendants without reviving that handler", async () => {
 const child = deferred<Result>(); let runningChild = false; let intermediateResumes = 0
 const { scheduler, team, results } = setup(async req => {
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", {id: "parent", to: "bot-b", message: "review"}); return {ok: true, output: "wait"} }
  if (req.collaboration.exchangeId === "parent" && req.collaboration.phase === "request") { scheduler.requestBot(team.id, "reviewer", {id: "child", to: "bot-c", message: "consult"}); return {ok: true, output: "wait"} }
  if (req.collaboration.phase === "request") { runningChild = true; return child.promise }
  if (req.member.name === "reviewer") intermediateResumes++
  return {ok: true, output: "root handled cancellation"}
 })
 await scheduler.踢一下(team.id); await until(() => runningChild)
 scheduler.中止(team.id, "reviewer"); await scheduler.踢一下(team.id)
 await until(() => results.length === 1)
 child.resolve({ok: true, output: "late"}); await until(() => scheduler.几个在跑() === 0)
 expect(intermediateResumes).toBe(0)
 expect(scheduler.读(team.id).tasks[0]?.output).toBe("root handled cancellation")
})

it("resumes nested user-message consultation with each handler's own authenticated context", async () => {
 const calls: BotMemberRun[] = []
 const { scheduler, team } = setup(async req => {
  calls.push(req); req.onSession(`session-${req.member.name}`)
  if (!req.collaboration) { scheduler.requestBot(team.id, "analyst", {id: "user-parent", to: "bot-b", message: "review units"}); return {ok: true, output: "wait"} }
  if (req.collaboration.exchangeId === "user-parent" && req.collaboration.phase === "request") { scheduler.requestBot(team.id, "reviewer", {id: "user-child", to: "bot-c", message: "clarify"}); return {ok: true, output: "wait"} }
  if (req.collaboration.phase === "request") return {ok: true, output: "kg"}
  if (req.member.name === "reviewer") { scheduler.sayBot(team.id, "reviewer", {id: "handling", message: "I checked kg"}); return {ok: true, output: "reviewed kg"} }
  return {ok: true, output: "user final kg"}
 })
 scheduler.改(team.id, t => { 取消任务(t, "analysis") })
 scheduler.messageTeam(team.id, {id: "user-nested", message: "Discuss units", toBotId: "bot-a"})
 await until(() => scheduler.读(team.id).conversationTurns?.[0]?.status === "replied")
 expect(calls.map(c => c.member.name)).toEqual(["analyst", "reviewer", "plotter", "reviewer", "analyst"])
 expect(scheduler.读(team.id).conversation?.some(m => m.content === "user final kg")).toBe(true)
 expect(scheduler.读(team.id).conversation?.some(m => m.content === "I checked kg")).toBe(true)
})

it("publishes explicit system status when queued public user deliveries are cancelled", async () => {
 const busy = deferred<Result>()
 const { scheduler, team } = setup(async () => busy.promise)
 scheduler.messageTeam(team.id, {id: "cancel-user", message: "Discuss", toBotId: "bot-a"})
 scheduler.中止全部(team.id)
 expect(scheduler.读(team.id).conversation?.some(m => m.role === "system" && m.kind === "status" && m.content.includes("取消"))).toBe(true)
 busy.resolve({ok: true, output: "late"}); await until(() => scheduler.几个在跑() === 0)
})

it("rejects oversized peer replies explicitly and lets the root handle failure without partial artifacts", async () => {
 const { scheduler, team, results } = setup(async req => {
  if (!req.collaboration) { scheduler.requestBot(team.id,"analyst",{id:"large-peer",to:"bot-b",message:"Review"});return {ok:true,output:"wait"} }
  if (req.collaboration.phase === "request") return {ok:true,output:"中".repeat(6000)+'["analysis/full.csv"]'}
  expect(req.prompt).toContain("16 KiB");expect(req.prompt).toContain("18021");expect(req.prompt).not.toContain("analysis/full.csv")
  return {ok:true,output:"root handled oversized reply"}
 })
 await scheduler.踢一下(team.id);await until(()=>results.length===1)
 const saved=scheduler.读(team.id)
 expect(saved.collaboration?.[0]?.status).toBe("failed")
 expect(saved.conversation?.some(m=>m.role==="system"&&m.content.includes("16 KiB"))).toBe(true)
 expect(saved.conversation?.every(m=>Buffer.byteLength(m.content,"utf8")<=16*1024)).toBe(true)
})

it("fails oversized user answers instead of publishing a truncated successful answer",async()=>{
 const {scheduler,team}=setup(async()=>({ok:true,output:"x".repeat(17000)+'["analysis/result.csv"]'}))
 scheduler.改(team.id,t=>{取消任务(t,"analysis")})
 scheduler.messageTeam(team.id,{id:"large-user",message:"Explain",toBotId:"bot-a"})
 await until(()=>scheduler.读(team.id).conversationTurns?.[0]?.status!=="working")
 const saved=scheduler.读(team.id)
 expect(saved.conversationTurns?.[0]).toMatchObject({status:"failed",reply:expect.stringMatching(/16 KiB/)})
 expect(saved.conversation?.some(m=>m.kind==="reply")).toBe(false)
 expect(saved.conversation?.some(m=>m.role==="system"&&m.content.includes("16 KiB"))).toBe(true)
})

it.each([60000,70000])("keeps task output within 64 KiB and bounds its public result (%s bytes)",async size=>{
 const content="x".repeat(size)+'["analysis/full.csv"]'
 const {scheduler,team,results}=setup(async()=>({ok:true,output:content}))
 await scheduler.踢一下(team.id);await until(()=>results.length===1)
 const saved=scheduler.读(team.id)
 if(size<65536){expect(saved.tasks[0]?.status).toBe("completed");expect(saved.tasks[0]?.output).toBe(content)}
 else {expect(saved.tasks[0]?.status).toBe("failed");expect(saved.tasks[0]?.output).toMatch(/64 KiB/);expect(saved.tasks[0]?.output).not.toContain("analysis/full.csv")}
 expect(saved.conversation?.every(m=>Buffer.byteLength(m.content,"utf8")<=16*1024)).toBe(true)
 expect(saved.conversation?.some(m=>m.role==="system"&&m.content.includes("省略"))).toBe(true)
})

it("keeps the user's requirement in shared context when the latest legacy public message is oversized",async()=>{
 let prompt=""
 const {scheduler,team,results}=setup(async req=>{prompt=req.prompt;return {ok:true,output:"done"}})
 scheduler.改(team.id,t=>{t.conversation=[{id:"requirement",role:"user",from:"user",content:"Use dry mass and preserve units",createdAt:1,kind:"message"},{id:"legacy-long",role:"bot",from:"reviewer",botId:"bot-b",content:"中".repeat(100000),createdAt:2,kind:"reply"}]})
 await scheduler.踢一下(team.id);await until(()=>results.length===1)
 expect(prompt).toContain("Use dry mass and preserve units")
 expect(prompt).toMatch(/省略.*字符/)
 expect(prompt.length).toBeLessThan(26000)
})

it("does not repeatedly append a lifecycle status when a near-limit failure requires a bounded public summary",()=>{
 const {scheduler,team}=setup(async()=>({ok:true,output:"unused"}))
 scheduler.改(team.id,t=>{
  t.tasks[0]!.status="in_progress";t.tasks[0]!.attemptId="token"
  t.collaboration=[{id:"large-error",from:"analyst",to:"reviewer",fromBotId:"bot-a",toBotId:"bot-b",kind:"request",message:"Review",taskId:"analysis",attemptId:"token",status:"failed",reply:"x".repeat(16380),createdAt:1,updatedAt:1}]
 })
 const before=scheduler.读(team.id).conversation?.length
 scheduler.改(team.id,()=>{});scheduler.改(team.id,()=>{})
 expect(scheduler.读(team.id).conversation?.length).toBe(before)
})

it("未结束协作仍受团队 64 次活动上限保护",async()=>{
 const {scheduler,team,results}=setup(async req=>{
  if(req.collaboration)return {ok:true,output:"checked"}
  scheduler.改(team.id,t=>{
   // Eight independent roots each own eight outstanding requests.
   for(let i=0;i<8;i++){
    const root=加任务(t,{id:`root-${i}`,subject:"active",assignee:"plotter"});root.status="in_progress";root.attemptId=`token-${i}`
   }
   t.collaboration=Array.from({length:64},(_,i)=>({id:`active-${i}`,from:"plotter",to:"reviewer",fromBotId:"bot-c",toBotId:"bot-b",rootOwner:"plotter",rootOwnerBotId:"bot-c",message:"active",kind:"request",status:"working",taskId:`root-${Math.floor(i/8)}`,attemptId:`token-${Math.floor(i/8)}`,createdAt:1,updatedAt:1}))
  })
  expect(()=>scheduler.requestBot(team.id,"analyst",{id:"overflow",to:"bot-b",message:"check"})).toThrow(/64/)
  return {ok:true,output:"done"}
 })
 await scheduler.踢一下(team.id);await until(()=>results.length===1)
 expect(scheduler.读(team.id).collaboration).toHaveLength(64)
})
