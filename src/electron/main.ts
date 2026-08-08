/**
 * Electron 主进程（Task 2.7）。
 *
 * **本文件只做两件事：开窗口、注册那一个 IPC 通道。**
 * 装配在 `wiring.ts`、派发在 `workbench/server.ts`、桥接逻辑在 `ipc.ts`——
 * 三者都不认识 Electron，因此都能单独测。这里剩下的部分正是「测不了、也不值得测」的那些。
 */
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron"
import { join } from "node:path"
import { IPC_CHANNEL, createIpcHandler } from "./ipc.js"
import { createWorkbench, type Workbench } from "./wiring.js"
import { CredentialStore, defaultCredentialFile } from "./credentials.js"

const CONFIG = process.env.DAWN_CONFIG ?? join(process.cwd(), "providers.yaml")
const DB = process.env.DAWN_DB ?? join(app.getPath("userData"), "dawn.db")
const DEV_URL = process.env.DAWN_DEV_SERVER

let workbench: Workbench | undefined

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    // 窗口标题栏留给 Rho 那种自绘顶栏（46px），但 ①-B 先用系统标题栏，不做无谓的自绘
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      // 渲染进程不给 node 能力：它只经 IPC 的单一入口取数（AgentDeck 的「不靠开洞」）
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(import.meta.dirname, "../ui/index.html"))
}

app.whenReady().then(() => {
  try {
    workbench = createWorkbench({
      configPath: CONFIG,
      dbPath: DB,
      // 凭证由 app 管：加密交给 OS（macOS Keychain / DPAPI / libsecret）
      credentials: new CredentialStore({
        file: defaultCredentialFile(app.getPath("userData")),
        safeStorage,
      }),
      onInternalError: (op, err) => console.error(`[workbench] ${op} 失败:`, err),
    })
    if (workbench.reconciled > 0) {
      console.error(`[启动对账] 修正了 ${workbench.reconciled} 条残留会话记录`)
    }
  } catch (err) {
    // 配置错误必须让人看见，而不是开一个空窗口让人猜（规格 7.5 无静默回退）
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox("DAWN 启动失败", `${message}\n\n配置文件：${CONFIG}`)
    app.exit(1)
    return
  }

  const handle = createIpcHandler(workbench.server)
  ipcMain.handle(IPC_CHANNEL, (_e, operation: unknown, request: unknown, requestId?: string) =>
    handle(operation, request, requestId ? { requestId } : {}),
  )

  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// 关停顺序是正式代码（Phase 0 通则 ②）：先放数据库句柄，再让运行时退出
app.on("will-quit", () => {
  workbench?.close()
})
