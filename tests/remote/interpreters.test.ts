/**
 * 远端探测解释器（远程内核，2026-09-03）：复用 `kernel/probe.ts` 的枚举与解析，
 * 只换了「事实从哪来」——一段登录 shell 脚本一次吐完，再逐个候选起一次。
 */
import { describe, expect, it } from "vitest"
import { 事实脚本, 解析事实, 探测远端解释器, 选定 } from "../../src/remote/interpreters.js"

const 事实 = [
  "*** 欢迎横幅 ***",
  "DAWNFACT_HOME=/home/liu",
  "DAWNFACT_OS=Linux",
  "DAWNFACT_PATH_python3=/home/liu/miniconda3/bin/python3",
  "DAWNFACT_PATH_python3=/usr/bin/python3",
  "DAWNFACT_EXE=/home/liu/miniconda3/envs/bio/bin/python",
  "DAWNFACT_EXE=/usr/bin/python3",
].join("\n")

describe("解析事实", () => {
  it("横幅不碍事；PATH 命中按名字归组；可执行文件成集合", () => {
    const f = 解析事实(事实)
    expect(f.home).toBe("/home/liu")
    expect(f.platform).toBe("linux")
    expect(f.path["python3"]).toEqual(["/home/liu/miniconda3/bin/python3", "/usr/bin/python3"])
    expect(f.exe.has("/home/liu/miniconda3/envs/bio/bin/python")).toBe(true)
  })
})

describe("探测远端解释器", () => {
  it("先跑事实脚本，再对每个候选起一次；结果按枚举顺序、包在的浮前", async () => {
    const 跑过: string[] = []
    const exec = async (cmd: string) => {
      跑过.push(cmd)
      if (cmd.includes("DAWNFACT_HOME")) return { code: 0, stdout: 事实, stderr: "" }
      if (cmd.includes("miniconda3/envs/bio")) return { code: 0, stdout: "3.11.9\n", stderr: "" }
      if (cmd.includes("miniconda3/bin/python3")) return { code: 1, stdout: "3.12.2\n", stderr: "No module named 'ipykernel'" }
      return { code: 1, stdout: "3.10.12\n", stderr: "/usr/bin/python3: No module named ipykernel" }
    }
    const 候选 = await 探测远端解释器(exec, "python", {})
    expect(跑过[0]).toBe(事实脚本)
    expect(候选.map((c) => [c.path, c.kernelPackage])).toEqual([
      ["/home/liu/miniconda3/envs/bio/bin/python", "present"],
      ["/home/liu/miniconda3/bin/python3", "missing"],
      ["/usr/bin/python3", "missing"],
    ])
    expect(候选[0]?.version).toBe("3.11.9")
    // 每个候选一条 exec，命令是单引号包好的路径 + 参数（**参数也包**：`-c` 后面那串代码必须原样过去）
    expect(跑过.some((c) => c.startsWith("'/usr/bin/python3' '-c' "))).toBe(true)
  })

  it("已配的那条排最前、来源 settings", async () => {
    const exec = async (cmd: string) => cmd.includes("DAWNFACT_HOME") ? { code: 0, stdout: 事实, stderr: "" } : { code: 0, stdout: "3.9.1\n", stderr: "" }
    const 候选 = await 探测远端解释器(exec, "python", { python: "/opt/py/bin/python" })
    expect(候选[0]).toMatchObject({ path: "/opt/py/bin/python", source: "settings" })
  })

  it("R：候选来自 Rscript 换回 R；探测命令用同目录的 Rscript", async () => {
    const 跑过: string[] = []
    const exec = async (cmd: string) => {
      跑过.push(cmd)
      if (cmd.includes("DAWNFACT_HOME")) return { code: 0, stdout: "DAWNFACT_HOME=/h\nDAWNFACT_OS=Linux\nDAWNFACT_PATH_Rscript=/usr/bin/Rscript\n", stderr: "" }
      return { code: 3, stdout: "4.3.2", stderr: "" }
    }
    const 候选 = await 探测远端解释器(exec, "R", {})
    expect(候选).toEqual([{ path: "/usr/bin/R", source: "PATH", version: "4.3.2", kernelPackage: "missing" }])
    expect(跑过[1]).toContain("'/usr/bin/Rscript' '-e' ")
  })
})

describe("选定", () => {
  const c = (path: string, kernelPackage: "present" | "missing" | "unknown") => ({ path, source: "PATH" as const, kernelPackage })
  it("唯一装了包的 → one；多个 → many；零个 → none（missing / unknown 都不算）", () => {
    expect(选定([c("/a", "present"), c("/b", "missing")])).toEqual({ kind: "one", path: "/a" })
    expect(选定([c("/a", "present"), c("/b", "present")])).toEqual({ kind: "many", n: 2 })
    expect(选定([c("/b", "missing"), c("/c", "unknown")])).toEqual({ kind: "none" })
    expect(选定([])).toEqual({ kind: "none" })
  })
})
