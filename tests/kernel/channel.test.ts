/**
 * 内核通道适配器（②-A · K1）。
 *
 * 这份测试盯的四件事，每一件都对应 Spike D 里一条**实测得来**的约束，
 * 或一种「看着对、实际不工作」的坏法：
 *
 *   1. **握手前不许把消息发出去** —— 内核就绪前的 `execute_request` 会被静默丢弃
 *   2. **回复按 `parent_header` 配对** —— 按顺序配会在并发时张冠李戴
 *   3. **关停顺序** —— 先停进程再关 socket，否则 native 层 SIGABRT
 *   4. **溯源三件套在出适配器那一刻绑上** —— 之后再补就永远是「事后补」
 */
import { describe, expect, it, vi } from "vitest"
import { createKernelChannel, type RawChannel, type KernelProcess } from "../../src/kernel/channel.js"
import type { JupyterMessage } from "../../src/kernel/types.js"

let seq = 0
/** 假的 `execute_request` 工厂。**测试不必碰 nteract** —— 这正是注入的收益 */
const makeExecute = (code: string, opts?: Record<string, unknown>): JupyterMessage => ({
  header: { msg_id: `x${++seq}`, msg_type: "execute_request" },
  parent_header: {},
  metadata: {},
  content: { code, ...(opts ?? {}) },
})

const msg = (msg_type: string, parent?: string): JupyterMessage => ({
  header: { msg_id: `m${++seq}`, msg_type },
  parent_header: parent ? { msg_id: parent } : {},
  metadata: {},
  content: {},
})

/** 假通道：记下发出去的，允许手动灌回消息 */
function fake() {
  const sent: JupyterMessage[] = []
  let observer: ((m: unknown) => void) | undefined
  let completed = false
  const channel: RawChannel = {
    next: (m) => sent.push(m as JupyterMessage),
    subscribe: (o) => {
      observer = o
      return { unsubscribe: () => (observer = undefined) }
    },
    complete: () => (completed = true),
  }
  const killed: (string | undefined)[] = []
  const process: KernelProcess = { pid: 1, kill: (s) => killed.push(s) }
  return {
    channel,
    process,
    sent,
    killed,
    isCompleted: () => completed,
    /** 内核吐一条消息回来 */
    incoming: (m: JupyterMessage) => observer?.(m),
  }
}

function make(over: Partial<Parameters<typeof createKernelChannel>[0]> = {}) {
  const f = fake()
  const handshake = msg("kernel_info_request")
  const ch = createKernelChannel({
    channel: f.channel,
    process: f.process,
    kernelInstanceId: "k-1",
    handshake,
    makeExecute,
    sleep: async () => {},
    ...over,
  })
  return { f, ch, handshake }
}

/** 把握手做完 */
async function shake(m: ReturnType<typeof make>) {
  const p = m.ch.ready()
  m.f.incoming(msg("kernel_info_reply", m.handshake.header.msg_id))
  await p
}

describe("握手：就绪之前不许发出去", () => {
  it("**握手前 send 只入队** —— 内核就绪前的请求会被静默丢弃，那是最难查的症状", () => {
    const m = make()
    m.ch.send(msg("execute_request"))
    // 只有握手自己没发（ready 还没调），队列里那条更不该出现
    expect(m.f.sent).toEqual([])
  })

  it("握手完成后按原顺序补发", async () => {
    const m = make()
    const a = msg("execute_request")
    const b = msg("execute_request")
    m.ch.send(a)
    m.ch.send(b)
    await shake(m)
    const types = m.f.sent.map((x) => x.header.msg_id)
    expect(types).toEqual([m.handshake.header.msg_id, a.header.msg_id, b.header.msg_id])
  })

  it("**握手自己不走 send** —— 走了就死锁（它会被自己入队）", async () => {
    const m = make()
    const p = m.ch.ready()
    // 还没收到 reply，但握手消息必须已经发出去了
    expect(m.f.sent.map((x) => x.header.msg_type)).toEqual(["kernel_info_request"])
    m.f.incoming(msg("kernel_info_reply", m.handshake.header.msg_id))
    await p
  })

  it("ready 可以重复调用，只握一次手", async () => {
    const m = make()
    const p1 = m.ch.ready()
    const p2 = m.ch.ready()
    m.f.incoming(msg("kernel_info_reply", m.handshake.header.msg_id))
    await Promise.all([p1, p2])
    expect(m.f.sent.filter((x) => x.header.msg_type === "kernel_info_request")).toHaveLength(1)
  })

  it("**握手超时要响亮失败**，不能悄悄当成就绪", async () => {
    vi.useFakeTimers()
    const m = make({ handshakeTimeoutMs: 100 })
    const p = m.ch.ready()
    const assertion = expect(p).rejects.toThrow(/kernel_info_reply/)
    await vi.advanceTimersByTimeAsync(200)
    await assertion
    vi.useRealTimers()
  })
})

describe("回复按 parent_header 配对，不按顺序", () => {
  it("**两个请求并发时不会张冠李戴**", async () => {
    const m = make()
    await shake(m)
    const a = msg("execute_request")
    const b = msg("execute_request")
    const pa = m.ch.request(a)
    const pb = m.ch.request(b)
    // **故意反着回**：先回 b，再回 a
    m.f.incoming({ ...msg("execute_reply", b.header.msg_id), content: { which: "b" } })
    m.f.incoming({ ...msg("execute_reply", a.header.msg_id), content: { which: "a" } })
    expect((await pa).message.content.which).toBe("a")
    expect((await pb).message.content.which).toBe("b")
  })

  it("认不出回复类型时响亮失败 —— 猜一个的症状是「等一个永远不来的回复」", async () => {
    const m = make()
    await shake(m)
    expect(() => m.ch.request(msg("这不是一个请求"))).toThrow(/认不出/)
  })
})

describe("溯源在出适配器那一刻绑上", () => {
  it("每条消息都带 kernelInstanceId 与当前 revision", async () => {
    const m = make()
    await shake(m)
    const seen: number[] = []
    m.ch.on("stream", (t) => {
      expect(t.provenance.kernelInstanceId).toBe("k-1")
      seen.push(t.provenance.kernelRevision)
    })
    m.ch.send(msg("execute_request")) // revision → 1
    m.f.incoming(msg("stream"))
    m.ch.send(msg("execute_request")) // revision → 2
    m.f.incoming(msg("stream"))
    expect(seen).toEqual([1, 2])
  })

  it("**只有执行请求让 revision +1** —— 握手、心跳不该动它", async () => {
    const m = make()
    await shake(m)
    expect(m.ch.kernelRevision).toBe(0)
    m.ch.send(msg("kernel_info_request"))
    expect(m.ch.kernelRevision).toBe(0)
    m.ch.send(msg("execute_request"))
    expect(m.ch.kernelRevision).toBe(1)
  })

  it("**runId 拿不到就不给这个字段** —— 空串会被读成「有一条叫空的 run」", async () => {
    const m = make()
    await shake(m)
    let p: Record<string, unknown> = {}
    m.ch.on("stream", (t) => (p = t.provenance as unknown as Record<string, unknown>))
    m.f.incoming(msg("stream"))
    expect("runId" in p).toBe(false)
  })

  it("给得出 runId 时带上", async () => {
    const m = make({ runIdOf: () => "run-7" })
    await shake(m)
    let got: string | undefined
    m.ch.on("stream", (t) => (got = t.provenance.runId))
    m.f.incoming(msg("stream"))
    expect(got).toBe("run-7")
  })

  it("**runId 每次现取** —— 一个内核跨很多轮，缓存下来就会把后面的记到前面那条上", async () => {
    let current = "run-1"
    const m = make({ runIdOf: () => current })
    await shake(m)
    const got: (string | undefined)[] = []
    m.ch.on("stream", (t) => got.push(t.provenance.runId))
    m.f.incoming(msg("stream"))
    current = "run-2"
    m.f.incoming(msg("stream"))
    expect(got).toEqual(["run-1", "run-2"])
  })
})

describe("关停：顺序是正式代码", () => {
  it("**先停进程，再关 socket**，最后留时间给 native 层", async () => {
    const order: string[] = []
    const f = fake()
    const ch = createKernelChannel({
      channel: {
        ...f.channel,
        complete: () => order.push("complete"),
      },
      process: { pid: 1, kill: () => order.push("kill") },
      kernelInstanceId: "k",
      handshake: msg("kernel_info_request"),
      makeExecute,
      sleep: async () => {
        order.push("drain")
      },
    })
    await ch.close()
    expect(order).toEqual(["kill", "complete", "drain"])
  })

  it("重复 close 是安全的", async () => {
    const m = make()
    await m.ch.close()
    await m.ch.close()
    expect(m.f.killed).toHaveLength(1)
  })

  it("**关了之后再 send 要报错**，不能悄悄吞掉", async () => {
    const m = make()
    await shake(m)
    await m.ch.close()
    expect(() => m.ch.send(msg("execute_request"))).toThrow(/已关闭/)
  })

  it("进程已经退出时不抛异常 —— 那不是失败，它本来就该死", async () => {
    const f = fake()
    const ch = createKernelChannel({
      channel: f.channel,
      process: { pid: 1, kill: () => { throw new Error("ESRCH") } },
      kernelInstanceId: "k",
      handshake: msg("kernel_info_request"),
      makeExecute,
      sleep: async () => {},
    })
    await expect(ch.close()).resolves.toBeUndefined()
  })
})

describe("订阅", () => {
  it("`*` 收全部", async () => {
    const m = make()
    await shake(m)
    const types: string[] = []
    m.ch.on("*", (t) => types.push(t.message.header.msg_type))
    m.f.incoming(msg("stream"))
    m.f.incoming(msg("status"))
    expect(types).toEqual(["stream", "status"])
  })

  it("**回调里退订不会漏掉后面的回调** —— 遍历时改集合是经典坑", async () => {
    const m = make()
    await shake(m)
    const hits: string[] = []
    const off = m.ch.on("stream", () => {
      hits.push("first")
      off()
    })
    m.ch.on("stream", () => hits.push("second"))
    m.f.incoming(msg("stream"))
    expect(hits).toEqual(["first", "second"])
  })

  it("不是协议消息就忽略，不抛异常", async () => {
    const m = make()
    await shake(m)
    expect(() => m.f.incoming({ 乱七八糟: true } as unknown as JupyterMessage)).not.toThrow()
  })
})

/**
 * 中断（②-A · K3）。
 *
 * **这是 ②-A 的前置门**，不是普通功能：规格 10.4 的硬要求，
 * 而 wisp-science 的自研 JSON-lines worker 方案正是败在这一条。
 */
describe("中断：两条路，走错的症状是「点了停止什么也没发生」", () => {
  it("默认走 signal —— 向内核进程发 SIGINT", async () => {
    const m = make()
    await shake(m)
    m.ch.interrupt()
    expect(m.f.killed).toEqual(["SIGINT"])
    // **不是 SIGKILL**：那是杀内核，不是打断它
    expect(m.f.killed).not.toContain("SIGKILL")
  })

  it("**`message` 模式走 control 通道** —— 发到 shell 上会排在死循环后面，等于没发", async () => {
    const m = make({ interruptMode: "message" })
    await shake(m)
    m.ch.interrupt()
    const sent = m.f.sent.at(-1)!
    expect(sent.header.msg_type).toBe("interrupt_request")
    expect(sent.channel).toBe("control")
    // 这条路不碰进程
    expect(m.f.killed).toEqual([])
  })

  it("**中断不让 revision +1** —— 它不是一次执行", async () => {
    const m = make({ interruptMode: "message" })
    await shake(m)
    m.ch.send(msg("execute_request"))
    expect(m.ch.kernelRevision).toBe(1)
    m.ch.interrupt()
    expect(m.ch.kernelRevision).toBe(1)
  })

  it("**中断走 rawSend，不进握手队列** —— 排队的中断到达时早就没意义了", () => {
    const m = make({ interruptMode: "message" })
    // 故意不握手
    m.ch.interrupt()
    expect(m.f.sent.map((x) => x.header.msg_type)).toEqual(["interrupt_request"])
  })

  it("信号发不出去要出声 —— 进程没了的话「中断」这个动作失去了对象", async () => {
    const f = fake()
    const ch = createKernelChannel({
      channel: f.channel,
      process: { pid: 1, kill: () => { throw new Error("ESRCH") } },
      kernelInstanceId: "k",
      handshake: msg("kernel_info_request"),
      makeExecute,
      sleep: async () => {},
    })
    expect(() => ch.interrupt()).toThrow(/发不出中断信号/)
  })

  it("关了之后不能再中断", async () => {
    const m = make()
    await m.ch.close()
    expect(() => m.ch.interrupt()).toThrow(/已关闭/)
  })
})
