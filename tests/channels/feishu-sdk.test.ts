/**
 * 假飞书 × fakeFeishuSdk(2026-08-25):设备流 / 长轮询收 / 发文本与表情记录。
 * real 实现(官方 SDK)在这里不起真连接——它的形状由类型面约束,链路由 e2e 与人工验。
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { startFakeFeishuServer, FAKE_OPEN_ID } from "../../scripts/fake-feishu-server.mjs"
import type { FakeFeishuServer } from "../../scripts/fake-feishu-server.mjs"
import { fakeFeishuSdk, FEISHU_SCOPES } from "../../src/channels/feishu/sdk.js"

let srv: FakeFeishuServer
beforeAll(async () => {
  srv = await startFakeFeishuServer({ longPollMs: 200 })
})
afterAll(() => srv.close())

const 凭 = { appId: "cli_fake_app", appSecret: "s", domain: "feishu" as const }

describe("假飞书 × fakeFeishuSdk", () => {
  it("设备流:出码 → 确认 → 拿到凭据与扫码人 openId", async () => {
    await srv.reset()
    const sdk = fakeFeishuSdk(srv.url)
    let qr = ""
    const p = sdk.注册应用({ name: "DAWN-Science", desc: "测试" }, (u) => {
      qr = u
    }, new AbortController().signal)
    await new Promise((r) => setTimeout(r, 50))
    expect(qr).toContain("http")
    await srv.确认扫码()
    const 回 = await p
    expect(回.openId).toBe(FAKE_OPEN_ID)
    expect(回.appSecret).toBeTruthy()
    expect(回.domain).toBe("feishu")
  })

  it("设备流:过期要响亮说,不挂着干等", async () => {
    await srv.reset()
    const sdk = fakeFeishuSdk(srv.url)
    const p = sdk.注册应用({ name: "x", desc: "y" }, () => {}, new AbortController().signal)
    await new Promise((r) => setTimeout(r, 50))
    await srv.码过期()
    await expect(p).rejects.toThrow(/过期/)
  })

  it("连接收消息(长轮询模拟 WS);发文本与表情都被记录", async () => {
    await srv.reset()
    const sdk = fakeFeishuSdk(srv.url)
    const 收到: string[] = []
    const conn = sdk.连接(凭, (m) => 收到.push(`${m.openId}:${m.text}:${m.messageType}`), () => {})
    await new Promise((r) => setTimeout(r, 100))
    await srv.发来("你好")
    await new Promise((r) => setTimeout(r, 400))
    expect(收到).toEqual([`${FAKE_OPEN_ID}:你好:text`])
    await sdk.发文本(凭, FAKE_OPEN_ID, "回你")
    await sdk.表情(凭, "m1", "OnIt", "create")
    const sent = await srv.发出的()
    expect(JSON.stringify(sent)).toContain("回你")
    expect(JSON.stringify(sent)).toContain("OnIt")
    conn.stop()
  })

  it("权限声明写死一处且不含 CardKit(第二批才加)", () => {
    expect(FEISHU_SCOPES).toContain("im:message:send_as_bot")
    expect(FEISHU_SCOPES.join()).not.toContain("cardkit")
  })
})
