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
