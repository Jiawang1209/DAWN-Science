/**
 * 一段会话在界面上需要的那几样状态，收成一个「槽」（2026-09-24，侧边对话）。
 *
 * 主区一个、坞里一个。**攒的逻辑只此一份**：两处各写一遍的话，迟早一处攒、一处不攒。
 * 只收「对话组件要读的」那几样；终端、内核、团队、产物仍只跟主区走（spec §2.3）。
 *
 * **权威在后端。** 槽里存的是它的缓存——与 `transcript.ts` 文件头同一条纪律。
 * 攒着的更新、定时器都**闭包在槽里**：一槽落下不替另一槽落，一槽清空不碰另一槽。
 */
import { atom } from "nanostores"
import type { TranscriptItem, QueuedMessage } from "../../protocol/index.js"
import { setList, shallowEqual } from "./identity.js"

/** 一次还没结果的权限询问（A2）。**选项原样来自 agent** */
export interface 待答的权限 {
  requestId: string
  title: string
  options: readonly { optionId: string; name: string; kind: string }[]
}

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
 * 正在写的那一条，至多这么久落一次（2026-09-22，分支 `perf-render`）。理由见 `upsertItem`。
 */
const 攒的间隔毫秒 = 33

export function 创建转录槽() {
  /** 对话、工具调用、系统提示。**按顺序渲染，不重排** */
  const $items = atom<readonly TranscriptItem[]>([])

  /**
   * agent 正在问「能不能」（A2，只有 acp 会有）。
   *
   * **它跟着当前会话走**，与转录同一条路：并排开两段对话时，
   * 各自显示各自的那张卡（切走再切回来，它还在——因为它住在快照上，
   * 而不是某个组件的局部状态里）。
   */
  const $待答权限 = atom<待答的权限 | undefined>(undefined)

  /**
   * 这一段会话可以调的开关（A3，只有 acp 有）。
   * **缺省 = 这条运行时没有这回事**，界面据此不画那个菜单。
   */
  const $会话开关 = atom<readonly 会话开关[] | undefined>(undefined)

  /**
   * 这一段还排着、没送进模型的话（2026-09-23，学自 Codex）。作用域 = 这一槽正在看的那一段；切会话清掉。
   * 空单与缺省同义（都画不出东西）——统一存成空数组，读的人少一种情形。
   */
  const $待发 = atom<readonly QueuedMessage[]>([])

  const 攒着的 = new Map<string, TranscriptItem>()
  let 攒的定时器: ReturnType<typeof setTimeout> | undefined

  /** 把攒着的更新落进 `$items`。**同步**：谁要按顺序落下一条，先调它 */
  function flush(): void {
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

  function setItems(next: readonly TranscriptItem[]): void {
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
  function upsertItem(item: TranscriptItem): void {
    const 可攒 = item.type === "turn" && !item.final && $items.get().some((x) => x.id === item.id)
    if (可攒) {
      攒着的.set(item.id, item)
      攒的定时器 ??= setTimeout(flush, 攒的间隔毫秒)
      return
    }
    flush()
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
  function dropItem(id: string): void {
    flush()
    const prev = $items.get()
    const i = prev.findIndex((x) => x.id === id)
    if (i < 0) return
    $items.set(prev.filter((x) => x.id !== id))
  }

  function setQueued(q: readonly QueuedMessage[] | undefined): void {
    setList($待发, q ?? [])
  }

  /** 快照里「对话组件要读的」那几样整份换掉。主区的终端 / 内核 / 团队由 `transcript.ts` 的 `applySnapshot` 另写 */
  function applySnapshot(s: {
    items: readonly TranscriptItem[]
    /** 正等着人回答的那次权限询问（A2）。**缺省 = 没有人在问** */
    pendingPermission?: 待答的权限 | undefined
    /** 这一段可以调的开关（A3）。**缺省 = 这条运行时没有这回事** */
    configOptions?: readonly 会话开关[] | undefined
    /** 待发单（2026-09-23）。缺省 = 没有待发 */
    queued?: readonly QueuedMessage[] | undefined
  }): void {
    setItems(s.items)
    $待答权限.set(s.pendingPermission)
    $会话开关.set(s.configOptions)
    setQueued(s.queued)
  }

  /**
   * 切会话时清空这一槽。
   *
   * **权限卡、开关、待发单都跟着走**：留着的话，换到另一段对话，屏幕上还挂着上一段的询问——
   * 点下去答的是别人的问题；挂在别的会话上面点「撤回」会撤错地方。
   * 作废飞行中的请求（`invalidate()`）不在这里：那是主区切会话的事，侧槽清空不该连带作废主区的请求。
   */
  function reset(): void {
    setItems([])
    $待答权限.set(undefined)
    $会话开关.set(undefined)
    setQueued(undefined)
  }

  return { $items, $待答权限, $会话开关, $待发, flush, setItems, upsertItem, dropItem, setQueued, applySnapshot, reset }
}

export type 转录槽 = ReturnType<typeof 创建转录槽>
