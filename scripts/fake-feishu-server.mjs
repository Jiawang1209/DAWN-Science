/**
 * 假飞书(2026-08-25,规格 `2026-08-25-飞书通道-design.md` §六)。
 *
 * **`dev:mock` 与 e2e 共用这一份**(准入规则 ①,与 `fake-ilink-server.mjs` 同一条纪律)。
 * 形状对应 `src/channels/feishu/sdk.ts` 的 fakeFeishuSdk——真 SDK 的 WS 不进假路径,
 * 假路径用简单 HTTP 长轮询模拟同一语义。
 *
 * 假 sdk 那一侧:
 *   POST /register/start        → { qrUrl }
 *   GET  /register/status       → { status: "wait" | "confirmed" | "expired", …凭据 }
 *   GET  /inbox?cursor=N        长轮询吐入站消息(有货立回,没货等 longPollMs)
 *   POST /send                  记录出站 { openId, text }
 *   POST /reaction              记录 { messageId, emoji, action }
 * 测试那一侧(/__fake/*,真协议里没有):
 *   POST /__fake/qr/confirm     设备流走到 confirmed
 *   POST /__fake/qr/expire      设备流过期
 *   POST /__fake/inbound        { text, openId?, messageId?, chatType?, messageType? } 塞一条
 *   GET  /__fake/sent           出站全记录(文本与 reaction 混排,带 kind)
 *   POST /__fake/reset
 */
import http from "node:http"

export const FAKE_APP_ID = "cli_fake_app"
export const FAKE_APP_SECRET = "fake-secret"
export const FAKE_OPEN_ID = "fake-open-id"

export function startFakeFeishuServer(opts = {}) {
  const 长轮询最长 = opts.longPollMs ?? 2_000
  let 扫码态 = "idle" // idle | wait | confirmed | expired
  const 入站 = []
  const 发出 = []
  let 序号 = 0
  /** 等着的 inbox 长轮询:有新消息立刻回 */
  const 等着的 = new Set()

  const 回JSON = (res, o, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(o))
  }
  const 读体 = (req) =>
    new Promise((成) => {
      const 块 = []
      req.on("data", (c) => 块.push(c))
      req.on("end", () => {
        try {
          成(JSON.parse(Buffer.concat(块).toString("utf8") || "{}"))
        } catch {
          成({})
        }
      })
    })
  const 吐给等着的 = () => {
    for (const f of [...等着的]) f()
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://x")
      const p = url.pathname
      if (p === "/register/start") {
        扫码态 = "wait"
        return 回JSON(res, { qrUrl: "http://fake-feishu/qr/launcher" })
      }
      if (p === "/register/status") {
        if (扫码态 === "confirmed") {
          return 回JSON(res, {
            status: "confirmed",
            appId: FAKE_APP_ID,
            appSecret: FAKE_APP_SECRET,
            openId: FAKE_OPEN_ID,
            domain: "feishu",
          })
        }
        // wait 态小睡一下再回,免得假 sdk 的轮询空转烧 CPU
        if (扫码态 === "wait") await new Promise((成) => setTimeout(成, 100))
        return 回JSON(res, { status: 扫码态 === "expired" ? "expired" : "wait" })
      }
      if (p === "/inbox") {
        const cursor = Number(url.searchParams.get("cursor") ?? "0")
        const 给 = () => 回JSON(res, { cursor: String(序号), msgs: 入站.filter((m) => m.seq > cursor) })
        if (入站.some((m) => m.seq > cursor)) return 给()
        const 醒 = () => {
          等着的.delete(醒)
          clearTimeout(t)
          给()
        }
        const t = setTimeout(醒, 长轮询最长)
        等着的.add(醒)
        return
      }
      if (p === "/send") {
        const b = await 读体(req)
        发出.push({ kind: "text", ...b })
        return 回JSON(res, { ok: true })
      }
      if (p === "/reaction") {
        const b = await 读体(req)
        发出.push({ kind: "reaction", ...b })
        return 回JSON(res, { ok: true })
      }
      /* ── 测试侧 ── */
      if (p === "/__fake/qr/confirm") {
        扫码态 = "confirmed"
        return 回JSON(res, { ok: true })
      }
      if (p === "/__fake/qr/expire") {
        扫码态 = "expired"
        return 回JSON(res, { ok: true })
      }
      if (p === "/__fake/inbound") {
        const b = await 读体(req)
        序号 += 1
        入站.push({
          seq: 序号,
          messageId: b.messageId ?? `fm-${序号}`,
          openId: b.openId ?? FAKE_OPEN_ID,
          text: b.text ?? "",
          chatType: b.chatType ?? "p2p",
          messageType: b.messageType ?? "text",
        })
        吐给等着的()
        return 回JSON(res, { ok: true })
      }
      if (p === "/__fake/sent") return 回JSON(res, 发出)
      if (p === "/__fake/reset") {
        扫码态 = "idle"
        入站.length = 0
        发出.length = 0
        序号 = 0
        return 回JSON(res, { ok: true })
      }
      回JSON(res, { error: `假飞书不认识 ${p}` }, 404)
    })().catch((e) => 回JSON(res, { error: String(e) }, 500))
  })

  return new Promise((成) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const url = `http://127.0.0.1:${addr.port}`
      const post = (p, body) =>
        fetch(`${url}${p}`, {
          method: "POST",
          ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
        })
      成({
        url,
        // 把手(照 fake-ilink 的形制;e2e 夹具与用例直接调,不自己拼 /__fake 路径)
        确认扫码: () => post("/__fake/qr/confirm"),
        码过期: () => post("/__fake/qr/expire"),
        发来: (text, extra) => post("/__fake/inbound", { text, ...(extra ?? {}) }),
        发出的: async () => (await fetch(`${url}/__fake/sent`)).json(),
        reset: () => post("/__fake/reset"),
        close: () => new Promise((好) => server.close(() => 好())),
      })
    })
  })
}
