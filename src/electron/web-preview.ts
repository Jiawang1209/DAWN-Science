/**
 * 网页预览：坞里那一格里活着的一个 `WebContentsView`（批 1，2026-08-18）。
 *
 * 设计见 `docs/superpowers/specs/2026-08-18-网页预览-design.md`。
 *
 * ## 为什么是 `WebContentsView`，不是 `<iframe>`
 *
 * `<iframe>` 要把**整个窗口**的 CSP `frame-src` 从 `blob:` 放到 `http:`——
 * 而且换不来什么：大量站点用 `X-Frame-Options` / `frame-ancestors` 直接
 * 拒绝被嵌。拿全应用的守卫去换一个面板，还换不到，这条自己就把它排除了。
 *
 * ## 它有两个别处没有的性质，写在这里免得下一个人踩
 *
 * 1. **它浮在 DOM 之上。** `contentView` 的子视图盖住一切 HTML，
 *    命令面板、确认框的 `z-index` 对它**完全无效**。
 *    处置在渲染进程那一侧（`web.tsx` 的命中测试）：**被挡住就把它藏起来**。
 * 2. **窗口自己的 `capturePage()` 截不到它**（spike 实测：那一栏是空白）。
 *    于是 Playwright 与十张视觉基线**都看不见它**——
 *    判据必须走 `app.evaluate` 进主进程问 `getURL()` / `getTitle()`。
 *
 * ## 隔离
 *
 * 独立 `persist:` 分区（cookie 与我们、与 agent 那台都不共用）、`sandbox`、
 * **不给任何 preload**——它是别人的网页，不该碰到 `window.dawn`。
 */
import { WebContentsView, type BrowserWindow } from "electron"
import { resolve, sep } from "node:path"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { 本机主机吗, 解析地址 } from "../policy/local-url.js"

/** 这一格自己的 cookie 罐子。**与 agent 那台浏览器也不共用**——两个读者，两套身份 */
export const 网页预览分区 = "persist:dawn-web-preview"

export interface 网页状态 {
  url: string
  title: string
  loading: boolean
  canBack: boolean
  canForward: boolean
  /** 上一次动作为什么没成。**缺席 = 没出事**，空串会被读成「出事了但说不出」 */
  error?: string
}

export type 网页命令 =
  | { kind: "open"; url: string; workspace?: string }
  | { kind: "bounds"; x: number; y: number; width: number; height: number }
  | { kind: "visible"; on: boolean }
  | { kind: "back" }
  | { kind: "forward" }
  | { kind: "reload" }
  | { kind: "close" }

/**
 * **这条地址是本机的吗**（批 1 只放本机，作者定的分期）。
 *
 * 纯函数，**不碰 Electron**：它要能在普通 node 测试里跑
 * （与 `ipc.ts` 那句「只有 Electron 才跑得起来的东西不塞进协议」同一条理由）。
 *
 * @param workspace 给了才认工作区里的 `file:`。**不给就一个 file: 都不放**——
 *   拿家目录之类顶上，等于把守卫开在一个没人声明过的地方。
 */
export function 本机地址吗(
  raw: string,
  workspace: string | undefined,
): { ok: true; url: string } | { ok: false; why: string } {
  const 原 = raw.trim()
  if (!原) return { ok: false, why: "没有地址" }

  /**
   * **解析与主机名规则来自 `policy/local-url.ts`，两边共用**（批 2）。
   *
   * 渲染进程也要判「这条链接点了该进坞还是进系统浏览器」，而它碰不到 `fs`。
   * 各写一份的话，一条链接会在「界面说能开」与「主进程说不能」之间打架，
   * 而那种不一致没有任何地方会报出来。
   *
   * **这一层在它之上多一道**：`file:` 还要用 `realpath` 确认真在工作目录里。
   */
  const u = 解析地址(原)
  if (!u) return { ok: false, why: `「${原.slice(0, 60)}」不是一个地址` }

  if (u.protocol === "file:") {
    if (!workspace) return { ok: false, why: "这段会话没有工作目录，本机文件不知道该以哪儿为界" }
    let 文件: string
    try {
      文件 = fileURLToPath(u)
    } catch {
      return { ok: false, why: `「${原.slice(0, 60)}」不是一个能用的本机路径` }
    }
    /**
     * **与 `files/access.ts` 同一个判据**：解析真实路径再比前缀，
     * 不然一条软链就能把界画到工作区外面去。
     */
    let 真: string
    let 根: string
    try {
      真 = realpathSync(文件)
      根 = realpathSync(resolve(workspace))
    } catch {
      return { ok: false, why: `找不到 ${文件}` }
    }
    if (真 !== 根 && !真.startsWith(根 + sep)) {
      return { ok: false, why: `${真} 在工作目录外面，这一格只开工作目录里的文件` }
    }
    return { ok: true, url: u.href }
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, why: `这一格只开 http(s) 与工作目录里的文件，不开 ${u.protocol}` }
  }

  if (!本机主机吗(u.hostname)) {
    return {
      ok: false,
      // **点名说是哪个主机**：笼统一句「不允许」会让人以为是功能坏了
      why: `${u.hostname} 不是本机。这一格现在只开本机的东西——用系统浏览器打开它。`,
    }
  }
  return { ok: true, url: u.href }
}

export interface 网页预览 {
  控制(命令: 网页命令): 网页状态
  /** 现在的样子。**没有 view 时也要给得出**——界面据此画一张空态 */
  状态(): 网页状态
  销毁(): void
}

const 空状态 = (): 网页状态 => ({ url: "", title: "", loading: false, canBack: false, canForward: false })

/**
 * 造一个。**懒建**：没人打开过网页那一格时，一个 web contents 都不起——
 * 它是一个完整的渲染进程，为一个没人看的面板起一个不划算。
 */
export function 造网页预览(win: BrowserWindow, 推: (s: 网页状态) => void): 网页预览 {
  let view: WebContentsView | undefined
  let 上次错: string | undefined
  let 想要的框: { x: number; y: number; width: number; height: number } | undefined
  let 想要可见 = false

  const 现状 = (): 网页状态 => {
    if (!view) return { ...空状态(), ...(上次错 ? { error: 上次错 } : {}) }
    const wc = view.webContents
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canBack: wc.navigationHistory.canGoBack(),
      canForward: wc.navigationHistory.canGoForward(),
      ...(上次错 ? { error: 上次错 } : {}),
    }
  }

  const 通知 = () => 推(现状())

  const 保证有 = (): WebContentsView => {
    if (view) return view
    const v = new WebContentsView({
      webPreferences: {
        partition: 网页预览分区,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // **不给 preload**：它是别人的网页，不该碰到 `window.dawn`
        webviewTag: false,
      },
    })
    win.contentView.addChildView(v)
    /**
     * **它自己不许再开窗口。** 页面里一个 `target=_blank` 就能弹出一个
     * 我们完全没有 chrome 的 Electron 窗口——批 0 刚把主窗口那条堵上，
     * 这里是同一个洞的第二个入口。
     */
    v.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    for (const ev of ["did-navigate", "did-navigate-in-page", "page-title-updated", "did-stop-loading", "did-start-loading"] as const) {
      v.webContents.on(ev as never, () => 通知())
    }
    v.webContents.on("did-fail-load", (_e, code, desc, url) => {
      // **-3 是「被我们自己拦下的」**，不是失败；其余如实说
      if (code === -3) return
      上次错 = `打不开 ${url}：${desc}（${code}）`
      通知()
    })
    view = v
    if (想要的框) v.setBounds(想要的框)
    v.setVisible(想要可见)
    return v
  }

  return {
    状态: 现状,
    控制(命令) {
      switch (命令.kind) {
        case "open": {
          const 判 = 本机地址吗(命令.url, 命令.workspace)
          if (!判.ok) {
            // **响亮拒绝，不静默跳回去**（规格 7.5）
            上次错 = 判.why
            break
          }
          上次错 = undefined
          void 保证有().webContents.loadURL(判.url)
          break
        }
        case "bounds":
          想要的框 = { x: 命令.x, y: 命令.y, width: 命令.width, height: 命令.height }
          view?.setBounds(想要的框)
          break
        case "visible":
          想要可见 = 命令.on
          view?.setVisible(命令.on)
          break
        case "back":
          if (view?.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack()
          break
        case "forward":
          if (view?.webContents.navigationHistory.canGoForward()) view.webContents.navigationHistory.goForward()
          break
        case "reload":
          view?.webContents.reload()
          break
        case "close": {
          const v = view
          view = undefined
          上次错 = undefined
          想要可见 = false
          if (!v) break
          /**
           * **拆的时候窗口可能已经没了**（退出那条路上就是如此）。
           * 这里每一步都单独兜住：漏掉一个异常，`will-quit` 里那条链就断在半路，
           * 表现是**应用关不掉**——e2e 上就是
           * *「Tearing down "dawn" exceeded the test timeout」*，
           * 这个仓库为同一个症状（另一个原因）已经付过一次账。
           */
          try {
            if (!win.isDestroyed()) win.contentView.removeChildView(v)
          } catch {
            /* 窗口先没的，无所谓 */
          }
          try {
            v.webContents.close()
          } catch {
            /* 已经死了 */
          }
          break
        }
      }
      return 现状()
    },
    销毁() {
      this.控制({ kind: "close" })
    },
  }
}
