/**
 * 待发单的镜像（2026-09-23，spec `2026-09-23-待发消息-design.md` §4.1）。
 *
 * **白盒**：往私有表里塞一段假 pi 会话。假会话照 pi 的样子演两张单子——
 * `prompt(…, { streamingBehavior })` 进单子并报 `queue_update`，`clearQueue()` 清空并报，
 * `送出(单)` 从头上摘一条并报（pi 在 `message_start` 时就是这么做的）。
 * 真 pi 收不收、真送没送到，归 e2e `busy-gap.spec.ts`。
 */
import { describe, expect, it } from "vitest"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"

function 摆一段(opts: { inFlight?: number; 慢收?: Promise<void> } = {}) {
  const rt = new NativeRuntime({})
  const 内部 = rt as unknown as {
    sessions: Map<string, Record<string, unknown>>
    sinks: Map<string, ((e: AgentEvent) => void)[]>
    translate: (sessionId: string, e: unknown) => void
  }
  const 单 = { steer: [] as string[], followUp: [] as string[] }
  const 报 = () => 内部.translate("s1", { type: "queue_update", steering: [...单.steer], followUp: [...单.followUp] })
  const 开过的轮: string[] = []
  const pi = {
    model: { id: "m", input: ["text", "image"] },
    state: { messages: [] },
    async prompt(text: string, o?: { streamingBehavior?: "steer" | "followUp" }) {
      if (o?.streamingBehavior) {
        // pi 的输入处理是异步的：`慢收` 演「镜像先进、pi 后到」
        if (opts.慢收) await opts.慢收
        单[o.streamingBehavior].push(text)
        报()
        return
      }
      开过的轮.push(text)
    },
    clearQueue() {
      const r = { steering: [...单.steer], followUp: [...单.followUp] }
      单.steer = []
      单.followUp = []
      报()
      return r
    },
    async abort() {},
  }
  内部.sessions.set("s1", {
    session: pi,
    inFlight: opts.inFlight ?? 1,
    pending: undefined,
    stuck: { reset() {} },
    待发: [],
    pi待发: { steer: 0, followUp: 0 },
    清队中: false,
  })
  const 事件: AgentEvent[] = []
  内部.sinks.set("s1", [(e) => 事件.push(e)])
  const 送出 = (哪张: "steer" | "followUp") => {
    单[哪张].shift()
    报()
  }
  const 待发单 = () => {
    const 最后 = [...事件].reverse().find((e) => e.kind === "queue")
    return 最后 && 最后.kind === "queue" ? 最后.items.map((x) => `${x.id}:${x.behavior}`) : undefined
  }
  const 送到 = () => 事件.flatMap((e) => (e.kind === "queue_delivered" ? [`${e.id}${e.newTurn ? "+新轮" : ""}`] : []))
  return { rt, 单, 送出, 事件, 待发单, 送到, 开过的轮, 内部 }
}

const 等一拍 = () => new Promise((r) => setTimeout(r, 0))

describe("待发单镜像", () => {
  it("忙着带 queueId 写：进单子、报待发单；pi 送走一条才报送到", async () => {
    const { rt, 送出, 待发单, 送到, 单 } = 摆一段()
    rt.write("s1" as never, "第一句", "followUp", "a")
    rt.write("s1" as never, "第二句", "followUp", "b")
    await 等一拍()
    expect(单.followUp).toEqual(["第一句", "第二句"])
    expect(待发单()).toEqual(["a:followUp", "b:followUp"])
    expect(送到()).toEqual([])

    送出("followUp")
    expect(送到()).toEqual(["a"])
    expect(待发单()).toEqual(["b:followUp"])
  })

  it("**只认变短**：镜像先进、pi 后到——那一瞬 pi 比镜像短不算送到；pi 送走 a 时才报 a", async () => {
    let 放行!: () => void
    const 慢收 = new Promise<void>((r) => (放行 = r))
    const { rt, 送出, 送到, 待发单 } = 摆一段({ 慢收 })
    rt.write("s1" as never, "第一句", "followUp", "a")
    rt.write("s1" as never, "第二句", "followUp", "b")
    // pi 还一条都没收下，期间又报了一次 0 条（别的原因触发的 queue_update）
    送出("followUp")
    expect(送到()).toEqual([])
    放行()
    await 等一拍()
    expect(待发单()).toEqual(["a:followUp", "b:followUp"])
    送出("followUp")
    expect(送到()).toEqual(["a"])
  })

  it("两张单子各自从头摘：插队的送走不动排队的", async () => {
    const { rt, 送出, 待发单, 送到 } = 摆一段()
    rt.write("s1" as never, "排着", "followUp", "a")
    rt.write("s1" as never, "插着", "steer", "b")
    await 等一拍()
    // 待发单按 pi 送出的先后排：后写的插队排在先写的排队前面
    expect(待发单()).toEqual(["b:steer", "a:followUp"])
    送出("steer")
    expect(送到()).toEqual(["b"])
    expect(待发单()).toEqual(["a:followUp"])
  })

  it("改插队：清掉重送，那条换到插队单上，其余照原先后", async () => {
    const { rt, 单, 待发单, 送到 } = 摆一段()
    rt.write("s1" as never, "一", "followUp", "a")
    rt.write("s1" as never, "二", "followUp", "b")
    rt.write("s1" as never, "三", "followUp", "c")
    await 等一拍()
    rt.editQueue("s1" as never, "b", "steer")
    await 等一拍()
    expect(单.steer).toEqual(["二"])
    expect(单.followUp).toEqual(["一", "三"])
    expect(待发单()).toEqual(["b:steer", "a:followUp", "c:followUp"])
    // 清单那一下变短不是送到
    expect(送到()).toEqual([])
  })

  it("撤回：拿掉那一条，其余照原先后重送", async () => {
    const { rt, 单, 待发单, 送到 } = 摆一段()
    rt.write("s1" as never, "一", "followUp", "a")
    rt.write("s1" as never, "二", "followUp", "b")
    await 等一拍()
    rt.editQueue("s1" as never, "a", "remove")
    await 等一拍()
    expect(单.followUp).toEqual(["二"])
    expect(待发单()).toEqual(["b:followUp"])
    expect(送到()).toEqual([])
  })

  it("撤一条已经不在单上的：出声，不静默", () => {
    const { rt } = 摆一段()
    expect(() => rt.editQueue("s1" as never, "nope", "remove")).toThrow(/不在待发单/)
  })

  it("以为在忙、其实刚跑完：当场开一轮，并先报「送到了、开了新轮」", () => {
    const { rt, 送到, 开过的轮, 待发单 } = 摆一段({ inFlight: 0 })
    rt.write("s1" as never, "晚了一步", "followUp", "a")
    expect(送到()).toEqual(["a+新轮"])
    expect(开过的轮).toEqual(["晚了一步"])
    expect(待发单()).toBeUndefined()
  })

  it("clearQueue 交回 id（原先后），镜像与 pi 都清空，不报送到", async () => {
    const { rt, 单, 待发单, 送到 } = 摆一段()
    rt.write("s1" as never, "一", "followUp", "a")
    rt.write("s1" as never, "二", "steer", "b")
    await 等一拍()
    expect(rt.clearQueue("s1" as never)).toEqual(["a", "b"])
    expect(单).toEqual({ steer: [], followUp: [] })
    expect(待发单()).toEqual([])
    expect(送到()).toEqual([])
  })

  it("中止时还排着的（没人先撤）：逐条报 queue_failed，不许悄悄丢", async () => {
    const { rt, 事件 } = 摆一段()
    rt.write("s1" as never, "一", "followUp", "a")
    await 等一拍()
    await rt.abort("s1" as never)
    expect(事件.filter((e) => e.kind === "queue_failed").map((e) => (e as { id: string }).id)).toEqual(["a"])
  })

  it("不带 queueId 的写（非 native 路径的老调用）：不进镜像", async () => {
    const { rt, 待发单, 单 } = 摆一段()
    rt.write("s1" as never, "老路", "steer")
    await 等一拍()
    expect(单.steer).toEqual(["老路"])
    expect(待发单()).toBeUndefined()
  })
})
