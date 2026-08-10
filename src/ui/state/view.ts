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

/** `files` 是 ②-A′ 加的：工作区目录树 + 预览 */
export type View = "conversation" | "panel" | "settings" | "files"

export const $view = atom<View>("conversation")

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

/**
 * 建会话期间打的字，该不该跟着新会话走（2026-08-10）。
 *
 * ## 问题
 *
 * 按下「新建会话」到真的切过去之间有一段时间，**输入框还挂在上一个会话上**。
 * 人在这个窗口里打的字会落进他已经不看的那个会话，屏幕上像是凭空消失了。
 * （不是假想：2026-08-10 截侧栏时当场撞见。）
 *
 * ## 规则
 *
 * **只带「按下之后新打的那部分」。** 按下之前写了一半的仍归旧会话——
 * 那正是 `$drafts` 按会话分家要保的东西。判据就是「与按下那一刻的快照是否不同」。
 *
 * 抽成纯函数是因为**这是一个竞态**：用 e2e 去撞那个窗口只会得到一条不稳的用例，
 * 而规则本身是确定的，可以直接验。
 *
 * @returns `undefined` 表示什么都不用做
 */
export function carryDraft(
  oldSessionId: string | undefined,
  snapshotAtClick: string,
  currentDraft: string,
  newSessionId: string,
): { moveTo: string; text: string; restoreTo: string; restored: string } | undefined {
  if (!oldSessionId) return undefined
  // 没变说明人在这段时间里什么都没打——不动任何东西
  if (currentDraft === snapshotAtClick) return undefined
  // **同一个会话不搬**：旧的就是新的时，搬运没有意义，还会把快照倒灌回去
  if (oldSessionId === newSessionId) return undefined
  return {
    moveTo: newSessionId,
    text: currentDraft,
    restoreTo: oldSessionId,
    restored: snapshotAtClick,
  }
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
export const setActiveProjectId = (v: string | undefined) => setValue($activeProjectId, v)
export const setActiveSessionId = (v: string | undefined) => setValue($activeSessionId, v)
