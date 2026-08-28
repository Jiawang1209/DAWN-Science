/**
 * 起真内核，以及**起不来时说的是不是人话**（②-A · K2）。
 *
 * ## 这条测试最有价值的一半是失败那一半
 *
 * 「能起来」用 spike 已经验过很多次了。真正没被验过的是**起不来的那条路**——
 * 而它恰恰是这个阶段最容易做坏的地方：笼统地说一句「内核起不来」，
 * 人就会去修一个没坏的东西（2026-08-10 的 `ir` 误诊就是这么来的）。
 *
 * 所以这里**造一个真的会失败的内核**：指向本机的 `python3.13`，
 * 那个解释器是真的、`ipykernel` 是真的没装。**不是手写一段 stderr**——
 * 手写样本已经骗过我一次（真机吐的是不带引号的 `No module named`，
 * 而我第一版只认带引号那种）。
 */
import { afterEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { launchKernelChannel } from "../../src/kernel/channel.js"
import { UserFacingError } from "../../src/errors.js"

const cleanup: string[] = []
const saved = process.env.DAWN_JUPYTER_ROOTS
afterEach(() => {
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true })
  if (saved === undefined) delete process.env.DAWN_JUPYTER_ROOTS
  else process.env.DAWN_JUPYTER_ROOTS = saved
})

/** 造一个只含指定 kernelspec 的搜索根，并让发现只看它 */
function only(name: string, argv: string[]): void {
  const root = mkdtempSync(join(tmpdir(), "dawn-launch-"))
  cleanup.push(root)
  const d = join(root, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, "kernel.json"), JSON.stringify({ argv, display_name: name, language: "python" }))
  process.env.DAWN_JUPYTER_ROOTS = root
}

/** 本机有没有一个**真没装 ipykernel** 的解释器 */
function pythonWithoutIpykernel(): string | undefined {
  for (const exe of ["/opt/homebrew/opt/python@3.13/bin/python3.13", "/usr/bin/python3"]) {
    if (!existsSync(exe)) continue
    try {
      execFileSync(exe, ["-c", "import ipykernel"], { stdio: "ignore" })
    } catch {
      return exe // import 失败 = 正是我们要的反面样本
    }
  }
  return undefined
}

describe("起不来时的诊断（真的起一次，不是手写 stderr）", () => {
  const 坏解释器 = pythonWithoutIpykernel()

  // CI 上跳过：这条靠的是本机某个具体解释器的真实行为；GitHub 的 mac runner 上 /usr/bin/python3 起来什么都不吐，
  // 8 秒握手超时后 stderr 是空的——测的是环境不是代码（2026-08-28 首次跑 CI 抓到）
  it.skipIf(!坏解释器 || !!process.env.CI)("**解释器在、ipykernel 没装 → 说的是「装包」**", async () => {
    only("broken", [坏解释器!, "-m", "ipykernel_launcher", "-f", "{connection_file}"])

    const err = await launchKernelChannel({ kernelName: "broken", handshakeTimeoutMs: 8000 })
      .then(() => undefined)
      .catch((e: unknown) => e)

    expect(err, "应当抛出，而不是给一个连不上的通道").toBeInstanceOf(UserFacingError)
    const msg = String((err as Error).message)
    // **要装的是 ipykernel，不是模块名 ipykernel_launcher**
    expect(msg).toMatch(/pip install ipykernel(?!_launcher)/)
    // **不能说成注册项坏了**——注册项没坏，那正是 `ir` 那次误诊的措辞
    expect(msg).not.toMatch(/注册项.*不存在/)
  }, 60_000)

  it("**没有这条注册项 → 根本不起进程，直接说清楚并列出有哪些**", async () => {
    only("只有这一个", ["/usr/bin/true"])
    const err = await launchKernelChannel({ kernelName: "并不存在" })
      .then(() => undefined)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UserFacingError)
    expect(String((err as Error).message)).toMatch(/只有这一个/)
  })

  it("**程序不存在 → 说的是「重装 kernelspec」**", async () => {
    only("坏路径", ["/一个/不存在的/python", "-m", "ipykernel_launcher"])
    const err = await launchKernelChannel({ kernelName: "坏路径", handshakeTimeoutMs: 5000 })
      .then(() => undefined)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UserFacingError)
    expect(String((err as Error).message)).toMatch(/不存在|注册项/)
  }, 30_000)
})

describe("起得来的那条路", () => {
  const 有 = existsSync(join(homedir(), "Library", "Jupyter", "kernels", "dawn-spike"))

  it.skipIf(!有)("起内核 → 执行 → 关停，且 kernelInstanceId 每次都不同", async () => {
    delete process.env.DAWN_JUPYTER_ROOTS // 用真实环境找 dawn-spike
    const a = await launchKernelChannel({ kernelName: "dawn-spike", handshakeTimeoutMs: 30_000 })
    const b = await launchKernelChannel({ kernelName: "dawn-spike", handshakeTimeoutMs: 30_000 })
    // **重启即变**：S13 的陈旧判断全靠它
    expect(a.kernelInstanceId).not.toBe(b.kernelInstanceId)
    await a.close()
    await b.close()
  }, 120_000)
})
