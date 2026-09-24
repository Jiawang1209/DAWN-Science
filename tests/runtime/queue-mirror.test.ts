/**
 * 待发单的镜像（2026-09-23，spec `2026-09-23-待发消息-design.md` §4.1）。
 *
 * **白盒**：往私有表里塞一段假 pi 会话。假会话照 pi 的样子演两张单子——
 * `prompt(…, { streamingBehavior })` 进单子并报 `queue_update`，`clearQueue()` 清空并报，
 * `送出(单)` 从头上摘一条并报（pi 在 `message_start` 时就是这么做的）。
 * 真 pi 收不收、真送没送到，归 e2e `busy-gap.spec.ts`。
 */
import { describe, expect, it, vi } from "vitest"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"

function 摆一段(opts: { inFlight?: number; 慢收?: Promise<void>; pi在跑?: boolean; 要转述?: boolean } = {}) {
  const rt = new NativeRuntime(
    opts.要转述 ? { vision: () => ({ baseUrl: "https://v.example/v1", model: "qwen-vl", apiKey: "k" }) } : {},
  )
  const 内部 = rt as unknown as {
    sessions: Map<string, Record<string, unknown>>
    sinks: Map<string, ((e: AgentEvent) => void)[]>
    translate: (sessionId: string, e: unknown) => void
  }
  const 单 = { steer: [] as string[], followUp: [] as string[] }
  const 报 = () => 内部.translate("s1", { type: "queue_update", steering: [...单.steer], followUp: [...单.followUp] })
  const 开过的轮: string[] = []
  const pi = {
    model: { id: "m", input: opts.要转述 ? ["text"] : ["text", "image"] },
    state: { messages: [] },
    /** pi 自己的「在跑」（`_isAgentRunActive`）。缺省与我们的 inFlight 一致 */
    isStreaming: opts.pi在跑 ?? (opts.inFlight ?? 1) > 0,
    async prompt(text: string, o?: { streamingBehavior?: "steer" | "followUp"; images?: unknown }) {
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
  const 放下 = () => {
    pi.isStreaming = false
    ;(内部.sessions.get("s1") as { inFlight: number }).inFlight = 0
  }
  const 说了 = () => 事件.flatMap((e) => (e.kind === "notice" ? [e.text] : []))
  return { rt, 单, 送出, 事件, 待发单, 送到, 开过的轮, 内部, pi, 放下, 说了 }
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

  describe("审查 09-24 补的", () => {
    it("#1 没身份的写（飞书 / 微信）也进镜像：pi 送走它时不会把有身份的那条错当成送到", async () => {
      const { rt, 送出, 送到, 待发单 } = 摆一段()
      rt.write("s1" as never, "飞书来的", undefined) // 没 queueId、没 behavior
      rt.write("s1" as never, "界面发的", "followUp", "t")
      await 等一拍()
      expect(待发单()).toEqual(["t:followUp"])
      送出("followUp") // pi 送走的是飞书那条
      expect(送到()).toEqual([])
      送出("followUp")
      expect(送到()).toEqual(["t"])
    })

    it("#1 改插队重送时，没身份的那条也跟着重送，不被 clearQueue 吞掉", async () => {
      const { rt, 单 } = 摆一段()
      rt.write("s1" as never, "飞书来的", undefined)
      rt.write("s1" as never, "界面发的", "followUp", "t")
      await 等一拍()
      rt.editQueue("s1" as never, "t", "steer")
      await 等一拍()
      expect(单.followUp).toEqual(["飞书来的"])
      expect(单.steer).toEqual(["界面发的"])
    })

    it("#1 全部撤下时，没身份的那条就地出声", async () => {
      const { rt, 说了 } = 摆一段()
      rt.write("s1" as never, "飞书来的", undefined)
      await 等一拍()
      expect(rt.clearQueue("s1" as never)).toEqual([])
      expect(说了().join("")).toContain("飞书来的")
    })

    it("#2 只有图没有字：交给 pi 时补一句字（pi 按文字摘，空文字永远摘不掉）", async () => {
      const { rt, 单, 待发单 } = 摆一段()
      rt.writeWithImages("s1" as never, "", [{ data: "aGk=", mimeType: "image/png" }], "followUp", "img")
      await 等一拍()
      expect(单.followUp).toEqual(["（见附图）"])
      expect(待发单()).toEqual(["img:followUp"])
    })

    it("#3 转述那几秒：忙着时先上待发条；这期间被停止撤下，转述回来也不再发", async () => {
      let 回话!: (r: Response) => void
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (回话 = r))))
      try {
        const { rt, 单, 待发单, 开过的轮 } = 摆一段({ 要转述: true })
        rt.writeWithImages("s1" as never, "看这张", [{ data: "aGk=", mimeType: "image/png" }], "followUp", "v")
        expect(待发单()).toEqual(["v:followUp"]) // 转述还没回来，已经看得见
        expect(rt.clearQueue("s1" as never)).toEqual(["v"])
        回话(new Response(JSON.stringify({ choices: [{ message: { content: "一块红色方块" } }] })))
        await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
        await 等一拍()
        await 等一拍()
        expect(单).toEqual({ steer: [], followUp: [] })
        expect(开过的轮).toEqual([])
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it("#3 转述回来、还在单上：带着转述交给 pi", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "一块红色方块" } }] }))))
      try {
        const { rt, 单, 待发单 } = 摆一段({ 要转述: true })
        rt.writeWithImages("s1" as never, "看这张", [{ data: "aGk=", mimeType: "image/png" }], "followUp", "v")
        await vi.waitFor(() => expect(单.followUp).toHaveLength(1))
        expect(单.followUp[0]).toContain("一块红色方块")
        expect(待发单()).toEqual(["v:followUp"])
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it("#5 我们以为在跑、pi 说没在跑：先挂着（上待发条），这一轮收尾后按新一轮送", async () => {
      let 收尾!: () => void
      const { rt, 内部, 单, 待发单, 送到, 开过的轮, 放下 } = 摆一段({ pi在跑: false })
      ;(内部.sessions.get("s1") as { pending: Promise<void> }).pending = new Promise<void>((r) => (收尾 = r))
      rt.write("s1" as never, "撞在缝里", "steer", "a")
      await 等一拍()
      expect(单).toEqual({ steer: [], followUp: [] }) // 没交给 pi
      expect(待发单()).toEqual(["a:steer"])
      放下()
      收尾()
      await 等一拍()
      expect(开过的轮).toEqual(["撞在缝里"])
      expect(送到()).toEqual(["a+新轮"])
      expect(待发单()).toEqual([])
    })

    it("#5 挂着的那条被取回：收尾后不再送", async () => {
      let 收尾!: () => void
      const { rt, 内部, 开过的轮, 放下 } = 摆一段({ pi在跑: false })
      ;(内部.sessions.get("s1") as { pending: Promise<void> }).pending = new Promise<void>((r) => (收尾 = r))
      rt.write("s1" as never, "撞在缝里", "followUp", "a")
      rt.editQueue("s1" as never, "a", "remove")
      放下()
      收尾()
      await 等一拍()
      expect(开过的轮).toEqual([])
    })
  })
})
