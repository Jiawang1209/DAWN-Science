import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { resyncSession, resyncSide } from "../../src/ui/state/sync.js"
import { $sessionRecovery } from "../../src/ui/state/session-recovery.js"
import { $activeSessionId } from "../../src/ui/state/view.js"
import { $侧边会话id } from "../../src/ui/state/side-chat.js"
import { $tempSessions, setTempSessions, setSessionState } from "../../src/ui/state/catalog.js"
import { ConversationView } from "../../src/ui/views.js"
import type { SessionSummary } from "../../src/protocol/index.js"

const session: SessionSummary = { sessionId: "A", projectId: "p", agentId: "deepseek", kind: "native", state: "exited", createdAt: "2026-10-09T00:00:00Z", pinned: false, sortOrder: 1 }
beforeEach(() => { $sessionRecovery.set({}); $activeSessionId.set("A"); $侧边会话id.set(undefined); setTempSessions([session]) })

describe("原会话恢复", () => {
  it("旧 alive 快照不能覆盖较新退出推送", async () => {
    let resolve!: (value: unknown) => void
    const client={get:()=>new Promise(r=>{resolve=r}),expectRevision:vi.fn()} as never
    const p=resyncSession(client,"A")
    setSessionState("A","exited")
    resolve({sessionId:"A",state:"alive",items:[],terminal:"",revision:1})
    await p
    expect($tempSessions.get()[0]?.state).toBe("exited")
  })
  it("失败原因按会话保留；成功重试校正名单并清除错误", async () => {
    const client = { get: vi.fn().mockRejectedValueOnce(new Error("服务器连接超时")).mockResolvedValueOnce({sessionId:"A", state:"alive", items:[], terminal:"", revision:1}), expectRevision: vi.fn() } as never
    await resyncSession(client, "A")
    expect($sessionRecovery.get().A).toMatchObject({ pending:false, error:"服务器连接超时" })
    await resyncSession(client, "A")
    expect($sessionRecovery.get().A?.error).toBeUndefined()
    expect($tempSessions.get()[0]?.state).toBe("alive")
  })
  it("侧边失败与主区不串；正在恢复时保留 pending", async () => {
    $侧边会话id.set("S")
    let reject!: (e: Error) => void
    const client = { get: () => new Promise((_, r) => { reject=r }) } as never
    const p=resyncSide(client,"S")
    expect($sessionRecovery.get().S?.pending).toBe(true)
    reject(new Error("S 连不上")); await p
    expect($sessionRecovery.get().S?.error).toBe("S 连不上")
    expect($sessionRecovery.get().A).toBeUndefined()
  })
  it("已结束 API 对话显示原因和重试，恢复中不能重复点", () => {
    const retry=vi.fn()
    const props={ session, onSend:vi.fn(), disabled:true, onResume:retry, recovery:{pending:false,error:"SSH 握手超时"} }
    const {rerender}=render(<ConversationView {...props} />)
    expect(screen.getByText("SSH 握手超时")).toBeDefined()
    fireEvent.click(screen.getByRole("button",{name:"重新连接并继续"}))
    expect(retry).toHaveBeenCalledTimes(1)
    rerender(<ConversationView {...props} recovery={{pending:true}} />)
    expect((screen.getByRole("button",{name:"正在恢复…"}) as HTMLButtonElement).disabled).toBe(true)
  })
})
