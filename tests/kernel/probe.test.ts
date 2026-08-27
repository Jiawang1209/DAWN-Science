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
      exists: (p) => p === "/opt/homebrew/bin/python3" || p === "/usr/bin/python3",
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

  it("R：kernelspec 里 language 为 R 的才算；PATH 上找 Rscript 但列出的是同目录的 R", () => {
    const d = 依赖({
      kernelspecs: [{ language: "python", executable: "/x/python" }, { language: "R", executable: "/usr/local/bin/R" }],
      pathLookup: (n) => (n === "Rscript" ? ["/opt/homebrew/bin/Rscript"] : []),
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
  it("每个候选跑一次，结果合并进候选", async () => {
    const d = 依赖({ settings: { python: "/a/python" }, pathLookup: () => ["/b/python3"] })
    const run = async (cmd: string) => (cmd === "/a/python" ? { code: 0, stdout: "3.12.0\n", stderr: "" } : { code: 1, stdout: "3.9.1\n", stderr: "No module named 'ipykernel'" })
    const r = await 探测解释器("python", d, run)
    expect(r).toEqual([
      { path: "/a/python", source: "settings", version: "3.12.0", kernelPackage: "present" },
      { path: "/b/python3", source: "PATH", version: "3.9.1", kernelPackage: "missing" },
    ])
  })
})
