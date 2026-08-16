/**
 * ACP 运行时（A1，2026-08-16）。
 *
 * **对着那台假 ACP agent 起真进程**——不是打桩。
 *
 * 理由与假模型服务器一模一样：协议、stdio、NDJSON 分帧、我们的收发、
 * 事件流全是真的，**假的只是「另一端是谁」**。
 * 打桩的话，这一组能证明的只有「我调了我自己写的那个函数」。
 */
import { afterEach, describe, expect, it } from "vitest"
import { join } from "node:path"
import { AcpRuntime } from "../../src/runtime/acp/runtime.js"
import type { AgentEvent, SessionSpec } from "../../src/runtime/types.js"

const 假agent = join(import.meta.dirname, "..", "..", "scripts", "fake-acp-agent.mjs")

/** 用当前这个 node 起假 agent。**生产走 `算命令` 里那条 `node` 记号** */
const 起一个 = (env: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  return new AcpRuntime({ commandOf: () => ({ command: process.execPath, args: [假agent] }) })
}

const spec = (id: string): SessionSpec =>
  ({ sessionId: id, agentId: "acp-x", workspace: process.cwd(), sessionDir: process.cwd() }) as SessionSpec

let 关掉: (() => Promise<void>) | undefined
afterEach(async () => {
  await 关掉?.()
  关掉 = undefined
  /**
   * **每一个都要清。**
   *
   * 第一版这张清单漏了 A2 新加的两个，于是
   * `FAKE_ACP_ASK_NO_OPTIONS` 漏到了下一条用例里——症状是
   * 「等不到权限询问，收到的是 notice」，看起来像功能坏了。
   * **一条用例把状态漏给下一条，比它自己红更难查。**
   */
  for (const k of [
    "FAKE_ACP_FAIL_INIT",
    "FAKE_ACP_USAGE",
    "FAKE_ACP_REPLY",
    "FAKE_ACP_ASK",
    "FAKE_ACP_ASK_NO_OPTIONS",
  ]) {
    delete process.env[k]
  }
})

/** 收事件，直到某一条出现（或超时）。**超时要说清在等什么** */
function 等到(收: AgentEvent[], 判: (e: AgentEvent) => boolean, 说明: string, ms = 15_000) {
  return new Promise<AgentEvent>((成, 败) => {
    const 到点 = Date.now() + ms
    const 转 = setInterval(() => {
      const 命中 = 收.find(判)
      if (命中) {
        clearInterval(转)
        成(命中)
      } else if (Date.now() > 到点) {
        clearInterval(转)
        败(new Error(`等不到${说明}。收到的是：${收.map((e) => e.kind).join(", ")}`))
      }
    }, 20)
  })
}

describe("整条路", () => {
  it("**起得来、说得上话**：一句话进去，回话流出来", async () => {
    const rt = 起一个()
    const s = spec("a1")
    const 收: AgentEvent[] = []
    // **先 attach 再 start**：`started` 是在 start 里发的，晚一步就收不到
    const h = await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    expect(h.pid).toBeGreaterThan(0)

    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")

    const 话 = await 等到(收, (e) => e.kind === "output" && e.data.includes("假 ACP agent 已应答"), "那句暗号")
    expect(话.kind).toBe("output")

    // **一轮要收口**：账本靠 `idle` 关账，不收口的话那一轮永远开着
    await 等到(收, (e) => e.kind === "idle", "回合收口")
  })

  /** 它说的话要**原样带回来**——证明我们真的把 prompt 送过去了，不是自说自话 */
  it("送过去的话真的到了对面", async () => {
    const rt = 起一个()
    const s = spec("a2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "这句话要回来")
    await 等到(收, (e) => e.kind === "output" && e.data.includes("这句话要回来"), "回声")
  })
})

describe("失败必须出声", () => {
  /**
   * **握手失败是最常见的一种**（多半是没登录），
   * 而它此前唯一的表现方式是「点了没反应」。
   */
  it("initialize 报错时，start 抛出一句人话", async () => {
    const rt = 起一个({ FAKE_ACP_FAIL_INIT: "1" })
    const s = spec("a3")
    await expect(rt.start(s)).rejects.toThrow(/握手失败/)
    关掉 = () => rt.stop(s.sessionId)
  })

  /** 命令根本不存在时，要说清是**哪一个命令**起不来 */
  it("适配器起不来时说清是哪个命令", async () => {
    const rt = new AcpRuntime({
      commandOf: () => ({ command: "这个命令肯定不存在-dawn", args: [] }),
    })
    const s = spec("a4")
    await expect(rt.start(s)).rejects.toThrow(/起不来 ACP 适配器「这个命令肯定不存在-dawn」/)
  })
})

describe("token：**累计要变差值**", () => {
  /**
   * **这一条是整组里最容易悄悄错的。**
   *
   * ACP 的 `usage` 是「整个会话累计」（SDK 注释原文
   * `Sum of all token types across session`）。照我们「每轮相加」的记法直接加，
   * 一段十轮的会话会被算成十几倍——那时它连「一个参考」都算不上。
   *
   * 假 agent 每轮各加 12/8，所以三轮之后累计是 36/24，
   * **而我们每轮该报的都是 12/8**。
   */
  it("三轮报三次增量，不是三次累计", async () => {
    const rt = 起一个({ FAKE_ACP_USAGE: "1" })
    const s = spec("a5")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 用量: { input?: number; output?: number }[] = []
    rt.attach(s.sessionId, (e) => {
      if (e.kind === "turn_usage") 用量.push(e.usage)
    })

    for (let i = 0; i < 3; i++) {
      const 收: AgentEvent[] = []
      const 退 = rt.attach(s.sessionId, (e) => 收.push(e))
      rt.write(s.sessionId, `第 ${i} 轮`)
      await 等到(收, (e) => e.kind === "idle", `第 ${i} 轮收口`)
      退()
    }

    expect(用量).toHaveLength(3)
    for (const u of 用量) {
      expect(u.input, `报成了累计值：${JSON.stringify(用量)}`).toBe(12)
      expect(u.output).toBe(8)
    }
  })

  /** **没报就不发**：补一个 0 会让「这一轮没花」与「它不报」变成同一句话 */
  it("适配器不报 usage 时，我们一条都不发", async () => {
    const rt = 起一个()
    const s = spec("a6")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")
    await 等到(收, (e) => e.kind === "idle", "收口")
    expect(收.filter((e) => e.kind === "turn_usage")).toHaveLength(0)
  })
})

/**
 * 权限询问（A2，2026-08-16）。
 *
 * **这是 ACP 相对 `cli` 最实的那个差别**：`cli` 那条我们没有话语权，
 * 只能事后从输出里读它干了什么；ACP 这边它会**停下来问**。
 */
describe("权限：它问，我们答", () => {
  it("**选项原样带上来**——不是我们自己编的一套", async () => {
    const rt = 起一个({ FAKE_ACP_ASK: "1" })
    const s = spec("p1")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下那个 csv")

    const 问 = (await 等到(收, (e) => e.kind === "permission_request", "权限询问")) as Extract<
      AgentEvent,
      { kind: "permission_request" }
    >
    expect(问.title).toContain("观测.csv")
    expect(问.options.map((o) => o.optionId)).toEqual(["yes", "always", "no"])
    // **kind 也要带**：界面据它决定「允许」画成什么样
    expect(问.options[0]?.kind).toBe("allow_once")

    // 答一个，**对方要收到同一个 id**
    rt.answerPermission?.(s.sessionId, 问.requestId, "always")
    const 回声 = await 等到(
      收,
      (e) => e.kind === "output" && e.data.includes("【权限结果】"),
      "它把答案说回来",
    )
    expect((回声 as { data: string }).data).toContain('"optionId":"always"')
    expect((回声 as { data: string }).data).toContain('"outcome":"selected"')
  })

  /** 不给 optionId = 取消。**它与「拒绝」不是一回事**：拒绝是决定，取消是这一轮不做了 */
  it("不给 optionId 就是取消", async () => {
    const rt = 起一个({ FAKE_ACP_ASK: "1" })
    const s = spec("p2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下")
    const 问 = (await 等到(收, (e) => e.kind === "permission_request", "权限询问")) as Extract<
      AgentEvent,
      { kind: "permission_request" }
    >
    rt.answerPermission?.(s.sessionId, 问.requestId)
    const 回声 = await 等到(收, (e) => e.kind === "output" && e.data.includes("【权限结果】"), "答案")
    expect((回声 as { data: string }).data).toContain('"outcome":"cancelled"')
  })

  /**
   * **一个选项都没有时，只能取消，而且要出声。**
   *
   * 摆一张没有按钮的卡等于让人对着它干瞪眼；静默不回它会一直卡着。
   * 两害相权，如实取消并说一句。
   */
  it("它一个选项都不给时，按取消处理并出声", async () => {
    const rt = 起一个({ FAKE_ACP_ASK_NO_OPTIONS: "1" })
    const s = spec("p3")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下")
    await 等到(收, (e) => e.kind === "notice" && e.text.includes("一个选项都没给"), "那句说明")
    // **不该冒出一张空卡**
    expect(收.filter((e) => e.kind === "permission_request")).toHaveLength(0)
    /**
     * **而且这一轮要真的走完。**
     *
     * 第一版只断言那句说明——但静默不回它也会有那句说明，
     * 而对面会一直等（表现是「它卡住了」）。**收口才是「我们真的答了」的证据。**
     */
    await 等到(收, (e) => e.kind === "idle", "这一轮收口（不答的话它会一直卡着）")
  })

  /** 同一个 id 答两次：第二次要被忽略，否则对方会收到两条回复 */
  it("答两次只算一次", async () => {
    const rt = 起一个({ FAKE_ACP_ASK: "1" })
    const s = spec("p4")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下")
    const 问 = (await 等到(收, (e) => e.kind === "permission_request", "权限询问")) as Extract<
      AgentEvent,
      { kind: "permission_request" }
    >
    rt.answerPermission?.(s.sessionId, 问.requestId, "yes")
    rt.answerPermission?.(s.sessionId, 问.requestId, "no")
    const 回声 = await 等到(收, (e) => e.kind === "output" && e.data.includes("【权限结果】"), "答案")
    expect((回声 as { data: string }).data).toContain('"optionId":"yes"')
    /**
     * **判据要盯「对面收到了什么」，不是「我们这边看起来正常」。**
     *
     * 第一版只断言「回声只有一条」——而假 agent 对一条 id 对不上的回复
     * 本来就静静丢掉，于是把去重删掉之后用例照样绿（变异测试当场抓到）。
     * 现在假 agent 会把「意外的回复」说出来，那才是协议违规的事实形式。
     */
    await new Promise((r) => setTimeout(r, 300))
    expect(收.filter((e) => e.kind === "output" && e.data.includes("【权限结果】"))).toHaveLength(1)
    expect(
      收.filter((e) => e.kind === "output" && e.data.includes("【意外的回复】")),
      "同一个询问被答了两次——对面收到了两条回复",
    ).toHaveLength(0)
  })
})
