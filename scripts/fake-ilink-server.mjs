/**
 * 假微信（iLink bot API）。远程助理 T1，2026-08-21。
 *
 * **`dev:mock` 与 e2e 共用这一份**（准入规则 ①：两套 mock 会各自漂移）。
 * 形状照 `docs/微信-iLink-协议笔记.md`（读自腾讯官方插件源码），不照 README——
 * README 在路径前缀、CDN 方法、aes_key 编码上都和代码不一致。
 *
 * 真协议那一侧：
 *   POST ilink/bot/get_bot_qrcode?bot_type=3      → { qrcode, qrcode_img_content }
 *   GET  ilink/bot/get_qrcode_status?qrcode=&verify_code=  长轮询，按剧本吐状态
 *   POST ilink/bot/getupdates                     长轮询，吐排队的用户消息，带游标
 *   POST ilink/bot/sendmessage                    记下来
 *   POST ilink/bot/getuploadurl / getconfig / sendtyping / msg/notifystart / msg/notifystop
 *   POST c2c/upload?encrypted_query_param=&filekey=   存密文，回头 x-encrypted-param
 *   GET  c2c/download?encrypted_query_param=           吐密文
 *
 * 测试那一侧（`/__fake/*`，真协议里没有）：
 *   POST /__fake/qr/scan | /__fake/qr/need_code | /__fake/qr/confirm | /__fake/qr/expire
 *   POST /__fake/inbound { text, from? }           往长轮询里塞一条用户消息
 *   GET  /__fake/sent                              我们发出去的全部消息
 *   POST /__fake/stale                             之后 getupdates 一律回 errcode -14
 *   POST /__fake/reset
 */
import http from "node:http"
import { randomBytes } from "node:crypto"

export const FAKE_BOT_TOKEN = "fake-bot-token"
export const FAKE_BOT_ID = "fakebot@im.bot"
export const FAKE_USER_ID = "fakeuser@im.wechat"

export function startFakeIlinkServer(opts = {}) {
  const 长轮询最长 = opts.longPollMs ?? 2_000
  /** 扫码剧本：`wait` → 测试端推一把 → 下一次轮询吐出来 */
  let 扫码态 = { status: "wait" }
  let 待配对码 = false
  const 排队的 = []
  const 发出的 = []
  const 存的密文 = new Map()
  let 失效 = false
  let 游标序号 = 0
  /** 等着的长轮询（getupdates）：有新消息就立刻回，不等满时长 */
  const 等着的 = new Set()

  const 回JSON = (res, o, status = 200, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers })
    res.end(JSON.stringify(o))
  }
  const 读体 = (req) =>
    new Promise((成) => {
      const 块 = []
      req.on("data", (c) => 块.push(c))
      req.on("end", () => 成(Buffer.concat(块)))
    })

  const 唤醒 = () => {
    for (const 成 of 等着的) 成()
    等着的.clear()
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    const p = url.pathname
    const 体 = await 读体(req)
    const json = () => (体.length ? JSON.parse(体.toString("utf8")) : {})

    /* ── 测试端 ── */
    if (p === "/__fake/reset") {
      扫码态 = { status: "wait" }
      待配对码 = false
      排队的.length = 0
      发出的.length = 0
      存的密文.clear()
      失效 = false
      return 回JSON(res, { ok: true })
    }
    if (p === "/__fake/qr/scan") {
      扫码态 = { status: "scaned" }
      return 回JSON(res, { ok: true })
    }
    if (p === "/__fake/qr/need_code") {
      // 码对了之后回到「已扫」；剧本再推一步才到确认
      扫码态 = { status: "scaned" }
      待配对码 = true
      return 回JSON(res, { ok: true })
    }
    if (p === "/__fake/qr/expire") {
      扫码态 = { status: "expired" }
      return 回JSON(res, { ok: true })
    }
    if (p === "/__fake/qr/confirm") {
      扫码态 = {
        status: "confirmed",
        bot_token: FAKE_BOT_TOKEN,
        ilink_bot_id: FAKE_BOT_ID,
        ilink_user_id: FAKE_USER_ID,
        baseurl: `http://127.0.0.1:${server.address().port}`,
      }
      return 回JSON(res, { ok: true })
    }
    if (p === "/__fake/inbound") {
      const b = json()
      排队的.push({
        message_id: `m${Date.now()}`,
        from_user_id: b.from ?? FAKE_USER_ID,
        to_user_id: FAKE_BOT_ID,
        create_time_ms: Date.now(),
        message_type: 1,
        item_list: [{ type: 1, text_item: { text: String(b.text ?? "") } }],
        context_token: b.context_token ?? `ctx-${randomBytes(4).toString("hex")}`,
      })
      唤醒()
      return 回JSON(res, { ok: true })
    }
    if (p === "/__fake/sent") return 回JSON(res, 发出的)
    if (p === "/__fake/stale") {
      失效 = true
      唤醒()
      return 回JSON(res, { ok: true })
    }

    /* ── 真协议 ── */
    const 有票 = () => (req.headers["authorization"] ?? "") === `Bearer ${FAKE_BOT_TOKEN}`

    if (p === "/ilink/bot/get_bot_qrcode") {
      扫码态 = { status: "wait" }
      return 回JSON(res, { qrcode: "fake-qr-handle", qrcode_img_content: "https://fake.weixin/qr/dawn" })
    }
    if (p === "/ilink/bot/get_qrcode_status") {
      // 要配对码时：带对了码才往下走
      if (待配对码) {
        const code = url.searchParams.get("verify_code")
        if (code === "1234") 待配对码 = false
        else return 回JSON(res, { status: "need_verifycode" })
      }
      return 回JSON(res, 扫码态)
    }
    if (p === "/ilink/bot/getupdates") {
      if (!有票()) return 回JSON(res, { ret: -1, errmsg: "no token" })
      if (失效) return 回JSON(res, { ret: 0, errcode: -14, errmsg: "stale token" })
      if (排队的.length === 0) {
        await new Promise((成) => {
          等着的.add(成)
          setTimeout(() => {
            等着的.delete(成)
            成()
          }, 长轮询最长)
        })
      }
      if (失效) return 回JSON(res, { ret: 0, errcode: -14, errmsg: "stale token" })
      const msgs = 排队的.splice(0)
      游标序号 += msgs.length
      return 回JSON(res, { ret: 0, errcode: 0, msgs, get_updates_buf: `cur-${游标序号}`, longpolling_timeout_ms: 长轮询最长 })
    }
    if (p === "/ilink/bot/sendmessage") {
      if (!有票()) return 回JSON(res, { ret: -1, errmsg: "no token" })
      const b = json()
      发出的.push(b.msg)
      return 回JSON(res, { ret: 0 })
    }
    if (p === "/ilink/bot/getuploadurl") {
      if (!有票()) return 回JSON(res, { ret: -1 })
      const b = json()
      return 回JSON(res, { upload_param: `up-${b.filekey}` })
    }
    if (p === "/ilink/bot/getconfig") return 回JSON(res, { ret: 0, typing_ticket: "ticket-1" })
    if (p === "/ilink/bot/sendtyping") return 回JSON(res, { ret: 0 })
    if (p === "/ilink/bot/msg/notifystart" || p === "/ilink/bot/msg/notifystop") return 回JSON(res, { ret: 0 })
    if (p === "/c2c/upload") {
      const key = `dl-${randomBytes(6).toString("hex")}`
      存的密文.set(key, 体)
      res.writeHead(200, { "x-encrypted-param": key })
      return res.end()
    }
    if (p === "/c2c/download") {
      const key = url.searchParams.get("encrypted_query_param")
      const 密 = key ? 存的密文.get(key) : undefined
      if (!密) {
        res.writeHead(404)
        return res.end()
      }
      res.writeHead(200, { "content-type": "application/octet-stream" })
      return res.end(密)
    }
    res.writeHead(404)
    res.end("not found")
  })

  return new Promise((成) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      成({
        url: `http://127.0.0.1:${port}`,
        port,
        /** 测试端的便捷把手 */
        推进扫码: (步) => fetch(`http://127.0.0.1:${port}/__fake/qr/${步}`, { method: "POST" }),
        发来: (text, extra = {}) =>
          fetch(`http://127.0.0.1:${port}/__fake/inbound`, { method: "POST", body: JSON.stringify({ text, ...extra }) }),
        发出的: async () => (await fetch(`http://127.0.0.1:${port}/__fake/sent`)).json(),
        让失效: () => fetch(`http://127.0.0.1:${port}/__fake/stale`, { method: "POST" }),
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

// 直接运行：`node scripts/fake-ilink-server.mjs`，打印地址
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFakeIlinkServer({ longPollMs: 25_000 })
  console.log(`假微信在 ${s.url}`)
}
