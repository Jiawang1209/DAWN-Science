/**
 * kernelspec 的发现与诊断（②-A · K2）。
 *
 * 这份测试的重心不在「能不能扫出来」，而在**起不来时说的是不是人话**——
 * 那条规则来自一次真实的误诊：Spike D 把 `ir` 起不来记成「kernelspec 指向旧安装」，
 * 而 `/usr/local/bin/R` 是一条**软链接**，指向的正是 kernelspec 里那个路径。
 * 注册项一直是对的，唯一的原因是 `IRkernel` 包没装。
 *
 * **三种实情要人做三件完全不同的事**，混成一句「内核起不来」，
 * 人就会去修一个没坏的东西。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { discoverKernelSpecs, diagnoseLaunch, kernelSpecRoots } from "../../src/kernel/specs.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** 造一个 kernelspec 根目录 */
function root(specs: Record<string, unknown>): string {
  const r = mkdtempSync(join(tmpdir(), "dawn-specs-"))
  dirs.push(r)
  for (const [name, json] of Object.entries(specs)) {
    const d = join(r, name)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, "kernel.json"), typeof json === "string" ? json : JSON.stringify(json))
  }
  return r
}

const py = (exe = "/usr/bin/python3") => ({
  argv: [exe, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
  display_name: "Python 3",
  language: "python",
})

describe("发现", () => {
  it("扫出来的带上名字、显示名、语言与 argv", () => {
    const d = discoverKernelSpecs({ roots: [root({ py3: py() })] })
    expect(d.specs).toHaveLength(1)
    expect(d.specs[0]).toMatchObject({ name: "py3", displayName: "Python 3", language: "python" })
    expect(d.specs[0]!.executable).toBe("/usr/bin/python3")
  })

  it("**同名时先出现的赢，但被挡住的那份要记下来**", () => {
    const a = root({ dup: { ...py("/a/python"), display_name: "先" } })
    const b = root({ dup: { ...py("/b/python"), display_name: "后" } })
    const d = discoverKernelSpecs({ roots: [a, b] })
    expect(d.specs.map((s) => s.displayName)).toEqual(["先"])
    // 「为什么我改了配置没生效」全靠这条回答
    expect(d.shadowed.map((s) => s.displayName)).toEqual(["后"])
  })

  it("**坏掉的注册项要出声，不是静默跳过**", () => {
    const r = root({ 坏json: "{ 这不是 json", 没有argv: { display_name: "x" } })
    const d = discoverKernelSpecs({ roots: [r] })
    expect(d.specs).toEqual([])
    expect(d.problems.map((p) => p.reason).join(" ")).toMatch(/解析不了/)
    expect(d.problems.map((p) => p.reason).join(" ")).toMatch(/没有可用的 argv/)
  })

  it("目录不存在不是错误 —— 那是「这台机器没装内核」", () => {
    const d = discoverKernelSpecs({ roots: ["/一个不存在的路径/kernels"] })
    expect(d).toEqual({ specs: [], problems: [], shadowed: [] })
  })

  it("language 没写就不给这个字段 —— **不猜**", () => {
    const d = discoverKernelSpecs({ roots: [root({ k: { argv: ["/x"], display_name: "K" } })] })
    expect("language" in d.specs[0]!).toBe(false)
  })
})

describe("搜索路径", () => {
  it("JUPYTER_PATH 排在用户目录前面", () => {
    const roots = kernelSpecRoots({
      env: { JUPYTER_PATH: "/custom" },
      home: "/home/x",
      platform: "darwin",
    })
    expect(roots[0]).toBe("/custom/kernels")
    expect(roots[1]).toBe("/home/x/Library/Jupyter/kernels")
  })

  it("三个平台的用户目录各不相同", () => {
    const at = (p: NodeJS.Platform) => kernelSpecRoots({ env: {}, home: "/h", platform: p })[0]
    expect(at("darwin")).toBe("/h/Library/Jupyter/kernels")
    expect(at("linux")).toBe("/h/.local/share/jupyter/kernels")
    expect(at("win32")).toContain("jupyter")
  })
})

describe("起不来时的三种实情", () => {
  const 有 = discoverKernelSpecs({ roots: [root({ py3: py("/usr/bin/python3"), ir: { argv: ["/opt/R/bin/R", "--slave", "-e", "IRkernel::main()"], display_name: "R", language: "R" } })] })

  it("① 没有这个 spec —— **要列出有哪些**，否则人只能自己翻目录", () => {
    const d = diagnoseLaunch("并不存在", 有)
    expect(d?.kind).toBe("no-spec")
    expect(d?.message).toMatch(/py3/)
    expect(d?.message).toMatch(/ir/)
  })

  it("② spec 在、程序不在 —— 说的是「重装 kernelspec」", () => {
    const d = diagnoseLaunch("ir", 有, "", () => false)
    expect(d?.kind).toBe("missing-executable")
    expect(d?.message).toMatch(/注册项/)
    expect(d?.message).toMatch(/installspec/)
  })

  it("③ **程序在、包没装 —— 说的是「装包」，不是「注册项坏了」**（R）", () => {
    const stderr = "Error in loadNamespace(x) : there is no package called ‘IRkernel’\nExecution halted"
    const d = diagnoseLaunch("ir", 有, stderr, () => true)
    expect(d?.kind).toBe("missing-kernel-package")
    expect(d?.message).toMatch(/IRkernel/)
    expect(d?.message).toMatch(/install\.packages/)
    // **不能说成注册项的问题**——那正是 Spike D 误诊的那句话
    expect(d?.message).not.toMatch(/注册项.*不存在/)
  })

  it("③ 同一条路对 Python 也成立", () => {
    const d = diagnoseLaunch("py3", 有, "ModuleNotFoundError: No module named 'ipykernel'", () => true)
    expect(d?.kind).toBe("missing-kernel-package")
    expect(d?.message).toMatch(/pip install ipykernel/)
  })

  it("**认不出就说认不出，并把内核自己的原话带上** —— 不编一个原因", () => {
    const d = diagnoseLaunch("py3", 有, "Segmentation fault (core dumped)", () => true)
    expect(d?.kind).toBe("unknown")
    expect(d && "evidence" in d ? d.evidence : "").toMatch(/Segmentation/)
  })

  it("没有任何错误输出时不编一个诊断 —— 返回 undefined", () => {
    expect(diagnoseLaunch("py3", 有, "", () => true)).toBeUndefined()
  })

  it("**相对命令不判存在性** —— `python3` 要靠 PATH 找，这里判不了", () => {
    const d = discoverKernelSpecs({ roots: [root({ k: py("python3") })] })
    // 传一个「什么都不存在」的判断，也不该报成 missing-executable
    expect(diagnoseLaunch("k", d, "", () => false)).toBeUndefined()
  })
})

/**
 * ── 用**真机上捕获的原话**当样本（2026-08-10）───────────────────────
 *
 * 第一版的 Python 匹配只认带引号那种（`No module named 'ipykernel'`），
 * 而本机 `python3.13 -m ipykernel_launcher` 真吐出来的是**不带引号**的：
 *
 * ```
 * /opt/homebrew/opt/python@3.13/bin/python3.13: No module named ipykernel_launcher
 * ```
 *
 * **整条会漏掉**，于是第三种实情被降级成「认不出」。
 * 手写的样本证明不了这个——只有真的去跑一次才会撞上。
 */
describe("真机捕获的失败输出", () => {
  const 有 = discoverKernelSpecs({
    roots: [root({ py313: { argv: ["/opt/homebrew/opt/python@3.13/bin/python3.13", "-m", "ipykernel_launcher"], display_name: "3.13" } })],
  })

  it("**不带引号的 `No module named` 也要认出来**", () => {
    const 真话 = "/opt/homebrew/opt/python@3.13/bin/python3.13: No module named ipykernel_launcher"
    const d = diagnoseLaunch("py313", 有, 真话, () => true)
    expect(d?.kind).toBe("missing-kernel-package")
  })

  it("**模块名不等于包名** —— 报的是 ipykernel_launcher，要装的是 ipykernel", () => {
    const 真话 = "/opt/homebrew/opt/python@3.13/bin/python3.13: No module named ipykernel_launcher"
    const d = diagnoseLaunch("py313", 有, 真话, () => true)
    // 照模块名给建议，人就会去装一个不存在的包 —— 那比不给建议更坏
    expect(d?.message).toMatch(/pip install ipykernel(?!_launcher)/)
    expect(d?.message).not.toMatch(/pip install ipykernel_launcher/)
  })
})
