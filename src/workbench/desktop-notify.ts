/**
 * 桌面通知的判断（2026-09-27，spec `2026-09-27-桌面通知-design.md`）。
 *
 * **这里只判「弹不弹、弹什么、角标几」，不碰系统**——出口是注入的（`src/electron/desktop-notify.ts`），
 * 与 `isForeground` / `openPath` / `trashItem` 同一个注入缝，所以整个判断在 node 下可测。
 *
 * 听的与微信 / 飞书同一处（`events.onAnyUpdate`），设置同一个形状（`{ done, error, permission, quietWhenFocused }`）。
 * 不同的两处写在 spec §3.1：「做完」认 runtime 的 `idle`（中枢的 `on回合收尾`），不认每次模型响应都会立的 `final`；
 * 「出错」只认带 `failed` 的提示，不认换模型、MCP 那类 notice。
 */
import type { SessionUpdate, TranscriptItem } from "../protocol/index.js"
import type { SessionId } from "../runtime/types.js"
import type { 回合收尾 } from "./events.js"

export type 通知语言 = "zh" | "en"

/** 设置表 `desktop.notify` 那把键里的 json。**缺省全开**——与微信 `NOTIFY_DEFAULT` 同一张表（spec §0 第 1 条） */
export interface 桌面通知设置 {
  done: boolean
  error: boolean
  permission: boolean
  quietWhenFocused: boolean
  /** 通知用哪种语言（界面报来的，spec §0 第 6 条）。缺省 = 出口按系统语言 */
  lang?: 通知语言 | undefined
}
export const 桌面通知缺省: 桌面通知设置 = { done: true, error: true, permission: true, quietWhenFocused: true }

/** 一句话：键是中文原文，出口按语言查 `EN`。`{0}` 起是原样透传的那段 */
export interface 文案 {
  msgid: string
  args: string[]
}
export type 通知种类 = "done" | "error" | "permission" | "schedule" | "test"
export interface 桌面通知条 {
  kind: 通知种类
  /** 点它回到哪段。「发一条试试」、没拿到会话的定时没有 */
  sessionId?: string | undefined
  title: 文案
  body: 文案
  lang?: 通知语言 | undefined
}

/** 出口（主进程实现）。**缺了它判断照做，只是弹不出来**——`试一条()` 会如实说 */
export interface 桌面通知出口 {
  弹(n: 桌面通知条): void
  角标(count: number): void
  /** 窗口回到前台时叫一声（角标据此划掉看见了的那几段）。返回退订 */
  前台变了(cb: () => void): () => void
  /** 这台系统弹不弹得出来（Electron `Notification.isSupported()`） */
  支持(): boolean
}

/**
 * 通知里所有的话。**这张表里每一句 `EN` 里都得有**（单元测试扫）。
 * 原样透传的那段不在表里：它是 `{ msgid: "{0}", args: [原话] }`，出口查不到英文就原样出。
 */
export const 通知文案 = {
  做完: "「{0}」做完了",
  做完无题: "一段对话做完了",
  出错: "「{0}」出错了",
  出错无题: "一段对话出错了",
  等点头: "「{0}」在等你点头",
  等点头无题: "一段对话在等你点头",
  没有文字: "（没有文字回复）",
  退出码: "会话退出了（退出码 {0}）",
  定时成: "定时「{0}」跑完了",
  定时败: "定时「{0}」失败了",
  定时消: "定时「{0}」取消了",
  试标题: "桌面通知是通的",
  试正文: "点这一条会回到 DAWN。",
} as const

const 文 = (msgid: string, ...args: string[]): 文案 => ({ msgid, args })
const 原话 = (s: string): 文案 => ({ msgid: "{0}", args: [s] })
const 正文最多字 = 120
/** 一行、最多 120 字。通知中心只画两三行，多了也是被截 */
function 截(s: string): string {
  const 一行 = s.replace(/\s+/g, " ").trim()
  return 一行.length > 正文最多字 ? `${一行.slice(0, 正文最多字)}…` : 一行
}

/** 收尾后等多久才报「做完了」：这期间这段又动了（排着的下一句、调整方向接着跑）就作废（spec §3.3） */
export const 收尾静候毫秒 = 1_000
/** 没有「一轮」可言的会话：终端是字节流，纯内核会话每执行一段就 idle 一次 */
const 不报的种类: ReadonlySet<string> = new Set(["pty", "kernel"])

type 设置表 = {
  get(k: "desktop.notify"): string | undefined
  set(k: "desktop.notify", v: string, now: string): void
}

export function 读桌面设置(s: Pick<设置表, "get"> | undefined): 桌面通知设置 {
  try {
    const raw = s?.get("desktop.notify")
    return raw ? { ...桌面通知缺省, ...(JSON.parse(raw) as Partial<桌面通知设置>) } : 桌面通知缺省
  } catch {
    return 桌面通知缺省
  }
}

export function 写桌面设置(s: 设置表, patch: { [K in keyof 桌面通知设置]?: 桌面通知设置[K] | undefined }): 桌面通知设置 {
  const 旧 = 读桌面设置(s)
  const lang = patch.lang ?? 旧.lang
  const next: 桌面通知设置 = {
    done: patch.done ?? 旧.done,
    error: patch.error ?? 旧.error,
    permission: patch.permission ?? 旧.permission,
    quietWhenFocused: patch.quietWhenFocused ?? 旧.quietWhenFocused,
    ...(lang ? { lang } : {}),
  }
  s.set("desktop.notify", JSON.stringify(next), new Date().toISOString())
  return next
}

export interface 桌面通知依赖 {
  events: {
    onAnyUpdate(cb: (u: SessionUpdate) => void): () => void
    on回合收尾(cb: (v: 回合收尾) => void): () => void
    peek(sid: SessionId): { kind: string; items: readonly TranscriptItem[] } | undefined
  }
  设置: () => 桌面通知设置
  /** 窗口在不在前台。与微信那个 `isForeground` 是同一个函数 */
  前台: () => boolean
  /** 这段此刻在不在屏上（主区那段，或坞里挂着的那段——后端从 `setSideSession` 知道） */
  在屏上: (sid: SessionId) => boolean
  标题of: (sid: SessionId) => string | undefined
  /** 这段按过几次停止（`abortSession` / `stopSession` 各加一）。一轮里变了 = 人停的，不是做完 */
  停过几次: (sid: SessionId) => number
  出口?: 桌面通知出口 | undefined
  静候毫秒?: number
}

export class 桌面通知器 {
  /** 弹过、还没看的那几段，记着是为哪种弹的（权限卡被答掉只划「为权限弹的」） */
  private readonly 未看 = new Map<SessionId, 通知种类>()
  /** 已经弹过的那张权限卡（按 requestId 去重，与微信 `问过的` 同一手法） */
  private readonly 问过的 = new Map<SessionId, string>()
  private readonly 起轮时停过 = new Map<SessionId, number>()
  private readonly 候着 = new Map<SessionId, ReturnType<typeof setTimeout>>()
  /** 定时开的那几段：它们自己的收尾不报，由调度器报一条「定时…」 */
  private readonly 定时的 = new Set<SessionId>()
  /** 定时已经报过结束的：人从下一句起接着聊，就按普通会话算 */
  private readonly 定时完了 = new Set<SessionId>()
  private readonly 退订: (() => void)[] = []

  constructor(private readonly d: 桌面通知依赖) {
    this.退订.push(d.events.onAnyUpdate((u) => this.有动静(u)))
    this.退订.push(d.events.on回合收尾((v) => this.收尾(v)))
    const 退 = d.出口?.前台变了(() => this.看见了())
    if (退) this.退订.push(退)
  }

  /** 开关开着，且不是「人正看着那段」 */
  private 该弹(种类: "done" | "error" | "permission", sid: SessionId | undefined): boolean {
    const n = this.d.设置()
    if (!n[种类]) return false
    return !(n.quietWhenFocused && sid !== undefined && this.d.前台() && this.d.在屏上(sid))
  }

  private 有动静(u: SessionUpdate): void {
    const sid = u.sessionId
    if (u.type === "item" && u.item.type === "turn") {
      // 又动了：候着的「做完了」作废。**已 final 的 agent 条目被回填 usage 不算**——那是收尾的一部分
      if (u.item.who === "user" || !u.item.final) this.不候(sid)
      if (u.item.who === "user") {
        this.起轮时停过.set(sid, this.d.停过几次(sid))
        if (this.定时完了.delete(sid)) this.定时的.delete(sid)
      }
      return
    }
    if (u.type === "snapshot") {
      const p = u.snapshot.pendingPermission
      if (!p) {
        this.问过的.delete(sid)
        if (this.未看.get(sid) === "permission") this.划掉(sid)
        return
      }
      if (this.问过的.get(sid) === p.requestId) return
      this.问过的.set(sid, p.requestId)
      if (this.定时的.has(sid) || !this.该弹("permission", sid)) return
      this.发(sid, "permission", [通知文案.等点头, 通知文案.等点头无题], 原话(截(p.title.split("\n")[0] ?? p.title)))
      return
    }
    if (u.type === "state" && u.state === "exited" && u.exitCode !== undefined && u.exitCode !== 0) {
      const kind = this.d.events.peek(sid)?.kind
      if (kind === undefined || 不报的种类.has(kind) || this.定时的.has(sid)) return
      this.不候(sid)
      if (this.该弹("error", sid)) this.发(sid, "error", [通知文案.出错, 通知文案.出错无题], 文(通知文案.退出码, String(u.exitCode)))
    }
  }

  private 收尾(v: 回合收尾): void {
    const sid = v.sessionId
    if (不报的种类.has(v.kind) || this.定时的.has(sid)) return
    const 停过 = this.起轮时停过.get(sid)
    this.起轮时停过.delete(sid)
    this.不候(sid)
    if (v.失败 !== undefined) {
      if (this.该弹("error", sid)) this.发(sid, "error", [通知文案.出错, 通知文案.出错无题], 原话(截(v.失败)))
      return
    }
    if (停过 !== undefined && this.d.停过几次(sid) !== 停过) return
    this.候着.set(
      sid,
      setTimeout(() => {
        this.候着.delete(sid)
        if (!this.该弹("done", sid)) return
        const 答 = [...(this.d.events.peek(sid)?.items ?? [])]
          .reverse()
          .find((x): x is Extract<TranscriptItem, { type: "turn" }> => x.type === "turn" && x.who === "agent" && x.text.trim() !== "")
        this.发(sid, "done", [通知文案.做完, 通知文案.做完无题], 答 ? 原话(截(答.text)) : 文(通知文案.没有文字))
      }, this.d.静候毫秒 ?? 收尾静候毫秒),
    )
  }

  private 发(sid: SessionId, kind: "done" | "error" | "permission", 题: readonly [string, string], 正文: 文案): void {
    const 标题 = this.d.标题of(sid)?.trim()
    const lang = this.d.设置().lang
    this.d.出口?.弹({ kind, sessionId: sid, title: 标题 ? 文(题[0], 标题) : 文(题[1]), body: 正文, ...(lang ? { lang } : {}) })
    this.未看.set(sid, kind)
    this.d.出口?.角标(this.未看.size)
  }

  private 不候(sid: SessionId): void {
    const t = this.候着.get(sid)
    if (t === undefined) return
    clearTimeout(t)
    this.候着.delete(sid)
  }

  private 划掉(sid: SessionId): void {
    if (this.未看.delete(sid)) this.d.出口?.角标(this.未看.size)
  }

  /** 人看见了：窗口在前台时，把此刻在屏上的那几段从角标里划掉。回到前台、主区 / 坞里换段时各叫一次 */
  看见了(): void {
    if (!this.d.前台()) return
    let 变了 = false
    for (const sid of [...this.未看.keys()]) {
      if (!this.d.在屏上(sid)) continue
      this.未看.delete(sid)
      变了 = true
    }
    if (变了) this.d.出口?.角标(this.未看.size)
  }

  /** 会话没了（删 / 归档 / 关）：候着的作废、角标划掉 */
  忘掉(sid: SessionId): void {
    this.不候(sid)
    this.问过的.delete(sid)
    this.起轮时停过.delete(sid)
    this.定时的.delete(sid)
    this.定时完了.delete(sid)
    this.划掉(sid)
  }

  /** 定时任务开的这段：它自己的收尾不报（调度器会报一条「定时…」，spec §0 第 5 条） */
  交给定时(sid: SessionId): void {
    this.定时的.add(sid)
  }

  定时跑完了(名: string, 状态: "succeeded" | "failed" | "cancelled", 摘要: string | undefined, sid: SessionId | undefined): void {
    if (sid) this.定时完了.add(sid)
    const n = this.d.设置()
    if (状态 === "succeeded" ? !n.done : !n.error) return
    if (n.quietWhenFocused && sid !== undefined && this.d.前台() && this.d.在屏上(sid)) return
    const 题 = 状态 === "succeeded" ? 通知文案.定时成 : 状态 === "failed" ? 通知文案.定时败 : 通知文案.定时消
    this.d.出口?.弹({
      kind: "schedule",
      ...(sid ? { sessionId: sid } : {}),
      title: 文(题, 名),
      body: 摘要?.trim() ? 原话(截(摘要)) : 文(通知文案.没有文字),
      ...(n.lang ? { lang: n.lang } : {}),
    })
    if (!sid) return
    this.未看.set(sid, "schedule")
    this.d.出口?.角标(this.未看.size)
  }

  /** 设置里「发一条试试」。不计角标 */
  试一条(): { shown: boolean; reason?: "unsupported" | "no_exit" } {
    const 出口 = this.d.出口
    if (!出口) return { shown: false, reason: "no_exit" }
    if (!出口.支持()) return { shown: false, reason: "unsupported" }
    const lang = this.d.设置().lang
    出口.弹({ kind: "test", title: 文(通知文案.试标题), body: 文(通知文案.试正文), ...(lang ? { lang } : {}) })
    return { shown: true }
  }

  dispose(): void {
    for (const t of this.候着.values()) clearTimeout(t)
    this.候着.clear()
    for (const f of this.退订.splice(0)) f()
  }
}
