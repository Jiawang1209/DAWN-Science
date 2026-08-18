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
import { join, resolve, sep } from "node:path"
import { existsSync, realpathSync } from "node:fs"
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
 * **这条地址开得了吗**（批 3 起：任意网站，作者定的第二期）。
 *
 * 批 1 时它只放本机。作者定的范围是「**先本机的东西，其次任意网站**」，
 * 这一批放开了 http(s) 那一半——**而 `file:` 那一半一个字都没松**：
 * 它仍然只认工作目录里的文件。
 *
 * ## 为什么放开 http(s) 不等于放弃守卫
 *
 * 守卫从「**哪些地址能开**」挪到了「**那个视图能干什么**」——
 * 独立分区、拒绝一切权限请求、证书错误不放行、弹窗不新开窗口、
 * 下载落到设置里那个目录。逐条见 `造网页预览`。
 * **拿一张网址白名单当安全边界本来就是假的**：真正的边界是那个渲染进程
 * 被允许接触什么。
 *
 * 纯函数，**不碰 Electron**：它要能在普通 node 测试里跑
 * （与 `ipc.ts` 那句「只有 Electron 才跑得起来的东西不塞进协议」同一条理由）。
 *
 * @param workspace 给了才认工作区里的 `file:`。**不给就一个 file: 都不放**——
 *   拿家目录之类顶上，等于把守卫开在一个没人声明过的地方。
 */
export function 可以开吗(
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

  /**
   * **人没写协议、而那一串又不像个主机名时，说它不是地址**（批 3 补的）。
   *
   * 批 1 时这条不需要：主机名不是 `localhost` 就直接被拦了。放开任意网站
   * 之后，`这不是一个地址` 会被 `new URL` 认成一个合法的 IDN 主机名——
   * 判据当场红了，而它是对的：**那不是地址，是一句话**。
   *
   * 判据取「有点、有端口、或者就是 localhost」。**写了协议的就信他**——
   * 那时他明确知道自己在干什么（内网单标签主机名是真实存在的）。
   */
  const 人写了协议 = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(原) && !/^[a-zA-Z0-9.-]+:\d+(\/|$|\?)/.test(原)
  if (!人写了协议 && (u.protocol === "http:" || u.protocol === "https:")) {
    const 像主机 = u.hostname.includes(".") || u.port !== "" || 本机主机吗(u.hostname)
    if (!像主机) return { ok: false, why: `「${原.slice(0, 60)}」不像一个地址` }
  }

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
  /**
   * **主机名不再是判据**（批 3）。留下 `本机主机吗` 的引用是给
   * `local-url.ts` 那一半用的——渲染进程仍然要分辨「点这条链接该进坞
   * 还是该去系统浏览器」，那是**动线**，不是**安全**。
   */
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
 * 重名就改名，**不默默覆盖**。
 *
 * 与 SFTP 那条下载同一条规矩（批 4a 写下的）：*「默默覆盖是这里唯一不能选的
 * ——你可能正在覆盖昨天那一版数据。」* 那边叫 `不覆盖的名字`，
 * 在 backend 里；这一层碰不到它，所以照同一个形状再写一次
 * **并在这里点名说它是同一条规矩**。
 */
function 不覆盖(目标: string): string {
  if (!existsSync(目标)) return 目标
  const 点 = 目标.lastIndexOf(".")
  const [主, 尾] = 点 > 目标.lastIndexOf(sep) ? [目标.slice(0, 点), 目标.slice(点)] : [目标, ""]
  for (let i = 1; i < 1000; i++) {
    const 试 = `${主} (${i})${尾}`
    if (!existsSync(试)) return 试
  }
  return 目标
}

/**
 * 造一个。**懒建**：没人打开过网页那一格时，一个 web contents 都不起——
 * 它是一个完整的渲染进程，为一个没人看的面板起一个不划算。
 */
export function 造网页预览(
  win: BrowserWindow,
  推: (s: 网页状态) => void,
  /**
   * 设置里那个下载目录（批 3）。**注入而不是在这里去问**——
   * 这一层不该知道 workbench 长什么样，与 `openPath` / `trashItem` 同一条缝。
   */
  取下载目录?: () => string | undefined,
): 网页预览 {
  let view: WebContentsView | undefined
  let 上次错: string | undefined
  /** 上一次 `open` 带来的工作区。**弹窗那条要用它**——页面里点出来的链接同样要过门 */
  let 上次工作区: string | undefined
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
     * ── 放开任意网站之后，守卫全在这一段（批 3）────────────────────
     *
     * 门那一层已经不看主机名了。**真正的边界是这个渲染进程被允许接触什么**，
     * 而那正是下面这四条。设计文档第四节那张表逐条落实。
     */

    /**
     * **弹窗不新开窗口，就在这一栏里走。**
     *
     * 批 1 时是一律 `deny`——那时只开本机的东西，`target=_blank` 罕见。
     * 放开任意网站之后，`deny` 会让人点了没反应，而**「点了没反应」
     * 与「这个功能坏了」在屏幕上长得一模一样**。
     * 改成在同一栏里导航过去（仍然要过同一道门）。
     */
    v.webContents.setWindowOpenHandler(({ url }) => {
      const 判 = 可以开吗(url, 上次工作区)
      if (判.ok) void v.webContents.loadURL(判.url)
      else {
        上次错 = 判.why
        通知()
      }
      return { action: "deny" }
    })

    /**
     * **权限一律拒**（摄像头、麦克风、位置、通知、剪贴板…）。
     *
     * 第一版不摆一个假的授权流程：**问人需要一条主进程↔界面的往返**，
     * 而那条今天还不存在（`Settings.tsx` 权限那一节如实写着同一件事）。
     * **不存在的能力不该看起来存在**——所以是干脆地拒，不是假装在问。
     */
    v.webContents.session.setPermissionRequestHandler((_wc, permission, done) => {
      console.error(`[网页预览] 拒绝了一次权限请求：${permission}`)
      done(false)
    })
    v.webContents.session.setPermissionCheckHandler(() => false)

    /**
     * **证书错误不放行，而且说得出是哪个域、什么错**。
     *
     * Electron 的默认动作就是拒绝，但**默认是沉默的**——页面白着，
     * 人不知道是网断了还是证书坏了。这里把话说出来（规格 7.5）。
     */
    v.webContents.on("certificate-error", (e, url, error) => {
      e.preventDefault()
      上次错 = `证书有问题，没有打开：${error}（${url.slice(0, 80)}）`
      通知()
    })

    /**
     * **下载落到设置里那个下载目录**——不另起一套。
     *
     * 那一格是作者 2026-08-18 定的②，已经做完了；这里只是把它接上。
     * 取不到就交给 Electron 自己的默认，**不猜一个路径**。
     */
    v.webContents.session.on("will-download", (_e, item) => {
      const 目录 = 取下载目录?.()
      /**
       * **一定要给一个落点。**
       *
       * 不给的话 Electron 会弹一个**原生保存对话框**——判据当场挂了 31 秒
       * 才超时，而在真实使用里那是一个我们完全没设计过的模态框
       * （窗口 `show: false` 时它甚至看不见）。
       * 取不到配置就用注入进来的那个兜底，**不猜路径**。
       */
      if (目录) item.setSavePath(不覆盖(join(目录, item.getFilename())))
      item.once("done", (_e2, state) => {
        上次错 = state === "completed" ? undefined : `下载没成：${item.getFilename()}（${state}）`
        通知()
      })
    })
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
          上次工作区 = 命令.workspace
          const 判 = 可以开吗(命令.url, 命令.workspace)
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
