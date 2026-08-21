/**
 * 真客户端 × 假微信：走真实 socket。**假服务器与客户端各自对着协议笔记写**，
 * 这里证明它们说的是同一种话——否则 e2e 里的「通了」只是两份错误互相抵消。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startFakeIlinkServer, FAKE_BOT_TOKEN, FAKE_USER_ID } from "../../scripts/fake-ilink-server.mjs"
import { IlinkClient, fileItem, 读入站 } from "../../src/channels/weixin/ilink.js"

let s: Awaited<ReturnType<typeof startFakeIlinkServer>>
beforeAll(async () => {
  s = await startFakeIlinkServer({ longPollMs: 300 })
})
afterAll(() => s.close())

describe("真客户端 × 假微信", () => {
  it("扫码：等待 → 已扫 → 要配对码（错的不放行）→ 确认，拿到 token 与两个 id", async () => {
    // 扫码那两步线上写死打默认基址；`qrBaseUrl` 是给假微信留的口子
    const c = new IlinkClient({ baseUrl: s.url, qrBaseUrl: s.url })
    const qr = await c.fetchQrCode()
    expect(qr.url).toContain("fake.weixin")
    expect(await c.pollQrStatus(qr.qrcode)).toEqual({ status: "wait" })
    await s.推进扫码("scan")
    expect(await c.pollQrStatus(qr.qrcode)).toEqual({ status: "scaned" })
    await s.推进扫码("need_code")
    expect(await c.pollQrStatus(qr.qrcode)).toEqual({ status: "need_verifycode" })
    expect(await c.pollQrStatus(qr.qrcode, "0000")).toEqual({ status: "need_verifycode" })
    expect(await c.pollQrStatus(qr.qrcode, "1234")).toEqual({ status: "scaned" })
    await s.推进扫码("confirm")
    const 成 = await c.pollQrStatus(qr.qrcode)
    expect(成).toMatchObject({ status: "confirmed", bot_token: FAKE_BOT_TOKEN, ilink_user_id: FAKE_USER_ID })
  })

  it("长轮询：空着等到时长；塞一条立刻回；回复带 context_token 落到 sent 里；-14 标失效", async () => {
    const c = new IlinkClient({ baseUrl: s.url })
    const 空 = await c.getUpdates(FAKE_BOT_TOKEN, "")
    expect(空.msgs).toEqual([])
    const 等 = c.getUpdates(FAKE_BOT_TOKEN, 空.cursor)
    await s.发来("在吗")
    const r = await 等
    expect(r.msgs).toHaveLength(1)
    const 入 = 读入站(r.msgs[0]!)
    expect(入.text).toBe("在吗")
    await c.sendText(FAKE_BOT_TOKEN, 入.from, "在的", 入.contextToken)
    const 发 = await s.发出的()
    expect(发.at(-1)).toMatchObject({ to_user_id: FAKE_USER_ID, context_token: 入.contextToken, item_list: [{ type: 1, text_item: { text: "在的" } }] })

    await s.让失效()
    expect((await c.getUpdates(FAKE_BOT_TOKEN, r.cursor)).staleToken).toBe(true)
    await fetch(`${s.url}/__fake/reset`, { method: "POST" })
  })

  it("媒体：传上去再下回来，解开是原样", async () => {
    const c = new IlinkClient({ baseUrl: s.url, cdnBaseUrl: `${s.url}/c2c` })
    const 明 = Buffer.from("a,b,c\n1,2,3\n")
    const up = await c.uploadMedia(FAKE_BOT_TOKEN, FAKE_USER_ID, 3, 明)
    expect(await c.downloadMedia(up.media)).toEqual(明)
    expect(fileItem(up, "t.csv").file_item?.len).toBe(String(明.length))
  })
})
