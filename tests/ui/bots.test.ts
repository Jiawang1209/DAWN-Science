import { beforeEach, expect, it, vi } from "vitest"
import { BotDispatchQueue, parseBotCommand, Bot槽, selectBotSession, clearBotSession, $botSession, sendBotTaskSupplement } from "../../src/ui/state/bots.js"
import { 侧槽 } from "../../src/ui/state/side-chat.js"

beforeEach(() => { clearBotSession(); 侧槽.reset(); localStorage.removeItem("dawn.session.bot-dispatch-pending") })
it("stable bot command stores ID instead of renamed display name", () => {
  expect(parseBotCommand("/bot:stable-id 检查数据")).toEqual({ botId: "stable-id", instruction: "检查数据" })
  expect(parseBotCommand("/bot:stable-id")).toEqual({ botId: "stable-id", instruction: "" })
  expect(parseBotCommand("普通文本 /bot:x 检查")).toBeUndefined()
})
it("Bot selection owns a third transcript slot and switching clears only its transcript", () => {
  侧槽.回显("侧边私聊")
  selectBotSession({ sessionId: "a" } as never)
  Bot槽.回显("Bot A")
  selectBotSession({ sessionId: "b" } as never)
  expect(Bot槽.$items.get()).toEqual([])
  expect(侧槽.$items.get()).toHaveLength(1)
  expect($botSession.get()?.sessionId).toBe("b")
})
it("concurrent sends and retry after lost response preserve one request identity", async () => {
  let release!: () => void
  const calls: unknown[] = []
  const send = vi.fn(async (input) => { calls.push(input); await new Promise<void>(r => { release = r }); throw Error("lost response") })
  const queue = new BotDispatchQueue(() => "request-1")
  const a = queue.send("main", "/bot:b 检查", send)
  const b = queue.send("main", "/bot:b 检查", send)
  expect(send).toHaveBeenCalledTimes(1)
  release()
  await Promise.allSettled([a, b])
  const retry = vi.fn(async input => { calls.push(input); return { teamId: "t", taskId: "1" } })
  await queue.send("main", "/bot:b 检查", retry)
  expect(calls).toEqual([calls[0], calls[0]])
  expect(calls[0]).toMatchObject({ requestId: "request-1", botId: "b", ownerSessionId: "main" })
})

it("late snapshot and pushes cannot overwrite the newly selected Bot or side chat", async () => {
  const { resyncBot, receiveBotUpdate } = await import("../../src/ui/state/bots.js")
  let finish!: (snapshot: unknown) => void
  const client = { get: () => new Promise(resolve => { finish = resolve }), expectRevision: vi.fn() }
  selectBotSession({ sessionId: "a" } as never)
  const pending = resyncBot(client as never, "a")
  selectBotSession({ sessionId: "b" } as never)
  Bot槽.回显("B 的草稿")
  finish({ sessionId: "a", revision: 10, items: [{ type: "turn", id: "a1", who: "agent", text: "A 的结果", final: true, at: 1 }] })
  await pending
  expect(Bot槽.$items.get()).toHaveLength(1)
  expect(Bot槽.$items.get()[0]).toMatchObject({ text: "B 的草稿" })
  expect(client.expectRevision).not.toHaveBeenCalled()
  expect(receiveBotUpdate({ type: "queued", sessionId: "a", queued: [], revision: 11 } as never, vi.fn())).toBe(false)
})

it("a lost response survives renderer restart without allocating a second request", async () => {
  localStorage.removeItem("dawn.session.bot-dispatch-pending")
  const first = new BotDispatchQueue(() => "first-request")
  let sent: unknown
  await first.send("main", "/bot:b 检查", async input => { sent = input; throw Error("lost") }).catch(() => {})
  const restarted = new BotDispatchQueue(() => "second-request")
  let retried: unknown
  await restarted.send("main", "/bot:b 检查", async input => { retried = input; return { teamId: "t", taskId: "1" } })
  expect(retried).toEqual(sent)
  restarted.acknowledge("main", "/bot:b 检查")
  const fresh = new BotDispatchQueue(() => "third-request")
  await fresh.send("main", "/bot:b 检查", async input => { expect(input.requestId).toBe("third-request"); return { teamId: "t", taskId: "2" } })
  fresh.acknowledge("main", "/bot:b 检查")
})

it("task supplements reject images before sending and preserve file references in queued text", async () => {
  const send = vi.fn(async () => undefined)
  const task = { ownerSessionId: "main", teamId: "team", taskId: "task" }
  await expect(sendBotTaskSupplement(task, "检查 @data/iris.csv", 1, send)).rejects.toThrow("Bot 任务补充暂不支持图片")
  expect(send).not.toHaveBeenCalled()
  await sendBotTaskSupplement(task, "检查 @data/iris.csv", 0, send)
  expect(send).toHaveBeenCalledWith({ ...task, instruction: "检查 @data/iris.csv" })
})

it("Bot resync caches the actual runtime model rather than profile or agent defaults", async () => {
  const { resyncBot } = await import("../../src/ui/state/bots.js")
  const { $sessionModels } = await import("../../src/ui/state/catalog.js")
  selectBotSession({ sessionId: "runtime-model" } as never)
  const client = { expectRevision: vi.fn(), get: vi.fn(async (op: string) => op === "subscribeSession"
    ? { sessionId: "runtime-model", revision: 1, items: [] }
    : { model: "switched-model", provider: "actual-provider" }) }
  await resyncBot(client as never, "runtime-model")
  expect($sessionModels.get()["runtime-model"]).toEqual({ model: "switched-model", provider: "actual-provider" })
})

it("verified artifact previews use local relative paths and retain remote absolute paths", async () => {
  const { botArtifactPreviewPath } = await import("../../src/ui/state/bots.js")
  expect(botArtifactPreviewPath("/workspace/scripts/model.py", "/workspace", false)).toBe("scripts/model.py")
  expect(botArtifactPreviewPath("/remote/scripts/model.py", "/remote", true)).toBe("/remote/scripts/model.py")
  expect(() => botArtifactPreviewPath("/other/model.py", "/workspace", false)).toThrow()
  expect(() => botArtifactPreviewPath("/workspace-else/model.py", "/workspace", false)).toThrow()
})

it("an authoritative unallocated rejection permits a fresh request after configuration is fixed", async () => {
  const { WorkbenchClientError } = await import("../../src/ui/client.js")
  let next = 0
  const queue = new BotDispatchQueue(() => `request-${++next}`)
  await expect(queue.send("main", "/bot:b 检查", async input => {
    expect(input.requestId).toBe("request-1")
    throw new WorkbenchClientError("invalid_request", "模型不可用", false, { dispatchRejected: true })
  })).rejects.toThrow("模型不可用")
  await queue.send("main", "/bot:b 检查", async input => {
    expect(input.requestId).toBe("request-2")
    return { teamId: "team", taskId: "task" }
  })
})
