/**
 * 变量内省跑**真内核**（②-A · K5 · S14）。
 *
 * 这段 Python 表达式是手写的——**只有真跑一次才知道它对不对**。
 * 今晚已经有两次教训：手写的样本骗过我两回
 * （不带引号的 `No module named`、模块名≠包名）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { launchKernelChannel } from "../../src/kernel/channel.js"
import { PREVIEW_MAX, parseVariables, probeExpressionFor } from "../../src/kernel/variables.js"

const KERNEL = "dawn-spike"
const 有 = existsSync(join(homedir(), "Library", "Jupyter", "kernels", KERNEL))

describe.skipIf(!有)("变量内省", () => {
  let ch: Awaited<ReturnType<typeof launchKernelChannel>>

  beforeAll(async () => {
    ch = await launchKernelChannel({ kernelName: KERNEL, handshakeTimeoutMs: 30_000 })
  }, 60_000)
  afterAll(async () => {
    await ch?.close()
  })

  /** 造一些变量，然后问 */
  async function vars(setup: string) {
    ch.execute(setup)
    // 等这一轮跑完再问，否则问到的是执行前的命名空间
    await new Promise<void>((res) => {
      const off = ch.on("status", (m) => {
        if (m.message.content.execution_state === "idle") {
          off()
          res()
        }
      })
    })
    return parseVariables(await ch.probe(probeExpressionFor("python")!))
  }

  it("**认得出用户造的变量**，带类型与预览", async () => {
    const v = await vars("s14_n = 42\ns14_s = 'hello'\ns14_l = [1, 2, 3]")
    expect(v, "解析不出来就是 undefined，不是空数组").toBeDefined()
    const byName = Object.fromEntries(v!.map((x) => [x.name, x]))
    expect(byName.s14_n).toMatchObject({ type: "int", preview: "42" })
    expect(byName.s14_s).toMatchObject({ type: "str" })
    expect(byName.s14_l).toMatchObject({ type: "list", dimensions: "3" })
  }, 90_000)

  it("**函数、模块、下划线开头的都不列** —— 它们会把真正的变量淹掉", async () => {
    const v = await vars("import json as s14_mod\ndef s14_fn(): pass\n_s14_hidden = 1")
    const names = v!.map((x) => x.name)
    expect(names).not.toContain("s14_mod")
    expect(names).not.toContain("s14_fn")
    expect(names).not.toContain("_s14_hidden")
  }, 90_000)

  it("**预览被砍过要显式标注** —— 砍过的和完整的看起来一模一样", async () => {
    const v = await vars(`s14_big = 'x' * ${PREVIEW_MAX * 3}`)
    const big = v!.find((x) => x.name === "s14_big")!
    expect(big.previewTruncated).toBe(true)
    expect(big.preview.length).toBeLessThanOrEqual(PREVIEW_MAX)
  }, 90_000)

  it("短变量不该被标成截断", async () => {
    const v = await vars("s14_small = 1")
    expect(v!.find((x) => x.name === "s14_small")!.previewTruncated).toBe(false)
  }, 90_000)

  it("**内省不弄脏 Console** —— 它走 silent，不该产生任何输出条目", async () => {
    const seen: string[] = []
    const off = ch.on("*", (m) => seen.push(m.message.header.msg_type))
    await ch.probe(probeExpressionFor("python")!)
    off()
    /**
     * **`silent` 抑制的是「输出」，不是「状态」。**
     *
     * 第一版这里断言的是「iopub 上一条都不该有」——**写强了**：
     * 协议规定 `status` 的 busy/idle 心跳**始终广播**，
     * `silent: true` 挡掉的是 `execute_input` / `execute_result` / 历史。
     *
     * 而要守的那件事仍然成立：**Console 不会被弄脏**——
     * `status` 本来就不进 transcript（K4 时定的：它是执行状态，不是输出）。
     * 所以这里盯的是**产出型**的消息，一条都不该有。
     */
    const 产出型 = ["stream", "execute_result", "display_data", "update_display_data", "error"]
    expect(seen.filter((t) => 产出型.includes(t))).toEqual([])
  }, 60_000)

  it("**R 暂不支持时如实回 undefined** —— 空数组会被读成「没有变量」", () => {
    expect(probeExpressionFor("R")).toBeUndefined()
    expect(probeExpressionFor(undefined)).toBeUndefined()
  })
})
