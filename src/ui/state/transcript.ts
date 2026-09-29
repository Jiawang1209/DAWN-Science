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
import type { TranscriptItem, TeamSnapshot, KernelState, QueuedMessage } from "../../protocol/index.js"
import { sameList, setValue } from "./identity.js"
import { invalidate } from "./guard.js"
import { cells as 转录里的cells, type Cell } from "../../protocol/notebook-cells.js"
import { 创建转录槽, 是回显, type 待答的权限, type 会话开关 } from "./transcript-slot.js"

/** 两个 interface 搬去了 `transcript-slot.ts`（2026-09-24）；这里转发，旧 import 路径一个字不改 */
export type { 待答的权限, 会话开关 } from "./transcript-slot.js"

/**
 * 主区那一槽（2026-09-24，侧边对话）。**旧导出名一个不改**——全仓库按这些名字 import。
 *
 * `$items`（对话、工具调用、系统提示，**按顺序渲染，不重排**）、攒的逻辑（正在写的那一条
 * 至多 33ms 落一次）、`upsertItem` / `dropItem` / `setItems`、`$待答权限`、`$会话开关`、
 * `$待发` / `setQueued` 都住在槽里；函数体与它们的注释见 `transcript-slot.ts`。
 * 坞里那段对话是同一个工厂的第二个实例（`side-chat.ts`）——**攒的逻辑只此一份**。
 */
export const 主槽 = 创建转录槽()
export const { $items, $待答权限, $会话开关, $待发, upsertItem, dropItem, setItems, setQueued } = 主槽
/** 把攒着的更新落进 `$items`。**同步**：谁要按顺序落下一条，先调它 */
export const flushTranscript = 主槽.flush

/**
 * 有一次压缩正在进行（2026-09-27）。**它也算「这一轮在跑」**：停止键要能按（按了取消压缩），
 * 这期间回车是排队——pi 在手动压缩时收到新的一句会直接抛。
 */
export const 在压缩 = (items: readonly TranscriptItem[]): boolean =>
  items.some((i) => i.type === "compaction" && i.status === "running")

/**
 * **一整轮是不是还开着**（2026-09-22 从 `App.tsx` 挪来，`perf-render`）。
 *
 * 布尔值，一轮只翻两次；`computed` 值没变就不通知——所以读它的组件
 * 不会跟着每一段字重渲染。**壳（`App`）只许读这种派生值，不许订阅整份 `$items`**
 * （学自 Hermes `chat/index.tsx:299`：*"ChatView must not subscribe to $messages"*）。
 */
export const $回合进行中 = computed($items, (items) =>
  items.some((i) => i.type === "turn" && i.who === "agent" && !i.final) || 在压缩(items),
)

/**
 * **从第 `从` 条起，对面有没有回音**——「正在等回话」据它收（2026-09-28 从 `views.tsx` 挪来，好单测）。
 *
 * 只认「有东西可读」：agent 说出了字、内核吐了一条输出、或者**这一轮没做成的那句报错**（带 `failed` 的 notice）。
 * 思考块、工具调用、普通系统提示都不算——它们是过程，不是结果。
 * 报错那一条是 2026-09-28 补的：没配 key 时 `prompt()` 直接 reject，一轮只有一句 failed notice、没有 agent 发言，
 * 不算回音的话「在等」永远不收，停止键不消失、模型菜单锁在「这一轮还没说完」（`e2e/turn-closes-on-failure.spec.ts`）。
 */
export function 有回音了(items: readonly TranscriptItem[], 从: number): boolean {
  return items
    .slice(从)
    .some(
      (i) =>
        (i.type === "turn" && i.who === "agent" && (i.text ?? "").length > 0) ||
        i.type === "kernelOutput" ||
        (i.type === "notice" && i.failed === true),
    )
}

/**
 * 主区这段说过话没有（至少一句自己说的话，2026-09-27）。命令面板「回到上一句之前」据它列成不可用并写缘故（spec §2.1）。
 * 与 `$回合进行中` 一样是布尔派生值：壳读它不会跟着每一段字重渲染。
 */
// 回显（A1）不算：它还没被后端收下，回退不到
export const $说过话 = computed($items, (items) => items.some((i) => i.type === "turn" && i.who === "user" && !是回显(i.id)))

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
  /** 待发单（2026-09-23）。缺省 = 没有待发 */
  queued?: readonly QueuedMessage[] | undefined
}): void {
  主槽.applySnapshot(snap)
  const term = snap.terminal ? [snap.terminal] : []
  if (!sameList($terminal.get(), term)) $terminal.set(term)
  setValue($terminalTrimmed, snap.trimmed)
  setValue($kernelInstanceId, snap.kernelInstanceId)
  $团队.set(snap.team)
  setValue($kernels, snap.kernels)
}

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
  /**
   * 转录、权限卡、开关、待发单：主槽一并清掉（`transcript-slot.ts` 的 `reset`）。
   *
   * **切会话时那张权限卡必须跟着走。**
   *
   * 留着的话，你切到另一段对话，屏幕上还挂着上一段的询问——
   * 点下去答的是别人的问题。这与整个文件头那句
   * 「作用域是当前正在看的那个会话」是同一条。
   * 开关也跟着走：切到另一段会话，那颗菜单里的选项本来就不是它的。
   * 待发单也跟着走：那几句话是那一段的，挂在别的会话上面点「撤回」会撤错地方。
   */
  主槽.reset()
  if ($terminal.get().length > 0) $terminal.set([])
  setValue($terminalTrimmed, false)
  $团队.set(undefined)
  // 内核状态也跟着走：它没有单独的取清单操作，靠下一次快照重新灌（笔记本，2026-08-26）
  setValue($kernels, undefined)
  invalidate()
}
