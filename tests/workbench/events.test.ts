/**
 * 会话记录中枢（返工 R4 重写）。
 *
 * 旧版是「环形缓冲 + seq + 丢弃出声」，19 条用例全部随设计作废。
 * 新版持有一份 transcript：订阅给全量快照，之后推增量。
 */
import { describe, expect, it, vi } from "vitest"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { SessionUpdateSchema } from "../../src/protocol/events.js"
import type { SessionUpdate } from "../../src/protocol/events.js"

const hub = (terminalMaxChars = 1000) => new SessionTranscripts({ terminalMaxChars })

function collector(h: SessionTranscripts) {
  const seen: SessionUpdate[] = []
  h.onUpdate((u) => seen.push(u))
  return seen
}

describe("记录中枢 · 快照与 revision", () => {
  it("新会话的快照是空的，revision 0", () => {
    const h = hub()
    h.track("a", "native")
    const s = h.subscribe("a")
    expect(s).toMatchObject({ sessionId: "a", kind: "native", revision: 0, items: [], state: "alive" })
  })

  it("每次更新 revision +1，且快照与增量对得上", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)

    h.ingest("a", { kind: "output", sessionId: "a", data: "你" })
    h.ingest("a", { kind: "output", sessionId: "a", data: "好" })

    expect(seen.map((u) => u.revision)).toEqual([1, 2])
    expect(h.subscribe("a").revision).toBe(2)
  })

  it("未追踪的会话订阅即抛错 —— 不返回空快照假装正常", () => {
    expect(() => hub().subscribe("nope")).toThrow(/nope/)
  })

  it("推出去的每一条都合协议", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)
    h.ingest("a", { kind: "output", sessionId: "a", data: "hi" })
    h.ingest("a", { kind: "tool_start", sessionId: "a", toolCallId: "t1", toolName: "bash", input: {} })
    h.ingest("a", { kind: "exited", sessionId: "a", exitCode: 0 })
    expect(seen.length).toBe(3)
    for (const u of seen) expect(SessionUpdateSchema.safeParse(u).success).toBe(true)
  })
})

describe("记录中枢 · 对话累积", () => {
  it("文本增量累积进同一条 turn，按 id 覆盖推送", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)

    h.ingest("a", { kind: "output", sessionId: "a", data: "你" })
    h.ingest("a", { kind: "output", sessionId: "a", data: "好" })

    const items = seen.map((u) => (u.type === "item" ? u.item : undefined))
    expect(items[0]).toMatchObject({ type: "turn", text: "你", final: false })
    // 第二条推的是**累积后的整条**，界面按 id 覆盖即可，不必自己拼
    expect(items[1]).toMatchObject({ type: "turn", text: "你好", final: false })
    expect(new Set(items.map((i) => i?.id)).size).toBe(1)
  })

  it("turn_end 收尾，下一轮换新 id", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    h.ingest("a", { kind: "output", sessionId: "a", data: "一" })
    h.ingest("a", { kind: "turn_end", sessionId: "a" })
    h.ingest("a", { kind: "output", sessionId: "a", data: "二" })

    const items = h.subscribe("a").items
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ text: "一", final: true })
    expect(items[1]).toMatchObject({ text: "二", final: false })
  })

  it("用户自己说的话进 transcript —— 否则切回旧会话只剩半边对话", () => {
    const h = hub()
    h.track("a", "native")
    h.userTurn("a", "跑一下测试")
    const items = h.subscribe("a").items
    expect(items[0]).toMatchObject({ type: "turn", who: "user", text: "跑一下测试", final: true })
  })

  it("PTY 不补用户 turn —— 终端本来就回显", () => {
    const h = hub()
    h.track("p", "pty")
    h.userTurn("p", "ls\n")
    expect(h.subscribe("p").items).toEqual([])
  })
})

describe("记录中枢 · 工具调用（界面靠它才看得见 agent 在干什么）", () => {
  it("tool_start 产生 running 条目", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", {
      kind: "tool_start", sessionId: "a", toolCallId: "t1", toolName: "bash",
      input: { command: "ls" },
    })
    expect(h.subscribe("a").items[0]).toMatchObject({
      type: "tool", name: "bash", status: "running", input: { command: "ls" },
    })
  })

  it("tool_end 就地改写同一条，不新增", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", { kind: "tool_start", sessionId: "a", toolCallId: "t1", toolName: "bash", input: {} })
    h.ingest("a", {
      kind: "tool_end", sessionId: "a", toolCallId: "t1", toolName: "bash",
      isError: false, text: "done", truncated: false, bytes: 4,
    })
    const items = h.subscribe("a").items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ status: "ok", result: "done" })
  })

  it("失败的工具标 error —— 不能和成功长得一样", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", { kind: "tool_start", sessionId: "a", toolCallId: "t1", toolName: "bash", input: {} })
    h.ingest("a", {
      kind: "tool_end", sessionId: "a", toolCallId: "t1", toolName: "bash",
      isError: true, text: "拒绝执行", truncated: false, bytes: 12,
    })
    expect(h.subscribe("a").items[0]).toMatchObject({ status: "error", result: "拒绝执行" })
  })

  it("没见过 start 的 end 也照记 —— 宁可多一条，不可丢一条", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", {
      kind: "tool_end", sessionId: "a", toolCallId: "orphan", toolName: "read",
      isError: false, text: "x", truncated: false, bytes: 1,
    })
    expect(h.subscribe("a").items).toHaveLength(1)
  })
})

describe("记录中枢 · 终端 scrollback", () => {
  it("PTY 字节进 terminal，不进 items", () => {
    const h = hub()
    h.track("p", "pty")
    h.ingest("p", { kind: "output", sessionId: "p", data: "[31mred" })
    const s = h.subscribe("p")
    expect(s.terminal).toBe("[31mred")
    expect(s.items).toEqual([])
  })

  it("超出上限时裁掉最早的并标注 —— **但不发故障事件**", () => {
    // 终端本来就是有限回滚的，xterm 自己也只留 5000 行。
    // 旧设计为此发 `dropped` 事件要求界面道歉，那是把正常契约当故障播报。
    const h = hub(10)
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    h.ingest("p", { kind: "output", sessionId: "p", data: "aaaaaa" })
    h.ingest("p", { kind: "output", sessionId: "p", data: "bbbbbb" })

    const s = h.subscribe("p")
    expect(s.terminal.length).toBeLessThanOrEqual(10)
    expect(s.terminalTrimmed).toBe(true)
    // 推送的仍然只是两条 bytes 增量，没有额外的「丢弃」事件
    expect(seen.map((u) => u.type)).toEqual(["bytes", "bytes"])
  })

  it("native 会话的 terminal 恒为空", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", { kind: "output", sessionId: "a", data: "你好" })
    expect(h.subscribe("a").terminal).toBe("")
  })
})

describe("记录中枢 · 状态与订阅", () => {
  it("退出写进快照并推 state 更新", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)
    h.ingest("a", { kind: "exited", sessionId: "a", exitCode: 3 })
    expect(h.subscribe("a")).toMatchObject({ state: "exited", exitCode: 3 })
    expect(seen[0]).toMatchObject({ type: "state", state: "exited", exitCode: 3 })
  })

  it("未订阅就不推 —— 没人看的 PTY 不该往 IPC 上灌字节", () => {
    const h = hub()
    h.track("p", "pty")
    const seen = collector(h)
    h.ingest("p", { kind: "output", sessionId: "p", data: "noise" })
    expect(seen).toEqual([])
  })

  it("未订阅期间的内容仍然记进 transcript —— 订阅后能补看", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", { kind: "output", sessionId: "a", data: "错过的" })
    expect(h.subscribe("a").items[0]).toMatchObject({ text: "错过的" })
  })

  it("退订后停止推送", () => {
    const h = hub()
    h.track("p", "pty")
    h.subscribe("p")
    const seen = collector(h)
    h.ingest("p", { kind: "output", sessionId: "p", data: "1" })
    h.unsubscribe("p")
    h.ingest("p", { kind: "output", sessionId: "p", data: "2" })
    expect(seen).toHaveLength(1)
  })

  it("dispose 后不再推送，退订函数可重复调用", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const cb = vi.fn()
    const off = h.onUpdate(cb)
    off()
    off()
    h.ingest("a", { kind: "output", sessionId: "a", data: "x" })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe("系统提示（notice）", () => {
  // `NoticeItem` 在协议里一直存在，但在卡死守卫之前**没有任何东西能产出它**。
  // 「定义了却没人产出」是本项目反复出现的那类缺口。
  it("notice 独立成条，不并进 agent 的发言", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", { kind: "output", sessionId: "a", data: "我在想" })
    h.ingest("a", { kind: "notice", sessionId: "a", text: "检测到重复调用，已中断" })
    const items = h.subscribe("a").items
    expect(items.map((i) => i.type)).toEqual(["turn", "notice"])
    const notice = items[1]!
    expect(notice.type === "notice" && notice.text).toContain("已中断")
  })

  it("notice 有独立的 id，不和 turn 撞", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", { kind: "notice", sessionId: "a", text: "一" })
    h.ingest("a", { kind: "notice", sessionId: "a", text: "二" })
    const ids = h.subscribe("a").items.map((i) => i.id)
    expect(new Set(ids).size).toBe(2)
  })

  it("会推送给订阅者 —— 中断的原因必须到得了界面", () => {
    const h = hub()
    h.track("a", "native")
    h.subscribe("a")
    const seen = collector(h)
    h.ingest("a", { kind: "notice", sessionId: "a", text: "停了" })
    expect(seen).toHaveLength(1)
  })
})

describe("截断的三件套一起走", () => {
  // 修复前：runtime 层 `.slice(0, 2000)` 硬砍，只传正文。
  // 界面拿不到「这是残缺品」这个事实，却在认真地说「还有 N 行」。
  it("truncated / bytes / fullOutputPath 都传到协议层", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", {
      kind: "tool_end", sessionId: "a", toolCallId: "t1", toolName: "bash",
      isError: false, text: "头…尾", truncated: true, bytes: 999_999,
      fullOutputPath: "/tmp/sess/tool-output/bash-1.txt",
    })
    expect(h.subscribe("a").items[0]).toMatchObject({
      resultTruncated: true,
      resultBytes: 999_999,
      fullOutputPath: "/tmp/sess/tool-output/bash-1.txt",
    })
  })

  it("没截断时 bytes 仍是真数 —— 界面靠它说话，不能只在截断时才给", () => {
    const h = hub()
    h.track("a", "native")
    h.ingest("a", {
      kind: "tool_end", sessionId: "a", toolCallId: "t1", toolName: "read",
      isError: false, text: "短", truncated: false, bytes: 3,
    })
    expect(h.subscribe("a").items[0]).toMatchObject({ resultTruncated: false, resultBytes: 3 })
  })
})
