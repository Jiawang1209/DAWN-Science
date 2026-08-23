/**
 * IPC 桥的可测核心（Task 2.8）。
 *
 * **只暴露一个入口 `invoke(operation, request)`**，转给 `WorkbenchServer`，
 * 不含任何业务逻辑。
 *
 * 依据 AgentDeck `ui.py`：GUI 只经固定的少数端点取数，**不靠开洞**。
 * 单一入口使「UI 能做什么」完全由协议的操作清单决定，
 * 而不是由「暴露了多少个 IPC 通道」决定——后者会随手一加就多一个口子。
 */
import type { WorkbenchServer, WorkbenchResponse } from "../workbench/server.js"

/** 请求/响应通道。渲染进程主动发起，主进程回。 */
export const IPC_CHANNEL = "dawn:workbench:invoke"

/**
 * 事件通道。**方向相反：主进程主动推，渲染进程只听。**
 *
 * 与请求/响应通道**刻意不合并**——两者的错误语义完全不同：
 * 请求失败要回给发起者并可重试，事件推送失败没有发起者可回。
 * 合并会逼着其中一方接受另一方的语义。
 */
export const IPC_EVENT_CHANNEL = "dawn:workbench:event"

/**
 * 选目录。**刻意不做成协议操作**——它要用 Electron 的 `dialog`，
 * 而 `WorkbenchServer` 必须能在 node 下测（Task 2.3 的前提）。
 * 把一个只有 Electron 才跑得起来的东西塞进协议，等于毁掉那个前提。
 *
 * 这是一条**窄通道**：没有入参，只回一个绝对路径或 `null`（用户取消）。
 * 取消返回 null 而不是报错——用户改主意不是错误。
 */
export const IPC_PICK_DIRECTORY = "dawn:shell:pick-directory"
/** 取色器要看像素（2026-08-24 作者要的放大镜取色）：截当前窗口一帧。与选目录同理，走窄通道不进协议 */
export const IPC_CAPTURE_PAGE = "dawn:shell:capture-page"

/**
 * 网页预览那一格（批 1，2026-08-18）。**同样刻意不做成协议操作**——
 * 它操纵的是一个 `WebContentsView`，只有 Electron 里才有那个东西。
 *
 * **两条通道，与 workbench 那两条同一个理由**：请求/响应失败要回给发起者，
 * 状态推送没有发起者可回。合并会逼着其中一方接受另一方的语义。
 */
export const IPC_WEB_CONTROL = "dawn:web:control"
export const IPC_WEB_STATE = "dawn:web:state"

export interface IpcHandler {
  (operation: unknown, request: unknown, ctx?: { requestId?: string }): Promise<WorkbenchResponse>
}

export function createIpcHandler(server: WorkbenchServer): IpcHandler {
  return async (operation, request, ctx = {}) => {
    // 通道边界上先做类型收窄：渲染进程送来的东西一律不可信，
    // 哪怕它是我们自己写的 preload——将来 devtools 里手敲一行就能绕过。
    if (typeof operation !== "string") {
      return server.handle("__invalid__", request, ctx)
    }
    return server.handle(operation, request, ctx)
  }
}
