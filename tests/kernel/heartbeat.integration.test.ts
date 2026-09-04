/**
 * `开心跳口` 对着一只真的 zmq Reply（ipykernel 的 hb 就是一只回声 Reply）。
 * 验三件事：有人应答 → true；对端不答了 → 在 `超时ms` 内回 false；
 * 回声回来 → 又 true（这一步才证明 `relaxed`：不带它，超时过的 REQ 连第二次 send 都发不出去）。
 */
import { describe, expect, it } from "vitest"
import { 开心跳口 } from "../../src/kernel/heartbeat.js"

describe("开心跳口（真 zmq）", () => {
  it("回声在 → true；回声没了 → 超时内 false；回声回来 → 又 true", async () => {
    const { Reply } = await import("zeromq")
    /** 起一只回声 Reply；整条原样回（帧数组），和 ipykernel 的 hb 一样。`应答` 变 false 后再收到一条就退出 */
    const 起回声 = (rep: InstanceType<typeof Reply>, 应答: () => boolean) =>
      void (async () => {
        for await (const 帧 of rep) {
          if (应答()) await rep.send(帧)
          else break
        }
      })().catch(() => {
        // 关 socket 时 for-await 会以异常收场，这是预期的
      })

    let rep = new Reply()
    let 口: Awaited<ReturnType<typeof 开心跳口>> | undefined
    try {
      await rep.bind("tcp://127.0.0.1:0")
      const 端口 = Number(new URL(rep.lastEndpoint!.replace("tcp://", "http://")).port)
      let 应答 = true
      起回声(rep, () => 应答)
      口 = await 开心跳口(端口, 300)
      expect(await 口.ping()).toBe(true)
      应答 = false
      // 让 for-await 退出：再发一条它就 break，之后没人应答
      const t0 = Date.now()
      expect(await 口.ping()).toBe(false)
      expect(Date.now() - t0).toBeLessThan(2000)
      expect(await 口.ping()).toBe(false)
      // 回声回来：旧那只 break 之后卡在「该 send」态，得换一只新的绑回同一个端口；REQ 会自己重连
      rep.close()
      rep = new Reply()
      await rep.bind(`tcp://127.0.0.1:${端口}`)
      应答 = true
      起回声(rep, () => 应答)
      expect(await 口.ping()).toBe(true)
    } finally {
      口?.关()
      rep.close()
    }
  }, 15_000)
})
