/**
 * 内核通道跑**真内核**（②-A · K1 判据）。
 *
 * 单元测试用的是假通道，它证明不了适配器接得上 enchannel 与 spawnteract——
 * **风险在接缝不在逻辑**，这个项目已经在这类接缝上栽过不止一次。
 *
 * ## 两种语言都跑
 *
 * 路线图押的是「**一次实现，通吃多语言**」。那句话要么被测试盯着，
 * 要么迟早变成「只有 Python 能用」。所以 Python 与 R 各跑一遍同一段代码。
 *
 * ## 为什么还要一条子进程的退出码测试
 *
 * Spike D 实测：socket 没关就退出，native 层抛 `Napi::Error` + **SIGABRT**，
 * 而且**结论先打印、崩溃在后**——只看输出会以为成功。
 * 在 vitest 里断言不了自己的退出码，所以单独起一个子进程来判。
 */
import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { attachKernelChannel, launchKernelChannel } from "../../src/kernel/channel.js"
import type { KernelConnectionInfo } from "../../src/kernel/types.js"

/** 本机有没有这个 kernelspec。没有就跳过——**跳过要出声，不能假装跑过** */
function hasKernel(name: string): boolean {
  const roots = [
    join(homedir(), "Library", "Jupyter", "kernels"),
    join(homedir(), ".local", "share", "jupyter", "kernels"),
    ...(process.env.JUPYTER_PATH ? [join(process.env.JUPYTER_PATH, "kernels")] : []),
  ]
  return roots.some((r) => existsSync(join(r, name)))
}

/** 两种语言，同一段代码。`echo` 里的标记用来确认输出真的回来了 */
const KERNELS = [
  { name: "dawn-spike", 语言: "Python", code: 'print("KCH_OK", 40 + 2)' },
  { name: "ir", 语言: "R", code: 'cat("KCH_OK", 40 + 2, "\\n")' },
] as const

const RUNNER = resolve(import.meta.dirname, "run-kernel-once.ts")
/** 用仓库自带的 tsx 跑 —— 与 `npm run spike:d` 同一条路径 */
const TSX = resolve(import.meta.dirname, "../../node_modules/.bin/tsx")

for (const k of KERNELS) {
  describe(`${k.语言}（${k.name}）`, () => {
    const 有 = hasKernel(k.name)

    it.skipIf(!有)("execute_request → iopub 输出全程可测，且**退出码为 0**", () => {
      /**
       * **在子进程里跑，为的就是能判退出码。**
       *
       * 关停顺序写错的症状是「输出全对、进程 SIGABRT」——
       * 在同进程里测的话，那次崩溃会把 vitest 自己带走，
       * 报出来的是一堆看不懂的东西，而不是「关停顺序错了」。
       */
      /**
       * **红的时候要说得出是哪一种红**（2026-08-13）。
       *
       * 这条在一次全量跑里红过一次，单独跑与后来的全量跑都绿——
       * 而 `execFileSync` 抛出来的东西**分不出「超时」「非 0 退出」「输出不对」**，
       * 于是它只留下一句看不懂的报错，下一个人只能当它「又抖了一下」。
       *
       * **一条说不清自己为什么红的用例，会慢慢把整套测试的可信度耗光。**
       * 这里不改判据、不放宽超时——只把三种失败分开讲清楚：
       * 超时多半是全量跑时的资源争抢（它起的是**真内核**：tsx 子进程 + Jupyter），
       * 非 0 退出多半是关停顺序（Spike D 那个 SIGABRT），
       * 而输出不对才是适配器真的坏了。
       */
      let out: string
      try {
        out = execFileSync(TSX, [RUNNER, k.name, k.code], {
          encoding: "utf8",
          timeout: 90_000,
        })
      } catch (e) {
        const err = e as { code?: string; signal?: string; status?: number; stdout?: string; stderr?: string }
        const 尾 = `\nstdout：${err.stdout ?? "(空)"}\nstderr：${err.stderr ?? "(空)"}`
        if (err.signal === "SIGTERM" || err.code === "ETIMEDOUT") {
          throw new Error(
            `起 ${k.name} 内核超过 90 秒。**这多半不是适配器坏了**——` +
              `它起的是真内核（tsx 子进程 + Jupyter），全量跑时容易被抢资源。` +
              `先单独跑一遍这条确认。${尾}`,
          )
        }
        throw new Error(
          `子进程以 ${err.status ?? "?"} 退出（signal=${err.signal ?? "无"}）。` +
            `**非 0 退出优先怀疑关停顺序**：socket 没关就退出会让 native 层 SIGABRT` +
            `（Spike D 实测，而且结论先打印、崩溃在后）。${尾}`,
        )
      }
      expect(out, `子进程输出：${out}`).toContain("KCH_OK 42")
      // 溯源三件套必须在消息出适配器时就在
      expect(out).toMatch(/kernelInstanceId=k-[a-z0-9-]+/)
      expect(out).toMatch(/kernelRevision=1/)
      expect(out).toContain("CLEAN_EXIT")
      // `execFileSync` 在非 0 退出码时会抛——所以能走到这里就说明退出码是 0
    })

    if (!有) {
      it(`（跳过：本机没有 ${k.name} kernelspec）`, () => {
        expect(有).toBe(false)
      })
    }
  })
}

describe("attachKernelChannel（远程内核，2026-09-03）", () => {
  // 与本文件其它用例同一条判据：dawn-spike 这台 kernelspec 本机装没装
  const KERNEL = "dawn-spike"
  const 有 = hasKernel(KERNEL)

  it("拿一份现成的 connection.json 接通道：与 launch 同一套握手与执行", async () => {
    if (!有) return // 与本文件其它用例同一条跳过口径
    // 用 launch 起一台，从它的 config 抄一份连接信息，再用 attach 接第二条通道到同一台内核
    const a = await launchKernelChannel({ kernelName: KERNEL })
    const info = (a as unknown as { 连接信息?: KernelConnectionInfo }).连接信息
    expect(info, "launch 之后要能拿到连接信息（attach 要用）").toBeDefined()
    const b = await attachKernelChannel({
      连接信息: info!,
      process: { pid: undefined, kill: () => {} },
      language: "python",
      label: "attach 测试",
    })
    const out: string[] = []
    b.on("stream", (m) => out.push(String((m.message.content as { text?: string }).text ?? "")))
    b.execute("print('DAWN_ATTACH_OK')")
    await new Promise((r) => setTimeout(r, 1500))
    expect(out.join("")).toContain("DAWN_ATTACH_OK")
    await b.close()
    await a.close()
  })
})
