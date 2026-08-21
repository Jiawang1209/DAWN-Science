/**
 * 底部终端 dock 的状态（2026-08-11）。**渲染进程自有。**
 *
 * 作者：*「终端，我们要学习 Claude app、Codex app，要点击之后，界面下方
 * 单独出现一个地方，可以专门用于开启一个新的终端，并且这个终端的路径，
 * 应该是项目文件夹的路径。」*
 *
 * ## 为什么它必须是**另一条**订阅，而不是复用当前会话那一条
 *
 * 此前一个终端会话是**占满主区**的：选中它，它就是「当前会话」，
 * 于是 `transcript.ts` 里那一份字节流正好够用。
 *
 * dock 改变了这件事：**终端要和一段对话同时活着**——你一边让模型干活，
 * 一边在下面敲命令。那一刻有两个会话在推送，
 * 而「当前会话」只有一个。所以 dock 自己有一份字节流与自己的订阅。
 *
 * **两份不会串**：推送按 sessionId 分流（见 `App.tsx` 的订阅回调），
 * 各写各的 atom。
 */
import { atom } from "nanostores"
import { sameList } from "./identity.js"

/** dock 开着没有。**不持久化**——它是一个窗口此刻的样子，不是设置 */
export const $dockOpen = atom(false)
export const setDockOpen = (v: boolean) => $dockOpen.set(v)
export const toggleDock = () => $dockOpen.set(!$dockOpen.get())

/**
 * dock 里**正在看**哪个终端。
 *
 * 一次只显示一个：多开的终端各自活着（它们是各自的会话，进程一直在跑），
 * 但屏幕上只画选中的那个——**没画出来不等于死了**，这一点由标签页体现。
 */
export const $dockSessionId = atom<string | undefined>(undefined)
export const setDockSessionId = (id: string | undefined) => $dockSessionId.set(id)

/** dock 那个终端的字节流。与 `$terminal`（当前会话的）**是两份** */
export const $dockChunks = atom<readonly string[]>([])

export function setDockChunks(chunks: readonly string[]): void {
  // 无变化时保持同一个引用（规则 6）——否则 xterm 会被无谓地重画
  if (sameList($dockChunks.get(), chunks)) return
  $dockChunks.set(chunks)
}

export function appendDockBytes(data: string): void {
  $dockChunks.set([...$dockChunks.get(), data])
}

/** 换一个终端看：**先清空再取快照**，否则上一个的输出会倒灌进这一个 */
export function resetDockTerminal(): void {
  $dockChunks.set([])
}

/**
 * 每个终端是从哪段对话里开出来的（2026-08-21，作者要的：*「每次开启新会话，
 * 我再次点击终端的话，要是一个新的终端，而不能是以前一大堆关闭的终端开开着」*）。
 *
 * **只在内存里**：终端活不过本进程（启动对账会把尸体删掉），归属也不用活得更久。
 * 键是终端的 sessionId，值是它归属的对话 sessionId；没有对话时用 `无会话`。
 */
export const 无会话 = "（无会话）"
/**
 * **存 `sessionStorage`，不存 `localStorage`**：它要活过一次页面重载（开发时常有），
 * 但不该活过应用重启——那时终端早没了，启动对账会把尸体删掉。
 * key 里写明作用域是 window（本项目的规矩：搞错作用域就是一个会话的东西渗进另一个）。
 */
const 终端归属KEY = "dawn.window.terminal-owner"
function 读归属(): ReadonlyMap<string, string> {
  try {
    const raw = sessionStorage.getItem(终端归属KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, string>
    return new Map(Object.entries(obj))
  } catch {
    return new Map()
  }
}
export const $终端归属 = atom<ReadonlyMap<string, string>>(读归属())
export function 记终端归属(终端: string, 归属: string): void {
  const n = new Map($终端归属.get())
  n.set(终端, 归属)
  $终端归属.set(n)
  try {
    sessionStorage.setItem(终端归属KEY, JSON.stringify(Object.fromEntries(n)))
  } catch (e) {
    console.error("[终端] 归属保存失败，本次仍然生效，但重载页面后不会被记住：", e)
  }
}
