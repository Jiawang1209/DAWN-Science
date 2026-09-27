/**
 * 桌面通知的判断（2026-09-27，spec `2026-09-27-桌面通知-design.md` §2–§3）。
 * 真中枢（`SessionTranscripts`）+ 假出口：出口只记它收到了什么，判断全在 `桌面通知器` 里。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SessionTranscripts } from "../../src/workbench/events.js"
import {
  桌面通知器, 桌面通知缺省, 通知文案, 读桌面设置, 写桌面设置,
  type 桌面通知条, type 桌面通知设置, type 桌面通知出口,
} from "../../src/workbench/desktop-notify.js"
import { EN } from "../../src/ui/i18n/en.js"
import type { AgentEvent } from "../../src/runtime/types.js"

function 造(o: { 设置?: Partial<桌面通知设置>; 前台?: boolean; 在屏上?: string[]; 标题?: Record<string, string>; 支持?: boolean } = {}) {
  const events = new SessionTranscripts({ terminalMaxChars: 1000 })
  const 弹过: 桌面通知条[] = []
  const 角标: number[] = []
  const 前台听众: (() => void)[] = []
  const 状态 = { 前台: o.前台 ?? false, 在屏上: new Set(o.在屏上 ?? []), 停过: new Map<string, number>(), 设置: { ...桌面通知缺省, ...o.设置 } }
  const 出口: 桌面通知出口 = {
    弹: (n) => void 弹过.push(n),
    角标: (n) => void 角标.push(n),
    前台变了: (cb) => {
      前台听众.push(cb)
      return () => {}
    },
    支持: () => o.支持 ?? true,
  }
  const 器 = new 桌面通知器({
    events,
    设置: () => 状态.设置,
    前台: () => 状态.前台,
    在屏上: (sid) => 状态.在屏上.has(sid),
    标题of: (sid) => o.标题?.[sid],
    停过几次: (sid) => 状态.停过.get(sid) ?? 0,
    出口,
    静候毫秒: 1000,
  })
  const 一轮 = (sid: string, 答 = "好的，做完了。", 失败?: string) => {
    events.userTurn(sid, "去做")
    events.ingest(sid, { kind: "output", sessionId: sid, data: 答 })
    events.ingest(sid, { kind: "turn_end", sessionId: sid })
    if (失败) events.ingest(sid, { kind: "notice", sessionId: sid, text: 失败, failed: true })
    events.ingest(sid, { kind: "idle", sessionId: sid })
  }
  const 问权限 = (sid: string, requestId = "r1") =>
    events.ingest(sid, {
      kind: "permission_request",
      sessionId: sid,
      requestId,
      title: "执行 curl http://x\n它要访问网络。",
      options: [{ optionId: "allow_once", name: "允许这一次", kind: "allow_once" }],
    })
  const 前台了 = () => {
    状态.前台 = true
    for (const f of 前台听众) f()
  }
  return { events, 器, 弹过, 角标, 状态, 一轮, 问权限, 前台了 }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("做完了", () => {
  it("收尾后静候 1 秒才弹；标题带会话名，正文是回复开头；角标 1", async () => {
    const c = 造({ 标题: { a: "清洗表格" } })
    c.events.track("a", "native")
    c.一轮("a")
    expect(c.弹过, "静候期间不弹").toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toEqual([
      { kind: "done", sessionId: "a", title: { msgid: 通知文案.做完, args: ["清洗表格"] }, body: { msgid: "{0}", args: ["好的，做完了。"] } },
    ])
    expect(c.角标.at(-1)).toBe(1)
  })

  it("静候期间这段又动了（排着的下一句 / 调整方向接着跑）→ 作废", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.一轮("a")
    c.events.userTurn("a", "接着做")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(0)
  })

  it("收尾之后的 usage 回填（落在已 final 的那条上）不算「又动了」", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.一轮("a")
    c.events.ingest("a", { kind: "turn_usage", sessionId: "a", usage: { input: 1, output: 1 } } as never)
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(1)
  })

  it("人按了停止（停止次数在这一轮里变了）→ 不报「做完了」", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.events.userTurn("a", "去做")
    c.状态.停过.set("a", 1)
    c.events.ingest("a", { kind: "idle", sessionId: "a" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(0)
  })

  it("没有文字回复 → 正文「（没有文字回复）」；没有标题 → 无题那一句", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.events.userTurn("a", "去做")
    c.events.ingest("a", { kind: "idle", sessionId: "a" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过[0]).toMatchObject({ title: { msgid: 通知文案.做完无题, args: [] }, body: { msgid: 通知文案.没有文字, args: [] } })
  })

  it("回复超过 120 字截断并带省略号；换行压成空格", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.一轮("a", `第一行\n${"字".repeat(200)}`)
    await vi.advanceTimersByTimeAsync(1000)
    const 正文 = c.弹过[0]!.body.args[0]!
    expect(正文.startsWith("第一行 字")).toBe(true)
    expect(正文.length).toBe(121)
    expect(正文.endsWith("…")).toBe(true)
  })

  it("pty 与纯内核会话不报", async () => {
    const c = 造()
    c.events.track("p", "pty")
    c.events.track("k", "kernel")
    c.events.ingest("p", { kind: "idle", sessionId: "p" })
    c.events.ingest("k", { kind: "idle", sessionId: "k" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(0)
  })
})

describe("前台与在屏上（spec §0 第 2 条）", () => {
  const 场景 = [
    { 前台: false, 在屏上: true, 弹: true, 说: "窗口不在前台：弹" },
    { 前台: true, 在屏上: false, 弹: true, 说: "在前台但看的是别的段：弹" },
    { 前台: true, 在屏上: true, 弹: false, 说: "在前台且那段就在眼前：不弹" },
  ]
  for (const s of 场景) {
    it(s.说, async () => {
      const c = 造({ 前台: s.前台, 在屏上: s.在屏上 ? ["a"] : [] })
      c.events.track("a", "native")
      c.一轮("a")
      await vi.advanceTimersByTimeAsync(1000)
      expect(c.弹过.length > 0).toBe(s.弹)
    })
  }

  it("关掉 quietWhenFocused：正看着也弹", async () => {
    const c = 造({ 前台: true, 在屏上: ["a"], 设置: { quietWhenFocused: false } })
    c.events.track("a", "native")
    c.一轮("a")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(1)
  })

  it("三个开关各管各的", async () => {
    const c = 造({ 设置: { done: false } })
    c.events.track("a", "native")
    c.一轮("a")
    c.一轮("a", "答", "模型调用失败：401")
    c.问权限("a")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过.map((n) => n.kind)).toEqual(["error", "permission"])
  })
})

describe("出错了", () => {
  it("这一轮带过 failed 的提示 → 弹「出错了」，正文是那句；**不再**另弹「做完了」", async () => {
    const c = 造({ 标题: { a: "画图" } })
    c.events.track("a", "native")
    c.一轮("a", "", "模型调用失败：401 bad key")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toEqual([
      { kind: "error", sessionId: "a", title: { msgid: 通知文案.出错, args: ["画图"] }, body: { msgid: "{0}", args: ["模型调用失败：401 bad key"] } },
    ])
  })

  it("非零退出（native / acp / cli）→ 出错；pty 的退出不算", () => {
    const c = 造()
    c.events.track("a", "acp")
    c.events.track("p", "pty")
    c.events.ingest("a", { kind: "exited", sessionId: "a", exitCode: 137 })
    c.events.ingest("p", { kind: "exited", sessionId: "p", exitCode: 1 })
    expect(c.弹过).toHaveLength(1)
    expect(c.弹过[0]).toMatchObject({ kind: "error", sessionId: "a", body: { msgid: 通知文案.退出码, args: ["137"] } })
  })

  it("零退出不算（runtime 的 `exited.exitCode` 是必填的 number；协议那头缺省的情形由 `u.exitCode !== undefined` 兜着）", () => {
    const c = 造()
    c.events.track("a", "native")
    c.events.ingest("a", { kind: "exited", sessionId: "a", exitCode: 0 })
    expect(c.弹过).toHaveLength(0)
  })
})

describe("等你点头", () => {
  it("新的一张权限卡 → 马上弹（不静候）；正文是卡标题第一行；同一张不弹两次", () => {
    const c = 造({ 标题: { a: "联网" } })
    c.events.track("a", "native")
    c.问权限("a", "r1")
    c.events.ingest("a", { kind: "output", sessionId: "a", data: "…" })
    c.问权限("a", "r1")
    expect(c.弹过).toEqual([
      { kind: "permission", sessionId: "a", title: { msgid: 通知文案.等点头, args: ["联网"] }, body: { msgid: "{0}", args: ["执行 curl http://x"] } },
    ])
    c.问权限("a", "r2")
    expect(c.弹过).toHaveLength(2)
  })

  it("卡被答掉（在哪答的都算）→ 若那段是因为权限卡记的，角标划掉", () => {
    const c = 造()
    c.events.track("a", "native")
    c.问权限("a")
    expect(c.角标.at(-1)).toBe(1)
    c.events.ingest("a", { kind: "permission_settled", sessionId: "a", requestId: "r1" })
    expect(c.角标.at(-1)).toBe(0)
  })
})

describe("角标 = 还没看的那几段", () => {
  it("两段各弹一次 = 2；回到前台时只划掉在屏上的那段", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.events.track("b", "native")
    c.一轮("a")
    c.一轮("b")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.角标.at(-1)).toBe(2)
    c.状态.在屏上.add("b")
    c.前台了()
    expect(c.角标.at(-1)).toBe(1)
  })

  it("`看见了()` 在不在前台时什么都不做（界面换段但人不在）", async () => {
    const c = 造({ 在屏上: ["a"] })
    c.events.track("a", "native")
    c.一轮("a")
    await vi.advanceTimersByTimeAsync(1000)
    c.器.看见了()
    expect(c.角标.at(-1)).toBe(1)
  })

  it("会话没了（删 / 归档）→ 划掉，候着的也作废", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.events.track("b", "native")
    c.一轮("a")
    await vi.advanceTimersByTimeAsync(1000)
    c.一轮("b")
    c.器.忘掉("a")
    c.器.忘掉("b")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(1)
    expect(c.角标.at(-1)).toBe(0)
  })
})

describe("定时任务（spec §0 第 5 条）", () => {
  it("交给定时的那段：它自己的收尾不弹；调度器报结束时弹一条「定时…」，计入角标", async () => {
    const c = 造()
    c.events.track("s", "native")
    c.器.交给定时("s")
    c.一轮("s")
    c.器.定时跑完了("周报", "succeeded", "写好了", "s")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toEqual([
      { kind: "schedule", sessionId: "s", title: { msgid: 通知文案.定时成, args: ["周报"] }, body: { msgid: "{0}", args: ["写好了"] } },
    ])
    expect(c.角标.at(-1)).toBe(1)
  })

  it("失败 / 取消走「出错」那个开关；没会话也能报（开任务就失败了）", () => {
    const c = 造({ 设置: { done: false } })
    c.器.定时跑完了("周报", "failed", "开任务时没有拿到会话", undefined)
    c.器.定时跑完了("月报", "cancelled", undefined, undefined)
    c.器.定时跑完了("日报", "succeeded", "好", undefined)
    expect(c.弹过.map((n) => n.title.msgid)).toEqual([通知文案.定时败, 通知文案.定时消])
    expect(c.角标, "没会话的不计角标——点它也回不到哪段").toEqual([])
  })

  it("定时那段结束之后人接着聊：从下一句起按普通会话算", async () => {
    const c = 造()
    c.events.track("s", "native")
    c.器.交给定时("s")
    c.一轮("s")
    c.器.定时跑完了("周报", "succeeded", "好", "s")
    c.一轮("s")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过.map((n) => n.kind)).toEqual(["schedule", "done"])
  })
})

describe("发一条试试", () => {
  it("弹一条 test，不计角标", () => {
    const c = 造()
    expect(c.器.试一条()).toEqual({ shown: true })
    expect(c.弹过[0]).toMatchObject({ kind: "test", title: { msgid: 通知文案.试标题 } })
    expect(c.角标).toEqual([])
  })
  it("系统不支持 → 如实说，不假装弹了", () => {
    const c = 造({ 支持: false })
    expect(c.器.试一条()).toEqual({ shown: false, reason: "unsupported" })
    expect(c.弹过).toEqual([])
  })
  it("没有出口（这次运行没装配）→ 如实说", () => {
    const events = new SessionTranscripts({ terminalMaxChars: 10 })
    const 器 = new 桌面通知器({ events, 设置: () => 桌面通知缺省, 前台: () => false, 在屏上: () => false, 标题of: () => undefined, 停过几次: () => 0 })
    expect(器.试一条()).toEqual({ shown: false, reason: "no_exit" })
  })
})

describe("语言与设置", () => {
  it("设置里有 lang → 每一条都带上；没有 → 不带（出口按系统语言）", async () => {
    const c = 造({ 设置: { lang: "en" } })
    c.events.track("a", "native")
    c.问权限("a")
    expect(c.弹过[0]!.lang).toBe("en")
  })

  it("读写：缺省全开；只改给了的那几个；坏 json 回落缺省", () => {
    const 表 = new Map<string, string>()
    const s = { get: (k: "desktop.notify") => 表.get(k), set: (k: "desktop.notify", v: string) => void 表.set(k, v) }
    expect(读桌面设置(s)).toEqual(桌面通知缺省)
    expect(写桌面设置(s, { done: false, lang: "en" })).toEqual({ ...桌面通知缺省, done: false, lang: "en" })
    expect(写桌面设置(s, { error: false })).toEqual({ ...桌面通知缺省, done: false, error: false, lang: "en" })
    表.set("desktop.notify", "{坏")
    expect(读桌面设置(s)).toEqual(桌面通知缺省)
    expect(读桌面设置(undefined)).toEqual(桌面通知缺省)
  })

  it("**通知里的每一句在英文表里都有**（扫描；`{0}` 是原样透传，不算）", () => {
    const 缺 = Object.values(通知文案).filter((m) => !(m in EN))
    expect(缺, "缺的补进 src/ui/i18n/en.ts").toEqual([])
  })
})

describe("压缩、回退、子 agent 都不报（2026-09-28，这三样在计划之后进来）", () => {
  it("一轮里自动压缩（超上限：先失败、压完重试答完）→ 只报一条「做完了」，不报「出错了」", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.events.userTurn("a", "去做")
    c.events.ingest("a", { kind: "notice", sessionId: "a", text: "模型调用失败：context length exceeded", failed: true })
    c.events.ingest("a", { kind: "compaction_start", sessionId: "a", reason: "overflow" })
    c.events.ingest("a", { kind: "compaction_end", sessionId: "a", reason: "overflow", status: "done", retried: true })
    c.events.ingest("a", { kind: "output", sessionId: "a", data: "压完接着做完了" })
    c.events.ingest("a", { kind: "turn_end", sessionId: "a" })
    c.events.ingest("a", { kind: "idle", sessionId: "a" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过.map((n) => [n.kind, n.body.args[0]])).toEqual([["done", "压完接着做完了"]])
  })

  it("手动压缩（没有 idle）、压缩失败的标记 → 什么都不弹", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.events.ingest("a", { kind: "compaction_start", sessionId: "a", reason: "manual" })
    c.events.ingest("a", { kind: "compaction_end", sessionId: "a", reason: "manual", status: "failed", error: "对话还太短" })
    c.events.ingest("a", { kind: "notice", sessionId: "a", text: "上下文没压缩成：对话还太短" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toEqual([])
  })

  it("回退（truncateAt + 一句提示）不弹", async () => {
    const c = 造()
    c.events.track("a", "native")
    c.一轮("a")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(1)
    const 那句 = c.events.peekItems("a").find((x) => x.type === "turn" && x.who === "user")!.id
    expect(c.events.truncateAt("a", 那句)).toBe(true)
    c.events.notice("a", "已回退到这句之前")
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过).toHaveLength(1)
  })

  it("子 agent 跑完、在坞里接着问它答完（成与不成）→ 不弹；主会话那一轮收尾照常弹一次", async () => {
    const c = 造()
    c.events.track("s", "native")
    c.events.userTurn("s", "派两个人去看")
    const 发 = (e: Extract<AgentEvent, { kind: "subagent_event" }>["event"]) =>
      c.events.ingest("s", { kind: "subagent_event", sessionId: "s", toolCallId: "c1", index: 0, event: e })
    c.events.ingest("s", { kind: "subagent_start", sessionId: "s", toolCallId: "c1", index: 0, agent: "scout", task: "看看" })
    发({ kind: "output", data: "看完了" })
    发({ kind: "turn_end" })
    发({ kind: "settled", ok: true, result: { text: "好" } })
    c.events.ingest("s", { kind: "subagent_end", sessionId: "s", toolCallId: "c1", index: 0, ok: true })
    c.events.ingest("s", { kind: "output", sessionId: "s", data: "他们看完了" })
    c.events.ingest("s", { kind: "turn_end", sessionId: "s" })
    c.events.ingest("s", { kind: "idle", sessionId: "s" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过.map((n) => [n.kind, n.sessionId])).toEqual([["done", "s"]])
    // 坞里接着问：答完（主会话此刻没在跑，也没有 idle）
    const 子 = c.events.找子转录("s#sub:c1:0")!
    expect(c.events.子agent续问开始(子, "再说说")).toBe(true)
    发({ kind: "output", data: "补一句" })
    发({ kind: "settled", ok: true, followUp: true })
    c.events.子agent续问开始(子, "还有吗")
    发({ kind: "settled", ok: false, followUp: true, error: "断了" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.弹过, "接着问一个子 agent 不发通知").toHaveLength(1)
  })
})
