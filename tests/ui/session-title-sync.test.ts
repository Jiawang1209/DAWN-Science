import { expect, it } from "vitest"
import { $sessions, $tempSessions, $tasks, setSessions, setTempSessions, setTasks, setSessionTitle } from "../../src/ui/state/catalog.js"
import { loadTasks, loadSessions, loadTempSessions } from "../../src/ui/state/sync.js"
import type { SessionSummary, TaskSummary } from "../../src/protocol/index.js"

const session = (id: string) => ({ sessionId: id, title: "旧标题", agentId: "native", kind: "native", state: "alive", projectId: "p", pinned: false, sortOrder: 0, createdAt: "2026-10-14T00:00:00Z" }) as SessionSummary
const task = (id: string) => ({ taskId: id, sessionId: id, title: "旧标题" }) as TaskSummary

it("按会话身份同步主列表、服务器/临时列表及任务投影，不改其他会话", () => {
  setSessions([session("project-a"), session("project-b")])
  setTempSessions([session("server-a"), session("server-b")])
  setTasks([task("project-a"), task("server-a"), task("server-b")])
  setSessionTitle("project-a", "500米8月偏差校正")
  setSessionTitle("server-a", "30米NDVI质量检查")
  expect($sessions.get().map(s => s.title)).toEqual(["500米8月偏差校正", "旧标题"])
  expect($tempSessions.get().map(s => s.title)).toEqual(["30米NDVI质量检查", "旧标题"])
  expect($tasks.get().map(s => s.title)).toEqual(["500米8月偏差校正", "30米NDVI质量检查", "旧标题"])
})

it("飞行中的旧名单不能盖掉新标题，下一次新快照仍可显示手动改名", async () => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const client = { get: async (op: string) => { await gate; return op === "listTasks" ? [task("race-a")] : [session("race-a")] } } as never
  const requests = [loadTasks(client), loadSessions(client, "p"), loadTempSessions(client)]
  setSessionTitle("race-a", "新的概括标题")
  finish()
  await Promise.all(requests)
  expect($sessions.get()[0]!.title).toBe("新的概括标题")
  expect($tempSessions.get()[0]!.title).toBe("新的概括标题")
  expect($tasks.get()[0]!.title).toBe("新的概括标题")
  await loadSessions({ get: async () => [{ ...session("race-a"), title: "后来手动改名" }] } as never, "p")
  expect($sessions.get()[0]!.title).toBe("后来手动改名")
})
