/**
 * preload：渲染进程与主进程之间的唯一开口（Task 2.8）。
 *
 * 只暴露 `window.dawn.invoke(operation, request)` 一个函数。
 * **不暴露任何 node API、不暴露 ipcRenderer 本身**——
 * 暴露后者等于把整个 IPC 表面开给渲染进程，那正是 contextIsolation 要防的。
 */
import { contextBridge, ipcRenderer } from "electron"

const CHANNEL = "dawn:workbench:invoke"

contextBridge.exposeInMainWorld("dawn", {
  invoke: (operation: string, request: unknown, requestId?: string) =>
    ipcRenderer.invoke(CHANNEL, operation, request, requestId),
})
