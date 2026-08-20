/**
 * 状态按权威归位（Task 3.3）。
 *
 * Hermes `AGENTS.md`：
 * > *"The first question for any piece of state is **who is allowed to be right
 * > about it**, not where it is convenient to store it."*
 *
 * 此前 14 个 `useState` 全堆在 `App.tsx` 里，"谁有资格对它是对的"这个问题
 * 从来没被问过。后果是具体的：`client` 的身份每渲染一次变一次，
 * **渲染进程 18 秒吃满 4 GB**。那不是一次 React 使用失误，是缺一条纪律。
 *
 * 这里验的是 Hermes「服务端真相是缓存，不是所有物」六条里最能测的三条：
 *   1. **合并，不要覆盖**
 *   3. **提防过去** —— 过期响应绝不能覆盖更新的意图
 *   6. **无变化时保持引用同一** —— 把内容相同的新数组交给 React
 *      会让昂贵的树白重渲染一遍
 */
import { beforeEach, describe, expect, it } from "vitest"
import { $providers, setProviders } from "../../src/ui/state/catalog.js"
import type { TranscriptItem } from "../../src/protocol/index.js"
import {
  $items,
  $notes,
  $terminal,
  $terminalTrimmed,
  applySnapshot,
  guard,
  note,
  resetTranscript,
  setItems,
  upsertItem,
  appendBytes,
} from "../../src/ui/state/index.js"

const turn = (id: string, text: string, final = true): TranscriptItem => ({
  type: "turn",
  id,
  who: "agent",
  text,
  final,
})

beforeEach(() => {
  resetTranscript()
  $notes.set([])
})

describe("规则 6 · 无变化时保持引用同一", () => {
  it("写入内容相同的数组不产生新身份", () => {
    const a = [turn("t1", "你好")]
    setItems(a)
    const first = $items.get()
    setItems([turn("t1", "你好")])
    // 内容一样 ⇒ **必须是同一个引用**，否则 React 会白重渲染整棵树
    expect($items.get()).toBe(first)
  })

  it("内容真的变了就换引用", () => {
    setItems([turn("t1", "你好")])
    const first = $items.get()
    setItems([turn("t1", "你好啊")])
    expect($items.get()).not.toBe(first)
  })

  it("对标量同样成立", () => {
    $terminalTrimmed.set(false)
    const before = $terminalTrimmed.get()
    $terminalTrimmed.set(false)
    expect($terminalTrimmed.get()).toBe(before)
  })
})

describe("规则 1 · 合并，不要覆盖", () => {
  it("按 id 更新已有条目，不追加重复行", () => {
    upsertItem(turn("t1", "写了一半", false))
    upsertItem(turn("t1", "写完了", true))
    expect($items.get()).toHaveLength(1)
    const only = $items.get()[0]!
    expect(only.type === "turn" && only.text).toBe("写完了")
  })

  it("新 id 追加到末尾，顺序不重排", () => {
    upsertItem(turn("t1", "一"))
    upsertItem(turn("t2", "二"))
    upsertItem(turn("t1", "一改"))
    expect($items.get().map((i) => i.id)).toEqual(["t1", "t2"])
  })

  it("内容没变的 upsert 不换引用", () => {
    upsertItem(turn("t1", "一"))
    const first = $items.get()
    upsertItem(turn("t1", "一"))
    expect($items.get()).toBe(first)
  })
})

describe("规则 3 · 提防过去", () => {
  it("世代变了之后，先前那一轮的结果被丢弃", () => {
    const g1 = guard()
    const g2 = guard() // 用户切走了：世代 +1
    expect(g1.stale()).toBe(true)
    expect(g2.stale()).toBe(false)
  })

  it("同一世代内的结果照常采纳", () => {
    const g = guard()
    expect(g.stale()).toBe(false)
    expect(g.stale()).toBe(false)
  })

  it("**世代号只增不减** —— 归零会让新旧请求撞车", () => {
    // 写 resetTranscript() 时发现的：若清空时把世代归零，
    // 旧请求持有的 mine=1 与归零后新请求的 mine=1 相等，
    // **旧请求会被误判为新鲜**——正好是这套机制要防的那件事。
    const old = guard()
    resetTranscript() // 内部 invalidate()
    const fresh = guard()
    expect(old.stale()).toBe(true)
    expect(fresh.stale()).toBe(false)
  })

  it("迟到的快照不会盖掉新会话的 transcript", () => {
    const stale = guard()
    guard() // 切会话
    setItems([turn("new", "新会话的内容")])
    // 旧请求这时才回来
    if (!stale.stale()) applySnapshot({ items: [turn("old", "旧会话")], terminal: "", trimmed: false })
    expect($items.get().map((i) => i.id)).toEqual(["new"])
  })
})

describe("终端字节", () => {
  it("增量追加", () => {
    appendBytes("a")
    appendBytes("b")
    expect($terminal.get().join("")).toBe("ab")
  })

  it("快照整段替换，不与旧增量拼接", () => {
    appendBytes("旧")
    applySnapshot({ items: [], terminal: "全新", trimmed: true })
    expect($terminal.get().join("")).toBe("全新")
    expect($terminalTrimmed.get()).toBe(true)
  })

  it("快照的 terminal 为空时不塞一个空串进去", () => {
    applySnapshot({ items: [], terminal: "", trimmed: false })
    expect($terminal.get()).toEqual([])
  })
})

describe("提示 · 失败必须出声（规格 7.5）", () => {
  it("记下最近几条，不静默丢弃", () => {
    note("一")
    note("二")
    expect($notes.get()).toEqual(["一", "二"])
  })

  it("有上限，但保留的是最新的", () => {
    for (let i = 0; i < 10; i++) note(`第${i}条`)
    const n = $notes.get()
    expect(n.length).toBeLessThanOrEqual(4)
    expect(n.at(-1)).toBe("第9条")
  })

  it("重复的同一条消息不刷屏", () => {
    note("同样的错")
    note("同样的错")
    expect($notes.get()).toEqual(["同样的错"])
  })
})

/**
 * **`setProviders` 要看内容，不只看 id**（2026-08-21 抓到的）。
 *
 * 上一版只比 agentId / providerId 两串名单：名单没变就当什么都没变。
 * 于是「给 claude-code-acp 标上能上服务器」写进了文件、后端也换了内存，
 * 界面却停在旧数据上——按钮按了没反应，而那正是 identity.ts 头上说的
 * 「看起来完全正常、最难查的一种坏」。同一个洞也咬得到 provider 的模型清单。
 */
describe("setProviders", () => {
  const 一份 = (remoteCapable: boolean) => ({
    agents: [
      { agentId: "ds-chat", kind: "native" as const, provider: "deepseek", model: "x" },
      { agentId: "claude-code-acp", kind: "acp" as const, command: "npx", remoteCapable },
    ],
    providers: [],
  })
  it("id 没变、字段变了 → 要换", () => {
    setProviders(一份(false))
    const before = $providers.get()
    setProviders(一份(true))
    expect($providers.get()).not.toBe(before)
    expect($providers.get().agents[1]).toMatchObject({ remoteCapable: true })
  })
  it("什么都没变 → 不换引用", () => {
    setProviders(一份(true))
    const before = $providers.get()
    setProviders(一份(true))
    expect($providers.get()).toBe(before)
  })
})
