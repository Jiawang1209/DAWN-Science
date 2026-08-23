/**
 * Electron 主进程（Task 2.7）。
 *
 * **本文件只做两件事：开窗口、注册那一个 IPC 通道。**
 * 装配在 `wiring.ts`、派发在 `workbench/server.ts`、桥接逻辑在 `ipc.ts`——
 * 三者都不认识 Electron，因此都能单独测。这里剩下的部分正是「测不了、也不值得测」的那些。
 */
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron"
import { extname, join } from "node:path"
import { readFile } from "node:fs/promises"
import { resizeImage } from "@earendil-works/pi-coding-agent"
import { IPC_CHANNEL, IPC_EVENT_CHANNEL, IPC_PICK_DIRECTORY, IPC_CAPTURE_PAGE, IPC_WEB_CONTROL, IPC_WEB_STATE, createIpcHandler } from "./ipc.js"
import { 造网页预览, type 网页命令, type 网页预览 } from "./web-preview.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../protocol/index.js"
import { createWorkbench, type Workbench } from "./wiring.js"
import { CredentialStore, defaultCredentialFile } from "./credentials.js"
import { CHILD_ENTRY } from "../subagent/protocol.js"

/**
 * 配置落在 `userData`，**不是 `process.cwd()`**。
 *
 * 打包后的桌面应用，cwd 是个任意目录（从 Finder 启动时通常是 `/`）。
 * 旧默认值意味着**全新安装必然找不到配置**，而 `loadRegistry` 缺文件会抛
 * ENOENT——结果是「装好了，打不开」，且没有任何可执行的提示。
 */
const CONFIG = process.env.DAWN_CONFIG ?? join(app.getPath("userData"), "providers.yaml")
const DB = process.env.DAWN_DB ?? join(app.getPath("userData"), "dawn.db")
/**
 * 没有任何项目时的默认工作区。
 *
 * **不要求先选文件夹**——claude code 与 codex 上来都不要求，DAWN 也不该要求。
 * 用户随时可以在侧栏打开自己的项目；这只是保证「打开就能说话」。
 */
const DEFAULT_WORKSPACE =
  process.env.DAWN_DEFAULT_WORKSPACE ?? join(app.getPath("home"), "DAWN", "scratch")
const DEV_URL = process.env.DAWN_DEV_SERVER
/**
 * mock 模式：pi 的 provider 被 models.json 重定向到本地假推理服务器。
 * 由 `scripts/dev-mock.mjs` 设置。**整条真链路照跑，只有模型是假的。**
 */
const MODELS_JSON = process.env.DAWN_MODELS_JSON
/**
 * 临时会话的目录根（2026-08-11）。**e2e 必须覆盖它**——
 * 不覆盖的话，跑一次测试就会往开发机的 `~/DAWN/scratch` 里建目录。
 * 与 `DAWN_CONFIG` / `DAWN_DB` 是同一套惯例。
 */
const SCRATCH_ROOT = process.env.DAWN_SCRATCH_ROOT
/**
 * 去哪找外部 CLI 自己的配置（①-C）。**只为测试隔离而存在**——
 * 与 `DAWN_CONFIG` / `DAWN_DB` 是同一套惯例：e2e 指向隔离目录，
 * 否则它会去读开发机真实的 `~/.codex`，而夹具的第一条原则是
 * 「每个用例一套全新的目录」。
 */
const CLI_HOME = process.env.DAWN_CLI_HOME
/** 全局技能目录（skills-manage，2026-08-21）。e2e 用它隔离——此前一直指着开发机真实的 `~/DAWN/skills` */
const SKILLS_DIR = process.env.DAWN_SKILLS_DIR
/** 全局子 agent 目录（2026-08-22）。e2e 用它隔离 */
const AGENTS_DIR_ENV = process.env.DAWN_AGENTS_DIR

/**
 * 用假服务器代替真 SSH（②-B · R3）。**mock 模式与 e2e 用。**
 *
 * 与 `DAWN_CONFIG` / `DAWN_DB` 是同一套惯例：**默认是真的**，
 * 要假的必须显式说。反过来（默认假、真的要显式开）会让某次忘了设的运行
 * 悄悄连到一台不存在的机器上，而界面会说「连上了」。
 */
const FAKE_SSH = process.env.DAWN_FAKE_SSH === "1"

/**
 * **不要把窗口显示出来**（e2e 用，2026-08-11）。
 *
 * 默认当然是显示——**要藏必须显式说**，与 `DAWN_FAKE_SSH` 同一套惯例：
 * 反过来会让某次忘了设的正常启动变成一个看不见的应用。
 */
const 隐藏窗口 = process.env.DAWN_HIDE_WINDOW === "1"

/**
 * 写权租约的 TTL（秒）。**默认 300**，e2e 调小它来验过期那条路——
 * 按默认值验一次要等五分钟，那种测试没人会跑。
 */
const LEASE_TTL = Number(process.env.DAWN_LEASE_TTL ?? "") || undefined

let workbench: Workbench | undefined

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    /**
     * **测试时不要弹出来**（2026-08-11，作者提）。
     *
     * 作者：*「我们每次测试的时候，能不能不弹出 Electron，因为每次测试都要
     * 弹出来，导致我什么都干不了。测试是应该做的，但是也要不影响我做其他的事情。」*
     *
     * 他是对的：一套要跑四分钟、期间抢走十几次焦点的测试，**代价会转嫁成
     * 「那就少跑几次」**——而那正是这三条准入规则最怕的结局。
     *
     * `show: false` 的窗口**仍然在渲染**（Chromium 照常合成），
     * 所以 Playwright 驱动得动、截图也照样出得来。
     * 但要显式关掉后台节流：不关的话，隐藏窗口里的 `requestAnimationFrame`
     * 会被降频，**视觉基线那十张会拍到一半的动画**。
     */
    show: !隐藏窗口,
    // 窗口标题栏留给 Rho 那种自绘顶栏（46px），但 ①-B 先用系统标题栏，不做无谓的自绘
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      // 渲染进程不给 node 能力：它只经 IPC 的单一入口取数（AgentDeck 的「不靠开洞」）
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // 隐藏窗口不该被降频——见上面 `show` 那段
      backgroundThrottling: false,
    },
  })

  /**
   * 事件中枢 → 这个窗口。
   *
   * **2026-08-11：窗口now先于后端创建**（见 `后端建好了` 那段注释），
   * 所以这里可能还没有 workbench。那时先记下这个窗口，
   * 等后端建好再接——**漏接的表现是「界面永远收不到 agent 的回复」**，
   * 而且不报错，正是最难查的那一类。
   */
  接上事件流(win)

  /**
   * **外链去系统浏览器，不在应用里新开一个裸窗口**（2026-08-18）。
   *
   * ## 修之前是什么样（探针实测，不是推断）
   *
   * `markdown.tsx` 把消息里的链接渲染成 `<a target="_blank">`，注释写着
   * *「外链在桌面应用里点开应当去系统浏览器」*——**而代码没有做这件事**。
   * 没有 `setWindowOpenHandler` 时 Electron 的默认动作是 `allow`，
   * 于是点一下就**多出一个 Electron 窗口**（探针量到：窗口数 1 → 2），
   * 里面是那个网站，**没有地址栏、没有后退**——人看不出自己在哪儿。
   *
   * 那个窗口本身不是提权（`sandbox: true` / `nodeIntegration: false` /
   * `contextIsolation: true`，探针一并读出来了），但它是一个
   * **没有任何 chrome 的浏览器窗口**，这不是我们要给的东西。
   *
   * ## 只放 http(s) 出去
   *
   * `shell.openExternal` 会把 `file:` 交给系统去打开——那等于绕过
   * `files/access.ts` 那道路径守卫。**其余协议一律拒，并说出口**（规格 7.5）。
   *
   * ## e2e 里不真的去开浏览器
   *
   * `DAWN_NO_EXTERNAL` 给了就只记账不打开——否则每跑一次 e2e
   * 就往作者脸上弹十几个浏览器标签页，那与 `show: false` 是同一个理由。
   */
  const 放外面开 = (raw: string): boolean => {
    let u: URL
    try {
      u = new URL(raw)
    } catch {
      console.error(`[外链] 不是一个地址，没打开：${raw.slice(0, 120)}`)
      return false
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      // **说出口**：静默不动会让人以为「点了没反应 = 坏了」
      console.error(`[外链] 只放 http(s) 去系统浏览器，拒绝了：${u.protocol}//…`)
      return false
    }
    if (process.env.DAWN_NO_EXTERNAL) {
      console.log(`[外链] DAWN_NO_EXTERNAL：本该交给系统浏览器 → ${u.href}`)
      return true
    }
    void shell.openExternal(u.href)
    return true
  }

  /**
   * 网页预览那一格（批 1，2026-08-18）。**懒建**——没人打开过网页那一格时
   * 一个 web contents 都不起。窗口关掉时跟着销毁，否则它会拽着一个
   * 渲染进程不放（那正是「关了窗口进程还在」的经典来源）。
   */
  let 网页: 网页预览 | undefined
  /**
   * 下载落到设置里那个目录（批 3）。
   *
   * **`will-download` 是同步的**，那时来不及去问后端，所以这里存一份。
   * 每收到一条网页命令就顺手刷新——**一次下载之前必然先有过一条命令**
   * （至少是 `open`），所以这份缓存不会是空的。
   * 取不到就留 `undefined`，交给 Electron 自己的默认——**不猜一个路径**。
   */
  let 下载目录: string | undefined
  const 刷下载目录 = () => {
    void ipcDispatch?.("getDownloadDir", {})
      .then((r) => {
        const p = (r as { data?: { path?: string } }).data?.path
        if (typeof p === "string" && p) 下载目录 = p
      })
      .catch(() => {
        /** 问不到就用 Electron 的默认。**不猜** */
      })
  }
  const 网页的 = (): 网页预览 =>
    (网页 ??= 造网页预览(
      win,
      (状态) => {
        if (!win.isDestroyed()) win.webContents.send(IPC_WEB_STATE, 状态)
      },
      /**
       * **永远给得出一个落点**：配置还没读到时用与 workbench 同一个兜底
       * （`DAWN_DOWNLOADS` 或系统下载目录）。返回 `undefined` 的话，
       * Electron 会弹一个原生保存对话框——那是我们完全没设计过的模态框。
       */
      () => 下载目录 ?? process.env.DAWN_DOWNLOADS ?? app.getPath("downloads"),
      /**
       * **下载落一条 Run**（批 4，作者选的乙）。
       *
       * 这不是「主进程能往账本里写东西」那条通用的路——`记一次网页下载`
       * 是一个**名字写死、形状写死**的函数，与 `openPath` / `trashItem`
       * 反方向的同一条缝。理由写在 `wiring.ts` 那个方法的注释里。
       */
      (入) => workbench?.记一次网页下载(入),
    ))
  ipcMain.handle(IPC_WEB_CONTROL, async (_e, cmd: 网页命令) => {
    刷下载目录()
    return 网页的().控制(cmd)
  })
  /**
   * **窗口要关、或者应用要退，都得先把它拆掉。**
   *
   * 一个还活着的 `WebContentsView` 会把应用拽住不放——症状是
   * *「Tearing down "dawn" exceeded the test timeout」*
   * （批 1 当场撞到；`will-quit` 那段注释里记着同一症状的另一个原因）。
   * **挂 `close` 而不是 `closed`**：后者触发时窗口已经销毁，那时再去
   * `removeChildView` 就晚了。
   */
  const 拆掉网页 = () => {
    try {
      网页?.销毁()
    } catch (e) {
      console.error("[网页预览] 拆的时候出错（不拦退出）：", e)
    }
    网页 = undefined
  }
  win.on("close", 拆掉网页)
  app.on("before-quit", 拆掉网页)

  win.webContents.setWindowOpenHandler(({ url }) => {
    放外面开(url)
    // **一律 deny**：要么已经交给系统浏览器了，要么它本来就不该开
    return { action: "deny" }
  })

  /**
   * **主窗口不许被导航走。**
   *
   * 一个 `<a>` 不带 `target` 时点下去会就地导航——那会把整个应用
   * **换成一个网页**，而且回不来（我们没有后退按钮）。
   * 自家那份 `dist/ui/index.html` 例外。
   */
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file://") && url.includes("/dist/ui/")) return
    e.preventDefault()
    console.error(`[导航拦截] 主窗口不许被导航走：${url.slice(0, 120)}`)
    放外面开(url)
  })

  // **渲染进程的报错必须能被看见。**
  // 此前它们只进 devtools，而 devtools 默认不开——于是「界面死了但主进程一切正常」
  // 这种最难查的情况，终端上一个字都没有。规格 7.5：失败必须出声。
  win.webContents.on("console-message", (e) => {
    if (e.level === "warning" || e.level === "error") {
      console.error(`[渲染进程] ${e.sourceId}:${e.lineNumber} ${e.message}`)
    }
  })
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[渲染进程崩溃] ${details.reason}（exitCode=${details.exitCode}）`)
  })
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[页面加载失败] ${desc}（${code}）${url}`)
  })
  win.webContents.on("preload-error", (_e, path, err) => {
    console.error(`[preload 出错] ${path}:`, err)
  })

  // 这里曾有一个 `DAWN_PROBE` 调试块，用 `executeJavaScript` 往渲染进程里注入
  // 任意脚本。它在 R2/R5 与本次令牌验证中都起了作用，但**留在生产代码里不合适**：
  // 一个由环境变量开关的任意代码执行入口，无论怎么解释都是个洞。
  // 一次性的验证应当用一次性的手段，长期的验证应当是 Playwright e2e（Task 3.10）。

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(import.meta.dirname, "../ui/index.html"))
}

/**
 * 后端建好了没有（2026-08-11）。
 *
 * ## 它修的是一个只在负载高时露头的缺陷
 *
 * 此前顺序是：`createWorkbench()`（同步：迁移、加载配置、启动对账）
 * → 注册 IPC → `createWindow()`。也就是说**后端没建完就一个窗口都没有**。
 *
 * 于是有两种情况会变成「什么都不发生」：
 *   1. 后端建得慢（e2e 全量跑时，旁边有真 Python/R 内核在抢 CPU）——
 *      Playwright 的 `firstWindow` 等 30 秒等不到窗口
 *   2. 后端**抛错**——那时会弹一个 `showErrorBox` 模态框，
 *      而模态框是阻塞的，**窗口永远不会出现，终端上也一个字都没有**
 *
 * 今天这条挂起出现了十几次，每次都只能靠「单独重跑就好」糊过去。
 *
 * **现在窗口先开。** IPC 的处理器立刻注册，但它先 `await` 这个 promise——
 * 渲染进程于是只是**等**，而不是撞上「没有这个处理器」然后进重试状态机。
 */
let 后端就绪: () => void
const 后端建好了 = new Promise<void>((r) => {
  后端就绪 = r
})
/** 后端没建起来的原因。**握手时原样交给界面**，而不是让人对着一个空窗口猜 */
let 启动失败: string | undefined
/** 协议分发器。**建好后端才有**，所以上面那个 handler 要先等 */
let ipcDispatch: ReturnType<typeof createIpcHandler> | undefined

/** 还没接上事件流的窗口。**后端建好之后补接** */
const 待接的窗口 = new Set<BrowserWindow>()

/**
 * 把事件中枢接到一个窗口上。**后端还没建好就先记下**。
 *
 * **销毁后要停手**：往已销毁的 webContents 发送会抛，
 * 而这条路径在关窗时必然发生（PTY 还在吐字节）。
 */
function 接上事件流(win: BrowserWindow): void {
  if (!workbench) {
    待接的窗口.add(win)
    win.on("closed", () => 待接的窗口.delete(win))
    return
  }
  const off = workbench.events.onUpdate((event) => {
    if (win.isDestroyed()) return
    win.webContents.send(IPC_EVENT_CHANNEL, event)
  })
  /**
   * 远端连接状态（②-B · R3）。**同一条 IPC 通道，另一种载荷。**
   *
   * schema 是分开的（`RemoteUpdate` 没有 `sessionId`），传输共用一条——
   * 再开一条通道就要在 preload 上再挖一个口，而那条通道是单向的、
   * 挖一个就多一处要守的边界。渲染进程按形状分派。
   */
  const offRemote = workbench.onRemoteState((u) => {
    if (win.isDestroyed()) return
    win.webContents.send(IPC_EVENT_CHANNEL, {
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      ...u,
    })
  })
  win.on("closed", () => {
    off()
    offRemote()
  })
}

app.whenReady().then(() => {
  /**
   * **连 Dock 图标也不要跳**（e2e 用，2026-08-11）。
   *
   * 窗口藏起来了，但 macOS 的 Dock 上仍然会蹦出一个图标并抢一次注意力——
   * 一套测试跑下来蹦十几次。作者要的是「测试不影响我做别的事」，
   * 那就得连这一下也没有。
   */
  if (隐藏窗口) app.dock?.hide()
  /**
   * **先开窗口，再建后端。**
   *
   * 顺序反过来的代价见上面那段注释：后端慢或炸的时候，
   * 用户（和测试）看到的是**没有窗口**——最难查的一种失败。
   */
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  /**
   * IPC 立刻注册，但**每一次调用先等后端**。
   *
   * 这样渲染进程的第一次握手只是慢一点，而不是失败——
   * 失败会让它进「重试三次然后放弃」的状态机，
   * 而那个状态机是为「后端真的挂了」准备的，不是为「后端还在启动」。
   */
  ipcMain.handle(IPC_CHANNEL, async (_e, operation: unknown, request: unknown, requestId?: string) => {
    await 后端建好了
    if (启动失败) throw new Error(启动失败)
    return ipcDispatch!(operation, request, requestId ? { requestId } : {})
  })

  try {
    workbench = createWorkbench({
      configPath: CONFIG,
      dbPath: DB,
      // 凭证由 app 管：加密交给 OS（macOS Keychain / DPAPI / libsecret）
      credentials: new CredentialStore({
        file: defaultCredentialFile(app.getPath("userData")),
        safeStorage,
      }),
      defaultWorkspace: DEFAULT_WORKSPACE,
      // **只有主进程碰得到 shell**。路径的合法性在后端已经校验过了
      openPath: (p: string) => shell.openPath(p),
      /**
       * 扔进废纸篓（批 5，2026-08-17）。**与 `openPath` 同一条注入缝。**
       *
       * 本地删除**可恢复**，远端只有 `unlink`（没了就是没了）——
       * 这个差别一路带到按钮文案上。
       */
      trashItem: (p: string) => shell.trashItem(p),
      // 远程助理：人在电脑前（窗口在前台）就不往微信推通知
      isForeground: () => BrowserWindow.getFocusedWindow() !== null,
      /**
       * 系统的下载目录（批 4a，2026-08-17）。
       *
       * **只有主进程问得到 `app.getPath`**，而这正是不在别处按平台拼路径的理由：
       * `~/Downloads` 与 `%USERPROFILE%\\Downloads` 会坏在别人机器上，
       * 而且跟不上用户改过的系统设置。
       */
      /**
       * **e2e 要能把它指到隔离目录里**（`DAWN_DOWNLOADS`）——
       * 不然测试会往开发者真实的 `~/Downloads` 里落文件。
       * 与 `DAWN_DEFAULT_WORKSPACE` 那几条同一个机制。
       */
      downloadsDir: process.env.DAWN_DOWNLOADS ?? app.getPath("downloads"),
      /**
       * 子 agent 入口就打在主进程 bundle 旁边（`dist/electron/`）。
       *
       * **路径在这里算，不在 wiring 里算**——`import.meta.dirname` 只有这里
       * 指向构建产物目录；wiring 是纯逻辑，不该知道构建布局。
       * 文件名从协议模块取，与 `build-electron.mjs` 的 outfile 是同一个常量。
       */
      subagentChildEntry: join(import.meta.dirname, CHILD_ENTRY),
      /**
       * 我们那台 MCP 服务器（B1 路线 B，2026-08-17）。
       * 与上面同一条理由：`import.meta.dirname` 只有这里算得准
       * （构建时拷到了 `dist/electron/` 旁边）。
       */
      dawnMcpEntry: join(import.meta.dirname, "dawn-mcp-server.mjs"),
      /**
       * **自带技能的位置**（S20，2026-08-15）。与上面同一条理由：
       * `import.meta.dirname` 只有这里算得准。构建时拷到了 `dist/skills`。
       */
      builtinSkillsDir: join(import.meta.dirname, "..", "skills"),
      /** 自带的子 agent 同一条理由（2026-08-22）。构建时拷到了 `dist/agents` */
      builtinAgentsDir: join(import.meta.dirname, "..", "agents"),
      ...(AGENTS_DIR_ENV ? { agentsDir: AGENTS_DIR_ENV } : {}),
      ...(CLI_HOME ? { cliHome: CLI_HOME } : {}),
      ...(SKILLS_DIR ? { skillsDir: SKILLS_DIR } : {}),
      ...(MODELS_JSON ? { modelsPath: MODELS_JSON, skipCredentialGate: true } : {}),
      ...(SCRATCH_ROOT ? { scratchRoot: SCRATCH_ROOT } : {}),
      ...(FAKE_SSH ? { fakeSsh: true } : {}),
      ...(LEASE_TTL ? { leaseTtlSeconds: LEASE_TTL } : {}),
      onInternalError: (op, err) => console.error(`[workbench] ${op} 失败:`, err),
    })
    if (workbench.reconciled > 0) {
      console.error(`[启动对账] 修正了 ${workbench.reconciled} 条残留会话记录`)
    }
  } catch (err) {
    /**
     * 配置错误必须让人看见（规格 7.5 无静默回退）。**三条路一起走**：
     *   1. stderr——e2e 与 `npm run app` 的终端上看得见（此前一个字都没有）
     *   2. 握手时把这句话交给界面——窗口已经开着，它能显示原因
     *   3. 模态框——给真人看的
     *
     * **顺序要紧**：模态框是阻塞的，它必须排在最后，
     * 而且必须在窗口已经存在之后。此前它排在窗口之前，
     * 于是一次启动失败的表现是「窗口永远不出现」。
     */
    const message = err instanceof Error ? err.message : String(err)
    启动失败 = message
    console.error(`[启动失败] ${message}（配置文件：${CONFIG}）`)
    后端就绪()
    dialog.showErrorBox("DAWN 启动失败", `${message}\n\n配置文件：${CONFIG}`)
    app.exit(1)
    return
  }

  ipcDispatch = createIpcHandler(workbench.server)

  /**
   * 取色器的一帧（2026-08-24）：截**自己的窗口**用 `capturePage`——
   * 不走 desktopCapturer，那条在 macOS 上要「屏幕录制」权限，而我们只取自己页面上的颜色。
   */
  ipcMain.handle(IPC_CAPTURE_PAGE, async (e) => {
    const img = await e.sender.capturePage()
    const size = img.getSize()
    return { dataUrl: img.toDataURL(), width: size.width, height: size.height }
  })

  // 选目录走独立窄通道：它要用 dialog，而协议服务端必须能在 node 下测
  ipcMain.handle(IPC_PICK_DIRECTORY, async (e, defaultPath?: string) => {
    /**
     * **e2e 的注入点**（2026-08-12，与 `DAWN_LEASE_TTL` 同一个路子）。
     *
     * 原生目录选择器是系统模态框——**Playwright 驱动不了它**。
     * 没有这个口子，凡是「选个文件夹」开头的路径就只能绕过界面直接打 IPC，
     * 而那样验的是后端，不是**用户真正点的那条路**。
     *
     * 只在环境变量给了值时生效，真实运行里这一行永远不成立。
     */
    const 注入的 = process.env.DAWN_PICK_DIRECTORY
    if (注入的) return 注入的
    const owner = BrowserWindow.fromWebContents(e.sender)
    /**
     * **从默认工作目录起步**（2026-08-12，作者要的那个设置的第二个用处）。
     * 不给就交给系统决定——**不猜一个**。
     */
    const opts = {
      properties: ["openDirectory" as const],
      ...(defaultPath ? { defaultPath } : {}),
    }
    const r = owner
      ? await dialog.showOpenDialog(owner, opts)
      : await dialog.showOpenDialog(opts)
    // 取消返回 null，不报错——用户改主意不是错误
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  /**
   * 原生文件选择器（2026-08-13，作者要的那颗 `＋`）。
   *
   * 与目录选择器同一副做法，包括那个 e2e 注入点——
   * **系统模态框 Playwright 驱动不了**，没有它就只能绕过界面直接打 IPC，
   * 而那样验的是后端，不是用户真正点的那条路。
   *
   * 多选：`multiSelections`。取消返回空数组，**不是 null**——
   * 调用点拿到的永远是一个数组，少一处判空就少一处漏判。
   */
  ipcMain.handle("dawn:shell:pick-files", async (e, kind: string, defaultPath?: string) => {
    const 注入的 = process.env.DAWN_PICK_FILES
    if (注入的) return 注入的.split(",").filter(Boolean)
    const owner = BrowserWindow.fromWebContents(e.sender)
    /**
     * 类型过滤。**它是「上传图片 / 上传数据」目前真实的区别**——
     * 替人把文件浏览器里的噪声挡掉，仅此而已。
     * **每一档都留一条「所有文件」的退路**：过滤器猜错了扩展名时，
     * 人得能自己绕过去。
     */
    const 过滤: Record<string, { name: string; extensions: string[] }[]> = {
      image: [
        { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg"] },
        { name: "所有文件", extensions: ["*"] },
      ],
      data: [
        {
          name: "数据",
          extensions: ["csv", "tsv", "xlsx", "xls", "json", "jsonl", "parquet", "feather",
                       "dta", "sav", "h5", "hdf5", "nc", "rds", "rdata", "txt"],
        },
        { name: "所有文件", extensions: ["*"] },
      ],
    }
    const opts = {
      properties: ["openFile" as const, "multiSelections" as const],
      ...(过滤[kind] ? { filters: 过滤[kind] } : {}),
      ...(defaultPath ? { defaultPath } : {}),
    }
    const r = owner
      ? await dialog.showOpenDialog(owner, opts)
      : await dialog.showOpenDialog(opts)
    return r.canceled ? [] : r.filePaths
  })

  /**
   * 一张图的缩略图（2026-08-13，作者给了一张 Codex 的截图：
   * 它把附件画成**图本身的缩略图**，不是一行文件名）。
   *
   * **缩到 320px 再回**：界面只是要让人确认「我挑的是这张」。
   * 真正送进模型的那份字节由 `writeToSession` 那条路在这一侧读，
   * **不经过渲染进程**——两条路各取所需，谁都不多搬一次。
   *
   * **失败返回 null，不抛**：缩略图出不来只是看不见预览，
   * 图本身还是好的，不该因此拦住发送。
   */
  /**
   * 扩展名 → MIME。**与 `workbench/backend.ts` 里那张表是同一件事**，
   * 但这两层不共享模块（一个是 Electron 壳，一个是后端内核），
   * 而**为了一张八行的表去建一条跨层依赖，代价比重复它更大**。
   *
   * 真正的判据在后端那一份：这里认不出来只是不给预览，
   * 而那边认不出来会**拒绝发送**——两处不一致时，坏的方向是「预览没有、
   * 但发得出去」，那是可以接受的一侧。
   */
  const 猜图片类型 = (p: string): string | undefined =>
    ({
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".tif": "image/tiff",
      ".tiff": "image/tiff",
    })[extname(p).toLowerCase()]

  ipcMain.handle("dawn:shell:image-thumb", async (_e, path: string) => {
    try {
      const bytes = await readFile(path)
      const mime = 猜图片类型(path)
      if (!mime) return null
      const r = await resizeImage(bytes, mime, { maxWidth: 320, maxHeight: 320 })
      if (r) return `data:${r.mimeType};base64,${r.data}`
      /**
       * **缩不动就原样给**（Photon/WASM 起不来时 `resizeImage` 返回 null）。
       * 小图这条路完全够用，而大图在这儿最多是多占一点内存——
       * 比「预览整个不见了」强。
       */
      return `data:${mime};base64,${bytes.toString("base64")}`
    } catch {
      return null
    }
  })

  /**
   * 后端就位：**先补接事件流，再放行 IPC**。
   *
   * 顺序反过来的话，界面可能在事件流接上之前就发出第一句话——
   * 那一轮的回复会全部丢掉，而屏幕上只是「没有回复」。
   */
  for (const win of 待接的窗口) 接上事件流(win)
  待接的窗口.clear()
  后端就绪()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

/**
 * 关停顺序是正式代码（Phase 0 通则 ②）。
 *
 * **2026-08-11：退出前要等会话真的停掉。**
 *
 * 内核会话背后是 zeromq 的 socket，**带着未关闭的 socket 退出，
 * native 析构会抛 `Napi::Error`——JS 接不住，整个进程 SIGABRT**。
 * 崩溃的代价不在本次退出（反正要退），而在**下一次启动**：
 * macOS 的崩溃上报会把它拖慢好几秒，e2e 那边的表现就是
 * `firstWindow: Timeout 30000ms`——一笔挂了两天、每次都只能「重跑一遍」的账。
 *
 * 所以拦下这次退出、异步收摊、再真的退。**收摊有上限**（见 `closeAsync`）：
 * 一个停不下来的内核不该让「关掉应用」变成「关不掉」。
 */
let 正在收摊 = false
app.on("will-quit", (e) => {
  if (正在收摊 || !workbench) return
  /**
   * **只有内核会话才值得等。**
   *
   * 第一版无条件走异步收摊，结果每一次退出都多花上一秒——
   * e2e 那边 155 条用例一下子从 5 分钟变成 22 分钟，
   * 还有几条直接报 `Tearing down "dawn" exceeded the test timeout`。
   * **为一个只在内核会话上出现的问题，让所有退出都变慢，是不划算的。**
   */
  if (!workbench.needsGracefulShutdown()) {
    workbench.close()
    return
  }
  正在收摊 = true
  e.preventDefault()
  /**
   * **硬兜底**：收摊本身也可能卡住（一个不肯死的内核）。
   * 那时也要退——「关不掉的应用」比「退出时少关一个 socket」严重得多。
   */
  const 兜底 = setTimeout(() => app.exit(0), 4000)
  void workbench
    .closeAsync()
    .catch((err: unknown) => console.error("[退出] 收摊时出错：", err))
    .finally(() => {
      clearTimeout(兜底)
      app.exit(0)
    })
})
