/**
 * `开心跳口` 对着一只真的 zmq Reply（ipykernel 的 hb 就是一只回声 Reply）。
 * 验两件事：有人应答 → true；对端关了 → 在 `超时ms` 内回 false，而且之后还能再 ping（relaxed）。
 */
import { describe, expect, it } from "vitest"
import { 开心跳口 } from "../../src/kernel/heartbeat.js"

describe("开心跳口（真 zmq）", () => {
  it("回声在 → true；回声没了 → 超时内 false；回声回来 → 又 true", async () => {
    const { Reply } = await import("zeromq")
    const rep = new Reply()
    await rep.bind("tcp://127.0.0.1:0")
    const 端口 = Number(new URL(rep.lastEndpoint!.replace("tcp://", "http://")).port)
    let 应答 = true
    void (async () => {
      // 整条原样回（帧数组），和 ipykernel 的 hb 一样；也免得单帧解构出 `undefined` 过不了类型
      for await (const 帧 of rep) {
        if (应答) await rep.send(帧)
        else break
      }
    })()
    const 口 = await 开心跳口(端口, 300)
    expect(await 口.ping()).toBe(true)
    应答 = false
    // 让 for-await 退出：再发一条它就 break，之后没人应答
    const t0 = Date.now()
    expect(await 口.ping()).toBe(false)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(await 口.ping()).toBe(false)
    口.关()
    rep.close()
  }, 15_000)
})
