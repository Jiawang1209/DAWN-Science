/**
 * 界面状态，**按权威分家**。
 *
 * ```
 * connection.ts   主进程权威   —— 后端能不能用
 * catalog.ts      后端权威     —— 项目/会话/Run/provider/凭证（渲染进程只是缓存）
 * transcript.ts   后端权威     —— 当前会话的对话与终端字节
 * view.ts         渲染进程自有 —— 看的是哪个面、哪个会话、底部 dock 开没开
 * sidebar.ts      渲染进程自有 —— 侧栏多宽、折没折
 * right-dock.ts   渲染进程自有 —— 右侧坞开没开、住着谁、多宽
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
  $kernelInstanceId,
  $待答权限,
  $会话开关,
  resetTranscript,
} from "./transcript.js"

export {
  $dockOpen,
  $dockSessionId,
  $dockChunks,
  setDockOpen,
  toggleDock,
  setDockSessionId,
  setDockChunks,
  appendDockBytes,
  resetDockTerminal,
} from "./dock.js"

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
  $tasks,
  setTasks,
  $connections,
  setConnections,
  setConnectionState,
  $跑着的会话,
  标记在跑,
  setSessionCwd,
  $remoteOpen,
  toggleRemoteOpen,
  setRemoteOpen,
  $projects,
  $sessions,
  $tempSessions,
  setTempSessions,
  $runs,
  $runDetail,
  $provenance,
  $providers,
  $sessionModels,
  $contextUsage,
  $credentials,
  setProjects,
  setSessions,
  setRuns,
  setRunDetail,
  setProvenance,
  setProviders,
  setCredentials,
  setSessionModel,
  setContextUsage,
  type RunDetail,
  type Providers,
  type CredentialState,
} from "./catalog.js"

export {
  $view,
  $drafts,
  $paletteOpen,
  $paletteQuery,
  openPalette,
  closePalette,
  togglePalette,
  $activeProjectId,
  $activeSessionId,
  carryDraft,
  draftOf,
  setDraft,
  clearDraft,
  setView,
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

export {
  $sidebarWidth,
  $sidebarCollapsed,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_DEFAULT,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  clampWidth,
  loadSidebar,
  setSidebarWidth,
  setSidebarCollapsed,
  toggleSidebar,
} from "./sidebar.js"

export {
  $rightDockOpen,
  $rightDockTenant,
  $rightDockWidth,
  $待开网址,
  请打开网址,
  收走网址,
  RIGHT_DOCK_TENANT_KEY,
  RIGHT_DOCK_WIDTH_KEY,
  RIGHT_DOCK_DEFAULT,
  RIGHT_DOCK_MIN,
  RIGHT_DOCK_MAX,
  RIGHT_DOCK_两栏起点,
  坞的上界,
  全部房客,
  clampDockWidth,
  loadRightDock,
  setRightDockOpen,
  setRightDockTenant,
  setRightDockWidth,
  点开房客,
  type 坞房客,
} from "./right-dock.js"

export { guard, currentGeneration, invalidate } from "./guard.js"
export { sameList, setList, setValue } from "./identity.js"

export {
  fail,
  loadConnections,
  loadTasks,
  loadProjects,
  loadCredentials,
  loadProviders,
  loadContextUsage,
  loadSessions,
  loadTempSessions,
  loadRuns,
  loadRunDetail,
  resyncSession,
} from "./sync.js"

import { $items, $terminal, $terminalTrimmed } from "./transcript.js"
import { $connection, $notes, $ready } from "./connection.js"
import {
  $contextUsage,
  $credentials,
  $projects,
  $providers,
  $provenance,
  $sessionModels,
  $runDetail,
  $runs,
  $sessions,
} from "./catalog.js"
import {
  $activeProjectId,
  $activeSessionId,
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
  $sessionModels.set({})
  $contextUsage.set(undefined)
  $credentials.set({ configured: [], encrypted: false })
  $activeProjectId.set(undefined)
  $activeSessionId.set(undefined)
  $view.set("conversation")
  $drafts.set({})
  $paletteOpen.set(false)
  $paletteQuery.set("")
  $items.set([])
  $terminal.set([])
  $terminalTrimmed.set(false)
  invalidateGeneration()
}
