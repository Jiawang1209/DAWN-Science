/**
 * 连续的工具调用折成一行（2026-09-15）。
 *
 * 作者：*「这些内容，我们能否也进行一个折叠呢？」*——一次「看看服务器配置」连着跑了 9 条 bash，
 * 每条各自折叠了，9 行仍占掉大半屏，而对他来说那是**一件事**：「它查了一轮服务器」。
 * 形状照 Hermes 的 `Ran date … + 1 command`。
 *
 * **失败怎么出声是作者定的**：只在汇总行里红字写「N 条失败」，点开才看是哪条。
 * 这改写了 08-10「报错的那条不许被折叠」——但**只对成组的**；单独一条报错照旧默认展开。
 *
 * 这里只放纯函数：什么算「连续」、汇总行说什么。长相在 `views.tsx` 的 `ToolGroupRow`。
 */
import type { TranscriptItem } from "../protocol/events.js"

type 工具 = Extract<TranscriptItem, { type: "tool" }>

export type 转录块 =
  | { kind: "item"; key: string; item: TranscriptItem; 下标: number }
  | { kind: "group"; key: string; tools: 工具[] }

/**
 * **两条以上相邻的工具调用成一组**；一条的不成组，隔着任何别的东西（一句话、思考、内核输出）就断开。
 *
 * 组的 key 用第一条的 id：流式时后面再长出一条，这一组是同一个 React 元素，
 * 人刚点开的展开状态不会被重新挂载冲掉。
 */
export function 分组转录(items: readonly TranscriptItem[]): 转录块[] {
  const 出: 转录块[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]!
    if (it.type === "tool") {
      let j = i
      while (j < items.length && items[j]!.type === "tool") j++
      if (j - i >= 2) {
        出.push({ kind: "group", key: `group:${it.id}`, tools: items.slice(i, j) as 工具[] })
        i = j
        continue
      }
    }
    出.push({ kind: "item", key: it.id, item: it, 下标: i })
    i++
  }
  return 出
}

export interface 工具组汇总 {
  条数: number
  /** 全是 bash 时汇总行说「运行了 N 条命令」，否则说「调用了 N 次工具」 */
  全是命令: boolean
  失败: number
  /** 正在跑的那一条（取最后一条在跑的）；都跑完了是 undefined */
  在跑: { 第几条: number; 条: 工具 } | undefined
  /**
   * 各条耗时之和。**有一条缺起止时刻就不给**——少算一截的总数看起来很确定，
   * 而那是错的（与 `useElapsed`「没有开始时刻就什么都不说」同一条）。
   */
  总毫秒: number | undefined
}

export function 汇总工具组(tools: readonly 工具[]): 工具组汇总 {
  let 失败 = 0
  let 总: number | undefined = 0
  let 在跑: 工具组汇总["在跑"]
  tools.forEach((x, k) => {
    if (x.status === "error") 失败++
    if (x.status === "running") 在跑 = { 第几条: k + 1, 条: x }
    if (总 !== undefined) 总 = x.startedAt !== undefined && x.endedAt !== undefined ? 总 + (x.endedAt - x.startedAt) : undefined
  })
  return {
    条数: tools.length,
    全是命令: tools.every((x) => x.name === "bash"),
    失败,
    在跑,
    总毫秒: 在跑 ? undefined : 总,
  }
}
