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
import type { TranscriptItem } from "../../protocol/index.js"
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
}): void {
  setItems(snap.items)
  const term = snap.terminal ? [snap.terminal] : []
  if (!sameList($terminal.get(), term)) $terminal.set(term)
  setValue($terminalTrimmed, snap.trimmed)
  setValue($kernelInstanceId, snap.kernelInstanceId)
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
  invalidate()
}
