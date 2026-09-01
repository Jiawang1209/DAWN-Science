/**
 * 本机解释器探测（首启向导，2026-08-27）：枚举候选、解析探测输出——全是纯函数，spawn 可注入。
 */
import { describe, expect, it } from "vitest"
import { 枚举候选, 解析探测, 探测命令, 探测解释器, R的Rscript, type 枚举依赖 } from "../../src/kernel/probe.js"

const 依赖 = (over: Partial<枚举依赖> = {}): 枚举依赖 => ({
  platform: "darwin",
  home: "/Users/me",
  exists: () => false,
  glob: () => [],
  pathLookup: () => [],
  settings: {},
  kernelspecs: [],
  ...over,
})

describe("枚举候选", () => {
  it("顺序：settings > kernelspec > PATH > common；同一路径只留一条（第一次出现的来源）", () => {
    const d = 依赖({
      settings: { python: "/opt/py/bin/python" },
      kernelspecs: [{ language: "python", executable: "/opt/py/bin/python" }, { language: "python", executable: "/venv/bin/python" }, { language: "R", executable: "/usr/local/bin/R" }],
      pathLookup: (n) => (n === "python3" ? ["/opt/homebrew/bin/python3"] : []),
      exists: (p) => ["/opt/homebrew/bin/python3", "/usr/bin/python3", "/venv/bin/python", "/opt/py/bin/python"].includes(p),
    })
    expect(枚举候选("python", d)).toEqual([
      { path: "/opt/py/bin/python", source: "settings" },
      { path: "/venv/bin/python", source: "kernelspec" },
      { path: "/opt/homebrew/bin/python3", source: "PATH" },
      { path: "/usr/bin/python3", source: "common" },
    ])
  })

  it("常见目录里不存在的不列；glob 到的 pyenv / conda envs 列进来", () => {
    const d = 依赖({
      glob: (pat) => (pat.includes(".pyenv") ? ["/Users/me/.pyenv/versions/3.11.9/bin/python"] : pat.includes("envs") ? ["/Users/me/miniconda3/envs/sci/bin/python"] : []),
    })
    expect(枚举候选("python", d).map((c) => c.path)).toEqual(["/Users/me/.pyenv/versions/3.11.9/bin/python", "/Users/me/miniconda3/envs/sci/bin/python"])
  })

  // C22（2026-09-01）：只用 uv / pixi 装 Python 的人，向导里一条都看不见——常见目录漏了这两家
  it("uv 托管的 Python 与 pixi 全局环境列进来（source 仍是 common）；顺序在 pyenv / conda 之后", () => {
    const d = 依赖({
      env: {},
      glob: (pat) =>
        pat.includes(".pyenv")
          ? ["/Users/me/.pyenv/versions/3.11.9/bin/python"]
          : pat.includes(".local/share/uv/python")
            ? ["/Users/me/.local/share/uv/python/cpython-3.12.4-macos-aarch64-none/bin/python3"]
            : pat.includes(".pixi/envs")
              ? ["/Users/me/.pixi/envs/sci/bin/python"]
              : [],
    })
    expect(枚举候选("python", d)).toEqual([
      { path: "/Users/me/.pyenv/versions/3.11.9/bin/python", source: "common" },
      { path: "/Users/me/.local/share/uv/python/cpython-3.12.4-macos-aarch64-none/bin/python3", source: "common" },
      { path: "/Users/me/.pixi/envs/sci/bin/python", source: "common" },
    ])
  })

  it("mac 上 uv 的两处目录都看（~/.local/share 与 ~/Library/Application Support）；Linux 只看前者", () => {
    const 问过: string[] = []
    const d = 依赖({ env: {}, glob: (pat) => (问过.push(pat), []) })
    枚举候选("python", d)
    expect(问过).toContain("/Users/me/.local/share/uv/python/*/bin/python3")
    expect(问过).toContain("/Users/me/Library/Application Support/uv/python/*/bin/python3")
    问过.length = 0
    枚举候选("python", 依赖({ env: {}, platform: "linux", glob: (pat) => (问过.push(pat), []) }))
    expect(问过).toContain("/Users/me/.local/share/uv/python/*/bin/python3")
    expect(问过.some((p) => p.includes("Application Support"))).toBe(false)
  })

  it("$UV_PYTHON_INSTALL_DIR / $PIXI_HOME 设了就按它们找；同一路径不重复", () => {
    const d = 依赖({
      env: { UV_PYTHON_INSTALL_DIR: "/vol/uv-py", PIXI_HOME: "/vol/pixi" },
      glob: (pat) =>
        pat.startsWith("/vol/uv-py/")
          ? ["/vol/uv-py/cpython-3.13.0-linux-x86_64-gnu/bin/python3"]
          : pat.startsWith("/vol/pixi/envs/")
            ? ["/vol/pixi/envs/lab/bin/python", "/vol/pixi/envs/lab/bin/python"]
            : [],
    })
    expect(枚举候选("python", d).map((c) => c.path)).toEqual(["/vol/uv-py/cpython-3.13.0-linux-x86_64-gnu/bin/python3", "/vol/pixi/envs/lab/bin/python"])
  })

  it("uv / pixi 的目录不在 → 什么都不多列", () => {
    expect(枚举候选("python", 依赖({ env: {} }))).toEqual([])
  })

  it("kernelspec 指向的路径已经不存在 → 不列（作者机器上三条删掉的 miniconda 环境）；设置里那条照列", () => {
    const d = 依赖({
      settings: { python: "/gone/settings/python" },
      kernelspecs: [{ language: "python", executable: "/gone/env/bin/python" }, { language: "python", executable: "/live/bin/python" }],
      exists: (p) => p === "/live/bin/python",
    })
    expect(枚举候选("python", d).map((c) => c.path)).toEqual(["/gone/settings/python", "/live/bin/python"])
  })

  it("R：kernelspec 里 language 为 R 的才算；PATH 上找 Rscript 但列出的是同目录的 R", () => {
    const d = 依赖({
      kernelspecs: [{ language: "python", executable: "/x/python" }, { language: "R", executable: "/usr/local/bin/R" }],
      pathLookup: (n) => (n === "Rscript" ? ["/opt/homebrew/bin/Rscript"] : []),
      exists: (p) => p === "/usr/local/bin/R",
    })
    expect(枚举候选("R", d)).toEqual([
      { path: "/usr/local/bin/R", source: "kernelspec" },
      { path: "/opt/homebrew/bin/R", source: "PATH" },
    ])
  })

  it("Windows：常见目录走 %LOCALAPPDATA% / Program Files，可执行带 .exe", () => {
    const d = 依赖({
      platform: "win32",
      home: "C:\\Users\\me",
      glob: (pat) => (pat.includes("Programs") ? ["C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"] : pat.includes("R-") ? ["C:\\Program Files\\R\\R-4.3.2\\bin\\Rscript.exe"] : []),
    })
    expect(枚举候选("python", d).map((c) => c.path)).toEqual(["C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"])
    expect(枚举候选("R", d).map((c) => c.path)).toEqual(["C:\\Program Files\\R\\R-4.3.2\\bin\\R.exe"])
  })
})

describe("解析探测", () => {
  it("python：退出 0 → present + 版本", () => {
    expect(解析探测("python", { code: 0, stdout: "3.11.9\n", stderr: "" })).toEqual({ version: "3.11.9", kernelPackage: "present" })
  })
  it("python：No module named 'ipykernel' → missing，版本仍在（print 在 import 之前）", () => {
    expect(解析探测("python", { code: 1, stdout: "3.14.7\n", stderr: "Traceback…\nModuleNotFoundError: No module named 'ipykernel'\n" })).toEqual({ version: "3.14.7", kernelPackage: "missing" })
  })
  it("python：别的失败 → unknown + 它自己说的末尾几行", () => {
    const r = 解析探测("python", { code: 127, stdout: "", stderr: "dyld: Library not loaded\nReason: image not found\n" })
    expect(r.kernelPackage).toBe("unknown")
    expect(r.problem).toContain("image not found")
    expect(r.version).toBeUndefined()
  })
  it("超时 → unknown + 「8 秒没应答」", () => {
    expect(解析探测("python", { code: null, stdout: "", stderr: "", timedOut: true })).toEqual({ kernelPackage: "unknown", problem: "8 秒没应答" })
  })
  it("R：退出 0 present、3 missing、其它 unknown", () => {
    expect(解析探测("R", { code: 0, stdout: "4.3.2", stderr: "" })).toEqual({ version: "4.3.2", kernelPackage: "present" })
    expect(解析探测("R", { code: 3, stdout: "4.3.2", stderr: "" })).toEqual({ version: "4.3.2", kernelPackage: "missing" })
    expect(解析探测("R", { code: 1, stdout: "", stderr: "Error: boom" }).kernelPackage).toBe("unknown")
  })
})

describe("探测命令 / R的Rscript", () => {
  it("python 用 -c，R 用同目录的 Rscript -e", () => {
    expect(探测命令.python("/x/python")).toEqual({ cmd: "/x/python", args: ["-c", expect.stringContaining("import ipykernel")] })
    expect(探测命令.R("/usr/local/bin/R").cmd).toBe("/usr/local/bin/Rscript")
    expect(R的Rscript("C:\\R\\bin\\R.exe")).toBe("C:\\R\\bin\\Rscript.exe")
  })
})

describe("探测解释器（并发跑、结果按枚举顺序）", () => {
  it("每个候选跑一次，结果合并进候选；内核包在的浮到前面（稳定）", async () => {
    const d = 依赖({ settings: { python: "/a/python" }, pathLookup: () => ["/b/python3", "/c/python3"] })
    const run = async (cmd: string) =>
      cmd === "/c/python3" ? { code: 0, stdout: "3.12.0\n", stderr: "" } : { code: 1, stdout: "3.9.1\n", stderr: "No module named 'ipykernel'" }
    const r = await 探测解释器("python", d, run)
    expect(r).toEqual([
      { path: "/c/python3", source: "PATH", version: "3.12.0", kernelPackage: "present" },
      { path: "/a/python", source: "settings", version: "3.9.1", kernelPackage: "missing" },
      { path: "/b/python3", source: "PATH", version: "3.9.1", kernelPackage: "missing" },
    ])
  })
})
