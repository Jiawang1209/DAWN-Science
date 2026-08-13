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
const PICK_DIRECTORY = "dawn:shell:pick-directory"
const PICK_FILES = "dawn:shell:pick-files"
const IMAGE_THUMB = "dawn:shell:image-thumb"

contextBridge.exposeInMainWorld("dawn", {
  invoke: (operation: string, request: unknown, requestId?: string) =>
    ipcRenderer.invoke(CHANNEL, operation, request, requestId),

  /**
   * 原生目录选择器。取消时得到 null——用户改主意不是错误。
   * `defaultPath` 是**起步的地方**（设置里那个默认工作目录）。
   */
  pickDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke(PICK_DIRECTORY, defaultPath),

  /**
   * 原生文件选择器（2026-08-13，作者要的那颗 `＋`）。**可以多选。**
   *
   * `kind` 决定对话框里的类型过滤——**那就是「上传图片 / 上传数据」
   * 与「上传文件」之间真正的区别**：它不声称我们对图片有什么特别能力，
   * 只是替你把浏览器里的噪声挡掉。
   *
   * 取消时返回空数组——用户改主意不是错误。
   */
  pickFiles: (kind: "any" | "image" | "data", defaultPath?: string): Promise<string[]> =>
    ipcRenderer.invoke(PICK_FILES, kind, defaultPath),

  /**
   * 一张图的**缩略图**，`data:` URL（2026-08-13）。
   *
   * **只给缩小过的那一份。** 界面要的是「让人看一眼确认没挑错」，
   * 而真正要送进模型的字节留在主进程——为了看一眼就把 20MB 搬过 IPC，
   * 是拿内存换一个本来不需要的拷贝。
   *
   * 读不出来返回 null：**缩略图出不来不该拦住发送**（那只是看不见预览，
   * 图本身还是好的）。
   */
  imageThumb: (path: string): Promise<string | null> =>
    ipcRenderer.invoke(IMAGE_THUMB, path),

  onEvent: (cb: (raw: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(EVENT_CHANNEL, listener)
    // 返回退订函数：热重载与组件卸载都会走到这里，不退订就会越积越多
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  },
})
