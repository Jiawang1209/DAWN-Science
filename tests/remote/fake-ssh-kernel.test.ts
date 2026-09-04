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
import { 内核文件名, 扫残留, 活着脚本, 远端内核还在, 远端启动命令 } from "../../src/remote/kernel-launch.js"

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
    /**
     * **收尸放 `finally`**（审查反馈 2026-09-05）：下面任何一个断言红了，这两台 detached 的
     * ipykernel 就会活到测试进程结束之后，`$TMPDIR` 里还留着两份 connection.json。
     * 那是**看不见**的泄漏——下一次跑测试时它们仍会被扫残留算进数里。
     */
    try {
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
    } finally {
      for (const pid of [留pid, 清pid]) {
        try {
          if (pid) process.kill(pid, "SIGKILL")
        } catch {
          // 已经没了
        }
      }
      for (const 名 of [留名, 清名]) {
        for (const p of [join(tmpdir(), 名), join(tmpdir(), `${名}.log`)]) {
          try {
            unlinkSync(p)
          } catch {
            // 没有就算了
          }
        }
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
    const pid = Number(/DAWNPID=(\d+)/.exec(起?.out ?? "")?.[1])
    // 同上：断言红了也要把这台 detached 内核和它的两个文件收干净（审查反馈 2026-09-05）
    try {
      expect(起?.code).toBe(0)
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
    } finally {
      try {
        if (pid) process.kill(pid, "SIGKILL")
      } catch {
        // 已经没了
      }
      for (const p of [文件, `${文件}.log`]) {
        try {
          unlinkSync(p)
        } catch {
          // 没有就算了
        }
      }
    }
  }, 30_000)
})

/**
 * 正则钉在真脚本上（审查反馈 · 2026-09-05）。
 *
 * 上面那些用例里的命令都是**手打**的——它们证明的是「假机器认得我手打的这个形状」，
 * 不是「假机器认得 `kernel-launch.ts` 真的会发出去的那条」。两者一旦分家，
 * 假机器就会在一片绿里悄悄退化：真脚本改一个字，e2e/mock 里的接回全线失效，
 * 而所有测试照样绿（`DAWNSWEPT=0` 那句谎的下一站）。
 *
 * 所以这里不手打命令：拿一个只负责**记下命令**的 exec 去调真的生产函数，
 * 把它记下来的那一整条原样交给 `假内核命令`。**改了脚本措辞，红的是这里。**
 */
describe("假机器 · 正则钉在真脚本上", () => {
  /** 一个把命令原样喂给假机器的 exec；假机器认不得（或回非零）就抛——那正是这条契约断了的样子 */
  const 记着的exec = (记: string[]) => async (cmd: string) => {
    记.push(cmd)
    const r = 假内核命令(cmd)
    if (!r) throw new Error(`假机器认不得真脚本发出去的这条命令：${cmd}`)
    if (r.code !== 0) throw new Error(`假机器回了非零（${r.code}）：${r.err.trim()}`)
    return { stdout: r.out, stderr: r.err, code: r.code }
  }

  it("扫残留（不带名单）：假机器认得真脚本，那个文件真被删了", async () => {
    const { writeFileSync, existsSync, unlinkSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { tmpdir } = await import("node:os")
    const 名 = 内核文件名("zz95", "python", 1)
    writeFileSync(join(tmpdir(), 名), "{}")
    try {
      const 记: string[] = []
      const r = await 扫残留(记着的exec(记), "zz95")
      expect(记[0]).toContain("DAWNSWEPT")
      expect(r.清了).toBe(1)
      expect(existsSync(join(tmpdir(), 名))).toBe(false)
    } finally {
      try {
        unlinkSync(join(tmpdir(), 名))
      } catch {
        // 已经删了
      }
    }
  })

  it("扫残留（带名单）：假机器认得真脚本拼出来的 case 子句，名单上那个留着", async () => {
    const { writeFileSync, existsSync, unlinkSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { tmpdir } = await import("node:os")
    const 留名 = 内核文件名("zz94", "python", 1)
    const 清名 = 内核文件名("zz94", "python", 2)
    writeFileSync(join(tmpdir(), 留名), "{}")
    writeFileSync(join(tmpdir(), 清名), "{}")
    try {
      const 记: string[] = []
      const r = await 扫残留(记着的exec(记), "zz94", [留名])
      expect(记[0]).toContain("case ")
      expect(r.清了).toBe(1)
      expect(existsSync(join(tmpdir(), 留名))).toBe(true)
      expect(existsSync(join(tmpdir(), 清名))).toBe(false)
    } finally {
      for (const 名 of [留名, 清名]) {
        try {
          unlinkSync(join(tmpdir(), 名))
        } catch {
          // 没有就算了
        }
      }
    }
  })

  it("活着 + 文件在：假机器认得真脚本，两个键都答得上", async () => {
    const { writeFileSync, unlinkSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { tmpdir } = await import("node:os")
    const 文件 = join(tmpdir(), 内核文件名("zz93", "python", 1))
    writeFileSync(文件, "{}")
    try {
      const 记: string[] = []
      expect(await 远端内核还在(记着的exec(记), { pid: process.pid, 文件 })).toBe(true)
      expect(记[0]).toContain("DAWNFILE")
      // 文件没了就该答 false——证明答的是真事实，不是写死的 1
      unlinkSync(文件)
      expect(await 远端内核还在(记着的exec(记), { pid: process.pid, 文件 })).toBe(false)
    } finally {
      try {
        unlinkSync(文件)
      } catch {
        // 已经删了
      }
    }
  })
})

/**
 * 名单读不出来就不许扫（审查反馈 · 2026-09-05，Critical）。
 *
 * `扫残留` 的措辞归 `kernel-launch.ts` 管，名单那条 `case` 子句只差一对引号，
 * 这边的正则就匹配不上——于是名单被读成空的，**等着接回的那台内核的 connection.json 被删、
 * 进程被 SIGKILL，回执还是 `DAWNSWEPT=1` 加退出码 0**（改这条之前真是这样：探针量到
 * `{"out":"DAWNSWEPT=1\n","code":0}`、被保护的文件已经没了）。那是一句**会毁状态**的谎，
 * 正是这台假机器存在的理由要挡的那一类。合并探测脚本那条早就是这么办的（认不得就落 127），
 * 名单这条要一样：**认得出名单在那儿、却读不出来，就一个都不动，如实回 127。**
 */
describe("假机器 · 名单读不出来就不扫", () => {
  it("case 子句形状对不上：回 127，且一个文件都没动", async () => {
    const { writeFileSync, existsSync, unlinkSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { tmpdir } = await import("node:os")
    const 留 = join(tmpdir(), "dawn-zz92-python-keep1.json")
    const 清 = join(tmpdir(), "dawn-zz92-python-gone1.json")
    writeFileSync(留, "{}")
    writeFileSync(清, "{}")
    try {
      // 与真脚本只差一对引号：`in 'x')` 写成了 `in x)`
      const r = 假内核命令(
        `n=0; for f in "\${TMPDIR:-/tmp}"/[d]awn-zz92-*.json; do [ -e "$f" ] || continue; case "$(basename "$f")" in dawn-zz92-python-keep1.json) continue;; esac; n=$((n+1)); b=$(basename "$f"); pkill -9 -f "[d]\${b#d}" 2>/dev/null; rm -f "$f" "$f.log"; done; echo DAWNSWEPT=$n`,
      )
      expect(r?.code).toBe(127)
      expect(r?.err).toContain("名单")
      // 一个都没动：名单里那个当然要在，**不在名单里的那个也要在**——
      // 认不得整条命令就该整条不做，而不是「先扫一半再报错」
      expect(existsSync(留)).toBe(true)
      expect(existsSync(清)).toBe(true)
    } finally {
      for (const p of [留, 清]) {
        try {
          unlinkSync(p)
        } catch {
          // 没有就算了
        }
      }
    }
  })

  it("装机 id 读不出来：同样回 127，而不是写死答一句 DAWNSWEPT=0", () => {
    const r = 假内核命令(`n=0; for f in "\${TMPDIR:-/tmp}"/dawn-*.json; do n=$((n+1)); done; echo DAWNSWEPT=$n`)
    expect(r?.code).toBe(127)
    expect(r?.err).toContain("装机 id")
  })
})
