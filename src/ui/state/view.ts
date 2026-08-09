/**
 * 纯呈现状态与导航选择。
 *
 * **这一层是渲染进程真正拥有的东西**——它只关乎"这个窗口现在在看什么"，
 * 别的界面无权对它是对的。
 *
 * 与之相对，`catalog.ts` 里的每一样都是后端权威的缓存。
 * 分清这两者是 Hermes「按权威决定状态归属」的全部内容。
 */
import { atom } from "nanostores"
import { setValue } from "./identity.js"

export type View = "conversation" | "panel" | "settings"

export const $view = atom<View>("conversation")
export const $dockOpen = atom(false)

/**
 * 当前选中的项目与会话。
 *
 * **作用域是本窗口。** Hermes 的原话：*"Persisted state must declare its scope in
 * its own key: is this global, or does it belong to a connection, a profile, a
 * stored session, a project, or a window? **Getting the scope wrong is how one
 * profile's setting bleeds into another.**"*
 *
 * 它们目前不落盘。将来若要记住"上次看的会话"，key 必须带窗口标识，
 * 否则两个窗口会互相抢。
 */
export const $activeProjectId = atom<string | undefined>(undefined)
export const $activeSessionId = atom<string | undefined>(undefined)

/**
 * 每个会话各自的输入框草稿。**key 就是作用域声明。**
 *
 * Hermes：*"Persisted state must declare its scope in its own key: is this
 * global, or does it belong to a connection, a profile, a stored session, a
 * project, or a window? **Getting the scope wrong is how one profile's setting
 * bleeds into another**."*
 *
 * 此前草稿是 `ConversationView` 里的一个 `useState`。切会话时那个组件**不卸载**
 * （位置没变、实例复用），于是草稿原样留着——**在 A 里打了一半的话，
 * 切到 B 之后还在输入框里**。作用域写成了「这个组件」，而它实际属于「这个会话」。
 *
 * 渗漏比重启更糟：重启至少是可见的。
 */
export const $drafts = atom<Readonly<Record<string, string>>>({})

export function draftOf(sessionId: string | undefined): string {
  return sessionId ? ($drafts.get()[sessionId] ?? "") : ""
}

export function setDraft(sessionId: string, text: string): void {
  const prev = $drafts.get()
  if (prev[sessionId] === text) return
  $drafts.set({ ...prev, [sessionId]: text })
}

/** 发出去之后清掉。**只清这一个会话的** */
export function clearDraft(sessionId: string): void {
  const prev = $drafts.get()
  if (!(sessionId in prev)) return
  const next = { ...prev }
  delete next[sessionId]
  $drafts.set(next)
}

/**
 * 命令面板（①-B″ · U1）。
 *
 * **查询词跟着面板一起清。** 上一次搜的东西留到下一次打开，
 * 表现为「打开就已经过滤掉了大半命令」——人会以为命令不见了。
 * 作用域是「这一次打开」，所以关闭就是它的生命终点。
 */
export const $paletteOpen = atom(false)
export const $paletteQuery = atom("")

export function openPalette(): void {
  $paletteQuery.set("")
  setValue($paletteOpen, true)
}

export function closePalette(): void {
  setValue($paletteOpen, false)
  $paletteQuery.set("")
}

export function togglePalette(): void {
  if ($paletteOpen.get()) closePalette()
  else openPalette()
}

export const setView = (v: View) => setValue($view, v)
export const setDockOpen = (v: boolean) => setValue($dockOpen, v)
export const setActiveProjectId = (v: string | undefined) => setValue($activeProjectId, v)
export const setActiveSessionId = (v: string | undefined) => setValue($activeSessionId, v)
