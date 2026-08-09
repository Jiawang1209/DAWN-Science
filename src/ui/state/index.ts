/**
 * 界面状态，**按权威分家**。
 *
 * ```
 * connection.ts   主进程权威   —— 后端能不能用
 * catalog.ts      后端权威     —— 项目/会话/Run/provider/凭证（渲染进程只是缓存）
 * transcript.ts   后端权威     —— 当前会话的对话与终端字节
 * view.ts         渲染进程自有 —— 看的是哪个面、哪个会话、dock 开没开
 * ```
 *
 * 两个横切工具：
 * ```
 * identity.ts     无变化时保持引用同一（规则 6）
 * guard.ts        提防过去，丢弃迟到的结果（规则 3）
 * ```
 *
 * **一个新的全局 store 是在主张「很多互不相邻的界面都需要它」。**
 * 这个主张要挣来——短命的交互细节留在组件里，不必到这里。
 */
export {
  $items,
  $terminal,
  $terminalTrimmed,
  setItems,
  upsertItem,
  appendBytes,
  applySnapshot,
  resetTranscript,
} from "./transcript.js"

export {
  $connection,
  $ready,
  $notes,
  note,
  connectStarted,
  connectSucceeded,
  connectFailed,
  markStale,
  fatalReason,
  MAX_CONNECT_ATTEMPTS,
  type ConnectionState,
} from "./connection.js"

export {
  $projects,
  $sessions,
  $runs,
  $runDetail,
  $provenance,
  $providers,
  $credentials,
  setProjects,
  setSessions,
  setRuns,
  setRunDetail,
  setProvenance,
  setProviders,
  setCredentials,
  type RunDetail,
  type Providers,
  type CredentialState,
} from "./catalog.js"

export {
  $view,
  $dockOpen,
  $drafts,
  $paletteOpen,
  $paletteQuery,
  openPalette,
  closePalette,
  togglePalette,
  $activeProjectId,
  $activeSessionId,
  draftOf,
  setDraft,
  clearDraft,
  setView,
  setDockOpen,
  setActiveProjectId,
  setActiveSessionId,
  type View,
} from "./view.js"

export {
  $theme,
  THEME_STORAGE_KEY,
  applyTheme,
  loadTheme,
  resolveTheme,
  setTheme,
  type ThemeChoice,
} from "./theme.js"

export { guard, currentGeneration, invalidate } from "./guard.js"
export { sameList, setList, setValue } from "./identity.js"

export {
  fail,
  loadProjects,
  loadCredentials,
  loadProviders,
  loadSessions,
  loadRuns,
  loadRunDetail,
  resyncSession,
} from "./sync.js"

import { $items, $terminal, $terminalTrimmed } from "./transcript.js"
import { $connection, $notes, $ready } from "./connection.js"
import {
  $credentials,
  $projects,
  $providers,
  $provenance,
  $runDetail,
  $runs,
  $sessions,
} from "./catalog.js"
import {
  $activeProjectId,
  $activeSessionId,
  $dockOpen,
  $drafts,
  $paletteOpen,
  $paletteQuery,
  $view,
} from "./view.js"
import { invalidate as invalidateGeneration } from "./guard.js"

/**
 * 把全部状态清回初始值。
 *
 * **为什么必须显式提供它**：这些 atom 是模块级单例，在同一个进程里
 * 跨测试、跨窗口重挂载都活着。写这个函数之前，一个测试留下的
 * `$activeProjectId` 指向了下一个测试里并不存在的项目，
 * 于是「新建会话」按钮一直是禁用的——**表现为「点了没反应」，
 * 而不是一条清楚的错误**。
 *
 * Hermes 把同一件事写成了纪律：*"Query invalidation alone cannot evict live
 * session stores — **wipe them**."*
 *
 * 目前只有测试调用它。将来做「切 profile / 换后端」时，
 * 那条路径也应当走这里，而不是各自 `set()` 一遍。
 */
export function resetAllState(): void {
  $connection.set({ phase: "connecting" })
  $ready.set(false)
  $notes.set([])
  $projects.set([])
  $sessions.set([])
  $runs.set([])
  $runDetail.set(undefined)
  $provenance.set(undefined)
  $providers.set({ agents: [], providers: [] })
  $credentials.set({ configured: [], encrypted: false })
  $activeProjectId.set(undefined)
  $activeSessionId.set(undefined)
  $view.set("conversation")
  $dockOpen.set(false)
  $drafts.set({})
  $paletteOpen.set(false)
  $paletteQuery.set("")
  $items.set([])
  $terminal.set([])
  $terminalTrimmed.set(false)
  invalidateGeneration()
}
