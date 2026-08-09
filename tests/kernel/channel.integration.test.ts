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
      const out = execFileSync(TSX, [RUNNER, k.name, k.code], {
        encoding: "utf8",
        timeout: 90_000,
      })
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
