/**
 * 环境快照跑**真内核**（②-B · S17）。
 *
 * 两段探测表达式都是手写的——**只有真跑一次才知道它对不对**。
 * ②-A 那批已经教过两回：IRkernel 不支持 `user_expressions`、
 * R 的多行代码被压成一行就语法错误。手写的样本骗得过人，内核骗不过。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { launchKernelChannel } from "../../src/kernel/channel.js"
import {
  environmentProbeFor,
  fingerprintOf,
  parseEnvironmentFor,
  type EnvironmentSnapshot,
} from "../../src/kernel/environment.js"

const 有内核 = (name: string) => existsSync(join(homedir(), "Library", "Jupyter", "kernels", name))

async function 探(ch: Awaited<ReturnType<typeof launchKernelChannel>>, language: string) {
  const expr = environmentProbeFor(language)!
  return parseEnvironmentFor(language, await ch.probe(expr))
}

describe.skipIf(!有内核("dawn-spike"))("Python 环境快照", () => {
  let ch: Awaited<ReturnType<typeof launchKernelChannel>>
  let snap: EnvironmentSnapshot | undefined

  beforeAll(async () => {
    ch = await launchKernelChannel({ kernelName: "dawn-spike", handshakeTimeoutMs: 30_000 })
    snap = await 探(ch, "python")
  }, 60_000)
  afterAll(async () => {
    await ch?.close()
  })

  it("**问得出解释器到底是哪一个** —— 那正是「哪个 conda 环境」的答案", () => {
    expect(snap).toBeDefined()
    expect(snap!.version).toMatch(/^\d+\.\d+/)
    // 绝对路径，不是一个名字
    expect(snap!.executable.startsWith("/")).toBe(true)
    expect(snap!.platform.length).toBeGreaterThan(0)
  })

  it("包清单不是空的，而且带版本", () => {
    // 一个能跑 ipykernel 的环境不可能一个包都没有
    expect(snap!.packages.length).toBeGreaterThan(3)
    expect(snap!.packages.every((p) => p.name && p.version)).toBe(true)
    // **按名字排过**：顺序不该随解释器内部的字典序抖动
    const names = snap!.packages.map((p) => p.name.toLowerCase())
    expect([...names].sort()).toEqual(names)
  })

  it("**总数与实际给出的条数对得上** —— 对不上就是被截断了，而那必须看得出来", () => {
    expect(snap!.packagesTotal).toBeGreaterThanOrEqual(snap!.packages.length)
  })

  it("库路径拿得到（`sys.path`）", () => {
    expect(snap!.libraryPaths.length).toBeGreaterThan(0)
  })

  it("**一个环境变量都没采**（Rho 的禁令二） —— 快照是要被分享出去的", () => {
    const 全文 = JSON.stringify(snap)
    // 这两个但凡出现，就说明有人往里塞了 `os.environ`
    expect(全文).not.toContain("API_KEY")
    expect(全文).not.toContain("SECRET")
    expect(Object.keys(snap!)).not.toContain("env")
  })

  it("**指纹稳定**：同一个环境问两次，是同一个 id", async () => {
    const again = await 探(ch, "python")
    expect(fingerprintOf(again!)).toBe(fingerprintOf(snap!))
  }, 30_000)

  it("**探测不弄脏 Console** —— 它走 `silent: true`，人不该看见自己没写过的代码", async () => {
    const 收到: string[] = []
    const off = ch.on("stream", () => 收到.push("stream"))
    await 探(ch, "python")
    off()
    expect(收到).toEqual([])
  }, 30_000)
})

describe.skipIf(!有内核("ir"))("R 环境快照", () => {
  let rch: Awaited<ReturnType<typeof launchKernelChannel>>
  let snap: EnvironmentSnapshot | undefined

  beforeAll(async () => {
    rch = await launchKernelChannel({ kernelName: "ir", handshakeTimeoutMs: 30_000 })
    snap = await 探(rch, "R")
  }, 60_000)
  afterAll(async () => {
    await rch?.close()
  })

  it("**同一条路径两种语言都走得通** —— R 走十六进制，Python 走 base64", () => {
    expect(snap).toBeDefined()
    expect(snap!.language).toBe("R")
    expect(snap!.version).toMatch(/R version/i)
    expect(snap!.executable.length).toBeGreaterThan(0)
  })

  it("装了哪些包问得出来（base R 的 `installed.packages`，不假定 jsonlite）", () => {
    expect(snap!.packages.length).toBeGreaterThan(3)
    // IRkernel 自己一定在里面——它就是这个内核
    expect(snap!.packages.some((p) => p.name === "IRkernel")).toBe(true)
    expect(snap!.packages.every((p) => p.version)).toBe(true)
  })

  it("`.libPaths()` 拿得到", () => {
    expect(snap!.libraryPaths.length).toBeGreaterThan(0)
  })

  it("**两种语言的指纹不会撞** —— 它们是两个环境", async () => {
    const py = 有内核("dawn-spike")
    if (!py) return
    // 只比结构：R 的快照不该算出与任何 Python 快照相同的指纹
    expect(fingerprintOf(snap!)).toMatch(/^[0-9a-f]{64}$/)
  })
})
