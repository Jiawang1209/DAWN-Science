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
import { readFile } from "node:fs/promises"
import { IlinkClient, imageItem, type InboundText, type QrStatus, 切段, 读入站 } from "./ilink.js"
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
  writeToSession(req: {
    sessionId: string
    data: string
    as: "user"
    images?: { from: "bytes"; data: string; mimeType: string }[]
  }): Promise<unknown>
  /** 写之前要持有写权——微信那头就是同一个人，按 `user` 取（`user` 永远取得到） */
  acquireLease(req: { sessionId: string; holder: "user" }): Promise<unknown>
  abortSession(req: { sessionId: string }): Promise<unknown>
  subscribeSession(req: { sessionId: string }): Promise<unknown>
  /** 微信里回「同意 / 拒绝」→ 与界面上按权限卡同一个操作 */
  answerPermission(req: { sessionId: string; requestId: string; optionId?: string }): Promise<unknown>
  listProjects(): Promise<readonly { projectId: string; name: string; workspace: string }[]>
}

export interface WeixinDeps {
  client: (baseUrl?: string) => IlinkClient
  settings: {
    get(key: WeixinSettingKey): string | undefined
    set(key: WeixinSettingKey, value: string, now: string): void
  }
  credentials: { get(k: string): string | undefined; set(k: string, v: string): void; delete(k: string): void }
  events: {
    onUpdate(cb: (u: SessionUpdate) => void): () => void
    /** 每段会话的每条更新（通知用，不看订没订） */
    onAnyUpdate(cb: (u: SessionUpdate) => void): () => void
    pin(id: string): void
    unpin(id: string): void
  }
  /** 人在不在电脑前：窗口在前台就不推通知（设计里写的是「且那段会话开着」，后端只知道前台，按前台判） */
  isForeground?: () => boolean
  ops: () => WeixinOps
  /** 新建专属会话用哪个 agent：配置里第一个 native */
  defaultAgentId: () => string | undefined
  /** 这段会话在哪台机器的哪个目录（`/在哪` 用） */
  whereIs: (sessionId: string) => { label?: string; cwd?: string } | undefined
  log?: (line: string) => void
  now?: () => number
  /** 读本机文件（回答里引用的图片要传去微信）。可注入只为可测 */
  readFile?: (path: string) => Promise<Buffer>
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

/** 通知开关（`weixin.notify` 里的 json）。**缺省全开** */
export interface NotifySettings {
  done: boolean
  error: boolean
  permission: boolean
  quietWhenFocused: boolean
}
export const NOTIFY_DEFAULT: NotifySettings = { done: true, error: true, permission: true, quietWhenFocused: true }
/** 跑完通知的门槛：一问一答的短回合不推 */
export const DONE_MIN_MS = 60_000

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
  private 退订全部: (() => void) | undefined
  private stale = false
  /** 每段会话这一轮从哪一刻开始（用户那条 turn 到的时候） */
  private readonly 回合起点 = new Map<string, number>()
  /** 每段会话已经通知过的权限询问，免得同一问推两次 */
  private readonly 问过的 = new Map<string, string>()
  /** 最近一次推出去的权限询问（微信里回「同意」答的就是它） */
  private 待答: { sessionId: string; requestId: string; title: string; options: readonly { optionId: string; name: string; kind: string }[] } | undefined
  /** 「正在输入」的票（`getconfig` 给的）。没有票就不发 */
  private 输入票: string | undefined
  /** 已经向微信报过「开始」的工具调用，结束时才报结果 */
  private readonly 报过的工具 = new Set<string>()

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

  notifySettings(): NotifySettings {
    try {
      const raw = this.deps.settings.get("weixin.notify")
      return raw ? { ...NOTIFY_DEFAULT, ...(JSON.parse(raw) as Partial<NotifySettings>) } : NOTIFY_DEFAULT
    } catch {
      return NOTIFY_DEFAULT
    }
  }

  setNotifySettings(patch: { [K in keyof NotifySettings]?: boolean | undefined }): NotifySettings {
    const 旧 = this.notifySettings()
    const next: NotifySettings = {
      done: patch.done ?? 旧.done,
      error: patch.error ?? 旧.error,
      permission: patch.permission ?? 旧.permission,
      quietWhenFocused: patch.quietWhenFocused ?? 旧.quietWhenFocused,
    }
    this.deps.settings.set("weixin.notify", JSON.stringify(next), new Date().toISOString())
    return next
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
    this.退订全部 = this.deps.events.onAnyUpdate((u) => void this.该不该通知(u))
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
    this.退订全部?.()
    this.退订全部 = undefined
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
    /**
     * **图片跟着话一起进会话**（T4）：下载解密后按 bytes 交给 `writeToSession`，
     * 与界面上贴图同一条路（协议 4.12）。文件 / 视频 / 语音（无转写）这一版只说收到了。
     */
    let images: { from: "bytes"; data: string; mimeType: string }[] | undefined
    if (入.media?.kind === "image") {
      try {
        const 字节 = await this.deps.client(this.baseUrl()).downloadMedia(入.media.media, 入.media.aesKeyHex)
        images = [{ from: "bytes", data: 字节.toString("base64"), mimeType: 猜图片类型(字节) }]
      } catch (e) {
        await this.回(`图片没下下来：${e instanceof Error ? e.message : String(e)}`)
        return
      }
    } else if (入.media && !text) {
      await this.回(`收到一个${入.media.kind === "voice" ? "语音" : "文件"}，这一版只会看图片和文字。`)
      return
    }
    if (!text && !images) return
    const 答权限 = await this.回答权限(text)
    if (答权限 !== undefined) {
      await this.回(答权限)
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
    // 写权跟着人走：界面选中会话时取一次，微信来一句也取一次——同一个人，同一种持有者
    await this.deps.ops().acquireLease({ sessionId, holder: "user" })
    await this.deps.ops().writeToSession({ sessionId, data: text || "（看图）", as: "user", ...(images ? { images } : {}) })
    void this.正在输入(true)
  }

  /** 认识的命令回一段话；不认识的回 `undefined`，原样进模型 */
  private async 斜杠(text: string): Promise<string | undefined> {
    const [cmd, ...rest] = text.slice(1).split(/\s+/)
    const arg = rest.join(" ")
    switch (cmd) {
      case "帮助":
      case "help":
        return [
          "/会话  列出最近的会话",
          "/用 N  接到第 N 段",
          "/新建  另起一段；/新建 @服务器名 在那台机器上开；/新建 #项目名 在那个项目里开",
          "/停  中止当前这一轮",
          "/在哪  现在绑着哪段、在哪台机器",
          "有权限要你点头时，回「同意」或「拒绝」",
          "别的话直接说就行",
        ].join("\n")
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
        // `@服务器名` 在那台机器上开；`#项目名` 在那个项目（文件夹）里开（作者问的：能不能接到服务器或项目）
        const 服务器 = arg.startsWith("@") ? arg.slice(1) : undefined
        const 项目 = arg.startsWith("#") ? arg.slice(1) : undefined
        let connectionId: string | undefined
        let workspace: string | undefined
        if (服务器) {
          const c = (await this.deps.ops().listConnections()).find((x) => x.label === 服务器)
          if (!c) return `没有叫「${服务器}」的服务器。发 /会话 看看都有哪些。`
          connectionId = c.id
        }
        if (项目) {
          const ps = await this.deps.ops().listProjects()
          const p = ps.find((x) => x.name === 项目 || x.workspace.split("/").pop() === 项目)
          if (!p) return `没有叫「${项目}」的项目。有这些：${ps.map((x) => x.name).join("、") || "（空）"}`
          workspace = p.workspace
        }
        const agentId = this.deps.defaultAgentId()
        if (!agentId) return "配置里还没有可用的 agent。"
        const t = await this.deps.ops().createTask({ agentId, ...(connectionId ? { connectionId } : {}), ...(workspace ? { workspace } : {}) })
        if (!t.sessionId) return "建是建了，却没有会话——这一步不该悄悄过去。"
        await this.bindSession(t.sessionId)
        return 服务器 ? `在「${服务器}」上开了一段新会话，说吧。` : 项目 ? `在项目「${项目}」里开了一段新会话，说吧。` : "开了一段新会话，说吧。"
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

  /* ── 通知（T3） ── */

  /**
   * 三种时刻主动推：跑完（这一轮超过 60 s）、出错（会话非零退出 / 系统提示）、等权限。
   * **听的是所有会话**，不只绑着的那段。窗口在前台时不推（人就在电脑前）。
   */
  private async 该不该通知(u: SessionUpdate): Promise<void> {
    const n = this.notifySettings()
    const sid = u.sessionId
    if (u.type === "item" && u.item.type === "turn") {
      if (u.item.who === "user") {
        this.回合起点.set(sid, this.deps.now?.() ?? Date.now())
        return
      }
      if (u.item.who === "agent" && u.item.final) {
        const 起 = this.回合起点.get(sid)
        this.回合起点.delete(sid)
        if (!n.done || 起 === undefined) return
        const 用了 = (this.deps.now?.() ?? Date.now()) - 起
        if (用了 < DONE_MIN_MS) return
        if (sid === this.deps.settings.get("weixin.sessionId")) return // 绑着的那段回答本身就会送过去
        await this.推(`『${await this.标题(sid)}』跑完了（用时 ${时长(用了)}）。回 /会话 再 /用 N 可接着聊。`, n)
      }
      return
    }
    if (u.type === "state" && u.state === "exited" && u.exitCode !== undefined && u.exitCode !== 0) {
      if (!n.error) return
      await this.推(`『${await this.标题(sid)}』出错退出了（退出码 ${u.exitCode}）。`, n)
      return
    }
    if (u.type === "item" && u.item.type === "notice") {
      if (!n.error) return
      await this.推(`『${await this.标题(sid)}』：${u.item.text}`, n)
      return
    }
    if (u.type === "snapshot") {
      const p = u.snapshot.pendingPermission
      if (!p) {
        if (this.待答?.sessionId === sid) this.待答 = undefined
        return
      }
      if (this.问过的.get(sid) === p.requestId) return
      this.问过的.set(sid, p.requestId)
      this.待答 = { sessionId: sid, requestId: p.requestId, title: p.title, options: p.options }
      if (!n.permission) return
      // 等权限**永远推**，不看前台：它是在等你，不推就卡在那儿
      await this.回(`『${await this.标题(sid)}』想：${p.title}\n回「同意」放行，回「拒绝」不让。`)
    }
  }

  /** 微信里的「同意 / 拒绝」：答最近推出去的那一问。不是这两个词就回 undefined，照常往下走 */
  private async 回答权限(text: string): Promise<string | undefined> {
    const 同意 = /^(同意|允许|可以|好|yes|y|ok)$/i.test(text)
    const 拒绝 = /^(拒绝|不行|不|不要|no|n)$/i.test(text)
    if (!同意 && !拒绝) return undefined
    const p = this.待答
    if (!p) return "现在没有在等你点头的事。"
    const 挑 = (pred: (k: string, name: string) => boolean) => p.options.find((o) => pred(o.kind.toLowerCase(), o.name))
    const 选 = 同意
      ? (挑((k) => k === "allow_once") ?? 挑((k) => k.startsWith("allow")) ?? p.options[0])
      : (挑((k) => k === "reject_once") ?? 挑((k) => k.startsWith("reject")) ?? p.options[p.options.length - 1])
    this.待答 = undefined
    await this.deps.ops().answerPermission({ sessionId: p.sessionId, requestId: p.requestId, ...(选 ? { optionId: 选.optionId } : {}) })
    return 同意 ? `好，放行了：${p.title}` : `已拒绝：${p.title}`
  }

  /**
   * 定时任务跑完了推一句（第二档，2026-08-22）。**跟「跑完通知」同一个开关**（`done` / `error`），
   * 没绑微信就什么都不发；不看「窗口在前台就不推」——定时的事多半发生在人不在的时候，但在也该知道。
   */
  async 定时跑完了(任务名: string, 状态: "succeeded" | "failed" | "cancelled", 摘要: string | undefined, 何时: string): Promise<void> {
    const n = this.notifySettings()
    if (状态 === "succeeded" ? !n.done : !n.error) return
    const 头 = 状态 === "succeeded" ? `⏰ 定时「${任务名}」跑完了（${何时}）` : 状态 === "failed" ? `⏰ 定时「${任务名}」失败了（${何时}）` : `⏰ 定时「${任务名}」取消了（${何时}）`
    await this.回(摘要 ? `${头}\n${摘要.slice(0, 1500)}` : 头)
  }

  private async 推(text: string, n: NotifySettings): Promise<void> {
    if (n.quietWhenFocused && this.deps.isForeground?.()) return
    await this.回(text)
  }

  private async 标题(sessionId: string): Promise<string> {
    const t = (await this.deps.ops().listTasks()).find((x) => x.sessionId === sessionId)
    return t?.title ?? "新会话"
  }

  /* ── 出站 ── */

  private async 会话有动静(u: SessionUpdate): Promise<void> {
    const s = this.deps.settings.get("weixin.sessionId")
    if (!s || u.sessionId !== s || u.type !== "item") return
    /**
     * **工具调用映成进度条目**（T4）：微信客户端会画成「正在用 bash…」。
     * 开始报一次、结束报一次，只报结束不报开始的话微信那头没有对应的起点。
     */
    if (u.item.type === "tool") {
      const 工具 = u.item
      const 键 = `${s}:${工具.id}`
      if (工具.status === "running" && !this.报过的工具.has(键)) {
        this.报过的工具.add(键)
        await this.发进度(() => this.deps.client(this.baseUrl()).sendToolStart(this.token()!, this.主人()!, 工具.name, 工具.id, this.ctx()))
      } else if (工具.status !== "running" && this.报过的工具.has(键)) {
        this.报过的工具.delete(键)
        const status = 工具.status === "ok" ? "completed" : "failed"
        await this.发进度(() => this.deps.client(this.baseUrl()).sendToolResult(this.token()!, this.主人()!, 工具.name, 工具.id, status, this.ctx()))
      }
      return
    }
    if (u.item.type !== "turn" || u.item.who !== "agent" || !u.item.final) return
    const text = u.item.text.trim()
    void this.正在输入(false)
    if (text) await this.回(text)
    await this.把图发过去(text)
  }

  /** 回答里引用的本机图片（绝对路径，png/jpg/gif/webp）传去微信，最多 3 张 */
  private async 把图发过去(text: string): Promise<void> {
    const 路径们 = [...new Set(text.match(/(?:\/[^\s"'()<>`]+)\.(?:png|jpe?g|gif|webp)/gi) ?? [])].slice(0, 3)
    if (路径们.length === 0) return
    const token = this.token()
    const to = this.主人()
    if (!token || !to) return
    const client = this.deps.client(this.baseUrl())
    for (const p of 路径们) {
      try {
        const 字节 = await (this.deps.readFile ?? ((f: string) => readFile(f)))(p)
        const up = await client.uploadMedia(token, to, 1, 字节)
        await client.sendItem(token, to, imageItem(up), this.ctx())
      } catch (e) {
        this.log(`图片 ${p} 没传去微信：${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  private async 发进度(f: () => Promise<unknown>): Promise<void> {
    if (!this.token() || !this.主人()) return
    await f().catch((e: unknown) => this.log(`进度没发出去：${e instanceof Error ? e.message : String(e)}`))
  }

  /** 「正在输入」：要先拿一张票；拿不到就算了（插件也是这么做的），绝不为它报错 */
  private async 正在输入(开: boolean): Promise<void> {
    const token = this.token()
    const user = this.主人()
    if (!token || !user) return
    const client = this.deps.client(this.baseUrl())
    try {
      if (this.输入票 === undefined) this.输入票 = (await client.getConfig(token, user, this.ctx())).typingTicket
      if (!this.输入票) return
      await client.sendTyping(token, user, this.输入票, 开)
    } catch {
      /* 正在输入只是礼貌，失败不出声 */
    }
  }

  private token(): string | undefined {
    return this.deps.credentials.get(WEIXIN_TOKEN_KEY)
  }
  private 主人(): string | undefined {
    return this.deps.settings.get("weixin.userId")
  }
  private ctx(): string | undefined {
    return this.deps.settings.get("weixin.contextToken")
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

function 时长(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  return `${m} 分 ${s % 60} 秒`
}

/** 按文件头猜图片类型；猜不出按 jpeg（微信发来的绝大多数是它） */
function 猜图片类型(b: Buffer): string {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b.length >= 6 && b.toString("ascii", 0, 6).startsWith("GIF8")) return "image/gif"
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp"
  return "image/jpeg"
}
