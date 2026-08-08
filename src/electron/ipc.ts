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
