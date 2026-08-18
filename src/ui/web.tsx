/**
 * 网页预览那一格（批 1，2026-08-18）。
 *
 * 屏幕上这一块**是空的**：真正的网页是主进程里一个 `WebContentsView`，
 * 它**浮在整个 DOM 之上**。这里画的只有 chrome（地址栏、前进后退），
 * 外加一个占位的方块——**它的矩形就是那个视图该在的地方**。
 *
 * ## 两条只有这个组件要操心的事
 *
 * ### 一、被浮层挡住就得藏起来
 *
 * `contentView` 的子视图盖住一切 HTML，命令面板与确认框的 `z-index`
 * 对它**完全无效**。
 *
 * 第一版想的是「列出所有浮层的状态，有任何一个开着就藏」——
 * `styles.css` 里用 `--z-modal*` 的地方有 **10 处**，而且以后还会加。
 * **一份要靠人记得更新的名单，等于没有名单。**
 *
 * 改成**命中测试**：拿占位块中心问一句 `document.elementFromPoint`，
 * 答的不是我们自己就说明被挡住了。这条规则**对以后新加的浮层自动成立**，
 * 不需要任何人记得来这里登记。
 *
 * 代价是它得**定期问**（浮层出现不会通知我们）。250ms 一次，
 * 与传输进度那条轮询同一个量级——「相对推送的全部收益，人眼看不出来」。
 *
 * ### 二、位置要跟着坞走
 *
 * 坞可以拖宽、窗口可以缩放、可以切房客。`ResizeObserver` 盯住占位块，
 * 变了就把新矩形推给主进程。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "./primitives.js"
import { 网页图标 } from "./icons.js"
import { useStore } from "@nanostores/react"
import { t } from "./i18n/index.js"
import { $待开网址, 收走网址 } from "./state/index.js"

export interface 网页状态 {
  url: string
  title: string
  loading: boolean
  canBack: boolean
  canForward: boolean
  error?: string
}

type 网页命令 =
  | { kind: "open"; url: string; workspace?: string }
  | { kind: "bounds"; x: number; y: number; width: number; height: number }
  | { kind: "visible"; on: boolean }
  | { kind: "back" }
  | { kind: "forward" }
  | { kind: "reload" }
  | { kind: "close" }

interface 网页桥 {
  control(cmd: 网页命令): Promise<unknown>
  onState(cb: (s: unknown) => void): () => void
}

const 桥 = (): 网页桥 | undefined =>
  (window as unknown as { dawn?: { web?: 网页桥 } }).dawn?.web

/** 多久问一次「我被挡住了吗」。**浮层出现不会通知我们**，只能自己看 */
const 命中间隔毫秒 = 250

export function WebPanel({ workspace }: { workspace?: string | undefined }) {
  const 占位 = useRef<HTMLDivElement | null>(null)
  const [状态, 设状态] = useState<网页状态>({
    url: "",
    title: "",
    loading: false,
    canBack: false,
    canForward: false,
  })
  const [草稿, 设草稿] = useState("")
  /** 上一次推给主进程的样子。**一样就不推**——否则 250ms 一次的 IPC 白烧 */
  const 上次 = useRef<string>("")

  /**
   * **回执要收下。**
   *
   * 第一版是 `void control(cmd)`，把返回值扔了——于是**被拦下的地址
   * 一个字都到不了屏幕上**：主进程那边只在 webContents 有动静时才推状态，
   * 而一次被拒绝的 `open` 压根没有动静。判据当场红了
   * （「example.com 不是本机」找不到），这是对的。
   *
   * `bounds` / `visible` 的回执**不收**：它们每 250ms 来一次，
   * 每次都 setState 等于每秒重画四遍，而那两条命令不改变屏幕上任何字。
   */
  const 发 = useCallback((cmd: 网页命令) => {
    const p = 桥()?.control(cmd)
    if (!p || cmd.kind === "bounds" || cmd.kind === "visible") return
    void p.then((s) => {
      if (s) 设状态(s as 网页状态)
    })
  }, [])

  useEffect(() => 桥()?.onState((s) => 设状态(s as 网页状态)), [])

  /**
   * **消息里点过来的那一条**（批 2）。`App.tsx` 把房客切到「网页」并把地址
   * 放进 `$待开网址`，这里接住。开完立刻收走——留着的话，
   * 切走再切回会自己把同一页重开一遍。
   */
  const 待开 = useStore($待开网址)

  /**
   * 把「该在哪儿、看不看得见」推给主进程。
   *
   * **可见性与位置一起算**：分成两条的话，会出现「位置已经挪了、
   * 但还没来得及藏」的一帧——而那一帧正好是浮层刚弹出来的时候。
   */
  const 对齐 = useCallback(() => {
    const el = 占位.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const 有地方 = r.width > 1 && r.height > 1

    /**
     * **命中测试**：中心点上最上面的那个元素是不是我们自己。
     * 不是就说明有东西盖在上面（命令面板、确认框、以后任何新浮层）。
     */
    const 中 = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const 露着 = 有地方 && (中 === el || (中 instanceof Node && el.contains(中)))

    const 框 = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    }
    const 指纹 = `${框.x},${框.y},${框.width},${框.height},${露着}`
    if (指纹 === 上次.current) return
    上次.current = 指纹
    发({ kind: "bounds", ...框 })
    发({ kind: "visible", on: 露着 })
  }, [发])

  useEffect(() => {
    对齐()
    const ro = new ResizeObserver(对齐)
    if (占位.current) ro.observe(占位.current)
    window.addEventListener("resize", 对齐)
    const 计时 = setInterval(对齐, 命中间隔毫秒)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", 对齐)
      clearInterval(计时)
      /**
       * **切走时一定要藏**：这个组件卸载了，而主进程那边的视图还在——
       * 不藏的话它会继续盖在「审阅」或「文件」上面，
       * 而那看起来就像那两格坏掉了。
       */
      发({ kind: "visible", on: false })
      上次.current = ""
    }
  }, [对齐, 发])

  const 去 = (地址: string) => {
    const s = 地址.trim()
    if (!s) return
    发({ kind: "open", url: s, ...(workspace ? { workspace } : {}) })
    /**
     * **刚建出来的那个视图要马上摆正。**
     *
     * 视图是懒建的：`open` 那一刻才有。而它建出来时用的是我们
     * **上一次推过去的**位置与可见性——如果那之后没再推过，
     * 它会一直藏着，直到下一个 250ms 的 tick。
     * 判据当场量到了这一帧（「加载完了却是藏着的」）。
     * 清掉指纹再对齐一次，把那一帧消掉。
     */
    上次.current = ""
    对齐()
  }

  useEffect(() => {
    if (!待开) return
    去(待开)
    收走网址()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [待开])

  return (
    <div className="webview">
      <div className="webview-bar">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("后退")}
          disabled={!状态.canBack}
          onClick={() => 发({ kind: "back" })}
        >
          ‹
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("前进")}
          disabled={!状态.canForward}
          onClick={() => 发({ kind: "forward" })}
        >
          ›
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("重新加载")}
          disabled={!状态.url}
          onClick={() => 发({ kind: "reload" })}
        >
          ↻
        </Button>
        <input
          className="control webview-url"
          aria-label={t("网址")}
          placeholder={t("输一个网址，或工作目录里的 .html")}
          value={草稿 || 状态.url}
          onChange={(e) => 设草稿(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            去(草稿 || 状态.url)
            设草稿("")
          }}
        />
      </div>

      {/**
        * **错误摆在 chrome 底下，不摆在占位块里**——占位块那一片
        * 随时会被真正的网页盖住，写在那儿的字人根本看不到。
        */}
      {状态.error ? <p className="caveat webview-error">{状态.error}</p> : null}

      {/**
        * 真正的网页**不在这里**：这只是个占位的方块，
        * 它的矩形被推给主进程，那个 `WebContentsView` 照它摆。
        * 里面这句话只有在还没开任何页面时看得见。
        */}
      <div className="webview-slot" ref={占位}>
        {状态.url ? null : (
          <p className="hint">{t("上面输一个网址，或者点消息里的链接。")}</p>
        )}
      </div>
    </div>
  )
}

/**
 * 消息底下那张「网页预览」卡（批 2，2026-08-18，形状照作者的截图）。
 *
 * ## 为什么链接之外还要一张卡
 *
 * 链接本身点了就进坞（`markdown.tsx` 那一半）。但**光有链接说不出
 * 「还能换个方式打开」**——作者要的那颗「打开方式 ▾」就是这件事：
 * 在这儿开，还是交给系统浏览器。
 *
 * ## 一条消息只给一张
 *
 * 作者截图里就是一张。一条消息里出现好几个地址时，**链接本身照样点得动**——
 * 这张卡是那条主线索的快捷方式，不是清单。
 */
export function 网页卡({
  url,
  onHere,
  onSystem,
}: {
  url: string
  onHere: (url: string) => void
  onSystem: (url: string) => void
}) {
  const [开着, 设开着] = useState(false)
  return (
    <div className="weblink-card">
      <span className="weblink-icon">
        <网页图标 />
      </span>
      <span className="weblink-what">
        <span className="weblink-title">{t("网页预览")}</span>
        {/** **把地址摆出来**：一张只写「网站」的卡说不出它要开的是哪儿 */}
        <span className="weblink-url">{url}</span>
      </span>
      <span className="weblink-how">
        <Button variant="secondary" size="sm" aria-expanded={开着} onClick={() => 设开着((v) => !v)}>
          {t("打开方式")}
        </Button>
        {开着 ? (
          <div className="weblink-menu" role="menu">
            <Button
              variant="ghost"
              size="sm"
              role="menuitem"
              onClick={() => {
                设开着(false)
                onHere(url)
              }}
            >
              {t("在这儿打开")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              role="menuitem"
              onClick={() => {
                设开着(false)
                onSystem(url)
              }}
            >
              {t("用系统浏览器打开")}
            </Button>
          </div>
        ) : null}
      </span>
    </div>
  )
}
