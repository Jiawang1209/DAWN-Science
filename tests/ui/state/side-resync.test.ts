/**
 * 坞里那段订阅失败：真没了才不出声，续接失败要出声（侧边对话 Task 6 审查 I1）。
 *
 * 后端把续接失败（服务器连不上、这类会话续不了）也报成 `not_found`，消息里写真原因；
 * 只有「压根没有这段」时才说「没有记录可订阅」——那是 `sideGone` 会报的，这里不重复。
 */
import { beforeEach, describe, expect, it } from "vitest"
import { resyncSide } from "../../../src/ui/state/sync.js"
import { WorkbenchClientError } from "../../../src/ui/client.js"
import { $notes } from "../../../src/ui/state/connection.js"
import { $侧边会话id, 侧槽 } from "../../../src/ui/state/side-chat.js"
import { $activeSessionId } from "../../../src/ui/state/view.js"
import { setSessions, setTempSessions } from "../../../src/ui/state/catalog.js"
import type { SessionSummary } from "../../../src/protocol/index.js"

const 失败的client = (e: unknown) => ({ get: () => Promise.reject(e) }) as never

beforeEach(() => {
  $notes.set([])
  $侧边会话id.set("S")
  $activeSessionId.set("M")
  setSessions([])
  setTempSessions([])
  侧槽.reset()
})

describe("resyncSide 的失败", () => {
  it("续接失败（not_found + 真原因）：照实出声，与主区同一句", async () => {
    await resyncSide(失败的client(new WorkbenchClientError("not_found", "连不上服务器 gpu01：Connection refused")), "S")
    expect($notes.get()).toEqual(["连不上服务器 gpu01：Connection refused"])
  })

  it("真没了（没有记录可订阅、会话单里也没有）：不出声，交给 sideGone", async () => {
    await resyncSide(失败的client(new WorkbenchClientError("not_found", '会话 "S" 未在本进程中活动，没有记录可订阅')), "S")
    expect($notes.get()).toEqual([])
  })

  it("后端说没有记录、会话单里却还有：两边对不上，出声", async () => {
    setSessions([{ sessionId: "S", projectId: "P", agentId: "a", kind: "native" } as unknown as SessionSummary])
    await resyncSide(失败的client(new WorkbenchClientError("not_found", '会话 "S" 未在本进程中活动，没有记录可订阅')), "S")
    expect($notes.get()).toHaveLength(1)
  })

  it("别的错误码照常出声", async () => {
    await resyncSide(失败的client(new WorkbenchClientError("internal_error", "库坏了")), "S")
    expect($notes.get()).toEqual(["库坏了"])
  })

  it("已经不是坞里那段了：作废的请求，不出声", async () => {
    const p = resyncSide(失败的client(new WorkbenchClientError("not_found", "连不上服务器")), "S")
    $侧边会话id.set(undefined)
    await p
    expect($notes.get()).toEqual([])
  })
})
