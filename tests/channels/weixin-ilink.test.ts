/**
 * iLink 协议客户端（远程助理 T1）。**假 fetch 扮服务端**，走完扫码状态机、长轮询、
 * 发消息、CDN 加解密往返——一个字节都不碰网络。
 *
 * 判据来自腾讯官方插件的源码（`docs/微信-iLink-协议笔记.md`），不是 README：
 * README 在路径前缀、CDN 方法、aes_key 编码上都和代码不一致。
 */
import { describe, expect, it } from "vitest"
import {
  IlinkClient,
  aesEcbDecrypt,
  aesEcbEncrypt,
  fileItem,
  imageItem,
  parseAesKey,
  切段,
  读入站,
  type FetchLike,
} from "../../src/channels/weixin/ilink.js"

interface 请求 {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

/** 假服务端：记下每个请求，按路径回剧本 */
function 假服务端(剧本: Record<string, (req: 请求) => Response | Promise<Response>>) {
  const 收到: 请求[] = []
  const fetch: FetchLike = async (url, init) => {
    const h = (init.headers ?? {}) as Record<string, string>
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : init.body instanceof Uint8Array ? Buffer.from(init.body) : undefined
    const req = { url, method: init.method ?? "GET", headers: h, body }
    收到.push(req)
    const path = new URL(url).pathname + new URL(url).search
    const 命中 = Object.entries(剧本).find(([k]) => path.startsWith(k))
    if (!命中) return new Response("not found", { status: 404 })
    return 命中[1](req)
  }
  return { fetch, 收到 }
}

const json = (o: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(o), { status: 200, ...init })

describe("头与路径", () => {
  it("POST 带 Bearer、AuthorizationType、X-WECHAT-UIN、iLink-App-*，路径有 ilink/bot/ 前缀，body 带 base_info", async () => {
    const s = 假服务端({ "/ilink/bot/getupdates": () => json({ ret: 0, msgs: [], get_updates_buf: "c1" }) })
    const c = new IlinkClient({ fetch: s.fetch })
    await c.getUpdates("tok", "")
    const r = s.收到[0]!
    expect(r.url).toBe("https://ilinkai.weixin.qq.com/ilink/bot/getupdates")
    expect(r.headers["Authorization"]).toBe("Bearer tok")
    expect(r.headers["AuthorizationType"]).toBe("ilink_bot_token")
    expect(r.headers["iLink-App-Id"]).toBe("bot")
    expect(r.headers["iLink-App-ClientVersion"]).toMatch(/^\d+$/)
    // UIN：base64 的十进制数字串
    expect(Buffer.from(r.headers["X-WECHAT-UIN"]!, "base64").toString()).toMatch(/^\d+$/)
    expect((r.body as { base_info: { bot_agent: string } }).base_info.bot_agent).toMatch(/^DAWN-Science\//)
  })

  it("账号自己的 baseUrl 覆盖默认，但**扫码那两步永远打默认基址**", async () => {
    const s = 假服务端({
      "/ilink/bot/get_bot_qrcode": () => json({ qrcode: "q", qrcode_img_content: "https://x/qr" }),
      "/ilink/bot/getupdates": () => json({ ret: 0, msgs: [] }),
    })
    const c = new IlinkClient({ fetch: s.fetch, baseUrl: "https://idc2.example" })
    await c.fetchQrCode()
    await c.getUpdates("t", "")
    expect(s.收到[0]!.url.startsWith("https://ilinkai.weixin.qq.com/")).toBe(true)
    expect(s.收到[1]!.url.startsWith("https://idc2.example/")).toBe(true)
  })
})

describe("扫码状态机", () => {
  it("要二维码：POST 带 local_token_list（最多 10 个），回句柄与 URL", async () => {
    const s = 假服务端({ "/ilink/bot/get_bot_qrcode": () => json({ qrcode: "qq", qrcode_img_content: "https://weixin/qr/1" }) })
    const c = new IlinkClient({ fetch: s.fetch })
    const qr = await c.fetchQrCode(Array.from({ length: 12 }, (_, i) => `t${i}`))
    expect(qr).toEqual({ qrcode: "qq", url: "https://weixin/qr/1" })
    expect(s.收到[0]!.url).toContain("get_bot_qrcode?bot_type=3")
    expect((s.收到[0]!.body as { local_token_list: string[] }).local_token_list).toHaveLength(10)
  })

  it("轮询是 **GET、不带 Authorization**；配对码拼在 query 上；确认时拿到四样东西", async () => {
    let 第几次 = 0
    const s = 假服务端({
      "/ilink/bot/get_qrcode_status": (req) => {
        第几次 += 1
        if (第几次 === 1) return json({ status: "scaned" })
        if (第几次 === 2) return json({ status: "need_verifycode" })
        if (第几次 === 3) {
          expect(req.url).toContain("verify_code=1234")
          return json({ status: "scaned_but_redirect", redirect_host: "idc2.example" })
        }
        return json({ status: "confirmed", bot_token: "BT", ilink_bot_id: "b1@im.bot", ilink_user_id: "u1@im.wechat", baseurl: "https://idc2.example" })
      },
    })
    const c = new IlinkClient({ fetch: s.fetch })
    expect(await c.pollQrStatus("q")).toEqual({ status: "scaned" })
    expect(s.收到[0]!.method).toBe("GET")
    expect(s.收到[0]!.headers["Authorization"]).toBeUndefined()
    expect(await c.pollQrStatus("q")).toEqual({ status: "need_verifycode" })
    const 转 = await c.pollQrStatus("q", "1234")
    expect(转.status).toBe("scaned_but_redirect")
    // 重定向后换基址继续问
    const 成 = await c.pollQrStatus("q", undefined, "https://idc2.example")
    expect(s.收到[3]!.url.startsWith("https://idc2.example/")).toBe(true)
    expect(成).toMatchObject({ status: "confirmed", bot_token: "BT", ilink_bot_id: "b1@im.bot", ilink_user_id: "u1@im.wechat" })
  })

  it("网关错误与超时一律当 wait——这一步只有「再问一次」", async () => {
    const s = 假服务端({ "/ilink/bot/get_qrcode_status": () => new Response("cf", { status: 524 }) })
    const c = new IlinkClient({ fetch: s.fetch })
    expect(await c.pollQrStatus("q")).toEqual({ status: "wait" })
  })
})

describe("长轮询", () => {
  it("游标：服务端给了就换、给空串就沿用；服务端能改下一次的时长", async () => {
    let n = 0
    const s = 假服务端({
      "/ilink/bot/getupdates": () => {
        n += 1
        return n === 1 ? json({ ret: 0, msgs: [], get_updates_buf: "c1", longpolling_timeout_ms: 20_000 }) : json({ ret: 0, msgs: [], get_updates_buf: "" })
      },
    })
    const c = new IlinkClient({ fetch: s.fetch })
    const a = await c.getUpdates("t", "")
    expect(a).toMatchObject({ cursor: "c1", nextTimeoutMs: 20_000 })
    const b = await c.getUpdates("t", a.cursor)
    expect(b.cursor).toBe("c1")
    expect((s.收到[1]!.body as { get_updates_buf: string }).get_updates_buf).toBe("c1")
  })

  it("errcode -14 = token 失效，**不抛，标出来**让上层停轮询、让人重新扫码", async () => {
    const s = 假服务端({ "/ilink/bot/getupdates": () => json({ ret: 0, errcode: -14, errmsg: "stale" }) })
    const c = new IlinkClient({ fetch: s.fetch })
    expect((await c.getUpdates("t", "c")).staleToken).toBe(true)
  })

  it("别的非零 ret 要抛，话里带 ret", async () => {
    const s = 假服务端({ "/ilink/bot/getupdates": () => json({ ret: 7, errmsg: "boom" }) })
    const c = new IlinkClient({ fetch: s.fetch })
    await expect(c.getUpdates("t", "c")).rejects.toThrow(/ret=7/)
  })

  it("客户端超时是正常情况：空 msgs、游标不变", async () => {
    const s = 假服务端({
      "/ilink/bot/getupdates": (req) =>
        new Promise((_, 败) => {
          ;(req as unknown as { signal?: AbortSignal }).signal?.addEventListener("abort", () => 败(Object.assign(new Error("aborted"), { name: "AbortError" })))
        }),
    })
    // 直接模拟 fetch 抛 AbortError
    const c = new IlinkClient({
      fetch: async () => {
        throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
      },
    })
    expect(await c.getUpdates("t", "c9", 10)).toEqual({ msgs: [], cursor: "c9", nextTimeoutMs: 10, staleToken: false })
    void s
  })
})

describe("发消息", () => {
  it("一条一项：to、client_id、message_type 2、state 2、context_token 原样、run_id；ret≠0 抛", async () => {
    const s = 假服务端({ "/ilink/bot/sendmessage": () => json({ ret: 0 }) })
    const c = new IlinkClient({ fetch: s.fetch })
    const id = await c.sendText("t", "u1@im.wechat", "你好", "CTX")
    const msg = (s.收到[0]!.body as { msg: Record<string, unknown> }).msg
    expect(msg).toMatchObject({ from_user_id: "", to_user_id: "u1@im.wechat", message_type: 2, message_state: 2, context_token: "CTX", client_id: id })
    expect(msg["item_list"]).toEqual([{ type: 1, text_item: { text: "你好" } }])
    expect(typeof msg["run_id"]).toBe("string")

    const 坏 = new IlinkClient({ fetch: 假服务端({ "/ilink/bot/sendmessage": () => json({ ret: 3, errmsg: "no" }) }).fetch })
    await expect(坏.sendText("t", "u", "x", undefined)).rejects.toThrow(/ret=3/)
  })

  it("工具进度两种条目的形状", async () => {
    const s = 假服务端({ "/ilink/bot/sendmessage": () => json({ ret: 0 }) })
    const c = new IlinkClient({ fetch: s.fetch })
    await c.sendToolStart("t", "u", "bash", "call1", "CTX")
    await c.sendToolResult("t", "u", "bash", "call1", "completed", "CTX")
    const 项 = (i: number) => (s.收到[i]!.body as { msg: { item_list: unknown[] } }).msg.item_list[0]
    expect(项(0)).toEqual({ type: 11, is_completed: false, tool_call_start_item: { tool_name: "bash", tool_call_id: "call1" } })
    expect(项(1)).toEqual({ type: 12, is_completed: true, tool_call_result_item: { tool_name: "bash", tool_call_id: "call1", status: "completed" } })
  })

  it("切段：≤ 4000 一段；超了尽量在换行处断，拼回去一字不差", () => {
    expect(切段("短")).toEqual(["短"])
    const 长 = Array.from({ length: 300 }, (_, i) => `第${i}行：${"字".repeat(30)}`).join("\n")
    const 段 = 切段(长)
    expect(段.length).toBeGreaterThan(1)
    for (const p of 段) expect(p.length).toBeLessThanOrEqual(4000)
    expect(段.join("\n")).toBe(长)
  })
})

describe("媒体：AES-128-ECB 往返", () => {
  it("加密再解密原样回来；PKCS7 整块对齐时多一整块", () => {
    const key = Buffer.alloc(16, 7)
    const 明 = Buffer.from("exactly sixteen!")
    const 密 = aesEcbEncrypt(key, 明)
    expect(密.length).toBe(32)
    expect(aesEcbDecrypt(key, 密)).toEqual(明)
  })

  it("aes_key 两种线上编码都认：base64(16 字节) 与 base64(32 位 hex)", () => {
    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex")
    expect(parseAesKey(key.toString("base64"))).toEqual(key)
    expect(parseAesKey(Buffer.from(key.toString("hex"), "utf8").toString("base64"))).toEqual(key)
    expect(() => parseAesKey(Buffer.from("short").toString("base64"))).toThrow(/aes_key/)
  })

  it("上传：getuploadurl 报 md5 / 明文大小 / 密文大小 / hex aeskey → POST 密文 → 读 x-encrypted-param；假 CDN 能用同一把钥匙解开", async () => {
    let 存的: Buffer | undefined
    const s = 假服务端({
      "/ilink/bot/getuploadurl": (req) => {
        const b = req.body as Record<string, unknown>
        expect(b["media_type"]).toBe(3)
        expect(b["no_need_thumb"]).toBe(true)
        expect(String(b["aeskey"])).toMatch(/^[0-9a-f]{32}$/)
        expect(b["filesize"]).toBe(32)
        expect(b["rawsize"]).toBe(16)
        return json({ upload_param: "UP" })
      },
      "/c2c/upload": (req) => {
        expect(req.method).toBe("POST")
        expect(req.headers["Content-Type"]).toBe("application/octet-stream")
        存的 = req.body as Buffer
        return new Response("", { status: 200, headers: { "x-encrypted-param": "DL" } })
      },
      "/c2c/download": () => new Response(new Uint8Array(存的!), { status: 200 }),
    })
    const c = new IlinkClient({ fetch: s.fetch })
    const 明 = Buffer.from("exactly sixteen!")
    const up = await c.uploadMedia("t", "u", 3, 明)
    expect(up.media.encrypt_query_param).toBe("DL")
    // 文件条目的 aes_key 是 base64(hex)
    expect(parseAesKey(up.media.aes_key!)).toEqual(Buffer.from(up.aesKeyHex, "hex"))
    expect(s.收到[1]!.url).toContain("/c2c/upload?encrypted_query_param=UP&filekey=")
    // 对方拿 media 就能下回来、解开
    expect(await c.downloadMedia(up.media)).toEqual(明)
    // 图片条目：media.aes_key 换成 base64(16 字节)，另外带 hex 的 aeskey
    const img = imageItem(up)
    expect(Buffer.from(img.image_item!.media!.aes_key!, "base64")).toEqual(Buffer.from(up.aesKeyHex, "hex"))
    expect(img.image_item!.aeskey).toBe(up.aesKeyHex)
    expect(fileItem(up, "a.txt").file_item).toMatchObject({ file_name: "a.txt", len: "16" })
  })
})

describe("读入站消息", () => {
  it("文字、语音转写、引用，按顺序合成一段；图片优先于别的媒体", () => {
    const r = 读入站({
      from_user_id: "u1@im.wechat",
      context_token: "CTX",
      item_list: [
        { type: 1, text_item: { text: "看这个" }, ref_msg: { title: "昨天", message_item: { type: 1, text_item: { text: "旧话" } } } },
        { type: 3, voice_item: { text: "这是语音转的字", media: { encrypt_query_param: "v" } } },
        { type: 4, file_item: { media: { encrypt_query_param: "f" }, file_name: "data.csv" } },
        { type: 2, image_item: { media: { encrypt_query_param: "i" }, aeskey: "00112233445566778899aabbccddeeff" } },
      ],
    })
    expect(r.from).toBe("u1@im.wechat")
    expect(r.contextToken).toBe("CTX")
    expect(r.text).toBe("[引用: 昨天 | 旧话]\n看这个\n这是语音转的字")
    expect(r.media).toMatchObject({ kind: "image", aesKeyHex: "00112233445566778899aabbccddeeff" })
  })

  it("没有媒体就是 undefined；纯语音没转写时才当媒体", () => {
    expect(读入站({ from_user_id: "u", item_list: [{ type: 1, text_item: { text: "嗨" } }] }).media).toBeUndefined()
    const v = 读入站({ from_user_id: "u", item_list: [{ type: 3, voice_item: { media: { encrypt_query_param: "v" } } }] })
    expect(v.media?.kind).toBe("voice")
    expect(v.text).toBe("")
  })
})
