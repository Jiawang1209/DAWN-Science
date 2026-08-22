/**
 * 当前会话的 transcript 与终端字节。
 *
 * **权威在后端。** 这里存的是它的缓存——所以每一次写入都要回答
 * 「这是新信息叠加，还是可以丢掉活跃行的替换」。
 *
 * 作用域是**当前正在看的那个会话**。切会话时由 `resetTranscript()` 清空，
 * 并由 `guard()` 保证飞行中的旧请求不会把内容倒灌回来。
 */
import { atom } from "nanostores"
import type { TranscriptItem, TeamSnapshot } from "../../protocol/index.js"
import { sameList, setList, setValue, shallowEqual } from "./identity.js"
import { invalidate } from "./guard.js"

/** 对话、工具调用、系统提示。**按顺序渲染，不重排** */
export const $items = atom<readonly TranscriptItem[]>([])

/** 终端字节片段。首帧是快照里的整段，之后是增量 */
export const $terminal = atom<readonly string[]>([])

/** 终端 scrollback 被裁过。**如实标注，但这不是故障**——终端本就有限回滚 */
export const $terminalTrimmed = atom(false)

export function setItems(next: readonly TranscriptItem[]): void {
  setList($items, next)
}

/**
 * 按 id 覆盖或追加。
 *
 * 服务端推的是**累积后的整条**，界面不必自己拼增量——那是流式渲染里
 * 最容易出错的一段（少一片、多一片、顺序错都很难查）。
 */
export function upsertItem(item: TranscriptItem): void {
  const prev = $items.get()
  const i = prev.findIndex((x) => x.id === item.id)
  if (i < 0) {
    $items.set([...prev, item])
    return
  }
  // 内容一模一样就什么都不做——规则 6
  if (shallowEqual(prev[i], item)) return
  const next = [...prev]
  next[i] = item
  $items.set(next)
}

export function appendBytes(data: string): void {
  $terminal.set([...$terminal.get(), data])
}

/**
 * 用一份全量快照替换当前内容。
 *
 * **终端是整段替换，不与旧增量拼接**——快照本身就是「到此为止的全部」，
 * 再拼一次就会看到重复的输出。
 */
export function applySnapshot(snap: {
  items: readonly TranscriptItem[]
  terminal: string
  trimmed: boolean
  /** **当前**内核实例（②-A · K5 · S13）。缺省 = 还没有内核 */
  kernelInstanceId?: string | undefined
  /** 正等着人回答的那次权限询问（A2）。**缺省 = 没有人在问** */
  pendingPermission?: 待答的权限 | undefined
  /** 这一段可以调的开关（A3）。**缺省 = 这条运行时没有这回事** */
  configOptions?: readonly 会话开关[] | undefined
  /** 这段会话的团队（team-board）。缺省 = 没建过 */
  team?: TeamSnapshot | undefined
}): void {
  setItems(snap.items)
  const term = snap.terminal ? [snap.terminal] : []
  if (!sameList($terminal.get(), term)) $terminal.set(term)
  setValue($terminalTrimmed, snap.trimmed)
  setValue($kernelInstanceId, snap.kernelInstanceId)
  $待答权限.set(snap.pendingPermission)
  $会话开关.set(snap.configOptions)
  $团队.set(snap.team)
}

/** 一次还没结果的权限询问（A2）。**选项原样来自 agent** */
export interface 待答的权限 {
  requestId: string
  title: string
  options: readonly { optionId: string; name: string; kind: string }[]
}

/**
 * agent 正在问「能不能」（A2，只有 acp 会有）。
 *
 * **它跟着当前会话走**，与转录同一条路：并排开两段对话时，
 * 各自显示各自的那张卡（切走再切回来，它还在——因为它住在快照上，
 * 而不是某个组件的局部状态里）。
 */
export const $待答权限 = atom<待答的权限 | undefined>(undefined)

/** 一个会话开关（A3）。**形状照抄 agent 给的**，我们不挑也不改名 */
export interface 会话开关 {
  id: string
  name: string
  /** `exactOptionalPropertyTypes` 下要显式带上 undefined——协议那边这两格是可缺的 */
  description?: string | undefined
  category?: string | undefined
  kind: "select" | "boolean"
  current: string
  options: readonly { value: string; name: string; description?: string | undefined }[]
}

/**
 * 这一段会话可以调的开关（A3，只有 acp 有）。
 * **缺省 = 这条运行时没有这回事**，界面据此不画那个菜单。
 */
export const $会话开关 = atom<readonly 会话开关[] | undefined>(undefined)
/** 当前会话的团队快照（team-board，2026-08-22）。作用域 = 正在看的那一段；切会话清掉 */
export const $团队 = atom<TeamSnapshot | undefined>(undefined)
export function setTeam(t: TeamSnapshot | undefined): void {
  $团队.set(t)
}

/**
 * **当前**内核实例的身份（②-A · K5 · S13）。
 *
 * 界面拿它与每条输出自带的那个一比，就知道那条输出是不是
 * **上一个内核**算出来的——那时它描述的状态已经不存在了。
 * 这正是 notebook 最经典的那个谎言：
 * *「单元格显示的结果，可能来自三次重启之前的状态。」*
 *
 * **缺省 = 还没有内核，不是「不陈旧」**。拿不到就不做判断，不猜。
 */
export const $kernelInstanceId = atom<string | undefined>(undefined)

/**
 * 切会话时清空。
 *
 * **它同时作废所有飞行中的请求**（`invalidate()`），
 * 所以旧会话的响应回来时会被判为过期，不会把内容倒灌进新会话。
 */
export function resetTranscript(): void {
  setItems([])
  if ($terminal.get().length > 0) $terminal.set([])
  setValue($terminalTrimmed, false)
  /**
   * **切会话时那张权限卡必须跟着走。**
   *
   * 留着的话，你切到另一段对话，屏幕上还挂着上一段的询问——
   * 点下去答的是别人的问题。这与整个文件头那句
   * 「作用域是当前正在看的那个会话」是同一条。
   */
  $待答权限.set(undefined)
  // 开关也跟着走：切到另一段会话，那颗菜单里的选项本来就不是它的
  $会话开关.set(undefined)
  $团队.set(undefined)
  invalidate()
}
