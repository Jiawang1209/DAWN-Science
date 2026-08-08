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

export const setView = (v: View) => setValue($view, v)
export const setDockOpen = (v: boolean) => setValue($dockOpen, v)
export const setActiveProjectId = (v: string | undefined) => setValue($activeProjectId, v)
export const setActiveSessionId = (v: string | undefined) => setValue($activeSessionId, v)
