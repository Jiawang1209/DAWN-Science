/** 事件通道第五种载荷（桌面通知，2026-09-27）：在会话更新那句判据之前认掉，不报「不合协议」 */
import { describe, expect, it, vi } from "vitest"
import { createClient } from "../../src/ui/client.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"

describe("client · openSession", () => {
  it("认出来 → onOpenSession(id)；不走 onUpdate、不出声", () => {
    let 推: ((raw: unknown) => void) | undefined
    const c = createClient(async () => ({ ok: true, workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, data: {}, warnings: [] }) as never, (cb) => {
      推 = cb
      return () => {}
    })
    const onOpenSession = vi.fn()
    const onUpdate = vi.fn()
    const onProblem = vi.fn()
    c.subscribeUpdates({ onUpdate, onResync: () => {}, onProblem, onOpenSession })
    推!({ workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, openSession: "s1" })
    expect(onOpenSession).toHaveBeenCalledWith("s1")
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onProblem).not.toHaveBeenCalled()
  })
})
