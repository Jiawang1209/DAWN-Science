/**
 * 中断跑**真内核**（②-A · K3）。
 *
 * ## 这是前置门，不是普通功能
 *
 * 规格 10.4 的硬要求，而 **wisp-science 的自研 JSON-lines worker 方案
 * 正是败在这一条**。做不通就要明确记为已知限制，
 * **不静默降级成「能跑但停不下来」**。
 *
 * ## 判据只有一条，且与语言无关
 *
 * **中断之后再算一道题，能算对就通过。**
 *
 * 不能按回复的形状判：Python 回 `execute_reply status=error` + `KeyboardInterrupt`，
 * **R 回 `status=abort` 且没有 ename**，两个都是协议里合法的回复。
 * Spike D 原来的判据按 Python 的形状写死，**把一个工作正常的 R 内核判成了失败**
 * （2026-08-10 查清）。
 *
 * 而这一条为什么够：**内核串行执行**。中断之后那条能跑完，
 * 就同时证明了「死循环真的停了」与「内核没被打死」。
 */
import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { launchKernelChannel } from "../../src/kernel/channel.js"
import { executeRequest } from "@nteract/messaging"
import type { JupyterMessage } from "../../src/kernel/types.js"

const 有 = (name: string): boolean =>
  existsSync(join(homedir(), "Library", "Jupyter", "kernels", name)) ||
  existsSync(join(homedir(), ".local", "share", "jupyter", "kernels", name))

const KERNELS = [
  {
    name: "dawn-spike",
    语言: "Python",
    死循环: "import time\nwhile True:\n    time.sleep(0.05)",
    算一道: "print('ALIVE', 40 + 2)",
  },
  {
    name: "ir",
    语言: "R",
    死循环: "while (TRUE) { Sys.sleep(0.05) }",
    算一道: "cat('ALIVE', 40 + 2, '\\n')",
  },
] as const

const req = (code: string): JupyterMessage => executeRequest(code) as unknown as JupyterMessage
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

for (const k of KERNELS) {
  describe(`${k.语言}（${k.name}）`, () => {
    it.skipIf(!有(k.name))(
      "**打断长任务之后，内核还能算对一道题**（判据不看回复长什么样）",
      async () => {
        const ch = await launchKernelChannel({ kernelName: k.name, handshakeTimeoutMs: 30_000 })
        try {
          // ① 起一段停不下来的
          const loop = req(k.死循环)
          const 收口 = new Promise<string>((res) => {
            const off = ch.on("execute_reply", (m) => {
              if (m.message.parent_header?.msg_id !== loop.header.msg_id) return
              off()
              res(String(m.message.content.status))
            })
          })
          ch.send(loop)
          await sleep(1500) // 让它真的跑起来，否则打断的是一个还没开始的东西

          // ② 打断
          ch.interrupt()
          const status = await Promise.race([
            收口,
            sleep(30_000).then(() => "（30s 内没有收到 execute_reply）"),
          ])
          // **status 只作诊断**：Python 是 error、R 是 abort，两个都合法
          expect(status, "中断之后那一轮必须收口").not.toContain("没有收到")

          // ③ **判据在这里**：再算一道题
          const 算 = req(k.算一道)
          let out = ""
          const 出来了 = new Promise<void>((res) => {
            const off = ch.on("stream", (m) => {
              if (m.message.parent_header?.msg_id !== 算.header.msg_id) return
              out += String(m.message.content.text ?? "")
              if (out.includes("ALIVE")) {
                off()
                res()
              }
            })
          })
          const reply = await ch.request(算, { timeoutMs: 30_000 })
          await Promise.race([
            出来了,
            sleep(20_000).then(() => {
              throw new Error(`中断之后内核没有再输出。收到的是 ${JSON.stringify(out)}`)
            }),
          ])
          expect(out).toMatch(/ALIVE\s*42/)
          expect(reply.message.content.status, "中断之后这一轮必须是成功的").toBe("ok")

          // **溯源仍然跟着**：中断不该让打标断掉
          expect(reply.provenance.kernelInstanceId).toBe(ch.kernelInstanceId)
        } finally {
          await ch.close()
        }
      },
      120_000,
    )
  })
}
