/**
 * iopub → 结构化 Console 条目（②-A · K4）。
 *
 * 这份测试盯四件事，每一件都对应一种「看着对、实际有害」的做法：
 *
 *   1. **溯源只传不造** —— 中间任何一处「稍后补上」都会在重启后对不上
 *   2. **截断给真数** —— 「已截断」三个字帮不上任何人（规格 7.5）
 *   3. **富输出挑不出就不挑** —— 挑错 mime 画出来的是乱码
 *   4. **超大不渲染而不是硬渲染** —— 界面卡死比「这张图没显示」难查得多
 */
import { describe, expect, it } from "vitest"
import {
  RICH_MAX_BYTES,
  TEXT_MAX_BYTES,
  translateOutput,
  type ConsoleEntry,
} from "../../src/kernel/outputs.js"
import type { Provenance, TaggedMessage } from "../../src/kernel/types.js"

const prov: Provenance = { kernelInstanceId: "k-1", kernelRevision: 7, runId: "run-3" }

const tag = (msg_type: string, content: Record<string, unknown>): TaggedMessage => ({
  message: { header: { msg_id: "m1", msg_type }, parent_header: {}, metadata: {}, content },
  provenance: prov,
})

const one = (msg_type: string, content: Record<string, unknown>): ConsoleEntry | undefined =>
  translateOutput(tag(msg_type, content))[0]

describe("stream", () => {
  it("stdout 与 stderr 分开 —— 把报错混进正常输出会让人漏看", () => {
    expect(one("stream", { name: "stdout", text: "a" })).toMatchObject({ stream: "stdout", text: "a" })
    expect(one("stream", { name: "stderr", text: "b" })).toMatchObject({ stream: "stderr" })
  })

  it("**认不出的 name 当 stdout** —— 把普通输出误标成错误会让人以为出了问题", () => {
    expect(one("stream", { name: "什么鬼", text: "a" })).toMatchObject({ stream: "stdout" })
  })

  it("没超上界时不带截断字段", () => {
    expect(one("stream", { name: "stdout", text: "短" })).not.toHaveProperty("truncated")
  })

  it("**超了要给真数**，不是「已截断」三个字", () => {
    const 长 = "x".repeat(TEXT_MAX_BYTES + 5000)
    const e = one("stream", { name: "stdout", text: 长 }) as Extract<ConsoleEntry, { kind: "stream" }>
    expect(e.truncated?.originalBytes).toBe(TEXT_MAX_BYTES + 5000)
    expect(e.truncated?.keptBytes).toBeLessThanOrEqual(TEXT_MAX_BYTES)
    expect(e.text.length).toBeLessThan(长.length)
  })

  it("**按字节截断不能切出半个汉字**", () => {
    // 全中文：每个字 3 字节，按字节切必然落在字中间
    const 长 = "字".repeat(TEXT_MAX_BYTES) // 远超上界
    const e = one("stream", { name: "stdout", text: 长 }) as Extract<ConsoleEntry, { kind: "stream" }>
    expect(e.text).toMatch(/^字+$/) // 没有 � 残片
    expect(e.text.endsWith("字")).toBe(true)
  })
})

describe("富输出", () => {
  it("**从富到朴挑一个**，并把别的形态摆出来", () => {
    const e = one("display_data", {
      data: { "text/plain": "<Figure>", "image/png": "AAAA", "text/html": "<img>" },
    }) as Extract<ConsoleEntry, { kind: "display" }>
    expect(e.mediaType).toBe("image/png")
    // 人要知道还有别的形态可选
    expect(e.alsoAvailable.sort()).toEqual(["text/html", "text/plain"])
  })

  it("execute_result 与 display_data 是两种 kind —— 前者是「表达式的值」", () => {
    expect(one("execute_result", { data: { "text/plain": "42" } })?.kind).toBe("result")
    expect(one("display_data", { data: { "text/plain": "42" } })?.kind).toBe("display")
  })

  it("**一个认得的 mime 都没有就不产出条目** —— 挑错了画出来是乱码", () => {
    expect(translateOutput(tag("display_data", { data: { "application/x-某种私有格式": "??" } }))).toEqual([])
  })

  it("mime 值是字符串数组时拼起来（协议允许这么写）", () => {
    const e = one("display_data", { data: { "text/plain": ["第一行\n", "第二行"] } }) as Extract<
      ConsoleEntry,
      { kind: "display" }
    >
    expect(e.data).toBe("第一行\n第二行")
  })

  it("**超大不渲染，并说清它有多大** —— 界面卡死比「没显示」难查得多", () => {
    const 巨图 = "A".repeat(RICH_MAX_BYTES + 1000)
    const e = one("display_data", { data: { "image/png": 巨图 } }) as Extract<
      ConsoleEntry,
      { kind: "display" }
    >
    expect(e.tooLarge).toBe(true)
    expect(e.data).toBe("") // 不把它塞进界面
    expect(e.bytes).toBe(RICH_MAX_BYTES + 1000) // 但要说清多大
  })

  it("文本类超了是截断（还能看一部分），不是整份丢掉", () => {
    const e = one("display_data", { data: { "text/html": "h".repeat(TEXT_MAX_BYTES + 10) } }) as Extract<
      ConsoleEntry,
      { kind: "display" }
    >
    expect(e.tooLarge).toBeUndefined()
    expect(e.truncated).toBeDefined()
    expect(e.data.length).toBeGreaterThan(0)
  })
})

describe("error", () => {
  it("三样都留着，**traceback 原样不动**（ANSI 转义留给渲染层处理）", () => {
    const e = one("error", {
      ename: "ValueError",
      evalue: "boom",
      traceback: ["\u001b[31mTraceback\u001b[39m", "  line 1"],
    }) as Extract<ConsoleEntry, { kind: "error" }>
    expect(e.ename).toBe("ValueError")
    expect(e.traceback[0]).toContain("\u001b[31m")
  })

  it("内核没给错误类型时也不留空 —— 空字符串会被渲染成一片空白", () => {
    expect(one("error", {})).toMatchObject({ ename: "（内核没有给出错误类型）" })
  })
})

describe("status", () => {
  it("三种状态认得", () => {
    for (const s of ["busy", "idle", "starting"]) {
      expect(one("status", { execution_state: s })).toMatchObject({ kind: "status", state: s })
    }
  })
  it("认不出的状态不产出条目 —— Console 是给人读的，不是协议日志", () => {
    expect(translateOutput(tag("status", { execution_state: "什么" }))).toEqual([])
  })
})

describe("溯源", () => {
  it("**每一种条目都带着它，且是原样传下来的**", () => {
    const 各种: TaggedMessage[] = [
      tag("stream", { name: "stdout", text: "x" }),
      tag("display_data", { data: { "text/plain": "x" } }),
      tag("error", { ename: "E", evalue: "", traceback: [] }),
      tag("status", { execution_state: "idle" }),
    ]
    for (const m of 各种) {
      const e = translateOutput(m)[0]!
      // **翻译不产生新的溯源，只把它传下去**
      expect(e.provenance).toBe(prov)
    }
  })
})

describe("认不出的消息类型", () => {
  it("返回空数组，不造一条「未知输出」塞进 Console", () => {
    expect(translateOutput(tag("comm_open", {}))).toEqual([])
    expect(translateOutput(tag("execute_input", { code: "1+1" }))).toEqual([])
  })
})
