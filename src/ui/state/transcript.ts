/**
 * 当前会话的 transcript 与终端字节。
 *
 * **权威在后端。** 这里存的是它的缓存——所以每一次写入都要回答
 * 「这是新信息叠加，还是可以丢掉活跃行的替换」。
 *
 * 作用域是**当前正在看的那个会话**。切会话时由 `resetTranscript()` 清空，
 * 并由 `guard()` 保证飞行中的旧请求不会把内容倒灌回来。
 */
import { atom, computed } from "nanostores"
import type { TranscriptItem, TeamSnapshot, KernelState } from "../../protocol/index.js"
import { sameList, setList, setValue, shallowEqual } from "./identity.js"
import { invalidate } from "./guard.js"
import { cells as 转录里的cells, type Cell } from "../../protocol/notebook-cells.js"

/** 对话、工具调用、系统提示。**按顺序渲染，不重排** */
export const $items = atom<readonly TranscriptItem[]>([])

/**
 * **一整轮是不是还开着**（2026-09-22 从 `App.tsx` 挪来，`perf-render`）。
 *
 * 布尔值，一轮只翻两次；`computed` 值没变就不通知——所以读它的组件
 * 不会跟着每一段字重渲染。**壳（`App`）只许读这种派生值，不许订阅整份 `$items`**
 * （学自 Hermes `chat/index.tsx:299`：*"ChatView must not subscribe to $messages"*）。
 */
export const $回合进行中 = computed($items, (items) =>
  items.some((i) => i.type === "turn" && i.who === "agent" && !i.final),
)

/**
 * 笔记本格的 cell 清单，**cell 没变时保持同一个数组**（2026-09-22 从 `App.tsx` 挪来）。
 *
 * `cells()` 每次都造新对象，而正在写的那段话每 33ms 换一次 `$items`——
 * 不拦的话笔记本格与角标会跟着每一段字重算。`cells()` 不读发言的正文
 * （`turn` 只用来切窗口），所以比「结构」：发言按 id、其余按对象身份，一样就沿用上一份。
 */
let 上次结构: readonly unknown[] = []
let 上次cells: Cell[] = []
export const $笔记本cells = computed($items, (items) => {
  const 结构 = items.map((i) => (i.type === "turn" ? `turn:${i.id}` : i))
  if (结构.length === 上次结构.length && 结构.every((x, k) => x === 上次结构[k])) return 上次cells
  上次结构 = 结构
  上次cells = 转录里的cells(items)
  return 上次cells
})

/** 终端字节片段。首帧是快照里的整段，之后是增量 */
export const $terminal = atom<readonly string[]>([])

/** 终端 scrollback 被裁过。**如实标注，但这不是故障**——终端本就有限回滚 */
export const $terminalTrimmed = atom(false)

export function setItems(next: readonly TranscriptItem[]): void {
  丢掉攒着的()
  setList($items, next)
}

/**
 * 按 id 覆盖或追加。
 *
 * 服务端推的是**累积后的整条**，界面不必自己拼增量——那是流式渲染里
 * 最容易出错的一段（少一片、多一片、顺序错都很难查）。
 *
 * **正在写的那一条，至多 33ms 落一次**（2026-09-22，分支 `perf-render`）。
 * 基线量出来：约 340 段字产生 800–1150 次提交，每次整棵树跟着算，慢机器上掉到 10 帧/秒。
 * 学自 Hermes（`use-message-stream/utils.ts:59-67`：16ms 时「每个 token 一次提交」，改 33ms 让两个 token 并一次）。
 *
 * 只攒**一种**更新：已经在列表里、还没说完（`final: false`）的 agent 发言。
 * 其余一律**先把攒着的冲掉、再立即落**——新条目、说完的那一下、工具、删除，
 * 所以顺序不会乱，最后一个字也不会晚到。
 */
const 攒的间隔毫秒 = 33
const 攒着的 = new Map<string, TranscriptItem>()
let 攒的定时器: ReturnType<typeof setTimeout> | undefined

/** 把攒着的更新落进 `$items`。**同步**：谁要按顺序落下一条，先调它 */
export function flushTranscript(): void {
  if (攒的定时器 !== undefined) {
    clearTimeout(攒的定时器)
    攒的定时器 = undefined
  }
  if (攒着的.size === 0) return
  const prev = $items.get()
  let next: TranscriptItem[] | undefined
  for (const [id, item] of 攒着的) {
    const i = prev.findIndex((x) => x.id === id)
    // 攒的时候在、落的时候没了（被删了）：不复活它
    if (i < 0 || shallowEqual(prev[i], item)) continue
    next ??= [...prev]
    next[i] = item
  }
  攒着的.clear()
  if (next) $items.set(next)
}

/** 换会话 / 快照整份替换时：攒着的是旧的，**丢掉**，不落 */
function 丢掉攒着的(): void {
  if (攒的定时器 !== undefined) clearTimeout(攒的定时器)
  攒的定时器 = undefined
  攒着的.clear()
}

export function upsertItem(item: TranscriptItem): void {
  const 可攒 = item.type === "turn" && !item.final && $items.get().some((x) => x.id === item.id)
  if (可攒) {
    攒着的.set(item.id, item)
    攒的定时器 ??= setTimeout(flushTranscript, 攒的间隔毫秒)
    return
  }
  flushTranscript()
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

/** 按 id 从转录里删掉一条（审查 debug F3）：服务端把「只想没说」并进新的一条时,实时流靠它把旧的那条撤掉 */
export function dropItem(id: string): void {
  flushTranscript()
  const prev = $items.get()
  const i = prev.findIndex((x) => x.id === id)
  if (i < 0) return
  $items.set(prev.filter((x) => x.id !== id))
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
  /**
   * 这段会话挂着的内核状态列表（笔记本，2026-08-26）：starting/idle/busy/exited。
   * 缺省 = 还没有内核，不是「不陈旧」——与 `kernelInstanceId` 同一条理由。
   * **走这一条缝，不是零散地在各个调用点自己灌**：`applySnapshot` 有几处调用点
   * （实时更新的 `snapshot`、跳号自愈 / 重订阅的 `resyncSession`），
   * 都在这里收口才不会有第三条路忘了带。
   */
  kernels?: readonly KernelState[] | undefined
}): void {
  setItems(snap.items)
  const term = snap.terminal ? [snap.terminal] : []
  if (!sameList($terminal.get(), term)) $terminal.set(term)
  setValue($terminalTrimmed, snap.trimmed)
  setValue($kernelInstanceId, snap.kernelInstanceId)
  $待答权限.set(snap.pendingPermission)
  $会话开关.set(snap.configOptions)
  $团队.set(snap.team)
  setValue($kernels, snap.kernels)
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
 * 这段会话挂着的内核状态列表（笔记本，2026-08-26）：starting/idle/busy/exited。
 * 缺省 = 还没取到 / 没有会话——与 `$kernelInstanceId` 同一条理由。
 *
 * **只从 `applySnapshot()` 与实时的 `kernels` 更新两处写**：前者走这条缝
 * （快照有几条到达路径——实时更新的 `snapshot`、跳号自愈 / 重订阅的
 * `resyncSession`——都在 `applySnapshot` 里收口，不许各调用点自己零散地灌一次，
 * 那样多一条路就多一处忘记的机会）；后者是 `kernels` 更新**整份换掉**，
 * 与 `团队` 同一条纪律。
 */
export const $kernels = atom<readonly KernelState[] | undefined>(undefined)
export function setKernels(v: readonly KernelState[] | undefined): void {
  setValue($kernels, v)
}

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
  // 内核状态也跟着走：它没有单独的取清单操作，靠下一次快照重新灌（笔记本，2026-08-26）
  setValue($kernels, undefined)
  invalidate()
}
