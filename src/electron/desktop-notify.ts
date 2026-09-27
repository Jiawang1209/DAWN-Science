/**
 * 桌面通知的出口（2026-09-27，spec `2026-09-27-桌面通知-design.md` §4）。
 *
 * **整个应用只有这个文件碰系统通知**（`new Notification`、`setBadgeCount`、`flashFrame`）——设计契约有扫描。
 * 理由：e2e 看不见系统通知，靠的是这里的假出口把每一条记下来；别处再弹一次，那一条就绕过了注入缝。
 *
 * - **真的**：Electron `Notification`；macOS / Linux 角标是数字（`app.setBadgeCount`；macOS 上要应用有通知权限才显示），
 *   Windows 没有数字，改成任务栏按钮闪（`flashFrame`），回到窗口就停。
 * - **假的**（`DAWN_FAKE_NOTIFY=1`，e2e 夹具与 dev:mock 都开，同一份）：不碰系统，记进主进程 `globalThis.__dawn桌面通知`，
 *   e2e 用 `app.evaluate` 读、点。点走的是**同一个** `点了`——与真通知的 click 同一条路。
 *
 * 文案：判断那边只交 `{ msgid, args }`，这里按语言查 `EN`。electron 层 import 一份数据表，不 import 界面逻辑。
 * 参数全注入（不在这里 `import electron`），所以在 node 下可测——与 wiring 同一个理由。
 */
import type { 桌面通知条, 桌面通知出口, 文案, 通知语言, 通知种类 } from "../workbench/desktop-notify.js"
import { EN } from "../ui/i18n/en.js"

export function 译(w: 文案, lang: 通知语言): string {
  const 模 = lang === "en" ? (EN[w.msgid] ?? w.msgid) : w.msgid
  return 模.replace(/\{(\d+)\}/g, (m, i: string) => w.args[Number(i)] ?? m)
}

interface 通知对象 {
  on(ev: "click" | "close", cb: () => void): unknown
  on(ev: "failed", cb: (e: unknown, error: string) => void): unknown
  show(): void
}

export interface 真出口依赖 {
  Notification: { new (o: { title: string; body: string }): 通知对象; isSupported(): boolean }
  app: {
    setBadgeCount(n: number): boolean
    on(ev: "browser-window-focus", cb: () => void): unknown
    off(ev: "browser-window-focus", cb: () => void): unknown
  }
  窗口: () => { isDestroyed(): boolean; isFocused(): boolean; flashFrame(on: boolean): void } | undefined
  平台: string
  /** 设置里没存语言时用哪种（主进程按 `app.getLocale()` 判） */
  缺省语言: () => 通知语言
  点了: (sessionId: string | undefined) => void
  log: (line: string) => void
}

export function 真通知出口(d: 真出口依赖): 桌面通知出口 {
  /**
   * **活着的通知要有人拿着**：Electron 的 `Notification` 被回收之后 click 就不来了——
   * 人十分钟后才点，那一下什么都不会发生。点了 / 关了 / 失败了才放手。
   */
  const 拿着 = new Set<通知对象>()
  return {
    支持: () => d.Notification.isSupported(),
    弹(n) {
      if (!d.Notification.isSupported()) {
        d.log(`[桌面通知] 这台系统不支持，没弹：${n.kind}`)
        return
      }
      const lang = n.lang ?? d.缺省语言()
      const 条 = new d.Notification({ title: 译(n.title, lang), body: 译(n.body, lang) })
      拿着.add(条)
      // macOS 直接进通知中心的那些不一定来 close：只拿最近 50 条，最老的放手（2026-09-28 审查）
      if (拿着.size > 50) 拿着.delete(拿着.values().next().value as 通知对象)
      条.on("click", () => {
        拿着.delete(条)
        d.点了(n.sessionId)
      })
      条.on("close", () => void 拿着.delete(条))
      // **失败要出声**（规格 7.5）：Windows 上没设 AUMID、系统里关掉了通知都会走到这里
      条.on("failed", (_e, error) => {
        拿着.delete(条)
        d.log(`[桌面通知] 没弹出来（${n.kind}）：${error}`)
      })
      条.show()
    },
    角标(count) {
      if (d.平台 === "win32") {
        const w = d.窗口()
        if (!w || w.isDestroyed()) return
        w.flashFrame(count > 0 && !w.isFocused())
        return
      }
      d.app.setBadgeCount(count)
    },
    前台变了(cb) {
      const 听 = () => {
        if (d.平台 === "win32") {
          const w = d.窗口()
          if (w && !w.isDestroyed()) w.flashFrame(false)
        }
        cb()
      }
      d.app.on("browser-window-focus", 听)
      return () => void d.app.off("browser-window-focus", 听)
    },
  }
}

export interface 假通知记录 {
  kind: 通知种类
  sessionId?: string
  title: string
  body: string
}

/**
 * 假出口。多一个 `前台()`：`undefined` = 交还给真窗口去判（e2e 的窗口永远是藏着的，不设就永远「不在前台」）。
 * 主进程的 `isForeground` 先问它——**微信 / 飞书的「在电脑前不推」用的也是同一个**，所以 e2e 里拨它两边一起变。
 */
export function 假通知出口(d: { 点了: (sessionId: string | undefined) => void; log?: (line: string) => void }): 桌面通知出口 & { 前台(): boolean | undefined } {
  const 听众 = new Set<() => void>()
  const 台 = {
    发过: [] as 假通知记录[],
    角标: 0,
    前台: undefined as boolean | undefined,
    点(i: number): void {
      const n = 台.发过[i]
      if (!n) throw new Error(`没有第 ${i} 条通知（一共 ${台.发过.length} 条）`)
      d.点了(n.sessionId)
    },
    设前台(v: boolean | undefined): void {
      台.前台 = v
      if (v) for (const cb of [...听众]) cb()
    },
  }
  ;(globalThis as unknown as { __dawn桌面通知: typeof 台 }).__dawn桌面通知 = 台
  return {
    支持: () => true,
    弹(n) {
      const lang = n.lang ?? "zh"
      const r: 假通知记录 = { kind: n.kind, ...(n.sessionId ? { sessionId: n.sessionId } : {}), title: 译(n.title, lang), body: 译(n.body, lang) }
      台.发过.push(r)
      d.log?.(`[桌面通知·假] #${台.发过.length - 1} ${r.title} — ${r.body}`)
    },
    角标(count) {
      台.角标 = count
    },
    前台变了(cb) {
      听众.add(cb)
      return () => void 听众.delete(cb)
    },
    前台: () => 台.前台,
  }
}

/**
 * 「点了通知、还没回到的那段」（2026-09-28）。主进程每次点都**先记下**，界面来拉时读了就清（`takePendingOpenSession`）。
 *
 * 只推不记的第一版会丢：macOS 关了窗口时点通知，新窗口 `did-finish-load` 时界面还没挂上事件监听（它等 `ready`），
 * 挂上了名单也还是空的——推过去要么没人听，要么被报成「那段对话已经不在了」。页面重载、app 刚启动时点，同一个坑。
 * **只记最新的一段**：连点两条，人要的是后点的那条。没带会话的那一下（「发一条试试」）不动它。
 */
export function 待回的段(): { 记(sessionId: string | undefined): void; 取(): string | undefined } {
  let 段: string | undefined
  return {
    记(sessionId) {
      if (sessionId) 段 = sessionId
    },
    取() {
      const x = 段
      段 = undefined
      return x
    },
  }
}
