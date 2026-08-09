/**
 * 富输出跑**真内核**（②-A · K4 · S12）。
 *
 * 单元测试喂的是我自己手写的 mime 包——**而手写样本已经骗过我两次**
 * （不带引号的 `No module named`、模块名≠包名）。
 * 真内核吐出来的 `display_data` 长什么样，只有真跑一次才知道。
 *
 * 这条测试同时是 S12 那句话的验收：
 * **「输出从诞生那一刻起就绑定溯源状态，不是事后补」**。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { executeRequest } from "@nteract/messaging"
import { launchKernelChannel } from "../../src/kernel/channel.js"
import { translateOutput, type ConsoleEntry } from "../../src/kernel/outputs.js"
import type { JupyterMessage } from "../../src/kernel/types.js"

const KERNEL = "dawn-spike"
const 有 = existsSync(join(homedir(), "Library", "Jupyter", "kernels", KERNEL))

/** 1×1 的透明 PNG，base64。**不依赖 matplotlib**——本机的内核环境里没有它 */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

const req = (code: string): JupyterMessage => executeRequest(code) as unknown as JupyterMessage

describe.skipIf(!有)("真内核吐的富输出", () => {
  /**
   * **五条测试共用一个内核。**
   *
   * 第一版每条各起一个（连起五次），第五条红了——一条输出都没收到，
   * 等满了 3 秒兜底。**今晚已经查实过这类症状**：并发/连续起内核时
   * `spawnteract` 分配 ZMQ 端口会相撞，抢输的那个连到错的端点。
   *
   * 共用一个不只是绕开它，**也更接近产品里的真实形态**——
   * ②-A 的判据就是「一个**持久**的会话」，本来就不该一句话一个内核。
   */
  let ch: Awaited<ReturnType<typeof launchKernelChannel>>
  beforeAll(async () => {
    ch = await launchKernelChannel({ kernelName: KERNEL, handshakeTimeoutMs: 30_000 })
  }, 60_000)
  afterAll(async () => {
    await ch?.close()
  })

  /** 跑一段代码，收集它翻译出来的所有条目 */
  async function run(code: string): Promise<ConsoleEntry[]> {
    const m = req(code)
    const got: ConsoleEntry[] = []
    const off = ch.on("*", (t) => {
      if (t.message.parent_header?.msg_id !== m.header.msg_id) return
      got.push(...translateOutput(t))
    })
    /**
     * **等到那一轮的 `status: idle`**，不是等固定时长。
     * iopub 与 shell 是两条独立通道，`execute_reply` 到了不代表输出到齐——
     * 这正是 K1 里那个「Python 过、R 红」的坑，固定睡眠把它变成掷骰子。
     */
    const 到齐 = new Promise<void>((res) => {
      const off2 = ch.on("status", (x) => {
        if (x.message.parent_header?.msg_id !== m.header.msg_id) return
        if (x.message.content.execution_state === "idle") {
          off2()
          res()
        }
      })
    })
    await ch.request(m, { timeoutMs: 30_000 })
    await Promise.race([
      到齐,
      new Promise((_r, rej) =>
        setTimeout(() => rej(new Error(`30s 内没等到这一轮的 idle。已收到 ${got.length} 条`)), 30_000),
      ),
    ])
    off()
    return got
  }

  it("**HTML：挑 text/html，并把 text/plain 摆在 alsoAvailable 里**", async () => {
    const es = await run("from IPython.display import display, HTML\ndisplay(HTML('<b>你好</b>'))")
    const d = es.find((e) => e.kind === "display")
    expect(d, `没有 display 条目。收到的是 ${JSON.stringify(es.map((e) => e.kind))}`).toBeDefined()
    expect(d).toMatchObject({ mediaType: "text/html" })
    expect((d as Extract<ConsoleEntry, { kind: "display" }>).data).toContain("你好")
    // 真内核**一定**会附带 text/plain 回退，这是协议要求的
    expect((d as Extract<ConsoleEntry, { kind: "display" }>).alsoAvailable).toContain("text/plain")
  }, 120_000)

  it("**图片：挑 image/png，且不是把 base64 当文本截断**", async () => {
    const es = await run(
      `from IPython.display import display, Image\nimport base64\ndisplay(Image(data=base64.b64decode('${TINY_PNG}'), format='png'))`,
    )
    const d = es.find((e) => e.kind === "display") as Extract<ConsoleEntry, { kind: "display" }>
    expect(d, `没有 display 条目：${JSON.stringify(es.map((e) => e.kind))}`).toBeDefined()
    expect(d.mediaType).toBe("image/png")
    expect(d.bytes).toBeGreaterThan(0)
    expect(d.tooLarge).toBeUndefined()
  }, 120_000)

  it("**报错是 error 条目，不是一段 stderr 文本**", async () => {
    const es = await run("raise ValueError('故意的')")
    const e = es.find((x) => x.kind === "error") as Extract<ConsoleEntry, { kind: "error" }>
    expect(e, `没有 error 条目：${JSON.stringify(es.map((x) => x.kind))}`).toBeDefined()
    expect(e.ename).toBe("ValueError")
    expect(e.evalue).toContain("故意的")
    expect(e.traceback.length).toBeGreaterThan(0)
  }, 120_000)

  it("**表达式的值是 result，不是 display** —— 两者语义不同", async () => {
    const es = await run("40 + 2")
    const r = es.find((e) => e.kind === "result") as Extract<ConsoleEntry, { kind: "result" }>
    expect(r).toBeDefined()
    expect(r.data).toContain("42")
  }, 120_000)

  it("**每条输出都带着溯源，且 kernelInstanceId 一致** —— S12 那句话的验收", async () => {
    const es = await run("print('hi')")
    expect(es.length).toBeGreaterThan(0)
    const ids = new Set(es.map((e) => e.provenance.kernelInstanceId))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toMatch(/^k-dawn-spike-/)
    // 执行过一次，版本号必须已经 +1
    expect(es.every((e) => e.provenance.kernelRevision >= 1)).toBe(true)
  }, 120_000)
})
