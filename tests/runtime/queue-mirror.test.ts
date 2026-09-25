/**
 * 待发单的镜像（2026-09-23，spec `2026-09-23-待发消息-design.md` §4.1）与调整方向（2026-09-25，spec `2026-09-25-调整方向-design.md` §4.2）。
 *
 * **白盒**：往私有表里塞一段假 pi 会话。假会话照 pi 的样子演排队单——
 * `prompt(…, { streamingBehavior: "followUp" })` 进单子并报 `queue_update`，`clearQueue()` 清空并报，
 * `送出()` 从头上摘一条并报（pi 在 `message_start` 时就是这么做的）。
 * 真 pi 收不收、真停没停，归 `tests/integration/redirect.test.ts` 与 e2e。
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
  const 单 = { followUp: [] as string[] }
  const 报 = () => 内部.translate("s1", { type: "queue_update", steering: [], followUp: [...单.followUp] })
  const 开过的轮: string[] = []
  const pi = {
    model: { id: "m", input: opts.要转述 ? ["text"] : ["text", "image"] },
    state: { messages: [] },
    /** pi 自己的「在跑」（`_isAgentRunActive`）。缺省与我们的 inFlight 一致 */
    isStreaming: opts.pi在跑 ?? (opts.inFlight ?? 1) > 0,
    async prompt(text: string, o?: { streamingBehavior?: "followUp"; images?: unknown }): Promise<void> {
      if (o?.streamingBehavior) {
        // pi 的输入处理是异步的：`慢收` 演「镜像先进、pi 后到」
        if (opts.慢收) await opts.慢收
        单.followUp.push(text)
        报()
        return
      }
      开过的轮.push(text)
    },
    clearQueue(): { steering: string[]; followUp: string[] } {
      const r = { steering: [] as string[], followUp: [...单.followUp] }
      单.followUp = []
      报()
      return r
    },
    async abort(): Promise<void> {},
  }
  内部.sessions.set("s1", {
    session: pi,
    inFlight: opts.inFlight ?? 1,
    pending: undefined,
    stuck: { reset() {} },
    待发: [],
    pi待发: 0,
    清队中: false,
    中止中: false,
    调整链: undefined,
  })
  const 事件: AgentEvent[] = []
  内部.sinks.set("s1", [(e) => 事件.push(e)])
  const 送出 = () => {
    单.followUp.shift()
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

    送出()
    expect(送到()).toEqual(["a"])
    expect(待发单()).toEqual(["b:followUp"])
  })

  it("**只认变短**：镜像先进、pi 后到——那一瞬 pi 比镜像短不算送到；pi 送走 a 时才报 a", async () => {
    let 放行!: () => void
    const 慢收 = new Promise<void>((r) => (放行 = r))
    const { rt, 送出, 送到, 待发单 } = 摆一段({ 慢收 })
    rt.write("s1" as never, "第一句", "followUp", "a")
    rt.write("s1" as never, "第二句", "followUp", "b")
    送出()
    expect(送到()).toEqual([])
    放行()
    await 等一拍()
    expect(待发单()).toEqual(["a:followUp", "b:followUp"])
    送出()
    expect(送到()).toEqual(["a"])
  })

  it("撤回：拿掉那一条，其余照原先后重送", async () => {
    const { rt, 单, 待发单, 送到 } = 摆一段()
    rt.write("s1" as never, "一", "followUp", "a")
    rt.write("s1" as never, "二", "followUp", "b")
    await 等一拍()
    rt.editQueue("s1" as never, "a")
    await 等一拍()
    expect(单.followUp).toEqual(["二"])
    expect(待发单()).toEqual(["b:followUp"])
    expect(送到()).toEqual([])
  })

  it("撤一条已经不在单上的：出声，不静默", () => {
    const { rt } = 摆一段()
    expect(() => rt.editQueue("s1" as never, "nope")).toThrow(/不在待发单/)
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
    rt.write("s1" as never, "二", "followUp", "b")
    await 等一拍()
    expect(rt.clearQueue("s1" as never)).toEqual(["a", "b"])
    expect(单).toEqual({ followUp: [] })
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

  it("中止期间结束的工具标「已中断」；中止完了不再标", async () => {
    const x = 摆一段()
    const 结束 = (id: string) =>
      x.内部.translate("s1", { type: "tool_execution_end", toolCallId: id, toolName: "bash", isError: true, result: { content: [{ type: "text", text: "Command aborted" }] } })
    x.pi.abort = async () => {
      结束("t1")
    }
    await x.rt.abort("s1" as never)
    结束("t2")
    const ends = x.事件.filter((e) => e.kind === "tool_end") as Extract<AgentEvent, { kind: "tool_end" }>[]
    expect(ends.map((e) => [e.toolCallId, e.interrupted ?? false])).toEqual([
      ["t1", true],
      ["t2", false],
    ])
  })

  it("不带 queueId 的写（非界面路径的老调用）：不进待发条", async () => {
    const { rt, 待发单, 单 } = 摆一段()
    rt.write("s1" as never, "老路", "followUp")
    await 等一拍()
    expect(单.followUp).toEqual(["老路"])
    expect(待发单()).toBeUndefined()
  })

  describe("审查 09-24 补的", () => {
    it("#1 没身份的写（飞书 / 微信）也进镜像：pi 送走它时不会把有身份的那条错当成送到", async () => {
      const { rt, 送出, 送到, 待发单 } = 摆一段()
      rt.write("s1" as never, "飞书来的", undefined) // 没 queueId、没 behavior
      rt.write("s1" as never, "界面发的", "followUp", "t")
      await 等一拍()
      expect(待发单()).toEqual(["t:followUp"])
      送出() // pi 送走的是飞书那条
      expect(送到()).toEqual([])
      送出()
      expect(送到()).toEqual(["t"])
    })

    it("#1 撤回重送时，没身份的那条也跟着重送，不被 clearQueue 吞掉", async () => {
      const { rt, 单 } = 摆一段()
      rt.write("s1" as never, "飞书来的", undefined)
      rt.write("s1" as never, "界面发的", "followUp", "t")
      rt.write("s1" as never, "界面二", "followUp", "u")
      await 等一拍()
      rt.editQueue("s1" as never, "t")
      await 等一拍()
      expect(单.followUp).toEqual(["飞书来的", "界面二"])
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
        expect(单).toEqual({ followUp: [] })
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
      rt.write("s1" as never, "撞在缝里", "followUp", "a")
      await 等一拍()
      expect(单).toEqual({ followUp: [] }) // 没交给 pi
      expect(待发单()).toEqual(["a:followUp"])
      放下()
      收尾()
      await 等一拍()
      expect(开过的轮).toEqual(["撞在缝里"])
      expect(送到()).toEqual(["a+新轮"])
      expect(待发单()).toEqual([])
    })

    it("#5 挂着的那条：收尾前会话被关了——报 queue_failed，不留未处理的 rejection（2026-09-25）", async () => {
      let 收尾!: () => void
      const { rt, 内部, 事件, 开过的轮 } = 摆一段({ pi在跑: false })
      ;(内部.sessions.get("s1") as { pending: Promise<void> }).pending = new Promise<void>((r) => (收尾 = r))
      rt.write("s1" as never, "撞在缝里", "followUp", "a")
      内部.sessions.delete("s1")
      收尾()
      await 等一拍()
      expect(开过的轮).toEqual([])
      expect(事件.filter((e) => e.kind === "queue_failed").map((e) => (e as { id: string }).id)).toEqual(["a"])
    })

    it("#5 挂着的那条被取回：收尾后不再送", async () => {
      let 收尾!: () => void
      const { rt, 内部, 开过的轮, 放下 } = 摆一段({ pi在跑: false })
      ;(内部.sessions.get("s1") as { pending: Promise<void> }).pending = new Promise<void>((r) => (收尾 = r))
      rt.write("s1" as never, "撞在缝里", "followUp", "a")
      rt.editQueue("s1" as never, "a")
      放下()
      收尾()
      await 等一拍()
      expect(开过的轮).toEqual([])
    })
  })
})

describe("调整方向（2026-09-25，spec §4.2）", () => {
  /**
   * 让假 pi 记下顺序，并演「停下」与「新的一轮」：
   * - 不带 behavior 的 `prompt` = 新的一轮开始了：pi 立起 `isStreaming`，**这一轮一直跑着**（promise 不 resolve）——
   *   真 pi 要过几道 await 才立起来，那条缝归 #5 与集成测试；
   * - `abort()`：有一轮在跑就让它收尾（它的 `.finally` 会把我们的 `inFlight` 减回去）；没有（摆一段时手设的 inFlight）就直接放下。
   */
  const 演停下 = (x: ReturnType<typeof 摆一段>) => {
    const 顺序: string[] = []
    let 收这一轮: (() => void) | undefined
    x.pi.abort = async () => {
      顺序.push("abort")
      x.pi.isStreaming = false
      if (收这一轮) {
        const r = 收这一轮
        收这一轮 = undefined
        r()
      } else x.放下()
    }
    const 原清 = x.pi.clearQueue.bind(x.pi)
    x.pi.clearQueue = () => {
      顺序.push("clearQueue")
      return 原清()
    }
    const 原问 = x.pi.prompt.bind(x.pi)
    x.pi.prompt = async (text, o) => {
      if (o?.streamingBehavior) return 原问(text, o)
      顺序.push(`prompt:${text}`)
      x.pi.isStreaming = true
      return new Promise<void>((r) => (收这一轮 = r))
    }
    return 顺序
  }

  it("待发单上那条：先撤单、再停、再起新一轮；其余照排、id 不变", async () => {
    const x = 摆一段()
    const 顺序 = 演停下(x)
    x.rt.write("s1" as never, "改成偶数", "followUp", "a")
    x.rt.write("s1" as never, "画个图", "followUp", "b")
    await 等一拍()
    expect(await x.rt.redirect("s1" as never, { queueId: "a" })).toEqual([])
    expect(顺序).toEqual(["clearQueue", "abort", "prompt:改成偶数"])
    expect(x.送到()).toEqual(["a+新轮"])
    expect(x.单.followUp).toEqual(["画个图"])
    expect(x.待发单()).toEqual(["b:followUp"])
  })

  it("Cmd/Ctrl+回车来的（不在单上）：其余全部照排", async () => {
    const x = 摆一段()
    const 顺序 = 演停下(x)
    x.rt.write("s1" as never, "画个图", "followUp", "b")
    await 等一拍()
    expect(await x.rt.redirect("s1" as never, { queueId: "n", data: "直接换个做法" })).toEqual([])
    expect(顺序).toEqual(["clearQueue", "abort", "prompt:直接换个做法"])
    expect(x.送到()).toEqual(["n+新轮"])
    expect(x.单.followUp).toEqual(["画个图"])
    expect(x.待发单()).toEqual(["b:followUp"])
  })

  it("按下那一刻这一轮刚好自己跑完了：当普通一句发出去，不撤单也不停", async () => {
    const x = 摆一段({ inFlight: 0 })
    const 顺序 = 演停下(x)
    await x.rt.redirect("s1" as never, { queueId: "n", data: "晚了一步" })
    expect(顺序).toEqual(["prompt:晚了一步"])
    expect(x.送到()).toEqual(["n+新轮"])
  })

  it("那条已经不在单上（刚好被送走了）：抛，什么都不动", async () => {
    const x = 摆一段()
    const 顺序 = 演停下(x)
    await expect(x.rt.redirect("s1" as never, { queueId: "nope" })).rejects.toThrow(/不在待发单/)
    expect(顺序).toEqual([])
  })

  it("还在准备的那条（还没交给 pi）：说清楚，不动它", async () => {
    const x = 摆一段({ pi在跑: false })
    ;(x.内部.sessions.get("s1") as { pending: Promise<void> }).pending = new Promise<void>(() => {})
    x.rt.write("s1" as never, "撞在缝里", "followUp", "a")
    await expect(x.rt.redirect("s1" as never, { queueId: "a" })).rejects.toThrow(/还在准备/)
    expect(x.待发单()).toEqual(["a:followUp"])
  })

  it("停不下来：这句改排在最前、其余在后，出声；一句都不丢", async () => {
    const x = 摆一段()
    x.pi.abort = async () => {
      throw new Error("停不下来")
    }
    x.rt.write("s1" as never, "改成偶数", "followUp", "a")
    x.rt.write("s1" as never, "画个图", "followUp", "b")
    await 等一拍()
    expect(await x.rt.redirect("s1" as never, { queueId: "a" })).toEqual([])
    expect(x.单.followUp).toEqual(["改成偶数", "画个图"])
    expect(x.待发单()).toEqual(["a:followUp", "b:followUp"])
    expect(x.说了().join("")).toContain("没能停下这一步（停不下来）")
  })

  it("停下之后会话没了：那几句的 id 按原先后交回（后端放回输入框），不许丢", async () => {
    const x = 摆一段()
    x.pi.abort = async () => {
      x.内部.sessions.delete("s1")
    }
    x.rt.write("s1" as never, "改成偶数", "followUp", "a")
    x.rt.write("s1" as never, "画个图", "followUp", "b")
    await 等一拍()
    expect(await x.rt.redirect("s1" as never, { queueId: "a" })).toEqual(["a", "b"])
  })

  it("那一步在停下期间结束：工具行标已中断", async () => {
    const x = 摆一段()
    x.pi.abort = async () => {
      x.内部.translate("s1", { type: "tool_execution_end", toolCallId: "t1", toolName: "bash", isError: true, result: { content: [{ type: "text", text: "Command aborted" }] } })
      x.放下()
    }
    await x.rt.redirect("s1" as never, { queueId: "n", data: "换个做法" })
    expect(x.事件.find((e) => e.kind === "tool_end")).toMatchObject({ toolCallId: "t1", interrupted: true })
  })

  it("两次挨得太近：一个接一个做，第二次等第一次停稳", async () => {
    const x = 摆一段()
    const 顺序 = 演停下(x)
    const 一 = x.rt.redirect("s1" as never, { queueId: "n1", data: "第一次" })
    const 二 = x.rt.redirect("s1" as never, { queueId: "n2", data: "第二次" })
    await Promise.all([一, 二])
    // 第一次停下了、起了新一轮（pi 又在跑）；第二次再撤单、再停、再起
    expect(顺序).toEqual(["clearQueue", "abort", "prompt:第一次", "clearQueue", "abort", "prompt:第二次"])
  })
})
