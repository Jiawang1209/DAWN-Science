import { describe, expect, it, vi } from "vitest"
import { createClient } from "../../src/ui/client.js"
import { WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"

/** 假的事件源：模拟主进程往渲染进程推。 */
function source() {
  const handlers = new Set<(e: unknown) => void>()
  return {
    onEvent: (cb: (e: unknown) => void) => {
      handlers.add(cb)
      return () => handlers.delete(cb)
    },
    push: (e: unknown) => {
      for (const h of [...handlers]) h(e)
    },
    get count() {
      return handlers.size
    },
  }
}

const evt = (over: Record<string, unknown> = {}) => ({
  workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
  sessionId: "s1",
  seq: 1,
  kind: "turn",
  who: "agent",
  text: "在",
  turnId: "a1",
  final: false,
  ...over,
})

describe("客户端事件流 · 正常路径", () => {
  it("推来的事件原样交给处理者", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onEvent = vi.fn()
    c.subscribeEvents({ onEvent })
    src.push(evt())
    expect(onEvent).toHaveBeenCalledOnce()
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ kind: "turn", text: "在" })
  })

  it("退订后不再收到", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onEvent = vi.fn()
    const off = c.subscribeEvents({ onEvent })
    off()
    src.push(evt())
    expect(onEvent).not.toHaveBeenCalled()
    expect(src.count).toBe(0)
  })
})

describe("客户端事件流 · 跳号必须出声", () => {
  it("seq 跳号 ⇒ 报告问题，但事件仍然交付", () => {
    // 出声而不丢弃：丢了反而更糟——界面会少一段内容且毫无提示
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onEvent = vi.fn()
    const onProblem = vi.fn()
    c.subscribeEvents({ onEvent, onProblem })

    src.push(evt({ seq: 1 }))
    src.push(evt({ seq: 5 }))

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onProblem).toHaveBeenCalledOnce()
    expect(String(onProblem.mock.calls[0]?.[0])).toMatch(/2.*4|跳|丢/)
  })

  it("连号不报警", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onProblem = vi.fn()
    c.subscribeEvents({ onEvent: () => {}, onProblem })
    src.push(evt({ seq: 1 }))
    src.push(evt({ seq: 2 }))
    src.push(evt({ seq: 3 }))
    expect(onProblem).not.toHaveBeenCalled()
  })

  it("不同会话各算各的 —— 交错到达不算跳号", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onProblem = vi.fn()
    c.subscribeEvents({ onEvent: () => {}, onProblem })
    src.push(evt({ sessionId: "a", seq: 1 }))
    src.push(evt({ sessionId: "b", seq: 1 }))
    src.push(evt({ sessionId: "a", seq: 2 }))
    src.push(evt({ sessionId: "b", seq: 2 }))
    expect(onProblem).not.toHaveBeenCalled()
  })

  it("重放（seq 回退或重复）也出声 —— 静默去重会掩盖服务端的编号错误", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onProblem = vi.fn()
    c.subscribeEvents({ onEvent: () => {}, onProblem })
    src.push(evt({ seq: 3 }))
    src.push(evt({ seq: 2 }))
    expect(onProblem).toHaveBeenCalledOnce()
  })

  it("expectSeq 让订阅历史之后接着往下校验 —— 历史与增量是同一套编号", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onProblem = vi.fn()
    c.subscribeEvents({ onEvent: () => {}, onProblem })
    c.expectSeq("s1", 10)
    src.push(evt({ seq: 11 }))
    expect(onProblem).not.toHaveBeenCalled()
    src.push(evt({ seq: 20 }))
    expect(onProblem).toHaveBeenCalledOnce()
  })
})

describe("客户端事件流 · 畸形与版本", () => {
  it("不合协议的事件被丢弃并出声 —— 不让它流进界面状态", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onEvent = vi.fn()
    const onProblem = vi.fn()
    c.subscribeEvents({ onEvent, onProblem })
    src.push({ nonsense: true })
    expect(onEvent).not.toHaveBeenCalled()
    expect(onProblem).toHaveBeenCalledOnce()
  })

  it("版本不匹配的事件被丢弃并出声", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onEvent = vi.fn()
    const onProblem = vi.fn()
    c.subscribeEvents({ onEvent, onProblem })
    src.push(evt({ workbenchProtocolVersion: "9.9" }))
    expect(onEvent).not.toHaveBeenCalled()
    expect(onProblem).toHaveBeenCalledOnce()
  })

  it("处理者自己抛错不拖垮事件流 —— 后面的事件照常送达", () => {
    const src = source()
    const c = createClient(undefined, src.onEvent)
    const onProblem = vi.fn()
    let seen = 0
    c.subscribeEvents({
      onEvent: () => {
        seen += 1
        if (seen === 1) throw new Error("界面炸了")
      },
      onProblem,
    })
    src.push(evt({ seq: 1 }))
    src.push(evt({ seq: 2 }))
    expect(seen).toBe(2)
    expect(onProblem).toHaveBeenCalledOnce()
  })
})

describe("客户端事件流 · 没有桥接时", () => {
  it("在浏览器里直接开页面 ⇒ 订阅报告问题而不是抛 undefined 错误", () => {
    const c = createClient(undefined, undefined)
    const onProblem = vi.fn()
    const off = c.subscribeEvents({ onEvent: () => {}, onProblem })
    expect(onProblem).toHaveBeenCalledOnce()
    expect(String(onProblem.mock.calls[0]?.[0])).toMatch(/window\.dawn|Electron/)
    expect(() => off()).not.toThrow()
  })
})
