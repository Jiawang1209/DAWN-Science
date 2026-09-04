/**
 * 假机器上「接回」要认的那几条（猝死与接回，2026-09-04 · 任务 8）。
 *
 * ## 为什么这几条要单独测
 *
 * 准入规则 1 说 mock 要跟上真实契约；这个文件盯的是它的反面——**mock 不能说谎**。
 * `DAWNSWEPT` 那条曾经写死答 `DAWNSWEPT=0`，于是「扫残留真的杀到了残留内核」这件事
 * 在测试里永远是绿的，真漏一台也看不见。名单（定案 11）是同一个坑的下一站：
 * 「名单上的不动」要是只体现在计数上，接回那条路就会在测试全绿的情况下把
 * 等着被认领的内核杀掉。所以这里量的是**文件真的还在、进程真的还在、数真的没算它**。
 *
 * `活着 + 文件在` 的合并脚本（`kernel-launch.ts` 的 `远端内核还在`）同理：
 * 假机器旧的「活着？」正则匹配得上它的前半句，只答 `DAWNALIVE`，
 * 调用方取不到 `DAWNFILE` 就一律断定内核没了——mock 模式下接回永远失败，而且不出声。
 */
import { describe, expect, it } from "vitest"
import { 假内核命令, 杀掉所有假内核 } from "../../src/remote/fake-ssh-kernel.js"
import { 内核文件名, 活着脚本, 远端启动命令 } from "../../src/remote/kernel-launch.js"

describe("假机器 · 接回要认的几条", () => {
  const PY = process.env.DAWN_FAKE_SSH_PYTHON

  it("活着 + 文件在 的合并脚本：两个键都答", () => {
    const r = 假内核命令(
      `${活着脚本(process.pid)}; if [ -f '/nonexistent/dawn-x.json' ]; then echo DAWNFILE=1; else echo DAWNFILE=0; fi`,
    )
    expect(r?.out).toContain("DAWNALIVE=1")
    expect(r?.out).toContain("DAWNFILE=0")
  })

  it("合并脚本形状对不上时：认不得（落 127），而不是只答半个键", () => {
    // 文件名里有单引号，`单引号()` 转成 `'\''`——上面那条正则的 `[^']+` 就被拆散了。
    // 这时旧的「活着？」分支会捡起前半句只答 DAWNALIVE，调用方取不到 DAWNFILE 就断定内核没了。
    const r = 假内核命令(
      `${活着脚本(process.pid)}; if [ -f '/tmp/a'\\''b.json' ]; then echo DAWNFILE=1; else echo DAWNFILE=0; fi`,
    )
    expect(r).toBeUndefined()
  })

  it("扫残留带名单：名单上的文件不删不杀不计数", async () => {
    const { writeFileSync, existsSync, unlinkSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { tmpdir } = await import("node:os")
    const 留 = join(tmpdir(), "dawn-zz99-python-keep1.json")
    const 清 = join(tmpdir(), "dawn-zz99-python-gone1.json")
    writeFileSync(留, "{}")
    writeFileSync(清, "{}")
    const r = 假内核命令(
      `n=0; for f in "\${TMPDIR:-/tmp}"/[d]awn-zz99-*.json; do [ -e "$f" ] || continue; case "$(basename "$f")" in 'dawn-zz99-python-keep1.json') continue;; esac; n=$((n+1)); b=$(basename "$f"); pkill -9 -f "[d]\${b#d}" 2>/dev/null; rm -f "$f" "$f.log"; done; echo DAWNSWEPT=$n`,
    )
    expect(r?.out).toBe("DAWNSWEPT=1\n")
    expect(existsSync(留)).toBe(true)
    expect(existsSync(清)).toBe(false)
    unlinkSync(留)
  })

  /**
   * 上面那条名单用例量的是文件；这条量的是**进程**——名单真正要保住的是那台还活着的内核。
   * 只留住文件、进程照杀，接回时会拿着一份 connection.json 去连一台已经没了的内核，
   * 而计数与文件两个断言都是绿的。
   */
  it.skipIf(!PY)("扫残留带名单：名单上那台的进程也真的没被杀", async () => {
    const { existsSync, unlinkSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { tmpdir } = await import("node:os")
    const 留名 = 内核文件名("zz98", "python", 1)
    const 清名 = 内核文件名("zz98", "python", 2)
    const 起两台 = [留名, 清名].map((名) => 假内核命令(远端启动命令("python", PY!, 名))!)
    const [留pid, 清pid] = 起两台.map((r) => Number(/DAWNPID=(\d+)/.exec(r.out)?.[1]))
    expect(留pid).toBeGreaterThan(0)
    expect(清pid).toBeGreaterThan(0)
    const 留文件 = join(tmpdir(), 留名)
    for (let i = 0; i < 100 && !(existsSync(留文件) && existsSync(join(tmpdir(), 清名))); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }

    const r = 假内核命令(
      `n=0; for f in "\${TMPDIR:-/tmp}"/[d]awn-zz98-*.json; do [ -e "$f" ] || continue; case "$(basename "$f")" in '${留名}') continue;; esac; n=$((n+1)); b=$(basename "$f"); pkill -9 -f "[d]\${b#d}" 2>/dev/null; rm -f "$f" "$f.log"; done; echo DAWNSWEPT=$n`,
    )
    expect(r?.out).toBe("DAWNSWEPT=1\n")
    // 被扫的那台真死了（收尸要一小会）
    let 清活 = true
    for (let i = 0; i < 100 && 清活; i++) {
      await new Promise((x) => setTimeout(x, 50))
      try {
        process.kill(清pid!, 0)
      } catch {
        清活 = false
      }
    }
    expect(清活).toBe(false)
    // 名单上那台：进程还在、文件还在
    expect(() => process.kill(留pid!, 0)).not.toThrow()
    expect(existsSync(留文件)).toBe(true)

    process.kill(留pid!, "SIGKILL")
    for (const p of [留文件, `${留文件}.log`, join(tmpdir(), `${清名}.log`)]) {
      try {
        unlinkSync(p)
      } catch {
        // 没有就算了
      }
    }
  }, 30_000)
})

/**
 * 两个测试开关的那一半：`杀掉所有假内核()` 要真的把子进程 `SIGKILL` 掉。
 *
 * 没有真解释器就没有子进程可杀，这条只能 `skipIf`——**但不因此改成「答一个数就算过」**，
 * 那正是 `DAWNSWEPT=0` 那句谎的形状。掐线那半在 `fake-ssh.test.ts` 里（它属于那个文件）。
 */
describe("假机器 · 杀掉所有假内核（模拟 OOM）", () => {
  const PY = process.env.DAWN_FAKE_SSH_PYTHON

  it.skipIf(!PY)("真 SIGKILL 掉起过的内核，connection.json 留着不删", async () => {
    const { existsSync, unlinkSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { tmpdir } = await import("node:os")
    const 名 = 内核文件名("k8", "python")
    const 文件 = join(tmpdir(), 名)
    const 起 = 假内核命令(远端启动命令("python", PY!, 名))
    expect(起?.code).toBe(0)
    const pid = Number(/DAWNPID=(\d+)/.exec(起!.out)?.[1])
    expect(pid).toBeGreaterThan(0)
    // ipykernel 自己写 connection.json，等它落地——文件在，才谈得上「杀内核不删文件」
    for (let i = 0; i < 100 && !existsSync(文件); i++) await new Promise((r) => setTimeout(r, 100))
    expect(existsSync(文件)).toBe(true)

    expect(杀掉所有假内核()).toBeGreaterThanOrEqual(1)
    // SIGKILL 之后进程真的没了（收尸要一小会，轮询）
    let 活 = true
    for (let i = 0; i < 100 && 活; i++) {
      await new Promise((r) => setTimeout(r, 50))
      try {
        process.kill(pid, 0)
      } catch {
        活 = false
      }
    }
    expect(活).toBe(false)
    // **文件不删**：猝死那条路自己会删，或者留给下次扫残留（定案 4）
    expect(existsSync(文件)).toBe(true)
    unlinkSync(文件)
    try {
      unlinkSync(`${文件}.log`)
    } catch {
      // 没有就算了
    }
  }, 30_000)
})
