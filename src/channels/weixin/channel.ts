/**
 * 微信通道：把微信里的话接到会话，把会话的回答送回微信。远程助理 T2，2026-08-21。
 *
 * 设计：`docs/superpowers/specs/2026-08-21-远程助理-design.md`。
 *
 * ## 它不自己做任何「会话的事」
 *
 * 建会话、写消息、中止、列任务——全部调后端自己那几个操作（`deps.ops`），
 * **与界面按下去走的是同一条路**。这一层只负责三件事：
 *   1. 绑定（扫码状态机，状态给界面看）；
 *   2. 轮询微信、把话写进会话；
 *   3. 听会话的最终回答、送回微信。
 *
 * ## 安全
 *
 * - **只认扫码那个人**（`ilink_user_id`）。别人发来的一律不回，记一条日志。
 *   不继承官方插件「空名单放行所有人」的缺省。
 * - token 在钥匙串（`credentials` 端口，键 `weixin:botToken`），不落设置表。
 * - token 失效（-14）：停轮询、状态变 `stale`，界面那张卡会说「重新扫码」。
 */
import { IlinkClient, type InboundText, type QrStatus, 切段, 读入站 } from "./ilink.js"
import type { SessionUpdate } from "../../protocol/events.js"
import type { TaskSummary } from "../../protocol/entities.js"

export const WEIXIN_TOKEN_KEY = "weixin:botToken"

export type WeixinState = "unbound" | "logging_in" | "bound" | "stale"

export interface LoginView {
  /** 让人扫的 URL——界面自己画二维码 */
  qrUrl: string
  /** 逐态出声：界面照原样显示 */
  step: "wait" | "scaned" | "need_verifycode" | "verify_code_wrong" | "expired" | "redirect" | "confirmed" | "failed"
  message: string
}

export interface WeixinStatus {
  state: WeixinState
  login?: LoginView | undefined
  botId?: string | undefined
  userId?: string | undefined
  boundAt?: string | undefined
  /** 微信那边的话正落到哪段会话 */
  sessionId?: string | undefined
  /** 最近一次出错（轮询失败之类），给界面看；成功一次就清 */
  lastError?: string | undefined
  contactName: string
}

/** 后端操作的子集。**只用这几个**——列在这儿就是契约 */
export interface WeixinOps {
  createTask(req: { agentId: string; workspace?: string; connectionId?: string }): Promise<TaskSummary>
  listTasks(): Promise<readonly TaskSummary[]>
  listConnections(): Promise<readonly { id: string; label: string }[]>
  writeToSession(req: { sessionId: string; data: string; as: "user" }): Promise<unknown>
  abortSession(req: { sessionId: string }): Promise<unknown>
  subscribeSession(req: { sessionId: string }): Promise<unknown>
}

export interface WeixinDeps {
  client: (baseUrl?: string) => IlinkClient
  settings: {
    get(key: WeixinSettingKey): string | undefined
    set(key: WeixinSettingKey, value: string, now: string): void
  }
  credentials: { get(k: string): string | undefined; set(k: string, v: string): void; delete(k: string): void }
  events: { onUpdate(cb: (u: SessionUpdate) => void): () => void; pin(id: string): void; unpin(id: string): void }
  ops: () => WeixinOps
  /** 新建专属会话用哪个 agent：配置里第一个 native */
  defaultAgentId: () => string | undefined
  /** 这段会话在哪台机器的哪个目录（`/在哪` 用） */
  whereIs: (sessionId: string) => { label?: string; cwd?: string } | undefined
  log?: (line: string) => void
  now?: () => number
}

export type WeixinSettingKey =
  | "weixin.botId"
  | "weixin.userId"
  | "weixin.baseUrl"
  | "weixin.cursor"
  | "weixin.contextToken"
  | "weixin.sessionId"
  | "weixin.boundAt"
  | "weixin.notify"

export const CONTACT_NAME = "DAWN-Science"

const 轮询退避毫秒 = 2_000
const 连败退避毫秒 = 30_000
const 二维码最多刷新 = 3

export class WeixinChannel {
  private login: LoginView | undefined
  private 登录中止: AbortController | undefined
  private 待配对码: ((code: string) => void) | undefined
  private 轮询中止: AbortController | undefined
  private lastError: string | undefined
  private 退订: (() => void) | undefined
  private stale = false

  constructor(private readonly deps: WeixinDeps) {}

  /* ── 状态 ── */

  status(): WeixinStatus {
    const botId = this.deps.settings.get("weixin.botId")
    const token = this.deps.credentials.get(WEIXIN_TOKEN_KEY)
    const state: WeixinState = this.login ? "logging_in" : botId && token ? (this.stale ? "stale" : "bound") : "unbound"
    return {
      state,
      login: this.login,
      botId,
      userId: this.deps.settings.get("weixin.userId"),
      boundAt: this.deps.settings.get("weixin.boundAt"),
      sessionId: this.deps.settings.get("weixin.sessionId"),
      lastError: this.lastError,
      contactName: CONTACT_NAME,
    }
  }

  /* ── 绑定 ── */

  /**
   * 开始扫码。**立刻返回**，状态机在后台走；界面轮 `status()` 看进度。
   * 已经在扫了就不重开（重开会换一张码，人扫的那张就作废了）。
   */
  async startLogin(): Promise<void> {
    if (this.login) return
    const client = this.deps.client()
    const 中止 = new AbortController()
    this.登录中止 = 中止
    const token = this.deps.credentials.get(WEIXIN_TOKEN_KEY)
    let qr = await client.fetchQrCode(token ? [token] : [])
    this.login = { qrUrl: qr.url, step: "wait", message: "用微信扫一扫" }
    void (async () => {
      let 刷新了 = 0
      let baseUrl: string | undefined
      let 配对码: string | undefined
      try {
        while (!中止.signal.aborted) {
          const st: QrStatus = await client.pollQrStatus(qr.qrcode, 配对码, baseUrl)
          if (中止.signal.aborted) return
          switch (st.status) {
            case "wait":
              break
            case "scaned":
              配对码 = undefined
              this.login = { ...this.login!, step: "scaned", message: "已扫，等手机上确认" }
              break
            case "need_verifycode": {
              const 错了 = 配对码 !== undefined
              this.login = {
                ...this.login!,
                step: 错了 ? "verify_code_wrong" : "need_verifycode",
                message: 错了 ? "配对码不对，再输一次手机上显示的数字" : "手机上显示了一串数字，填到这里",
              }
              配对码 = await new Promise<string>((成) => {
                this.待配对码 = 成
              })
              this.待配对码 = undefined
              continue
            }
            case "verify_code_blocked":
            case "expired": {
              刷新了 += 1
              if (刷新了 > 二维码最多刷新) {
                this.login = { ...this.login!, step: "failed", message: "二维码多次失效，先停下；要再试就再点一次「扫码绑定」" }
                return
              }
              qr = await client.fetchQrCode(token ? [token] : [])
              配对码 = undefined
              this.login = { qrUrl: qr.url, step: "expired", message: st.status === "expired" ? "二维码过期了，已换一张" : "配对码错太多次，换了一张码" }
              break
            }
            case "scaned_but_redirect":
              if (st.redirect_host) baseUrl = `https://${st.redirect_host}`
              this.login = { ...this.login!, step: "redirect", message: "已扫，正在连接" }
              break
            case "binded_redirect":
              // 服务端说这台机器早就绑过：现有凭证继续有效
              this.login = { ...this.login!, step: "confirmed", message: "这台机器已经绑过了，不用重复绑" }
              this.stale = false
              return
            case "confirmed": {
              const now = new Date(this.deps.now?.() ?? Date.now()).toISOString()
              this.deps.credentials.set(WEIXIN_TOKEN_KEY, st.bot_token)
              this.deps.settings.set("weixin.botId", st.ilink_bot_id, now)
              this.deps.settings.set("weixin.userId", st.ilink_user_id, now)
              this.deps.settings.set("weixin.baseUrl", st.baseurl ?? "", now)
              this.deps.settings.set("weixin.boundAt", now, now)
              this.deps.settings.set("weixin.cursor", "", now)
              this.stale = false
              this.login = { ...this.login!, step: "confirmed", message: "绑好了" }
              this.log(`绑定成功 bot=${st.ilink_bot_id} user=${遮(st.ilink_user_id)}`)
              this.start()
              return
            }
          }
          await 等(1_000, 中止.signal)
        }
      } catch (e) {
        this.login = { ...(this.login ?? { qrUrl: "", step: "failed", message: "" }), step: "failed", message: `扫码失败：${e instanceof Error ? e.message : String(e)}` }
      } finally {
        // 成功 / 失败的那一态留 8 秒给界面看，然后收起
        const 末 = this.login
        setTimeout(() => {
          if (this.login === 末) {
            this.login = undefined
            this.登录中止 = undefined
          }
        }, 8_000).unref?.()
      }
    })()
  }

  submitVerifyCode(code: string): void {
    if (!this.待配对码) throw new Error("现在不需要配对码")
    this.待配对码(code.trim())
  }

  cancelLogin(): void {
    this.登录中止?.abort()
    this.待配对码?.("")
    this.login = undefined
    this.登录中止 = undefined
  }

  async unbind(): Promise<void> {
    this.stop()
    const token = this.deps.credentials.get(WEIXIN_TOKEN_KEY)
    if (token) await this.deps.client(this.baseUrl()).notifyStop(token)
    this.deps.credentials.delete(WEIXIN_TOKEN_KEY)
    const now = new Date().toISOString()
    for (const k of ["weixin.botId", "weixin.userId", "weixin.baseUrl", "weixin.cursor", "weixin.contextToken", "weixin.boundAt"] as const) {
      this.deps.settings.set(k, "", now)
    }
    this.stale = false
    this.lastError = undefined
  }

  /** 把微信接到某段已有会话（界面上挑的，或 `/用 N`） */
  async bindSession(sessionId: string): Promise<void> {
    const 旧 = this.deps.settings.get("weixin.sessionId")
    if (旧 && 旧 !== sessionId) this.deps.events.unpin(旧)
    this.deps.settings.set("weixin.sessionId", sessionId, new Date().toISOString())
    await this.deps.ops().subscribeSession({ sessionId }).catch(() => {})
    this.deps.events.pin(sessionId)
  }

  /* ── 轮询 ── */

  /** 进程启动（或刚绑好）时调：有凭证就开始听 */
  start(): void {
    if (this.轮询中止) return
    const token = this.deps.credentials.get(WEIXIN_TOKEN_KEY)
    if (!token || !this.deps.settings.get("weixin.botId")) return
    const 中止 = new AbortController()
    this.轮询中止 = 中止
    const 已绑 = this.deps.settings.get("weixin.sessionId")
    if (已绑) void this.bindSession(已绑)
    this.退订 = this.deps.events.onUpdate((u) => void this.会话有动静(u))
    const client = this.deps.client(this.baseUrl())
    void client.notifyStart(token)
    void (async () => {
      let 连败 = 0
      let timeout = 35_000
      let cursor = this.deps.settings.get("weixin.cursor") ?? ""
      while (!中止.signal.aborted) {
        try {
          const r = await client.getUpdates(token, cursor, timeout, 中止.signal)
          if (中止.signal.aborted) return
          if (r.staleToken) {
            this.stale = true
            this.lastError = "微信那边说这个绑定失效了（多半是在别处重新扫了码）——重新扫码"
            this.log("token 失效（-14），停轮询")
            this.stop()
            return
          }
          连败 = 0
          this.lastError = undefined
          timeout = r.nextTimeoutMs
          if (r.cursor !== cursor) {
            cursor = r.cursor
            this.deps.settings.set("weixin.cursor", cursor, new Date().toISOString())
          }
          for (const m of r.msgs) await this.收到(读入站(m)).catch((e) => this.log(`处理入站失败：${String(e)}`))
        } catch (e) {
          if (中止.signal.aborted) return
          连败 += 1
          this.lastError = `轮询微信失败：${e instanceof Error ? e.message : String(e)}`
          this.log(this.lastError)
          await 等(连败 >= 3 ? 连败退避毫秒 : 轮询退避毫秒, 中止.signal)
          if (连败 >= 3) 连败 = 0
        }
      }
    })()
  }

  stop(): void {
    this.轮询中止?.abort()
    this.轮询中止 = undefined
    this.退订?.()
    this.退订 = undefined
  }

  /* ── 入站 ── */

  private async 收到(入: InboundText): Promise<void> {
    const 主人 = this.deps.settings.get("weixin.userId")
    if (!主人 || 入.from !== 主人) {
      this.log(`拒绝来自 ${遮(入.from)} 的消息：不是绑定的那个人`)
      return
    }
    if (入.contextToken) this.deps.settings.set("weixin.contextToken", 入.contextToken, new Date().toISOString())
    const text = 入.text.trim()
    if (!text) {
      if (入.media) await this.回(`收到一个${入.media.kind === "image" ? "图片" : "文件"}，这一版还不会看它（下一期）`)
      return
    }
    if (text.startsWith("/")) {
      const 答 = await this.斜杠(text)
      if (答 !== undefined) {
        await this.回(答)
        return
      }
    }
    const sessionId = await this.确保有会话()
    await this.deps.ops().writeToSession({ sessionId, data: text, as: "user" })
  }

  /** 认识的命令回一段话；不认识的回 `undefined`，原样进模型 */
  private async 斜杠(text: string): Promise<string | undefined> {
    const [cmd, ...rest] = text.slice(1).split(/\s+/)
    const arg = rest.join(" ")
    switch (cmd) {
      case "帮助":
      case "help":
        return ["/会话  列出最近的会话", "/用 N  接到第 N 段", "/新建  另起一段；/新建 @服务器名 在那台机器上开", "/停  中止当前这一轮", "/在哪  现在绑着哪段、在哪台机器", "别的话直接说就行"].join("\n")
      case "会话": {
        const 列 = await this.最近的()
        if (列.length === 0) return "还没有会话。直接说话就会新建一段。"
        const 当前 = this.deps.settings.get("weixin.sessionId")
        return 列.map((t, i) => `${t.sessionId === 当前 ? "▶" : " "} ${i + 1}. ${t.title ?? "新会话"}${t.connectionId ? " ·服务器" : ""}`).join("\n")
      }
      case "用": {
        const n = Number(arg)
        const 列 = await this.最近的()
        const t = 列[n - 1]
        if (!Number.isInteger(n) || !t?.sessionId) return `没有第 ${arg} 段。发 /会话 看清单。`
        await this.bindSession(t.sessionId)
        return `好，接到「${t.title ?? "新会话"}」了。`
      }
      case "新建": {
        const 名 = arg.startsWith("@") ? arg.slice(1) : undefined
        let connectionId: string | undefined
        if (名) {
          const c = (await this.deps.ops().listConnections()).find((x) => x.label === 名)
          if (!c) return `没有叫「${名}」的服务器。`
          connectionId = c.id
        }
        const agentId = this.deps.defaultAgentId()
        if (!agentId) return "配置里还没有可用的 agent。"
        const t = await this.deps.ops().createTask({ agentId, ...(connectionId ? { connectionId } : {}) })
        if (!t.sessionId) return "建是建了，却没有会话——这一步不该悄悄过去。"
        await this.bindSession(t.sessionId)
        return 名 ? `在「${名}」上开了一段新会话，说吧。` : "开了一段新会话，说吧。"
      }
      case "停": {
        const s = this.deps.settings.get("weixin.sessionId")
        if (!s) return "现在没绑着会话。"
        await this.deps.ops().abortSession({ sessionId: s })
        return "已中止这一轮。"
      }
      case "在哪": {
        const s = this.deps.settings.get("weixin.sessionId")
        if (!s) return "还没绑会话。直接说话就会新建一段。"
        const t = (await this.deps.ops().listTasks()).find((x) => x.sessionId === s)
        const w = this.deps.whereIs(s)
        return [`绑着「${t?.title ?? "新会话"}」`, w?.label ? `机器：${w.label}` : "本机", w?.cwd ?? t?.workspace ? `目录：${w?.cwd ?? t?.workspace}` : undefined].filter(Boolean).join("\n")
      }
      default:
        return undefined
    }
  }

  private async 最近的(): Promise<TaskSummary[]> {
    const 全 = await this.deps.ops().listTasks()
    return [...全].filter((t) => t.sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)
  }

  private async 确保有会话(): Promise<string> {
    const 有 = this.deps.settings.get("weixin.sessionId")
    if (有) {
      const 还在 = (await this.deps.ops().listTasks()).some((t) => t.sessionId === 有)
      if (还在) return 有
    }
    const agentId = this.deps.defaultAgentId()
    if (!agentId) throw new Error("配置里还没有可用的 agent")
    const t = await this.deps.ops().createTask({ agentId })
    if (!t.sessionId) throw new Error("任务建好了却没有会话")
    await this.bindSession(t.sessionId)
    return t.sessionId
  }

  /* ── 出站 ── */

  private async 会话有动静(u: SessionUpdate): Promise<void> {
    const s = this.deps.settings.get("weixin.sessionId")
    if (!s || u.sessionId !== s) return
    if (u.type !== "item" || u.item.type !== "turn" || u.item.who !== "agent" || !u.item.final) return
    const text = u.item.text.trim()
    if (text) await this.回(text)
  }

  private async 回(text: string): Promise<void> {
    const token = this.deps.credentials.get(WEIXIN_TOKEN_KEY)
    const to = this.deps.settings.get("weixin.userId")
    if (!token || !to) return
    const ctx = this.deps.settings.get("weixin.contextToken")
    const client = this.deps.client(this.baseUrl())
    for (const 段 of 切段(text)) {
      try {
        await client.sendText(token, to, 段, ctx)
      } catch (e) {
        this.lastError = `发到微信失败：${e instanceof Error ? e.message : String(e)}`
        this.log(this.lastError)
        return
      }
    }
  }

  private baseUrl(): string | undefined {
    return this.deps.settings.get("weixin.baseUrl") || undefined
  }

  private log(line: string): void {
    this.deps.log?.(`[微信] ${line}`)
  }
}

function 遮(id: string): string {
  return id.length <= 6 ? "***" : `${id.slice(0, 3)}***${id.slice(-3)}`
}

function 等(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((成) => {
    const t = setTimeout(成, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(t)
      成()
    })
  })
}
