/**
 * 飞书通道:把飞书里的话接到会话,把会话的回答送回飞书。远程助理第二格,2026-08-25。
 *
 * 设计:`docs/superpowers/specs/2026-08-25-飞书通道-design.md`;
 * 骨架同构 `../weixin/channel.ts`(**刻意不共享模块**——两个通道不值一笔抽象税,
 * dsh-im-bot 用统一接口换来的是飞书能力被抹平成交集;第三个通道进来再抽,
 * 且必须带 capability 声明。规格 §三)。
 *
 * ## 与微信的差异(其余语义整套平移)
 *
 * - 绑定 = 官方设备流(扫码即建应用),**没有配对码**;confirmed 时拿到
 *   appId + appSecret + 扫码人 openId,secret 进钥匙串。
 * - 听 = WS 长连接(sdk.连接),不是长轮询;连接健康位如实进状态卡。
 * - 只收 p2p 的 text;去重靠 messageId(内存 Set + settings 持久环形 1000——
 *   WS 重投与重启重放都要挡住,dsh-im-bot 的飞书通道就漏了这条)。
 * - 收到打 Reaction「OnIt」,回答发完撤掉换「DONE」,失败换「ERROR」。
 * - 发文本按 9000 字切段(dsh-feishu splitText 口径),无 typing、无工具进度
 *   (飞书 v1 没有对应形态)。
 *
 * ## 安全(平移微信)
 *
 * - **只认扫码那个人**(openId)。别人发来的一律不回,记一条日志。
 * - appSecret 在钥匙串(`feishu:appSecret`),不落设置表。
 */
import type { FeishuSdk, 入站消息, 设备流回执 } from "./sdk.js"
import type { SessionUpdate } from "../../protocol/events.js"
import type { TaskSummary } from "../../protocol/entities.js"

export const FEISHU_SECRET_KEY = "feishu:appSecret"

export type FeishuState = "unbound" | "logging_in" | "bound" | "stale"

export interface FeishuLoginView {
  qrUrl: string
  step: "wait" | "confirmed" | "failed"
  message: string
}

export interface FeishuStatus {
  state: FeishuState
  login?: FeishuLoginView | undefined
  openId?: string | undefined
  boundAt?: string | undefined
  sessionId?: string | undefined
  lastError?: string | undefined
  contactName: string
}

/** 后端操作的子集。**只用这几个**——列在这儿就是契约(与微信同一张表) */
export interface FeishuOps {
  createTask(req: { agentId: string; workspace?: string; connectionId?: string }): Promise<TaskSummary>
  listTasks(): Promise<readonly TaskSummary[]>
  listConnections(): Promise<readonly { id: string; label: string }[]>
  writeToSession(req: { sessionId: string; data: string; as: "user" }): Promise<unknown>
  acquireLease(req: { sessionId: string; holder: "user" }): Promise<unknown>
  abortSession(req: { sessionId: string }): Promise<unknown>
  subscribeSession(req: { sessionId: string }): Promise<unknown>
  answerPermission(req: { sessionId: string; requestId: string; optionId?: string }): Promise<unknown>
  listProjects(): Promise<readonly { projectId: string; name: string; workspace: string }[]>
}

export type FeishuSettingKey =
  | "feishu.appId"
  | "feishu.openId"
  | "feishu.domain"
  | "feishu.sessionId"
  | "feishu.boundAt"
  | "feishu.notify"
  | "feishu.seenIds"

export interface FeishuDeps {
  sdk: () => FeishuSdk
  settings: {
    get(key: FeishuSettingKey): string | undefined
    set(key: FeishuSettingKey, value: string, now: string): void
  }
  credentials: { get(k: string): string | undefined; set(k: string, v: string): void; delete(k: string): void }
  events: {
    onUpdate(cb: (u: SessionUpdate) => void): () => void
    onAnyUpdate(cb: (u: SessionUpdate) => void): () => void
    pin(id: string): void
    unpin(id: string): void
  }
  isForeground?: () => boolean
  ops: () => FeishuOps
  defaultAgentId: () => string | undefined
  whereIs: (sessionId: string) => { label?: string; cwd?: string } | undefined
  log?: (line: string) => void
  now?: () => number
}

export const FEISHU_CONTACT_NAME = "DAWN-Science"

/** 通知开关(`feishu.notify` 里的 json)。**缺省全开**——与微信同一张表 */
export interface FeishuNotifySettings {
  done: boolean
  error: boolean
  permission: boolean
  quietWhenFocused: boolean
}
export const FEISHU_NOTIFY_DEFAULT: FeishuNotifySettings = { done: true, error: true, permission: true, quietWhenFocused: true }
export const FEISHU_DONE_MIN_MS = 60_000

/** 飞书单条上限(dsh-feishu splitText 口径):9000 字,优先按换行切 */
export function 切段9000(text: string, 上限 = 9000): string[] {
  const 出: string[] = []
  let 余 = text
  while (余.length > 上限) {
    let 切 = 余.lastIndexOf("\n", 上限)
    if (切 <= 0) 切 = 上限
    出.push(余.slice(0, 切))
    余 = 余.slice(切).replace(/^\n/, "")
  }
  if (余) 出.push(余)
  return 出
}

const 已见上限 = 1000

export class FeishuChannel {
  private login: FeishuLoginView | undefined
  private 登录中止: AbortController | undefined
  private 连接: { stop(): void } | undefined
  private lastError: string | undefined
  private 退订: (() => void) | undefined
  private 退订全部: (() => void) | undefined
  private stale = false
  private readonly 回合起点 = new Map<string, number>()
  private readonly 问过的 = new Map<string, string>()
  private 待答:
    | { sessionId: string; requestId: string; title: string; options: readonly { optionId: string; name: string; kind: string }[] }
    | undefined
  /** 内存去重(持久那份在 settings feishu.seenIds) */
  private readonly 已见 = new Set<string>()
  /** 正在处理(打了 OnIt 还没收尾)的入站消息:回答送出后好换 DONE */
  private 处理中消息: string | undefined

  constructor(private readonly deps: FeishuDeps) {}

  /* ── 状态 ── */

  status(): FeishuStatus {
    const appId = this.deps.settings.get("feishu.appId")
    const secret = this.deps.credentials.get(FEISHU_SECRET_KEY)
    const state: FeishuState = this.login ? "logging_in" : appId && secret ? (this.stale ? "stale" : "bound") : "unbound"
    return {
      state,
      login: this.login,
      openId: this.deps.settings.get("feishu.openId"),
      boundAt: this.deps.settings.get("feishu.boundAt"),
      sessionId: this.deps.settings.get("feishu.sessionId"),
      lastError: this.lastError,
      contactName: FEISHU_CONTACT_NAME,
    }
  }

  notifySettings(): FeishuNotifySettings {
    try {
      const raw = this.deps.settings.get("feishu.notify")
      return raw ? { ...FEISHU_NOTIFY_DEFAULT, ...(JSON.parse(raw) as Partial<FeishuNotifySettings>) } : FEISHU_NOTIFY_DEFAULT
    } catch {
      return FEISHU_NOTIFY_DEFAULT
    }
  }

  setNotifySettings(patch: { [K in keyof FeishuNotifySettings]?: boolean | undefined }): FeishuNotifySettings {
    const 旧 = this.notifySettings()
    const next: FeishuNotifySettings = {
      done: patch.done ?? 旧.done,
      error: patch.error ?? 旧.error,
      permission: patch.permission ?? 旧.permission,
      quietWhenFocused: patch.quietWhenFocused ?? 旧.quietWhenFocused,
    }
    this.deps.settings.set("feishu.notify", JSON.stringify(next), new Date().toISOString())
    return next
  }

  /* ── 绑定 ── */

  /** 开始设备流。**立刻返回**,状态机在后台走;界面轮 `status()` 看进度 */
  async startLogin(): Promise<void> {
    if (this.login) return
    const 中止 = new AbortController()
    this.登录中止 = 中止
    this.login = { qrUrl: "", step: "wait", message: "正在向飞书要二维码…" }
    void (async () => {
      try {
        const 回: 设备流回执 = await this.deps.sdk().注册应用(
          { name: FEISHU_CONTACT_NAME, desc: "DAWN Science 的远程助理——对它说话就是对工作台说话" },
          (url) => {
            this.login = { qrUrl: url, step: "wait", message: "用飞书扫一扫(会创建一个自建应用,扫码的人就是唯一授权人)" }
          },
          中止.signal,
        )
        const now = new Date(this.deps.now?.() ?? Date.now()).toISOString()
        this.deps.credentials.set(FEISHU_SECRET_KEY, 回.appSecret)
        this.deps.settings.set("feishu.appId", 回.appId, now)
        this.deps.settings.set("feishu.openId", 回.openId, now)
        this.deps.settings.set("feishu.domain", 回.domain, now)
        this.deps.settings.set("feishu.boundAt", now, now)
        this.stale = false
        this.login = { ...(this.login ?? { qrUrl: "" }), step: "confirmed", message: "绑好了" } as FeishuLoginView
        this.log(`绑定成功 app=${回.appId} user=${遮(回.openId)}`)
        this.start()
      } catch (e) {
        if (中止.signal.aborted) return
        this.login = {
          ...(this.login ?? { qrUrl: "" }),
          step: "failed",
          message: e instanceof Error ? e.message : String(e),
        } as FeishuLoginView
      } finally {
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

  cancelLogin(): void {
    this.登录中止?.abort()
    this.login = undefined
    this.登录中止 = undefined
  }

  async unbind(): Promise<void> {
    // 先取消进行中的设备流(审查 debug D4):否则手机确认后凭证会被写回来、还 start()
    this.cancelLogin()
    this.stop()
    this.deps.credentials.delete(FEISHU_SECRET_KEY)
    const now = new Date().toISOString()
    // 清 sessionId 并 unpin(审查 debug D5):换人绑定不落进前一个人的会话
    const 旧会话 = this.deps.settings.get("feishu.sessionId")
    if (旧会话) this.deps.events.unpin(旧会话)
    for (const k of ["feishu.appId", "feishu.openId", "feishu.domain", "feishu.boundAt", "feishu.seenIds", "feishu.sessionId"] as const) {
      this.deps.settings.set(k, "", now)
    }
    this.stale = false
    this.lastError = undefined
  }

  async bindSession(sessionId: string): Promise<void> {
    const 旧 = this.deps.settings.get("feishu.sessionId")
    if (旧 && 旧 !== sessionId) this.deps.events.unpin(旧)
    this.deps.settings.set("feishu.sessionId", sessionId, new Date().toISOString())
    await this.deps.ops().subscribeSession({ sessionId }).catch(() => {})
    this.deps.events.pin(sessionId)
  }

  /* ── 长连接 ── */

  /** 进程启动(或刚绑好)时调:有凭证就连上听 */
  start(): void {
    if (this.连接) return
    const 凭 = this.凭据()
    if (!凭) return
    const 已绑 = this.deps.settings.get("feishu.sessionId")
    if (已绑) void this.bindSession(已绑)
    this.退订 = this.deps.events.onUpdate((u) => void this.会话有动静(u))
    this.退订全部 = this.deps.events.onAnyUpdate((u) => void this.该不该通知(u))
    // 持久去重读回内存
    try {
      for (const id of JSON.parse(this.deps.settings.get("feishu.seenIds") || "[]") as string[]) this.已见.add(id)
    } catch {
      /* 读不懂就从空开始——去重是防重放,不是账本 */
    }
    this.连接 = this.deps.sdk().连接(
      凭,
      (m) => void this.收到(m).catch((e) => this.log(`处理入站失败:${String(e)}`)),
      (s) => {
        if (s === "ready") this.lastError = undefined
        else if (s === "reconnecting") this.lastError = "飞书连接中断,重连中"
        else this.lastError = "飞书连接断了(stop 或出错)"
      },
    )
  }

  stop(): void {
    this.连接?.stop()
    this.连接 = undefined
    this.退订?.()
    this.退订 = undefined
    this.退订全部?.()
    this.退订全部 = undefined
  }

  /* ── 入站 ── */

  private async 收到(入: 入站消息): Promise<void> {
    const 主人 = this.deps.settings.get("feishu.openId")
    if (!主人 || 入.openId !== 主人) {
      this.log(`拒绝来自 ${遮(入.openId)} 的消息:不是绑定的那个人`)
      return
    }
    // **去重最前**(审查 debug D12):任何回复/回信之前先挡重投,否则非 text/群消息在
    // 去重之前就回信,WS 重连重投同一 messageId 会重复回复。
    if (this.已见.has(入.messageId)) return
    if (入.chatType !== "p2p") {
      this.记已见(入.messageId)
      this.log(`忽略非私聊消息(${入.chatType})——v1 只私聊`)
      return
    }
    if (入.messageType !== "text") {
      this.记已见(入.messageId)
      await this.回(`收到一条${入.messageType}消息——这一版只看文字。`)
      return
    }
    this.记已见(入.messageId)
    const text = 入.text.trim()
    if (!text) return
    // 收到即打「处理中」;礼貌失败不出声
    await this.表情(入.messageId, "OnIt", "create")
    // **立即回复类(权限/斜杠)自己收尾,不占处理中单槽**(审查 debug D7):
    // 它们不进会话,若占用 this.处理中消息 会干扰后续进会话消息的 DONE 收尾。
    const 答权限 = await this.回答权限(text)
    if (答权限 !== undefined) {
      await this.回(答权限)
      await this.收尾表情(入.messageId, "DONE")
      return
    }
    if (text.startsWith("/")) {
      const 答 = await this.斜杠(text)
      if (答 !== undefined) {
        await this.回(答)
        await this.收尾表情(入.messageId, "DONE")
        return
      }
    }
    // 进会话的消息:设单槽,会话最终回答回来时收尾(会话有动静)。
    // 注:两条正经问题同时在飞时单槽仍会覆盖(审查 debug D6),彻底修需 per-会话串行队列,单列。
    this.处理中消息 = 入.messageId
    try {
      const sessionId = await this.确保有会话()
      await this.deps.ops().acquireLease({ sessionId, holder: "user" })
      await this.deps.ops().writeToSession({ sessionId, data: text, as: "user" })
    } catch (e) {
      await this.收尾表情(入.messageId, "ERROR")
      throw e
    }
  }

  private 记已见(id: string): void {
    this.已见.add(id)
    // 持久环形:只留最后 1000 条
    const 列 = [...this.已见]
    const 存 = 列.slice(Math.max(0, 列.length - 已见上限))
    if (存.length < 列.length) {
      this.已见.clear()
      for (const x of 存) this.已见.add(x)
    }
    this.deps.settings.set("feishu.seenIds", JSON.stringify(存), new Date().toISOString())
  }

  /** 认识的命令回一段话;不认识的回 `undefined`,原样进模型(与微信逐字同源) */
  private async 斜杠(text: string): Promise<string | undefined> {
    const [cmd, ...rest] = text.slice(1).split(/\s+/)
    const arg = rest.join(" ")
    switch (cmd) {
      case "帮助":
      case "help":
        return [
          "/会话  列出最近的会话",
          "/用 N  接到第 N 段",
          "/新建  另起一段;/新建 @服务器名 在那台机器上开;/新建 #项目名 在那个项目里开",
          "/停  中止当前这一轮",
          "/在哪  现在绑着哪段、在哪台机器",
          "有权限要你点头时,回「同意」或「拒绝」",
          "别的话直接说就行",
        ].join("\n")
      case "会话": {
        const 列 = await this.最近的()
        if (列.length === 0) return "还没有会话。直接说话就会新建一段。"
        const 当前 = this.deps.settings.get("feishu.sessionId")
        return 列.map((t, i) => `${t.sessionId === 当前 ? "▶" : " "} ${i + 1}. ${t.title ?? "新会话"}${t.connectionId ? " ·服务器" : ""}`).join("\n")
      }
      case "用": {
        const n = Number(arg)
        const 列 = await this.最近的()
        const t = 列[n - 1]
        if (!Number.isInteger(n) || !t?.sessionId) return `没有第 ${arg} 段。发 /会话 看清单。`
        await this.bindSession(t.sessionId)
        return `好,接到「${t.title ?? "新会话"}」了。`
      }
      case "新建": {
        const 服务器 = arg.startsWith("@") ? arg.slice(1) : undefined
        const 项目 = arg.startsWith("#") ? arg.slice(1) : undefined
        let connectionId: string | undefined
        let workspace: string | undefined
        if (服务器) {
          const c = (await this.deps.ops().listConnections()).find((x) => x.label === 服务器)
          if (!c) return `没有叫「${服务器}」的服务器。`
          connectionId = c.id
        }
        if (项目) {
          const ps = await this.deps.ops().listProjects()
          const p = ps.find((x) => x.name === 项目 || x.workspace.split("/").pop() === 项目)
          if (!p) return `没有叫「${项目}」的项目。有这些:${ps.map((x) => x.name).join("、") || "(空)"}`
          workspace = p.workspace
        }
        const agentId = this.deps.defaultAgentId()
        if (!agentId) return "配置里还没有可用的 agent。"
        const t = await this.deps.ops().createTask({ agentId, ...(connectionId ? { connectionId } : {}), ...(workspace ? { workspace } : {}) })
        if (!t.sessionId) return "建是建了,却没有会话——这一步不该悄悄过去。"
        await this.bindSession(t.sessionId)
        return 服务器 ? `在「${服务器}」上开了一段新会话,说吧。` : 项目 ? `在项目「${项目}」里开了一段新会话,说吧。` : "开了一段新会话,说吧。"
      }
      case "停": {
        const s = this.deps.settings.get("feishu.sessionId")
        if (!s) return "现在没绑着会话。"
        await this.deps.ops().abortSession({ sessionId: s })
        return "已中止这一轮。"
      }
      case "在哪": {
        const s = this.deps.settings.get("feishu.sessionId")
        if (!s) return "还没绑会话。直接说话就会新建一段。"
        const t = (await this.deps.ops().listTasks()).find((x) => x.sessionId === s)
        const w = this.deps.whereIs(s)
        return [`绑着「${t?.title ?? "新会话"}」`, w?.label ? `机器:${w.label}` : "本机", (w?.cwd ?? t?.workspace) ? `目录:${w?.cwd ?? t?.workspace}` : undefined]
          .filter(Boolean)
          .join("\n")
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
    const 有 = this.deps.settings.get("feishu.sessionId")
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

  /* ── 通知(与微信同一张表) ── */

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
        if (用了 < FEISHU_DONE_MIN_MS) return
        if (sid === this.deps.settings.get("feishu.sessionId")) return
        await this.推(`『${await this.标题(sid)}』跑完了(用时 ${时长(用了)})。回 /会话 再 /用 N 可接着聊。`, n)
      }
      return
    }
    if (u.type === "state" && u.state === "exited" && u.exitCode !== undefined && u.exitCode !== 0) {
      if (!n.error) return
      await this.推(`『${await this.标题(sid)}』出错退出了(退出码 ${u.exitCode})。`, n)
      return
    }
    if (u.type === "item" && u.item.type === "notice") {
      if (!n.error) return
      await this.推(`『${await this.标题(sid)}』:${u.item.text}`, n)
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
      // **不推 = 不设待答**(审查 debug D2):没在飞书里见过的询问,不该能被「同意」放行
      if (!n.permission) return
      this.待答 = { sessionId: sid, requestId: p.requestId, title: p.title, options: p.options }
      // 等权限**永远推**,不看前台:它是在等你,不推就卡在那儿
      await this.回(`『${await this.标题(sid)}』想:${p.title}\n回「同意」放行,回「拒绝」不让。`)
    }
  }

  private async 回答权限(text: string): Promise<string | undefined> {
    const 同意 = /^(同意|允许|可以|好|yes|y|ok)$/i.test(text)
    const 拒绝 = /^(拒绝|不行|不|不要|no|n)$/i.test(text)
    if (!同意 && !拒绝) return undefined
    const p = this.待答
    if (!p) return "现在没有在等你点头的事。"
    const 挑 = (pred: (k: string) => boolean) => p.options.find((o) => pred(o.kind.toLowerCase()))
    const 选 = 同意
      ? (挑((k) => k === "allow_once") ?? 挑((k) => k.startsWith("allow")) ?? p.options[0])
      : (挑((k) => k === "reject_once") ?? 挑((k) => k.startsWith("reject")) ?? p.options[p.options.length - 1])
    this.待答 = undefined
    await this.deps.ops().answerPermission({ sessionId: p.sessionId, requestId: p.requestId, ...(选 ? { optionId: 选.optionId } : {}) })
    return 同意 ? `好,放行了:${p.title}` : `已拒绝:${p.title}`
  }

  /** 定时任务跑完了推一句(与微信同口径:跟 done/error 开关,不看前台) */
  async 定时跑完了(任务名: string, 状态: "succeeded" | "failed" | "cancelled", 摘要: string | undefined, 何时: string): Promise<void> {
    const n = this.notifySettings()
    if (状态 === "succeeded" ? !n.done : !n.error) return
    const 头 =
      状态 === "succeeded" ? `⏰ 定时「${任务名}」跑完了(${何时})` : 状态 === "failed" ? `⏰ 定时「${任务名}」失败了(${何时})` : `⏰ 定时「${任务名}」取消了(${何时})`
    await this.回(摘要 ? `${头}\n${摘要.slice(0, 1500)}` : 头)
  }

  private async 推(text: string, n: FeishuNotifySettings): Promise<void> {
    if (n.quietWhenFocused && this.deps.isForeground?.()) return
    await this.回(text)
  }

  private async 标题(sessionId: string): Promise<string> {
    const t = (await this.deps.ops().listTasks()).find((x) => x.sessionId === sessionId)
    return t?.title ?? "新会话"
  }

  /* ── 出站 ── */

  private async 会话有动静(u: SessionUpdate): Promise<void> {
    const s = this.deps.settings.get("feishu.sessionId")
    if (!s || u.sessionId !== s || u.type !== "item") return
    if (u.item.type !== "turn" || u.item.who !== "agent" || !u.item.final) return
    const text = u.item.text.trim()
    if (text) await this.回(text)
    // 回答送出去了:把「处理中」换成「完成」
    if (this.处理中消息) {
      await this.收尾表情(this.处理中消息, "DONE")
      this.处理中消息 = undefined
    }
  }

  private async 回(text: string): Promise<void> {
    const 凭 = this.凭据()
    const to = this.deps.settings.get("feishu.openId")
    if (!凭 || !to) return
    for (const 段 of 切段9000(text)) {
      try {
        await this.deps.sdk().发文本(凭, to, 段)
      } catch (e) {
        this.lastError = `发到飞书失败:${e instanceof Error ? e.message : String(e)}`
        this.log(this.lastError)
        return
      }
    }
  }

  private async 表情(messageId: string, emoji: string, 动作: "create" | "delete"): Promise<void> {
    const 凭 = this.凭据()
    if (!凭) return
    await this.deps.sdk().表情(凭, messageId, emoji, 动作).catch((e: unknown) => this.log(`表情没打上:${e instanceof Error ? e.message : String(e)}`))
  }

  /** 收尾:撤 OnIt、打终态(DONE / ERROR)。礼貌失败不出声 */
  private async 收尾表情(messageId: string, 终态: "DONE" | "ERROR"): Promise<void> {
    await this.表情(messageId, "OnIt", "delete")
    await this.表情(messageId, 终态, "create")
  }

  private 凭据(): { appId: string; appSecret: string; domain: "feishu" | "lark" } | undefined {
    const appId = this.deps.settings.get("feishu.appId")
    const appSecret = this.deps.credentials.get(FEISHU_SECRET_KEY)
    if (!appId || !appSecret) return undefined
    return { appId, appSecret, domain: this.deps.settings.get("feishu.domain") === "lark" ? "lark" : "feishu" }
  }

  private log(line: string): void {
    this.deps.log?.(`[飞书] ${line}`)
  }
}

function 遮(id: string): string {
  return id.length <= 6 ? "***" : `${id.slice(0, 3)}***${id.slice(-3)}`
}

function 时长(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  return `${m} 分 ${s % 60} 秒`
}
