/**
 * preload：渲染进程与主进程之间的唯一开口（Task 2.8 / 2.18）。
 *
 * 只暴露两样东西：
 *   - `window.dawn.invoke(operation, request)` —— 请求/响应
 *   - `window.dawn.onEvent(cb)` —— 只听主进程推来的会话事件
 *
 * **不暴露任何 node API、不暴露 ipcRenderer 本身**——
 * 暴露后者等于把整个 IPC 表面开给渲染进程，那正是 contextIsolation 要防的。
 *
 * `onEvent` 只挂 `on`，**不给渲染进程任何往事件通道发消息的能力**：
 * 这条通道是单向的，开一个反向口子等于把它变成第二个 invoke。
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

const CHANNEL = "dawn:workbench:invoke"
const EVENT_CHANNEL = "dawn:workbench:event"

contextBridge.exposeInMainWorld("dawn", {
  invoke: (operation: string, request: unknown, requestId?: string) =>
    ipcRenderer.invoke(CHANNEL, operation, request, requestId),

  onEvent: (cb: (raw: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(EVENT_CHANNEL, listener)
    // 返回退订函数：热重载与组件卸载都会走到这里，不退订就会越积越多
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  },
})
