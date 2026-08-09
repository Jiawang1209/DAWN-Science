/**
 * Workbench Protocol 的版本与兼容策略（Task 2.1）。
 *
 * 依据 Rho 的原则：**UI 只依赖版本化协议，不依赖实现内部**。
 * 版本号是这条依赖关系的唯一凭据——UI 启动时握手，不匹配就响亮报错，
 * 不静默降级（规格 7.5）。
 */
/**
 * 1.1（2026-08-08）：新增凭证的三个操作。
 * 1.2（2026-08-08）：新增 `getProviders`——界面要列出可选 agent 才能建会话，
 *   此前只能靠硬编码猜。minor 递增 = 向后兼容的新增。
 * 1.3（2026-08-08）：新增 `subscribeSession` / `unsubscribeSession`。
 *   此前协议**只能写不能读会话**——`writeToSession` 有，读的一个都没有，
 *   也就是说界面根本拿不到 agent 的回复。这是 MVP 那条路上断掉的一环。
 * **2.0（2026-08-08，破坏性）**：会话读取从 `seq + 环形缓冲 + dropped` 改为
 *   `snapshot + revision`（借自 pi-protocol）。`subscribeSession` 的响应形状变了，
 *   事件信封整体替换，故 major 递增。同批新增 `abortSession` / `steerSession`。
 *   **换来的不只是简单**：旧设计跳号只能出声，新设计跳号可以重新取快照——能自愈。
 */
export const WORKBENCH_PROTOCOL_VERSION = "2.1"

const VERSION_RE = /^(\d+)\.(\d+)$/

function parse(v: string): { major: number; minor: number } | undefined {
  const m = VERSION_RE.exec(v)
  if (!m) return undefined
  return { major: Number(m[1]), minor: Number(m[2]) }
}

/**
 * UI 能否与服务端通话。
 *
 * 规则：
 *   - **major 必须相同** —— major 递增即破坏性变更
 *   - **UI 的 minor 不得高于服务端** —— minor 递增只加字段；
 *     UI 比服务端新，意味着它会去读服务端根本不返回的字段
 *   - 反过来（服务端更新）是允许的：多出来的字段 UI 用不到，无害
 *
 * 格式非法一律判为不兼容——**不抛错也不放行**。放行会让一个畸形的版本号
 * 静默通过握手，那正是握手要防的事。
 */
export function isCompatible(uiVersion: string, serverVersion: string): boolean {
  const ui = parse(uiVersion)
  const server = parse(serverVersion)
  if (!ui || !server) return false
  return ui.major === server.major && ui.minor <= server.minor
}
