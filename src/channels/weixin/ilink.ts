/**
 * 微信「ClawBot」那一头的协议客户端（iLink bot API）。T1，2026-08-21。
 *
 * 设计文档：`docs/superpowers/specs/2026-08-21-远程助理-design.md`；
 * 协议事实：`docs/微信-iLink-协议笔记.md`（读自腾讯官方插件
 * `@tencent-weixin/openclaw-weixin@2.4.6` 的源码，MIT）。
 *
 * ## 这一层的边界
 *
 * 只管「怎么跟 `ilinkai.weixin.qq.com` 说话」：头、长轮询、扫码状态机、发消息、
 * CDN 的 AES 加解密。**不知道会话、不知道钥匙串、不知道界面**——那些在 `channel.ts`。
 *
 * **`fetch` 注入**：单测塞一个假的进来，走完整个扫码状态机与加解密往返，
 * 不碰网络。默认用全局 `fetch`（Node ≥ 18 自带）。
 *
 * ## 几条从源码里学来、README 没写或写错的
 *
 * - 路径都带 `ilink/bot/` 前缀；README 漏了。
 * - `getupdates` 的客户端超时（AbortError）**是正常情况**：返回空 msgs、游标不变，接着轮。
 * - 扫码状态轮询是 **GET，不带 Authorization**（那时还没有 token）。
 * - CDN 上传是 **POST** 不是 PUT；下载参数在响应头 `x-encrypted-param`。
 * - `aes_key` 在线上有两种编码：图片是 `base64(16 字节)`，文件 / 语音 / 视频是 `base64(32 位 hex)`。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"

export const ILINK_BASE_URL = "https://ilinkai.weixin.qq.com"
export const ILINK_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c"

/** 我们报给服务端的身份。**只用于可观测性**，不参与鉴权与路由（协议笔记 §1） */
const BOT_AGENT = "DAWN-Science/0.1"
const CHANNEL_VERSION = "0.1.0"
/** `iLink-App-ClientVersion`：`major<<16 | minor<<8 | patch`，与插件同一编码 */
const CLIENT_VERSION = String((0 << 16) | (1 << 8) | 0)

const LONG_POLL_TIMEOUT_MS = 35_000
const API_TIMEOUT_MS = 15_000
const LIGHT_TIMEOUT_MS = 10_000

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface IlinkOptions {
  fetch?: FetchLike
  /** 账号自己的基址（扫码确认时服务端给）。没有就用默认 */
  baseUrl?: string
  cdnBaseUrl?: string
  /**
   * 扫码那两步打的基址。**线上永远是默认那个**（插件写死了），这个口子只给
   * `dev:mock` / e2e 指向假微信用——与 `DAWN_FAKE_SSH` 同一套惯例。
   */
  qrBaseUrl?: string
}

/* ── 消息模型（只保留我们用到的字段；协议笔记 §3 有全貌） ─────────── */

export const MessageType = { USER: 1, BOT: 2 } as const
export const MessageState = { FINISH: 2 } as const
export const ItemType = {
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
  TOOL_CALL_START: 11,
  TOOL_CALL_RESULT: 12,
} as const

export interface CdnMedia {
  encrypt_query_param?: string
  aes_key?: string
  encrypt_type?: number
  full_url?: string
}

export interface MessageItem {
  type: number
  is_completed?: boolean
  text_item?: { text: string }
  image_item?: { media?: CdnMedia; aeskey?: string; mid_size?: number }
  voice_item?: { media?: CdnMedia; text?: string; playtime?: number }
  file_item?: { media?: CdnMedia; file_name?: string; len?: string }
  video_item?: { media?: CdnMedia; video_size?: number }
  tool_call_start_item?: { tool_name: string; tool_call_id: string }
  tool_call_result_item?: { tool_name: string; tool_call_id: string; status: string }
  ref_msg?: { message_item?: MessageItem; title?: string }
}

export interface InboundMessage {
  message_id?: string
  from_user_id: string
  to_user_id?: string
  create_time_ms?: number
  message_type?: number
  item_list?: MessageItem[]
  /** **回复时原样带回**——路由的全部 */
  context_token?: string
}

export interface GetUpdatesResult {
  msgs: InboundMessage[]
  /** 下一次要带的游标。**空串表示服务端没给，沿用上一个** */
  cursor: string
  /** 服务端建议的下一次长轮询时长 */
  nextTimeoutMs: number
  /** token 失效（errcode -14）。调用方该停轮询、让人重新扫码 */
  staleToken: boolean
}

export class IlinkError extends Error {
  constructor(
    message: string,
    readonly ret?: number,
  ) {
    super(message)
    this.name = "IlinkError"
  }
}

/* ── 扫码 ──────────────────────────────────────────────────────── */

export type QrStatus =
  | { status: "wait" }
  | { status: "scaned" }
  | { status: "need_verifycode" }
  | { status: "verify_code_blocked" }
  | { status: "expired" }
  | { status: "scaned_but_redirect"; redirect_host?: string }
  | { status: "binded_redirect" }
  | {
      status: "confirmed"
      bot_token: string
      ilink_bot_id: string
      ilink_user_id: string
      baseurl?: string
    }

export interface QrCode {
  /** 轮询用的句柄 */
  qrcode: string
  /** 让人扫的那个 URL——自己渲染成二维码 */
  url: string
}

export class IlinkClient {
  private readonly fetchImpl: FetchLike
  readonly baseUrl: string
  readonly cdnBaseUrl: string
  private readonly qrBaseUrl: string

  constructor(opts: IlinkOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((i, init) => fetch(i, init))
    this.baseUrl = 带斜杠(opts.baseUrl ?? ILINK_BASE_URL)
    this.cdnBaseUrl = opts.cdnBaseUrl ?? ILINK_CDN_BASE_URL
    this.qrBaseUrl = opts.qrBaseUrl ?? ILINK_BASE_URL
  }

  /* ── 扫码 ── */

  /**
   * 要一张二维码。`localTokens` 是本机已有的 bot token（最多 10 个）——
   * 服务端据此认出「已经绑过」并回 `binded_redirect`。
   */
  async fetchQrCode(localTokens: readonly string[] = []): Promise<QrCode> {
    const r = (await this.post(
      this.qrBaseUrl,
      "ilink/bot/get_bot_qrcode?bot_type=3",
      { local_token_list: localTokens.slice(0, 10) },
      undefined,
      API_TIMEOUT_MS,
    )) as { qrcode?: string; qrcode_img_content?: string }
    if (!r.qrcode || !r.qrcode_img_content) throw new IlinkError("服务端没给二维码")
    return { qrcode: r.qrcode, url: r.qrcode_img_content }
  }

  /**
   * 问一次扫码状态（长轮询，最多 35 s）。**超时与网络错误一律当 `wait`**——
   * 插件就是这么做的：这一步没有可恢复的失败，只有「再问一次」。
   * `baseUrl` 可被 `scaned_but_redirect` 换掉，所以显式传。
   */
  async pollQrStatus(qrcode: string, verifyCode?: string, baseUrl = this.qrBaseUrl): Promise<QrStatus> {
    let path = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`
    if (verifyCode) path += `&verify_code=${encodeURIComponent(verifyCode)}`
    try {
      const r = (await this.get(baseUrl, path, LONG_POLL_TIMEOUT_MS)) as QrStatus
      return r
    } catch {
      return { status: "wait" }
    }
  }

  /* ── 收 ── */

  async getUpdates(token: string, cursor: string, timeoutMs = LONG_POLL_TIMEOUT_MS, signal?: AbortSignal): Promise<GetUpdatesResult> {
    let r: {
      ret?: number
      errcode?: number
      errmsg?: string
      msgs?: InboundMessage[]
      get_updates_buf?: string
      longpolling_timeout_ms?: number
    }
    try {
      // **客户端比服务端多等 5 s**：服务端说 35 s 就在 35 s 回，两边同时到点会撞成一次假失败
      r = (await this.post(this.baseUrl, "ilink/bot/getupdates", { get_updates_buf: cursor }, token, timeoutMs + 5_000, signal)) as typeof r
    } catch (e) {
      // 客户端超时是正常的：空着回去，游标不变，接着轮。
      // **两个名字都认**：`AbortSignal.timeout` 抛的是 `TimeoutError`，外部取消才是 `AbortError`
      if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
        return { msgs: [], cursor, nextTimeoutMs: timeoutMs, staleToken: false }
      }
      throw e
    }
    if (r.errcode === -14 || r.ret === -14) return { msgs: [], cursor, nextTimeoutMs: timeoutMs, staleToken: true }
    if ((r.ret !== undefined && r.ret !== 0) || (r.errcode !== undefined && r.errcode !== 0)) {
      throw new IlinkError(`getupdates 失败：ret=${r.ret} errcode=${r.errcode} ${r.errmsg ?? ""}`, r.ret ?? r.errcode)
    }
    return {
      msgs: r.msgs ?? [],
      cursor: r.get_updates_buf && r.get_updates_buf !== "" ? r.get_updates_buf : cursor,
      nextTimeoutMs: r.longpolling_timeout_ms ?? timeoutMs,
      staleToken: false,
    }
  }

  /* ── 发 ── */

  /** 发一条文字。**一条 ≤ 4000 字**，切段是调用方的事（它知道在哪儿断句） */
  async sendText(token: string, to: string, text: string, contextToken: string | undefined): Promise<string> {
    return this.sendItem(token, to, { type: ItemType.TEXT, text_item: { text } }, contextToken)
  }

  /** 工具调用进度：微信客户端会画成进度条目 */
  async sendToolStart(token: string, to: string, toolName: string, toolCallId: string, contextToken: string | undefined): Promise<string> {
    return this.sendItem(
      token,
      to,
      { type: ItemType.TOOL_CALL_START, is_completed: false, tool_call_start_item: { tool_name: toolName, tool_call_id: toolCallId } },
      contextToken,
    )
  }

  async sendToolResult(
    token: string,
    to: string,
    toolName: string,
    toolCallId: string,
    status: "completed" | "failed" | "blocked" | "unknown",
    contextToken: string | undefined,
  ): Promise<string> {
    return this.sendItem(
      token,
      to,
      { type: ItemType.TOOL_CALL_RESULT, is_completed: true, tool_call_result_item: { tool_name: toolName, tool_call_id: toolCallId, status } },
      contextToken,
    )
  }

  /**
   * 发一条带一个条目的消息。**`item_list` 永远只有一项**（插件的口径：文字与图片分两条发）。
   * 返回我们自己生成的 `client_id`——服务端不回消息 id。
   */
  async sendItem(token: string, to: string, item: MessageItem, contextToken: string | undefined, clientId?: string): Promise<string> {
    clientId ??= `dawn-weixin:${Date.now()}-${randomBytes(4).toString("hex")}`
    const r = (await this.post(
      this.baseUrl,
      "ilink/bot/sendmessage",
      {
        msg: {
          from_user_id: "",
          to_user_id: to,
          client_id: clientId,
          message_type: MessageType.BOT,
          message_state: MessageState.FINISH,
          item_list: [item],
          ...(contextToken ? { context_token: contextToken } : {}),
          run_id: randomUUID(),
        },
      },
      token,
      API_TIMEOUT_MS,
    )) as { ret?: number; errcode?: number; errmsg?: string }
    // 两个字段都查(审查 debug D11):sendmessage 会用 errcode(含 -14 token 失效)报错而 ret 缺省,只查 ret 会把失败当成功吞掉
    if ((r.ret && r.ret !== 0) || (r.errcode && r.errcode !== 0)) throw new IlinkError(`sendmessage 失败：ret=${r.ret} errcode=${r.errcode} ${r.errmsg ?? ""}`, r.ret ?? r.errcode)
    return clientId
  }

  /** 「正在输入」。要先 `getConfig` 拿 `typing_ticket`；没有票就别调 */
  async sendTyping(token: string, userId: string, ticket: string, typing: boolean): Promise<void> {
    await this.post(this.baseUrl, "ilink/bot/sendtyping", { ilink_user_id: userId, typing_ticket: ticket, status: typing ? 1 : 2 }, token, LIGHT_TIMEOUT_MS)
  }

  async getConfig(token: string, userId: string, contextToken?: string): Promise<{ typingTicket: string }> {
    const r = (await this.post(
      this.baseUrl,
      "ilink/bot/getconfig",
      { ilink_user_id: userId, ...(contextToken ? { context_token: contextToken } : {}) },
      token,
      LIGHT_TIMEOUT_MS,
    )) as { ret?: number; typing_ticket?: string }
    if (r.ret !== undefined && r.ret !== 0) throw new IlinkError(`getconfig 失败：ret=${r.ret}`, r.ret)
    return { typingTicket: r.typing_ticket ?? "" }
  }

  async notifyStart(token: string): Promise<void> {
    await this.post(this.baseUrl, "ilink/bot/msg/notifystart", {}, token, LIGHT_TIMEOUT_MS).catch(() => {})
  }

  async notifyStop(token: string): Promise<void> {
    await this.post(this.baseUrl, "ilink/bot/msg/notifystop", {}, token, LIGHT_TIMEOUT_MS).catch(() => {})
  }

  /* ── 媒体 ── */

  /**
   * 传一份文件到 CDN，回可以塞进消息条目的 `media`。
   * 流程：`getuploadurl`（报明文大小、md5、密文大小、hex 的 aeskey）→ AES-128-ECB 加密 →
   * POST 密文 → 响应头 `x-encrypted-param` 就是别人下载时要带的参数。
   */
  async uploadMedia(
    token: string,
    to: string,
    mediaType: 1 | 2 | 3 | 4,
    plaintext: Buffer,
  ): Promise<{ media: CdnMedia; aesKeyHex: string; cipherSize: number; rawSize: number }> {
    const aesKey = randomBytes(16)
    const aesKeyHex = aesKey.toString("hex")
    const filekey = randomBytes(16).toString("hex")
    const cipher = aesEcbEncrypt(aesKey, plaintext)
    const r = (await this.post(
      this.baseUrl,
      "ilink/bot/getuploadurl",
      {
        filekey,
        media_type: mediaType,
        to_user_id: to,
        rawsize: plaintext.length,
        rawfilemd5: createHash("md5").update(plaintext).digest("hex"),
        filesize: cipher.length,
        no_need_thumb: true,
        aeskey: aesKeyHex,
      },
      token,
      API_TIMEOUT_MS,
    )) as { upload_param?: string; upload_full_url?: string; ret?: number; errmsg?: string }
    if (r.ret !== undefined && r.ret !== 0) throw new IlinkError(`getuploadurl 失败：ret=${r.ret} ${r.errmsg ?? ""}`, r.ret)
    const url =
      r.upload_full_url ??
      (r.upload_param
        ? `${this.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(r.upload_param)}&filekey=${encodeURIComponent(filekey)}`
        : undefined)
    if (!url) throw new IlinkError("getuploadurl 没给上传地址")
    // CDN 直连也要超时(审查 debug D1):半开/挂起的连接会卡住整条入站轮询,机器人彻底失聪
    const resp = await this.fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(cipher), signal: 合并信号(60_000) })
    if (!resp.ok) throw new IlinkError(`CDN 上传失败 ${resp.status}：${resp.headers.get("x-error-message") ?? ""}`)
    const param = resp.headers.get("x-encrypted-param")
    if (!param) throw new IlinkError("CDN 上传成功却没回 x-encrypted-param")
    return {
      // **文件 / 语音 / 视频是 base64(hex)**；图片条目另外还带 `aeskey: hex`（见 `imageItem`）
      media: { encrypt_query_param: param, aes_key: Buffer.from(aesKeyHex, "utf8").toString("base64"), encrypt_type: 1 },
      aesKeyHex,
      cipherSize: cipher.length,
      rawSize: plaintext.length,
    }
  }

  /** 下载并解密一份媒体。`aesKey` 两种编码都认（协议笔记 §4） */
  async downloadMedia(media: CdnMedia, aesKeyOverrideHex?: string): Promise<Buffer> {
    const url =
      media.full_url ??
      (media.encrypt_query_param
        ? `${this.cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param)}`
        : undefined)
    if (!url) throw new IlinkError("媒体没有下载地址")
    // CDN 下载也要超时(审查 debug D1)
    const resp = await this.fetchImpl(url, { method: "GET", signal: 合并信号(60_000) })
    if (!resp.ok) throw new IlinkError(`CDN 下载失败 ${resp.status}`)
    const body = Buffer.from(await resp.arrayBuffer())
    const key = aesKeyOverrideHex ? Buffer.from(aesKeyOverrideHex, "hex") : media.aes_key ? parseAesKey(media.aes_key) : undefined
    if (!key) return body // 没钥匙就是明文（插件对图片的口径）
    return aesEcbDecrypt(key, body)
  }

  /* ── 底层 ── */

  private async post(baseUrl: string, path: string, body: Record<string, unknown>, token: string | undefined, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": Buffer.from(String(randomBytes(4).readUInt32BE(0)), "utf8").toString("base64"),
      ...公共头(),
    }
    if (token) headers["Authorization"] = `Bearer ${token}`
    const resp = await this.fetchImpl(new URL(path, 带斜杠(baseUrl)).toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, base_info: { channel_version: CHANNEL_VERSION, bot_agent: BOT_AGENT } }),
      signal: 合并信号(timeoutMs, signal),
    })
    if (!resp.ok) throw new IlinkError(`${path} ${resp.status}：${(await resp.text()).slice(0, 200)}`)
    return resp.json()
  }

  private async get(baseUrl: string, path: string, timeoutMs: number): Promise<unknown> {
    const resp = await this.fetchImpl(new URL(path, 带斜杠(baseUrl)).toString(), { method: "GET", headers: 公共头(), signal: AbortSignal.timeout(timeoutMs) })
    if (!resp.ok) throw new IlinkError(`${path} ${resp.status}`)
    return resp.json()
  }
}

function 公共头(): Record<string, string> {
  return { "iLink-App-Id": "bot", "iLink-App-ClientVersion": CLIENT_VERSION }
}

function 带斜杠(u: string): string {
  return u.endsWith("/") ? u : `${u}/`
}

function 合并信号(timeoutMs: number, outer?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs)
  return outer ? AbortSignal.any([t, outer]) : t
}

/* ── AES-128-ECB / PKCS7（与插件 `cdn/aes-ecb.ts` 同） ─────────────── */

export function aesEcbEncrypt(key: Buffer, plaintext: Buffer): Buffer {
  const c = createCipheriv("aes-128-ecb", key, null)
  return Buffer.concat([c.update(plaintext), c.final()])
}

export function aesEcbDecrypt(key: Buffer, ciphertext: Buffer): Buffer {
  const d = createDecipheriv("aes-128-ecb", key, null)
  return Buffer.concat([d.update(ciphertext), d.final()])
}

/**
 * 线上 `aes_key` 的两种编码：解出 16 字节就直接用（图片）；解出 32 个 hex 字符就再 hex 解一次
 * （文件 / 语音 / 视频）。别的都是坏数据。
 */
export function parseAesKey(b64: string): Buffer {
  const raw = Buffer.from(b64, "base64")
  if (raw.length === 16) return raw
  if (raw.length === 32 && /^[0-9a-fA-F]{32}$/.test(raw.toString("utf8"))) return Buffer.from(raw.toString("utf8"), "hex")
  throw new IlinkError(`认不出的 aes_key 编码（解出 ${raw.length} 字节）`)
}

/** 图片条目：`media.aes_key` 用 base64(16 字节)，另外还带 hex 的 `aeskey` */
/**
 * 出站媒体的**确定性 client_id**(2026-08-25,dsh-im 对账捎上的):同一份字节重传
 * 得到同一个 id,服务端按 client_id 幂等——重试不重复发。**只用于媒体**:
 * 文本消息保持随机 id(同一句话合法地发两次,不该被去重)。
 */
export function mediaClientId(bytes: Buffer): string {
  return `dawn-weixin-media:${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}`
}

export function imageItem(up: { media: CdnMedia; aesKeyHex: string; cipherSize: number }): MessageItem {
  return {
    type: ItemType.IMAGE,
    image_item: {
      media: { ...up.media, aes_key: Buffer.from(up.aesKeyHex, "hex").toString("base64") },
      aeskey: up.aesKeyHex,
      mid_size: up.cipherSize,
    },
  }
}

export function fileItem(up: { media: CdnMedia; rawSize: number }, fileName: string): MessageItem {
  return { type: ItemType.FILE, file_item: { media: up.media, file_name: fileName, len: String(up.rawSize) } }
}

/* ── 收到的消息 → 一段给会话的文字 + 媒体引用 ───────────────────── */

export interface InboundText {
  from: string
  contextToken: string | undefined
  /** 合成的一段话：文字；语音用服务端的转写；引用前面加「[引用: …]」 */
  text: string
  /** 要下载的媒体（图片优先，其次视频、文件、语音），没有就 undefined */
  media?: { kind: "image" | "video" | "file" | "voice"; media: CdnMedia; aesKeyHex?: string; fileName?: string } | undefined
}

export function 读入站(msg: InboundMessage): InboundText {
  const items = msg.item_list ?? []
  const texts: string[] = []
  let media: InboundText["media"]
  const 挑媒体 = (it: MessageItem) => {
    if (media?.kind === "image") return
    if (it.image_item?.media || it.image_item?.aeskey) {
      media = { kind: "image", media: it.image_item.media ?? {}, ...(it.image_item.aeskey ? { aesKeyHex: it.image_item.aeskey } : {}) }
    } else if (!media && it.video_item?.media) media = { kind: "video", media: it.video_item.media }
    else if (!media && it.file_item?.media) media = { kind: "file", media: it.file_item.media, ...(it.file_item.file_name ? { fileName: it.file_item.file_name } : {}) }
    else if (!media && it.voice_item?.media && !it.voice_item.text) media = { kind: "voice", media: it.voice_item.media }
  }
  for (const it of items) {
    const ref = it.ref_msg
    if (it.text_item?.text) {
      const 引 = ref?.message_item?.text_item?.text
      texts.push(引 ? `[引用: ${ref?.title ?? ""} | ${引}]\n${it.text_item.text}` : it.text_item.text)
    } else if (it.voice_item?.text) texts.push(it.voice_item.text)
    挑媒体(it)
    if (ref?.message_item) 挑媒体(ref.message_item)
  }
  return { from: msg.from_user_id, contextToken: msg.context_token, text: texts.join("\n"), media }
}

/** 一条 ≤ 4000 字；尽量在换行处断 */
export function 切段(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit)
    if (cut < limit / 2) cut = limit
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n/, "")
  }
  if (rest) out.push(rest)
  return out
}
