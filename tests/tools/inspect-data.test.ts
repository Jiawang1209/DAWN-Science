/**
 * `inspect_data`（2026-09-27，先出方案 §4.2，D1）：写死的代码、编码传参、不留名字、不收代码当参数。
 *
 * 注入那组盯的是两道：①参数校验（变量名要是标识符、路径要在工作区里）拒掉的**一个字都不写进内核**；
 * ②校验放过的字符串（引号、分号、`system(`）在代码原文里**不出现**——只以编码后的形式进去。
 * 真解释器那组（有 python3 / Rscript 才跑）证「不在命名空间里留名字」与「注入的那半句没被执行」。
 */
import { describe, expect, it, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInspectDataTool, 看数据代码, 路径不成立, 变量名不成立 } from "../../src/tools/inspect-data.js"
import { 对话内核 } from "../../src/kernel/挂载.js"

function 记代码的内核(opts: { 慢?: boolean } = {}) {
  const 听众 = new Map<string, Set<(e: unknown) => void>>()
  const 记: string[] = []
  const 发给 = (id: string, e: unknown) => {
    for (const f of [...(听众.get(id) ?? [])]) f(e)
  }
  const runtime = {
    start: async (spec: { sessionId: string }) => ({ sessionId: spec.sessionId, pid: 0 }),
    attach: (id: string, sink: (e: unknown) => void) => {
      const 这台 = 听众.get(id) ?? new Set<(e: unknown) => void>()
      这台.add(sink)
      听众.set(id, 这台)
      return () => void 这台.delete(sink)
    },
    write: (id: string, code: string) => {
      记.push(code)
      发给(id, { kind: "kernel_output", entry: { kind: "stream", stream: "stdout", text: "形状：3 行 × 2 列\n" } })
      if (!opts.慢) 发给(id, { kind: "kernel_output", entry: { kind: "status", state: "idle" } })
    },
    abort: async (id: string) => {
      记.push("interrupt")
      发给(id, { kind: "kernel_output", entry: { kind: "status", state: "idle" } })
    },
    stop: async () => {},
  } as never
  const 内核 = new 对话内核({ runtime, workspaceOf: () => "/w/proj", sessionDirOf: () => "/dir", interpreterOf: () => "/usr/bin/python3" })
  return { 内核, 记 }
}

describe("inspect_data 的代码", () => {
  it("Python：路径不以原文出现在代码里（base64 传参），跑完 del 掉那个函数", () => {
    const c = 看数据代码("python", { path: "data/raw/a'b\".csv", rows: 5 })
    expect(c).not.toContain("a'b")
    expect(c).toContain("b64decode")
    expect(c).toMatch(/finally:\s*\n\s*del __dawn_inspect_data/)
  })
  it("R：十六进制传参，包在匿名函数里（不在全局留名字）", () => {
    const c = 看数据代码("R", { variable: "df", rows: 5 })
    expect(c).not.toMatch(/"df"/)
    expect(c).toMatch(/^\(function\(\) \{/)
    expect(c.trimEnd()).toMatch(/\}\)\(\)$/)
  })
  it("rows 不是有限数：落回 5，不把 NaN 拼进 R 代码", () => {
    expect(看数据代码("R", { path: "a.csv", rows: Number.NaN })).toContain("n <- 5L")
    expect(看数据代码("R", { path: "a.csv", rows: 999 })).toContain("n <- 20L")
  })

  const 坏话 = [
    'a.csv"); system("touch PWNED"); ("',
    "a.csv'); import os; os.system('x') #",
    "data/x\n__import__('os').system('x')",
    '`rm -rf /`.csv',
  ]
  for (const 语言 of ["python", "R"] as const) {
    it(`${语言}：放过校验的怪路径也只以编码形式进代码`, () => {
      for (const p of 坏话) {
        const c = 看数据代码(语言, { path: p, sheet: 'S"); q("no', rows: 5 })
        expect(c).not.toContain("system(")
        expect(c).not.toContain("import os;")
        expect(c).not.toContain("__import__")
        expect(c).not.toContain("rm -rf")
        expect(c).not.toContain('q("no')
      }
    })
  }
})

describe("参数校验", () => {
  it("变量名：Python 只收标识符", () => {
    for (const bad of ["df; import os", "__import__('os')", "df)", "df.x", "a b", 'df"', "df\nimport os", "1df", ""]) {
      expect(变量名不成立("python", bad), bad).toBeDefined()
    }
    for (const ok of ["df", "_x", "data_2024"]) expect(变量名不成立("python", ok), ok).toBeUndefined()
  })
  it("变量名：R 收语法名，拒 `df); system(\"x\")`", () => {
    for (const bad of ['df); system("x")', "df;q()", ".2x", "`df`", "df$x", "df[1]"]) {
      expect(变量名不成立("R", bad), bad).toBeDefined()
    }
    for (const ok of ["df", "my.df", ".hidden", "df_2"]) expect(变量名不成立("R", ok), ok).toBeUndefined()
  })
  it("路径：只收工作区里的相对路径", () => {
    for (const bad of ["/etc/passwd", "~/x.csv", "C:\\x.csv", "../x.csv", "data/../../x.csv", "a.csv\nimport os", "a\u0000.csv"]) {
      expect(路径不成立(bad), JSON.stringify(bad)).toBeDefined()
    }
    for (const ok of ["data/raw/a.csv", "a b's \"q\".csv", "数据/表.xlsx"]) expect(路径不成立(ok), ok).toBeUndefined()
  })
})

describe("inspect_data 工具", () => {
  it("在对话内核里跑写死的代码，结果照写", async () => {
    const { 内核, 记 } = 记代码的内核()
    const r = await createInspectDataTool({ 对话: "s1", 内核 }).execute("c1", { language: "python", path: "data/raw/a.csv" })
    expect(记).toHaveLength(1)
    expect(记[0]).toContain("__dawn_inspect_data")
    expect(记[0]).not.toContain("data/raw/a.csv")
    expect(r.isError).toBeUndefined()
    expect(r.content[0]!.text).toContain("inspect_data（path data/raw/a.csv）")
    expect(r.content[0]!.text).toContain("形状：3 行 × 2 列")
  })
  it("path 与 variable 二选一；变量名不是标识符 → 拒，一个字都不写进内核", async () => {
    const { 内核, 记 } = 记代码的内核()
    const tool = createInspectDataTool({ 对话: "s1", 内核 })
    expect((await tool.execute("c1", { language: "python" })).isError).toBe(true)
    expect((await tool.execute("c1", { language: "python", path: "a.csv", variable: "df" })).isError).toBe(true)
    expect((await tool.execute("c1", { language: "python", variable: "df; import os" })).isError).toBe(true)
    expect((await tool.execute("c1", { language: "python", variable: "__import__('os')" })).isError).toBe(true)
    expect((await tool.execute("c1", { language: "R", variable: 'df); system("x")' })).isError).toBe(true)
    expect((await tool.execute("c1", { language: "python", path: "../secret.csv" })).isError).toBe(true)
    expect((await tool.execute("c1", { language: "python", path: "a.csv", sheet: "s\nimport os" })).isError).toBe(true)
    expect((await tool.execute("c1", { language: "bash", path: "a.csv" })).isError).toBe(true)
    expect(记).toEqual([])
  })
  it("进来时已中止：不跑", async () => {
    const { 内核, 记 } = 记代码的内核()
    const c = new AbortController()
    c.abort()
    const r = await createInspectDataTool({ 对话: "s1", 内核 }).execute("c1", { language: "python", path: "a.csv" }, c.signal)
    expect(r.isError).toBe(true)
    await vi.waitFor(() => expect(记).toEqual([]))
  })
  it("跑到一半被中止：给那台内核发中断（与 run_code 同一条路）", async () => {
    const { 内核, 记 } = 记代码的内核({ 慢: true })
    const c = new AbortController()
    const 跑着 = createInspectDataTool({ 对话: "s1", 内核 }).execute("c1", { language: "python", variable: "df" }, c.signal)
    await vi.waitFor(() => expect(记).toHaveLength(1))
    c.abort()
    const r = await 跑着
    expect(记[1]).toBe("interrupt")
    expect(r.content[0]!.text).toContain("已中断")
  })
})

function 有(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}
const 有R = 有("Rscript", ["-e", "invisible(1)"])
const 有py = 有("python3", ["-c", "pass"])

describe("真解释器：不留名字、注入的那半句不执行", () => {
  let 目录 = ""
  const 进目录 = () => {
    目录 = mkdtempSync(join(tmpdir(), "dawn-inspect-"))
    writeFileSync(join(目录, "数据.csv"), "a,b\n1,x\n2,\n3,y\n4,z\n")
    return 目录
  }
  const 收 = () => rmSync(目录, { recursive: true, force: true })

  it.skipIf(!有R)("R：看得到文件与变量，全局环境前后一样，PWNED 没被建", () => {
    const cwd = 进目录()
    try {
      const 脚本 = [
        "df <- data.frame(x = 1:3, y = c('a', NA, 'b'))",
        "before <- ls(globalenv(), all.names = TRUE)",
        看数据代码("R", { path: "数据.csv", rows: 2 }),
        看数据代码("R", { variable: "df", rows: 2 }),
        看数据代码("R", { path: 'a.csv"); file.create("PWNED"); ("', rows: 2 }),
        看数据代码("R", { variable: 'df); file.create("PWNED"); (', rows: 2 }),
        "after <- setdiff(ls(globalenv(), all.names = TRUE), 'before')",
        "cat('LEFT:', paste(setdiff(after, before), collapse = ','), '\\n')",
      ].join("\n")
      writeFileSync(join(cwd, "s.R"), 脚本)
      const out = execFileSync("Rscript", ["s.R"], { cwd, encoding: "utf8" })
      expect(out).toContain("形状： 4 行 × 2 列")
      expect(out).toContain("形状： 3 行 × 2 列")
      expect(out).toContain("找不到文件")
      expect(out).toContain("内核里没有叫")
      expect(out).toMatch(/LEFT: +\n/)
      expect(existsSync(join(cwd, "PWNED"))).toBe(false)
    } finally {
      收()
    }
  })

  it.skipIf(!有py)("Python：跑完命名空间前后一样，注入的变量名只是数据", () => {
    const cwd = 进目录()
    try {
      const 脚本 = [
        "df = 1",
        "before = set(globals())",
        看数据代码("python", { path: "数据.csv", rows: 2 }),
        看数据代码("python", { path: "a.csv'); open('PWNED','w'); ('", rows: 2 }),
        "after = set(globals()) - {'before'}",
        "print('LEFT:', sorted(after - before))",
      ].join("\n")
      writeFileSync(join(cwd, "s.py"), 脚本)
      const out = execFileSync("python3", ["s.py"], { cwd, encoding: "utf8" })
      // 有没有 pandas 两样都行：要么看到了结构，要么说清没有 pandas
      expect(out).toMatch(/形状：4 行 × 2 列|没有 pandas/)
      expect(out).toContain("LEFT: []")
      expect(existsSync(join(cwd, "PWNED"))).toBe(false)
    } finally {
      收()
    }
  })
})
