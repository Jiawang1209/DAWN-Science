/**
 * `CliRuntime`：把两个 driver 接成一个 `AgentRuntime`（①-C · C4）。
 *
 * **这一片是 ①-C 的转折点**——C1–C3 都还没有可运行路径，
 * 接上它之后 claude / codex 第一次能在对话框里说话。
 *
 * 这份测试盯三件事：
 *   1. **按命令名挑 driver**，挑不出来要响亮失败
 *   2. `write` 的契约与 native 一致（同步返回，不 await 一整轮）
 *   3. **`thread_id` 变了要报出去**——codex 的多轮全靠它，丢了会话就断了
 */
import { afterAll, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliRuntime } from "../../../src/runtime/cli/runtime.js"
import type { AgentEvent, SessionSpec } from "../../../src/runtime/types.js"

const dir = mkdtempSync(join(tmpdir(), "dawn-clirt-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** 假 claude：长驻，读 stdin 逐行回一轮 */
const FAKE_CLAUDE = `
let buf = ""
const say = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
process.stdin.setEncoding("utf8")
process.stdin.on("data", (d) => {
  buf += d
  let i
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const text = JSON.parse(line).message.content
    say({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "claude 回：" + text }] } })
    say({ type: "result", is_error: false, stop_reason: "end_turn" })
  }
})
`
/** 假 codex：一轮一进程 */
const FAKE_CODEX = `
const say = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
const argv = process.argv.slice(2)
const isResume = argv.includes("resume")
say({ type: "thread.started", thread_id: isResume ? argv[argv.indexOf("resume") + 1] : "线程-A" })
say({ type: "item.completed", item: { id: "i", type: "agent_message", text: (isResume ? "codex 续接：" : "codex 首轮：") + argv[argv.length - 1] } })
say({ type: "turn.completed", usage: {} })
`

const write = (name: string, body: string) => {
  const p = join(dir, name)
  writeFileSync(p, body)
  return p
}
const CLAUDE = write("claude.mjs", FAKE_CLAUDE)
const CODEX = write("codex.mjs", FAKE_CODEX)

const spec = (over: Partial<SessionSpec> = {}): SessionSpec => ({
  sessionId: "s1",
  workspace: process.cwd(),
  sessionDir: join(dir, "session"),
  ...over,
})

/**
 * 起一个 runtime。`command` 决定挑哪个 driver——**按命令名**，
 * 与 `family.ts` 用的是同一份判断（那份已经有测试）。
 */
function runtime(command: string, args: string[], threads: string[] = []) {
  const events: AgentEvent[] = []
  const rt = new CliRuntime({
    commandOf: () => ({ command: process.execPath, args, family: command }),
    onThreadId: (_s, id) => threads.push(id),
  })
  return { rt, events, threads }
}

const texts = (events: AgentEvent[]) =>
  events.filter((e) => e.kind === "output").map((e) => (e.kind === "output" ? e.data : ""))

/** 说一句并等这一轮跑完 */
async function say(rt: CliRuntime, sessionId: string, text: string): Promise<void> {
  rt.write(sessionId, text)
  await rt.waitForIdle(sessionId)
}

describe("按命令名挑 driver", () => {
  it("claude → 长驻 driver", async () => {
    const { rt, events } = runtime("claude", [CLAUDE])
    rt.attach("s1", (e) => events.push(e))
    await rt.start(spec())
    await say(rt, "s1", "你好")
    expect(texts(events)).toEqual(["claude 回：你好"])
    await rt.stop("s1")
  })

  it("codex → 一轮一进程 driver，**第二轮走 resume**", async () => {
    const { rt, events, threads } = runtime("codex", [CODEX])
    rt.attach("s1", (e) => events.push(e))
    await rt.start(spec())
    await say(rt, "s1", "第一句")
    await say(rt, "s1", "第二句")
    expect(texts(events)).toEqual(["codex 首轮：第一句", "codex 续接：第二句"])
    // **thread_id 报出去了** —— 上层靠它落库
    expect(threads).toEqual(["线程-A"])
    await rt.stop("s1")
  })

  it("**认不出的命令响亮失败** —— 不静默挑一个 driver 凑合", async () => {
    const { rt } = runtime("某个没听说过的 cli", ["x"])
    await expect(rt.start(spec())).rejects.toThrow(/没听说过|不支持|认不出/)
  })
})

describe("write 的契约与 native 一致", () => {
  it("**同步返回，不 await 一整轮** —— 调用方是租约守卫，不该被一轮对话阻塞", async () => {
    const { rt, events } = runtime("claude", [CLAUDE])
    rt.attach("s1", (e) => events.push(e))
    await rt.start(spec())
    const before = Date.now()
    rt.write("s1", "你好")
    expect(Date.now() - before).toBeLessThan(50)
    await rt.waitForIdle("s1")
    expect(texts(events)).toEqual(["claude 回：你好"])
    await rt.stop("s1")
  })

  it("没启动的会话上写 —— 明确报错", async () => {
    const { rt } = runtime("claude", [CLAUDE])
    expect(() => rt.write("没这个会话", "x")).toThrow()
  })
})

describe("续接", () => {
  it("**spec 里给了 thread_id 就直接 resume** —— 重开应用后接得上", async () => {
    const { rt, events } = runtime("codex", [CODEX])
    rt.attach("s1", (e) => events.push(e))
    await rt.start(spec({ cli: { threadId: "旧线程-7" } }))
    await say(rt, "s1", "接着说")
    expect(texts(events)).toEqual(["codex 续接：接着说"])
    await rt.stop("s1")
  })
})
