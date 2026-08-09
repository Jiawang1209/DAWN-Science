/**
 * 内核作为第四种会话（②-A · K4），跑**真内核**。
 *
 * ## 这条测试盯的是判据本身
 *
 * ②-A 的判据第一条是*「一个持久的会话，**人和 agent 共用同一个活会话**」*。
 * 这句话在代码里的样子就是：**前一次定义的变量，后一次读得到**。
 * 做成「一次执行一个内核」时，所有单元测试仍然会绿，
 * 而这条判据当场不成立——所以它必须被一条真跑的测试盯着。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { KernelRuntime } from "../../src/runtime/kernel.js"
import type { AgentEvent } from "../../src/runtime/types.js"
import type { ConsoleEntry } from "../../src/kernel/outputs.js"

const KERNEL = "dawn-spike"
const 有 = existsSync(join(homedir(), "Library", "Jupyter", "kernels", KERNEL))
const SESSION = "s-kernel-1"

describe.skipIf(!有)("内核会话", () => {
  let rt: KernelRuntime
  let events: AgentEvent[]
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "dawn-krt-"))
    rt = new KernelRuntime()
    events = []
    rt.attach(SESSION, (e) => events.push(e))
    await rt.start({
      sessionId: SESSION,
      workspace: dir,
      sessionDir: join(dir, "session"),
      kernel: { kernelName: KERNEL },
    })
  }, 60_000)

  afterAll(async () => {
    await rt?.stop(SESSION)
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  /** 执行一段，等这一轮的 `idle`，回这一轮产生的条目 */
  async function run(code: string): Promise<ConsoleEntry[]> {
    const from = events.length
    rt.write(SESSION, code)
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error(`30s 内没等到 idle。收到 ${events.length - from} 条事件`)), 30_000)
      const tick = setInterval(() => {
        if (events.slice(from).some((e) => e.kind === "idle")) {
          clearTimeout(t)
          clearInterval(tick)
          res()
        }
      }, 20)
    })
    return events
      .slice(from)
      .filter((e): e is Extract<AgentEvent, { kind: "kernel_output" }> => e.kind === "kernel_output")
      .map((e) => e.entry)
  }

  it("执行一段代码 → 结构化条目 + turn_end + idle", async () => {
    const es = await run("print('KRT_OK')")
    expect(es.some((e) => e.kind === "stream" && e.text.includes("KRT_OK"))).toBe(true)
    // **`turn_end` 与 `idle` 都要有**：前者收尾气泡，后者收尾账本上那条回合
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain("turn_end")
    expect(kinds).toContain("idle")
  }, 60_000)

  it("**判据：同一个活会话** —— 前一次定义的变量，后一次读得到", async () => {
    await run("dawn_x = 40 + 2")
    const es = await run("print('X =', dawn_x)")
    expect(es.some((e) => e.kind === "stream" && e.text.includes("X = 42"))).toBe(true)
  }, 60_000)

  it("**输出是结构化的，不是一段文本** —— 图和报错是不同的东西", async () => {
    const 图 = await run(
      "from IPython.display import display, HTML\ndisplay(HTML('<i>rich</i>'))",
    )
    expect(图.some((e) => e.kind === "display" && e.mediaType === "text/html")).toBe(true)

    const 错 = await run("raise RuntimeError('boom')")
    const err = 错.find((e) => e.kind === "error")
    expect(err).toBeDefined()
    expect(err && err.kind === "error" ? err.ename : "").toBe("RuntimeError")
    // **报错没有被压成 stderr 文本**——那正是 Rho 禁止的那条路
    expect(错.some((e) => e.kind === "stream")).toBe(false)
  }, 60_000)

  it("**每条输出都带溯源，且同一个内核实例**", async () => {
    const es = await run("print('prov')")
    const id = rt.kernelInstanceId(SESSION)
    expect(id).toBeDefined()
    expect(es.every((e) => e.provenance.kernelInstanceId === id)).toBe(true)
  }, 60_000)

  it("**中断之后内核还活着**（K3 的判据，在会话这一层再验一次）", async () => {
    const from = events.length
    rt.write(SESSION, "import time\nwhile True:\n    time.sleep(0.05)")
    await new Promise((r) => setTimeout(r, 1200))
    await rt.abort(SESSION)
    // 等这一轮收口
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("中断后 30s 没等到 idle")), 30_000)
      const tick = setInterval(() => {
        if (events.slice(from).some((e) => e.kind === "idle")) {
          clearTimeout(t)
          clearInterval(tick)
          res()
        }
      }, 20)
    })
    // **判据：还能算对一道题**
    const es = await run("print('STILL', 40 + 2)")
    expect(es.some((e) => e.kind === "stream" && e.text.includes("STILL 42"))).toBe(true)
  }, 90_000)

  it("空白不发 —— 一个空的执行会让界面「闪一下」而什么都没发生", () => {
    const before = events.length
    rt.write(SESSION, "   \n  ")
    expect(events.length).toBe(before)
  })

  it("没这个会话时响亮失败", () => {
    expect(() => rt.write("不存在", "1")).toThrow(/没有这个内核会话/)
  })
})
