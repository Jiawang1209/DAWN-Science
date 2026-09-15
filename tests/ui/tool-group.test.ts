/**
 * 连续的工具调用折成一行（2026-09-15，作者：「这些内容，我们能否也进行一个折叠呢？」）。
 *
 * 分组与汇总是纯函数：**什么算「连续」、汇总行说什么**，在这里一次说清。
 */
import { describe, expect, it } from "vitest"
import type { TranscriptItem } from "../../src/protocol/events.js"
import { 分组转录, 汇总工具组 } from "../../src/ui/tool-group.js"

type 工具 = Extract<TranscriptItem, { type: "tool" }>
const 工具 = (id: string, extra: Partial<工具> = {}): 工具 => ({
  type: "tool",
  id,
  name: "bash",
  input: { command: `echo ${id}` },
  status: "ok",
  startedAt: 0,
  endedAt: 1000,
  ...extra,
})
const 话 = (id: string): TranscriptItem => ({ type: "notice", id, text: id }) as TranscriptItem

describe("分组转录", () => {
  it("**两条以上相邻的工具调用成一组**，原下标跟着走", () => {
    const 列 = [话("a"), 工具("t1"), 工具("t2"), 工具("t3"), 话("b")]
    const 组 = 分组转录(列)
    expect(组.map((g) => g.kind)).toEqual(["item", "group", "item"])
    const g = 组[1]!
    if (g.kind !== "group") throw new Error("应是一组")
    expect(g.tools.map((x) => x.id)).toEqual(["t1", "t2", "t3"])
    expect(组[2]).toMatchObject({ kind: "item", 下标: 4 })
  })

  it("**只有一条的不成组**——单独一条照旧是那一行", () => {
    const 组 = 分组转录([话("a"), 工具("t1"), 话("b")])
    expect(组.map((g) => g.kind)).toEqual(["item", "item", "item"])
  })

  it("**中间隔着别的东西就断开**", () => {
    const 组 = 分组转录([工具("t1"), 工具("t2"), 话("x"), 工具("t3"), 工具("t4")])
    expect(组.map((g) => g.kind)).toEqual(["group", "item", "group"])
  })

  it("组的 key 取第一条的 id：后面再长出一条时，这一组不重新挂载", () => {
    const 前 = 分组转录([工具("t1"), 工具("t2")])
    const 后 = 分组转录([工具("t1"), 工具("t2"), 工具("t3")])
    expect(前[0]!.key).toBe(后[0]!.key)
  })
})

describe("汇总工具组", () => {
  it("全是 bash → 「命令」；数失败；耗时相加", () => {
    const s = 汇总工具组([工具("t1"), 工具("t2", { status: "error" }), 工具("t3", { startedAt: 0, endedAt: 2500 })])
    expect(s).toMatchObject({ 条数: 3, 全是命令: true, 失败: 1, 在跑: undefined, 总毫秒: 4500 })
  })

  it("混着别的工具 → 不叫「命令」", () => {
    expect(汇总工具组([工具("t1"), 工具("t2", { name: "read" })]).全是命令).toBe(false)
  })

  it("**有一条在跑**：说出是第几条，以及它在跑什么", () => {
    const s = 汇总工具组([工具("t1"), 工具("t2", { status: "running", endedAt: undefined })])
    expect(s.在跑).toEqual({ 第几条: 2, 条: expect.objectContaining({ id: "t2" }) })
  })

  it("**有一条没有起止时刻就不给总耗时**——少算一截的数比不说更坏", () => {
    expect(汇总工具组([工具("t1"), 工具("t2", { startedAt: undefined })]).总毫秒).toBeUndefined()
  })
})
