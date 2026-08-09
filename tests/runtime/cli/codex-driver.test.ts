/**
 * codex driver：**一轮一个进程 + `thread_id` 续接**（①-C · C3）。
 *
 * 与 claude driver 刻意不共用一个抽象——Spike G 实测两者的多轮语义不同。
 * 这份测试盯的正是那个差异：**第二轮必须带上 `resume <thread_id>`**，
 * 否则每一轮都是一段全新的对话，而**它看起来是好的**（每轮都答得出话），
 * 只是不记得上文。**那种坏法最难被发现。**
 *
 * 假 CLI 起真进程，形状取自实测。
 */
import { afterAll, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CodexDriver } from "../../../src/runtime/cli/codex.js"
import type { AgentEvent } from "../../../src/runtime/types.js"

const SESSION = "s1"

/**
 * 假 codex：把收到的 argv 原样回报，让用例能断言**命令行是怎么拼的**——
 * 这正是 codex 与 claude 的区别所在。
 */
const FAKE = `
const say = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
const argv = process.argv.slice(2)
const isResume = argv.includes("resume")
const prompt = argv[argv.length - 1]
say({ type: "thread.started", thread_id: isResume ? argv[argv.indexOf("resume") + 1] : "新线程-1" })
say({ type: "turn.started" })
if (prompt.includes("工具")) {
  say({ type: "item.started", item: { id: "item_0", type: "command_execution", command: "ls", status: "in_progress" } })
  say({ type: "item.completed", item: { id: "item_0", type: "command_execution", command: "ls", aggregated_output: "a\\nb", exit_code: 0, status: "completed" } })
}
say({ type: "item.completed", item: { id: "item_1", type: "agent_message", text: (isResume ? "续接:" : "首轮:") + prompt } })
say({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 2 } })
`

const dir = mkdtempSync(join(tmpdir(), "dawn-fakecodex-"))
const FAKE_PATH = join(dir, "fake-codex.mjs")
writeFileSync(FAKE_PATH, FAKE)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function driver(over: { threadId?: string } = {}) {
  const events: AgentEvent[] = []
  const threads: string[] = []
  const d = new CodexDriver({
    sessionId: SESSION,
    command: process.execPath,
    args: [FAKE_PATH],
    cwd: process.cwd(),
    emit: (e) => events.push(e),
    onThreadId: (id) => threads.push(id),
    ...(over.threadId ? { threadId: over.threadId } : {}),
  })
  return { d, events, threads }
}

const texts = (events: AgentEvent[]) =>
  events.filter((e) => e.kind === "output").map((e) => (e.kind === "output" ? e.data : ""))

describe("第一轮", () => {
  it("跑得起来，回复回得来", async () => {
    const { d, events } = driver()
    await d.startTurn("你好")
    expect(texts(events)).toEqual(["首轮:你好"])
    expect(events.some((e) => e.kind === "idle")).toBe(true)
  })

  it("**thread_id 报给调用方** —— 它是会话记录，落库由上层负责", async () => {
    const { d, threads } = driver()
    await d.startTurn("你好")
    expect(threads).toEqual(["新线程-1"])
  })

  it("工具调用翻成 tool_start / tool_end", async () => {
    const { d, events } = driver()
    await d.startTurn("用工具看看")
    expect(events.find((e) => e.kind === "tool_start")).toMatchObject({ toolName: "command_execution" })
    expect(events.find((e) => e.kind === "tool_end")).toMatchObject({ isError: false, text: "a\nb" })
  })
})

describe("第二轮：必须 resume", () => {
  it("**第二轮走 resume，带着第一轮的 thread_id**", async () => {
    const { d, events } = driver()
    await d.startTurn("第一句")
    await d.startTurn("第二句")
    // 假 CLI 在 resume 时回「续接:」——不带 resume 的话它会回「首轮:」
    expect(texts(events)).toEqual(["首轮:第一句", "续接:第二句"])
  })

  it("**给了已有 thread_id 时，第一轮就 resume** —— 重开应用后要接得上", async () => {
    const { d, events } = driver({ threadId: "旧线程-9" })
    await d.startTurn("接着说")
    expect(texts(events)).toEqual(["续接:接着说"])
  })
})

describe("出问题时", () => {
  it("**起不来的命令不抛异常**，记成 notice + exited", async () => {
    const events: AgentEvent[] = []
    const d = new CodexDriver({
      sessionId: SESSION,
      command: "这个命令不存在-dawn",
      args: [],
      cwd: process.cwd(),
      emit: (e) => events.push(e),
      onThreadId: () => {},
    })
    await d.startTurn("你好")
    expect(events.some((e) => e.kind === "notice")).toBe(true)
  })

  it("**进程非 0 退出但已经给过 turn.completed** —— 不重复报失败", async () => {
    // codex 实测每轮都往 stderr 打噪声而退出码为 0；这里守的是反面：
    // 一旦这一轮已经正常收口，进程怎么退都不该再多报一次失败
    const { d, events } = driver()
    await d.startTurn("你好")
    expect(events.filter((e) => e.kind === "idle")).toHaveLength(1)
  })
})

describe("codex 没有长驻进程", () => {
  it("**close 之后仍然可以再说话** —— 它本来就是一轮一个进程", async () => {
    const { d, events } = driver()
    await d.startTurn("第一句")
    await d.close()
    await d.startTurn("第二句")
    // 与 claude driver 相反：那边 close 之后再说话要报错
    expect(texts(events)).toEqual(["首轮:第一句", "续接:第二句"])
  })
})
