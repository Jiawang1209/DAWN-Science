import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import { 消息转历史 } from "../../src/runtime/history.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import { 还原成条目 } from "../../src/workbench/restored-items.js"
import { TranscriptItemSchema } from "../../src/protocol/events.js"
import type { AgentEvent } from "../../src/runtime/types.js"

const name = "mlai-science__search_cases"
const raw = [{ case_id: "20251016-layout", title: "网络布局浅览", language: "r", cover: "figures/1.png", notes: "额外内容".repeat(8000) }]
const full = `[mlai-science]\n${JSON.stringify(raw)}`
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe("案例字段跨运行时和转录", () => {
  it.each([false, true])('retains upstream truncation and the original output path (event budget exceeded=%s)', overBudget => {
    const rt = new NativeRuntime({}), events: AgentEvent[] = []
    const dir = mkdtempSync(join(tmpdir(), 'dawn-upstream-output-')); dirs.push(dir)
    ;(rt as any).sessions.set('s', { sessionDir: dir })
    rt.attach('s', event => events.push(event))
    ;(rt as any).translate('s', { type: 'tool_execution_end', toolName: 'bash', toolCallId: 'short-lines', result: {
      content: [{ type: 'text', text: (overBudget ? 'x'.repeat(20000) : '') + '[Showing lines 1-2000. Full output: /tmp/original-sdk-output]' }],
      details: { truncation: { truncated: true }, fullOutputPath: '/tmp/original-sdk-output' },
    } })
    expect(events.find(e => e.kind === 'tool_end')).toMatchObject({ truncated: true, fullOutputPath: '/tmp/original-sdk-output' })
  })
  it("实时工具正文照常截断，独立案例字段完整进入协议、增量和快照", () => {
    const rt = new NativeRuntime({})
    const internal = rt as unknown as { sessions: Map<string, unknown>; translate: (id: string, event: unknown) => void }
    const dir = mkdtempSync(join(tmpdir(), "dawn-case-results-"))
    dirs.push(dir)
    internal.sessions.set("s", { sessionDir: dir })
    const events: AgentEvent[] = []
    rt.attach("s", (event) => events.push(event))
    internal.translate("s", { type: "tool_execution_end", toolName: name, toolCallId: "t", result: { content: [{ type: "text", text: full }] } })
    const event = events.find((x) => x.kind === "tool_end")!
    expect(event).toMatchObject({ truncated: true, caseResults: [{ case_id: "20251016-layout", title: "网络布局浅览", cover: "figures/1.png" }] })
    expect(JSON.stringify(event)).not.toContain("额外内容额外内容额外内容额外内容".repeat(1000))
    const hub = new SessionTranscripts({ terminalMaxChars: 1000 })
    hub.track("s", "native")
    hub.subscribe("s")
    const updates: unknown[] = []
    hub.onUpdate((x) => updates.push(x))
    hub.ingest("s", event)
    const item = hub.subscribe("s").items[0]!
    expect(item).toMatchObject({ caseResults: [{ case_id: "20251016-layout" }], resultTruncated: true })
    expect(TranscriptItemSchema.safeParse(item).success).toBe(true)
    expect(JSON.stringify(updates)).toContain("caseResults")
  })

  it.each([true, false])("历史恢复与投影重建案例字段，包括只有结果的旧记录（有调用=%s）", (withCall) => {
    const messages: Parameters<typeof 消息转历史>[0] = [
      ...(withCall ? [{ role: "assistant" as const, content: [{ type: "toolCall" as const, id: "t", name, arguments: {} }] }] : []),
      { role: "toolResult", toolCallId: "t", toolName: name, content: [{ type: "text", text: full }] },
    ]
    const restored = 消息转历史(messages)
    const item = 还原成条目(restored[0]!, 0)
    expect(item.type === "tool" ? item.caseResults : undefined).toMatchObject([{ case_id: "20251016-layout", title: "网络布局浅览" }])
    expect(TranscriptItemSchema.safeParse(item).success).toBe(true)
  })
})
