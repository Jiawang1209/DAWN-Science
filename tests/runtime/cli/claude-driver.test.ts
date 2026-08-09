/**
 * claude driver：长驻进程 + stream-json（①-C · C2）。
 *
 * **用假 CLI 起真进程**，不 mock `child_process`——
 * 与 `subagent/executor.test.ts` 同一条理由：这一层最可能坏的地方全在进程边界上
 * （stdin 写得进去吗、进程死了 pending 的那一轮怎么办、close 杀不杀得掉），
 * **把进程 mock 掉，测的就正好不是那些。**
 *
 * 假 CLI 吐的形状取自 Spike G 的实测，不是我编的。
 */
import { afterAll, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ClaudeDriver } from "../../../src/runtime/cli/claude.js"
import type { AgentEvent } from "../../../src/runtime/types.js"

const SESSION = "s1"

/**
 * 一个假的 claude：从 stdin 逐行读 `{"type":"user",...}`，
 * 按实测形状吐回一轮事件。
 */
const FAKE = `
let buf = ""
let n = 0
const say = (o) => process.stdout.write(JSON.stringify(o) + "\\n")
say({ type: "system", subtype: "init" })
process.stdin.setEncoding("utf8")
process.stdin.on("data", (d) => {
  buf += d
  let i
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const req = JSON.parse(line)
    const text = req.message.content
    n++
    if (text.includes("工具")) {
      say({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t" + n, name: "Read", input: { file_path: "a.md" } }] } })
      say({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t" + n, content: "文件内容", is_error: false }] } })
    }
    if (text.includes("崩")) { process.exit(7) }
    say({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "第" + n + "轮：" + text }] } })
    say({ type: "result", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.001, usage: { input_tokens: 1, output_tokens: 2 } })
  }
})
`

/**
 * **假 CLI 写成脚本文件跑，不用 `node -e`。**
 *
 * 第一版是 `node -e <脚本>`，全挂了——driver 会把
 * `--print --output-format stream-json …` 追加到命令后面，
 * 而 **`--print` 也是 node 自己的选项**，node 把它当成自己的参数就炸了。
 * 脚本路径之后的参数只是 argv，node 不会解释它们。
 */
const dir = mkdtempSync(join(tmpdir(), "dawn-fakecli-"))
const FAKE_PATH = join(dir, "fake-claude.mjs")
writeFileSync(FAKE_PATH, FAKE)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function driver(): { d: ClaudeDriver; events: AgentEvent[] } {
  const events: AgentEvent[] = []
  const d = new ClaudeDriver({
    sessionId: SESSION,
    command: process.execPath,
    args: [FAKE_PATH],
    cwd: process.cwd(),
    emit: (e) => events.push(e),
  })
  return { d, events }
}

const texts = (events: AgentEvent[]) =>
  events.filter((e) => e.kind === "output").map((e) => (e.kind === "output" ? e.data : ""))

describe("一轮", () => {
  it("说一句，拿到回复，并在这一轮结束时 resolve", async () => {
    const { d, events } = driver()
    await d.startTurn("你好")
    expect(texts(events)).toEqual(["第1轮：你好"])
    expect(events.some((e) => e.kind === "idle")).toBe(true)
    await d.close()
  })

  it("工具调用翻成 tool_start / tool_end", async () => {
    const { d, events } = driver()
    await d.startTurn("用工具读一下")
    expect(events.find((e) => e.kind === "tool_start")).toMatchObject({ toolName: "Read" })
    expect(events.find((e) => e.kind === "tool_end")).toMatchObject({ toolName: "Read", isError: false })
    await d.close()
  })
})

describe("多轮：同一个进程", () => {
  it("**第二轮不重开进程** —— 假 CLI 的计数器能证明它是同一个", async () => {
    const { d, events } = driver()
    await d.startTurn("第一句")
    await d.startTurn("第二句")
    // 计数器是进程内的：重开进程的话第二轮还会是「第1轮」
    expect(texts(events)).toEqual(["第1轮：第一句", "第2轮：第二句"])
    await d.close()
  })
})

describe("进程出问题时", () => {
  it("**进程中途死掉，pending 的那一轮必须结束** —— 不许永远挂着", async () => {
    const { d, events } = driver()
    await expect(d.startTurn("崩")).resolves.toBeUndefined()
    expect(events.some((e) => e.kind === "exited")).toBe(true)
    // 出声：不是静静地收工
    expect(events.some((e) => e.kind === "notice")).toBe(true)
  })

  it("**起不来的命令不抛异常**，记成一条 exited + notice", async () => {
    const events: AgentEvent[] = []
    const d = new ClaudeDriver({
      sessionId: SESSION,
      command: "这个命令不存在-dawn",
      args: [],
      cwd: process.cwd(),
      emit: (e) => events.push(e),
    })
    await d.startTurn("你好")
    expect(events.some((e) => e.kind === "notice")).toBe(true)
    expect(events.some((e) => e.kind === "exited")).toBe(true)
  })

  it("死过之后再说话 —— 明确失败，不静静地什么都不做", async () => {
    const { d } = driver()
    await d.startTurn("崩")
    await expect(d.startTurn("还在吗")).rejects.toThrow()
  })
})

describe("收摊", () => {
  it("close 之后进程真的没了 —— 再说话就报错", async () => {
    const { d } = driver()
    await d.startTurn("你好")
    await d.close()
    await expect(d.startTurn("还在吗")).rejects.toThrow()
  })

  it("close 可以重复调用，不报错", async () => {
    const { d } = driver()
    await d.close()
    await d.close()
  })
})
