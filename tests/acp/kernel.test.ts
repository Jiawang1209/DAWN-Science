/**
 * `dawn_run_in_kernel`（B1·B′，2026-08-17）。
 *
 * 这一件比另外三件重一档：它要起一段活着的会话、等它跑完、
 * 在跑不完的时候说清楚。**这里验的全是「等」与「说」的规矩**——
 * 会话怎么起、内核怎么算，各自有各自的判据。
 */
import { describe, expect, it, vi } from "vitest"
import { 建跑内核, type 内核条目, type 内核装配 } from "../../src/acp/kernel.js"
import { 工具清单 } from "../../src/acp/tools.js"

/** 一台假内核：`剧本` 是「收到代码之后依次发出来的那些条目」 */
function 假内核(剧本0: 内核条目[], 附加: Partial<内核装配> = {}) {
  const 开过 = { 次数: 0 }
  /** 换一份剧本。**一次调用一份**——「上一次超时、这一次跑完」要靠它才演得出来 */
  let 剧本 = 剧本0
  const 换剧本 = (新的: 内核条目[]) => {
    剧本 = 新的
  }
  const 发过: { id: string; code: string }[] = []
  let 收: ((e: 内核条目) => void) | undefined
  const 装配: 内核装配 = {
    找内核: (l) => (l === "python" ? "py内核" : undefined),
    归属: () => ({ projectId: "p1", workspace: "/工作区" }),
    开一段: async () => {
      开过.次数 += 1
      return `k${开过.次数}`
    },
    还活着: () => true,
    订: (_id, f) => {
      收 = f
      return () => {
        收 = undefined
      }
    },
    发: (id, code) => {
      发过.push({ id, code })
      // 真内核是异步来的；同步发会让「订阅之前就来了」这种错溜过去
      setTimeout(() => {
        for (const e of 剧本) 收?.(e)
      }, 0)
    },
    ...附加,
  }
  return { 装配, 开过, 发过, 换剧本 }
}

const busy: 内核条目 = { kind: "status", state: "busy" }
const idle: 内核条目 = { kind: "status", state: "idle" }
const 说 = (text: string): 内核条目 => ({ kind: "stream", stream: "stdout", text })

describe("跑不了的时候", () => {
  /**
   * **换一门配了的语言跑，是这件事上最坏的一种「帮忙」**：
   * 模型会拿着一段 R 的结果当 Python 的结果往下推。
   */
  it("这门语言没配内核 → 如实说没配，一个字都不跑", async () => {
    const { 装配, 发过 } = 假内核([])
    await expect(建跑内核(装配)("s1", "R", "1+1")).rejects.toThrow(/没有配 R 的内核/)
    expect(发过).toEqual([])
  })

  it("会话不属于任何项目 → 不起内核", async () => {
    const { 装配, 开过 } = 假内核([], { 归属: () => undefined })
    await expect(建跑内核(装配)("s1", "python", "1+1")).rejects.toThrow(/不属于任何项目/)
    expect(开过.次数).toBe(0)
  })
})

describe("等到跑完", () => {
  /**
   * **要先 busy 再 idle。**
   *
   * 订上去那一刻内核多半就是 idle 的（上一句刚跑完）。见 idle 就收的话，
   * 这一次一个字都收不到就返回了——而那看起来像「这段代码没有输出」。
   */
  it("订上去时先来一个 idle，不算跑完", async () => {
    const { 装配 } = 假内核([idle, busy, 说("真正的输出"), idle])
    const r = await 建跑内核(装配)("s1", "python", "print(1)")
    expect(r.文本).toBe("真正的输出")
  })

  it("stdout 与 stderr 分得开", async () => {
    const { 装配 } = 假内核([
      busy,
      说("正常的\n"),
      { kind: "stream", stream: "stderr", text: "警告一句" },
      idle,
    ])
    const r = await 建跑内核(装配)("s1", "python", "x")
    expect(r.文本).toBe("正常的\n[stderr] 警告一句")
    // stderr 不等于失败——一句 warning 不该让模型以为代码挂了
    expect(r.出错).toBeUndefined()
  })

  it("报错要带 traceback，并且标成出错", async () => {
    const { 装配 } = 假内核([
      busy,
      { kind: "error", ename: "NameError", evalue: "name 'df' is not defined", traceback: ["行一", "行二"] },
      idle,
    ])
    const r = await 建跑内核(装配)("s1", "python", "df")
    expect(r.出错).toBe(true)
    expect(r.文本).toContain("NameError: name 'df' is not defined")
    // traceback **原样给**——它是给模型改代码用的，删掉等于让它猜
    expect(r.文本).toContain("行一\n行二")
  })

  /**
   * **图要说一声，但不给内容。**
   * 不说，模型以为这句什么都没产生于是重跑；给 base64，是拿几百 KB 换一句「有张图」。
   */
  it("图只报一句，不塞 base64", async () => {
    const { 装配 } = 假内核([
      busy,
      { kind: "result", mediaType: "image/png", data: "AAAABBBBCCCC", bytes: 12345 },
      idle,
    ])
    const r = await 建跑内核(装配)("s1", "python", "plot()")
    expect(r.文本).toContain("image/png")
    expect(r.文本).toContain("12345")
    expect(r.文本).not.toContain("AAAABBBB")
  })

  /**
   * **一个字都没有也要说一声。** 返回空串的话，模型看到的是
   * 「工具成功了，内容为空」——它分不出这是「没输出」还是「工具坏了」。
   */
  it("没有任何输出时说一句，而不是空串", async () => {
    const { 装配 } = 假内核([busy, idle])
    const r = await 建跑内核(装配)("s1", "python", "x = 1")
    expect(r.文本).toBe("（跑完了，没有任何输出）")
  })
})

describe("会话复用", () => {
  /**
   * **复用是这件工具的意义所在**——每次新开一段的话，
   * 上一句 `import pandas` 就白做了。
   */
  it("同一段 ACP 会话里跑两次，用的是同一段内核", async () => {
    const { 装配, 开过, 发过 } = 假内核([busy, idle])
    const 跑 = 建跑内核(装配)
    await 跑("s1", "python", "a = 1")
    await 跑("s1", "python", "print(a)")
    expect(开过.次数).toBe(1)
    expect(发过.map((x) => x.id)).toEqual(["k1", "k1"])
  })

  it("两段 ACP 会话各有各的内核", async () => {
    const { 装配, 开过 } = 假内核([busy, idle])
    const 跑 = 建跑内核(装配)
    await 跑("s1", "python", "a = 1")
    await 跑("s2", "python", "a = 1")
    expect(开过.次数).toBe(2)
  })

  /**
   * **死了要重开**：写进一段死会话，代码掉进地里，
   * 而且**没有任何人会说话**——那一次调用会一直等到超时。
   */
  it("内核死了就重开一段", async () => {
    let 活着 = true
    const { 装配, 开过 } = 假内核([busy, idle], { 还活着: () => 活着 })
    const 跑 = 建跑内核(装配)
    await 跑("s1", "python", "a = 1")
    活着 = false
    await 跑("s1", "python", "a = 1")
    expect(开过.次数).toBe(2)
  })
})

describe("超时", () => {
  /**
   * **跑不完也要出声**（规格 7.5）。
   * 卡住的那次调用如果只是一直等，agent 那边看到的是「工具没反应」。
   */
  it("超时了把已经出来的交出去，并说清楚", async () => {
    vi.useFakeTimers()
    try {
      const { 装配 } = 假内核([busy, 说("跑了一半")], { 超时毫秒: 5000 })
      const p = 建跑内核(装配)("s1", "python", "while True: pass")
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(5000)
      const r = await p
      expect(r.出错).toBe(true)
      expect(r.文本).toContain("跑了一半")
      expect(r.文本).toContain("5 秒")
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * **超时之后那一句还在跑，而内核是顺序执行的。**
   *
   * 下一次订上去看到的第一段 busy→idle，收的很可能是上一次的尾巴。
   * 不声不响地把它当成这一次的答案，是所有处置里唯一会让人
   * **得出错误结论**的那一种。
   */
  it("超时之后，下一次要说清楚可能混着上一次的尾巴", async () => {
    vi.useFakeTimers()
    try {
      const { 装配, 换剧本 } = 假内核([busy], { 超时毫秒: 5000 })
      const 跑 = 建跑内核(装配)
      const 第一次 = 跑("s1", "python", "慢")
      await vi.advanceTimersByTimeAsync(5001)
      await 第一次

      // 这一次跑完了——但它收到的输出里可能混着上一次的尾巴
      换剧本([busy, 说("某段输出"), idle])
      const 第二次 = 跑("s1", "python", "快")
      await vi.advanceTimersByTimeAsync(1)
      const r = await 第二次
      expect(r.文本).toContain("可能混着它的尾巴")

      // **只说一次**：说成每次都说，那句话就没人看了
      const 第三次 = 跑("s1", "python", "再来")
      await vi.advanceTimersByTimeAsync(1)
      expect((await 第三次).文本).not.toContain("可能混着它的尾巴")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("摆不摆出来", () => {
  /**
   * **一台没配内核的 DAWN 不该把这件工具摆出来。**
   * 摆一个「点了说没配」的工具比不摆更坏：模型会围着它规划，
   * 然后在最后一步撞墙。
   */
  it("没有内核 agent 时，清单里没有这件工具", () => {
    expect(工具清单(false).map((t) => t.name)).not.toContain("dawn_run_in_kernel")
    expect(工具清单(true).map((t) => t.name)).toContain("dawn_run_in_kernel")
  })
})
