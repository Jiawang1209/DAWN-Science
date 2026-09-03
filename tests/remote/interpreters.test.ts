/**
 * 远端探测解释器（远程内核，2026-09-03）：复用 `kernel/probe.ts` 的枚举与解析，
 * 只换了「事实从哪来」——一段登录 shell 脚本一次吐完，再逐个候选起一次。
 */
import { describe, expect, it } from "vitest"
import { 事实脚本, 解析事实, 读远端事实, 探测远端解释器, 选定 } from "../../src/remote/interpreters.js"

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

describe("读远端事实", () => {
  /**
   * **探不出来要响亮地说**（规格 7.5）。此前一次失败的 exec 返回空 stdout，
   * 解析出 `home:"/"`、零个候选，用户看到的是一句斩钉截铁的
   * 「这台机器上没有装了 ipykernel 的 Python」——那是假话，而且指向完全错误的补救。
   */
  it("事实脚本没吐出 DAWNFACT_HOME → 抛，带上退出码与 stderr，不悄悄当成「一条都没有」", async () => {
    const exec = async () => ({ code: 127, stdout: "", stderr: "bash: command not found\n" })
    await expect(读远端事实(exec)).rejects.toThrow(/探不了那台机器（退出码 127）：bash: command not found/)
  })

  it("同样的空输出，探测那条也一路抛出来", async () => {
    const exec = async () => ({ code: undefined, stdout: "*** 只有横幅 ***\n", stderr: "" })
    await expect(探测远端解释器(exec, "python", {})).rejects.toThrow(/退出码 无/)
  })

  it("事实传进来就不再问那台机器一遍（两门语言共用一次）", async () => {
    const 跑过: string[] = []
    const exec = async (cmd: string) => {
      跑过.push(cmd)
      return { code: 0, stdout: 事实, stderr: "" }
    }
    const 事 = await 读远端事实(exec)
    await 探测远端解释器(exec, "python", {}, 事)
    await 探测远端解释器(exec, "R", {}, 事)
    expect(跑过.filter((c) => c === 事实脚本)).toHaveLength(1)
  })
})

describe("选定", () => {
  const c = (path: string, kernelPackage: "present" | "missing" | "unknown", problem?: string) => ({
    path, source: "PATH" as const, kernelPackage, ...(problem ? { problem } : {}),
  })
  it("唯一装了包的 → one；多个 → many；零个 → none（missing / unknown 都不算）", () => {
    expect(选定([c("/a", "present"), c("/b", "missing")])).toEqual({ kind: "one", path: "/a" })
    expect(选定([c("/a", "present"), c("/b", "present")])).toEqual({ kind: "many", n: 2 })
    expect(选定([])).toEqual({ kind: "none", unknown: [] })
  })

  /**
   * **「没有」与「没探明白」不是一回事**（审查，2026-09-04）：前者要人去装包，
   * 后者要人去看那条路径怎么了。折成一句话就等于把第二种人支上一条死路。
   */
  it("none 要把「没探明白」的那几条原样带出来（含 problem）", () => {
    const 定 = 选定([c("/b", "missing"), c("/c", "unknown", "8 秒没应答")])
    expect(定).toEqual({ kind: "none", unknown: [c("/c", "unknown", "8 秒没应答")] })
  })
})
