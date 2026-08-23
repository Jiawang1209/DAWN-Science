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
/**
 * 当前在哪一屏。**一个枚举，不是几个布尔**——布尔各自为政的话，
 * 加第三个屏时总有一处忘了改，而那一处的症状是「会话行仍然高亮着，
 * 人却已经不在会话里了」。
 *
 * 2026-08-12 加了 `skills` / `mcp`（作者要的四个固定入口里的两个）。
 */
/**
 * **`"files"` 在 2026-08-17（批 2）摘掉了**：文件不再是一整屏，
 * 它长在右侧坞里（`right-dock.ts`）。**`"panel"` 在 2026-08-20 因同一个
 * 理由摘掉**：概览搬进坞的第三个页签，那一整屏退役了。
 *
 * 留着一个没人设的取值，就是在类型上说一句不成立的话——
 * 下一个读这行的人（包括几个月后的我）会以为还有那一屏。
 */
export type View = "conversation" | "settings" | "archived" | "schedule"

export const $view = atom<View>("conversation")

/**
 * 设置屏里选中的分类（2026-08-23）。**技能 / 子 agent / 插件 / MCP / 远程助理从侧栏并进了设置**（作者：「前 4 个内容保留，剩下的都并入设置」），
 * 所以「去技能那一屏」= `setView("settings")` + 这一把。`undefined` = 设置屏自己的默认（第一项）。
 */
export const $settingsSection = atom<string | undefined>(undefined)
export const openSettingsSection = (id?: string) => {
  $settingsSection.set(id)
  $view.set("settings")
}

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

/**
 * 输入框里按 `/` 弹的那份单子（2026-08-22，作者：`/` 弹出整个命令面板是错的，那儿该只有技能与子 agent）。
 * 由 App 在启动与切项目时填；两个输入框（对话屏、空态屏）共用。
 */
export interface SlashItem {
  /** `team`：团队模式那一项（team-board，2026-08-22）——选了把草稿换成 `/team ` */
  kind: "skill" | "subagent" | "team"
  /** 标识符：技能名 / 子 agent 名，`/skill:名` 或派它时用的 */
  name: string
  /** 给人看的名字（子 agent 的 `title`）；没有就用 name */
  title?: string | undefined
  description: string
  group?: string | undefined
}
export const $slashItems = atom<readonly SlashItem[]>([])
export const setSlashItems = (items: readonly SlashItem[]) => $slashItems.set(items)
