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
  for (const k of ["FAKE_ACP_FAIL_INIT", "FAKE_ACP_USAGE", "FAKE_ACP_REPLY"]) delete process.env[k]
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
