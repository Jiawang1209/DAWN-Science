// 跨真实进程边界，不用 mock。用 bash 代替 agent CLI，保证 CI 可跑。
import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PtyRuntime } from "../../src/runtime/pty.js"
import type { AgentEvent } from "../../src/runtime/types.js"

/** 信号 0 只做存在性探测，不实际发送 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function waitFor(events: AgentEvent[], pred: (e: AgentEvent) => boolean, ms = 8000) {
  return new Promise<void>((resolve, reject) => {
    const t0 = Date.now()
    const tick = setInterval(() => {
      if (events.some(pred)) {
        clearInterval(tick)
        resolve()
      } else if (Date.now() - t0 > ms) {
        clearInterval(tick)
        reject(new Error("等待超时"))
      }
    }, 50)
  })
}

function waitUntil(pred: () => boolean, ms = 5000) {
  return new Promise<void>((resolve, reject) => {
    const t0 = Date.now()
    const tick = setInterval(() => {
      if (pred()) {
        clearInterval(tick)
        resolve()
      } else if (Date.now() - t0 > ms) {
        clearInterval(tick)
        reject(new Error("等待超时"))
      }
    }, 50)
  })
}

const bash = () => new PtyRuntime({ command: "bash", args: ["--norc", "--noprofile"] })
const newDir = () => mkdtempSync(join(tmpdir(), "dawn-pty-"))

describe("PtyRuntime（集成）", () => {
  it("启动进程、回显输入、退出时报告退出码", async () => {
    const rt = bash()
    const dir = newDir()
    const events: AgentEvent[] = []
    rt.attach("t1", (e) => events.push(e))

    const handle = await rt.start({ sessionId: "t1", workspace: dir, sessionDir: dir })
    expect(handle.pid).toBeGreaterThan(0)

    rt.write("t1", "echo DAWN_MARKER_OK\n")
    await waitFor(events, (e) => e.kind === "output" && e.data.includes("DAWN_MARKER_OK"))

    rt.write("t1", "exit 7\n")
    await waitFor(events, (e) => e.kind === "exited")
    expect(events.find((e) => e.kind === "exited")).toMatchObject({
      kind: "exited",
      sessionId: "t1",
      exitCode: 7,
    })
  })

  it("发出 started 事件且 pid 与 handle 一致", async () => {
    const rt = bash()
    const dir = newDir()
    const events: AgentEvent[] = []
    rt.attach("t1b", (e) => events.push(e))
    const handle = await rt.start({ sessionId: "t1b", workspace: dir, sessionDir: dir })
    const started = events.find((e) => e.kind === "started")
    expect(started).toMatchObject({ kind: "started", pid: handle.pid })
    await rt.stop("t1b")
  })

  it("stop 能终止一个不会自己退出的进程", async () => {
    const rt = bash()
    const dir = newDir()
    const events: AgentEvent[] = []
    rt.attach("t2", (e) => events.push(e))
    await rt.start({ sessionId: "t2", workspace: dir, sessionDir: dir })
    rt.write("t2", "sleep 300\n")
    await rt.stop("t2")
    await waitFor(events, (e) => e.kind === "exited")
    expect(events.some((e) => e.kind === "exited")).toBe(true)
  })

  it("stop 连孙子进程一起杀，不留孤儿", async () => {
    // 关键回归：agent 会起 npm test / python train.py 这类长任务。
    // 只 kill pty 进程会把它们留成孤儿继续吃 CPU/GPU——对训练任务尤其致命。
    const rt = bash()
    const dir = newDir()
    const marker = join(dir, "grandchild.pid")
    const events: AgentEvent[] = []
    rt.attach("t3", (e) => events.push(e))
    await rt.start({ sessionId: "t3", workspace: dir, sessionDir: dir })

    rt.write("t3", `sleep 600 & echo $! > ${marker}\n`)
    await waitUntil(() => existsSync(marker) && readFileSync(marker, "utf8").trim().length > 0)

    const grandchildPid = Number.parseInt(readFileSync(marker, "utf8").trim(), 10)
    expect(Number.isInteger(grandchildPid)).toBe(true)
    expect(isAlive(grandchildPid)).toBe(true)

    await rt.stop("t3")
    await waitUntil(() => !isAlive(grandchildPid), 4000)
    expect(isAlive(grandchildPid)).toBe(false)
  })

  it("stop 对已退出的会话是安全的（幂等，不崩溃）", async () => {
    // Spike C 记录：对已退出的 pty 重复操作会让 native 层抛 Napi::Error，
    // 那是异步异常，try/catch 拦不住，进程直接 SIGABRT。
    const rt = bash()
    const dir = newDir()
    const events: AgentEvent[] = []
    rt.attach("t4", (e) => events.push(e))
    await rt.start({ sessionId: "t4", workspace: dir, sessionDir: dir })
    rt.write("t4", "exit 0\n")
    await waitFor(events, (e) => e.kind === "exited")
    await expect(rt.stop("t4")).resolves.toBeUndefined()
    await expect(rt.stop("t4")).resolves.toBeUndefined()
  })

  it("对未启动的会话 write 抛错", () => {
    expect(() => bash().write("nope", "x")).toThrow(/nope/)
  })

  it("attach 的退订函数生效", async () => {
    const rt = bash()
    const dir = newDir()
    const seen: AgentEvent[] = []
    const off = rt.attach("t5", (e) => seen.push(e))
    off()
    await rt.start({ sessionId: "t5", workspace: dir, sessionDir: dir })
    expect(seen).toHaveLength(0)
    await rt.stop("t5")
  })
})

describe("PtyRuntime · 隔离配置注入", () => {
  it("family 设定时，写出配置文件并把 args 拼进命令行", async () => {
    // 用 echo 当命令：它会把收到的参数原样打印，正好验证 args 确实被传下去。
    // 这是 Task 1.7 的返回值新增 args 之后必须验证的一环——
    // 只把 env 传下去会让 claude 完全收不到 MCP 与 hook 配置。
    const rt = new PtyRuntime({ command: "/bin/echo", args: [], family: "claude" })
    const dir = newDir()
    const events: AgentEvent[] = []
    rt.attach("t6", (e) => events.push(e))
    await rt.start({ sessionId: "t6", workspace: dir, sessionDir: dir })

    await waitFor(events, (e) => e.kind === "output" && e.data.includes("--strict-mcp-config"))
    const out = events.filter((e) => e.kind === "output").map((e) => (e as { data: string }).data).join("")
    expect(out).toContain("--mcp-config")
    expect(out).toContain(join(dir, "mcp.json"))
    expect(existsSync(join(dir, "mcp.json"))).toBe(true)
  })

  it("未设 family 时不写任何配置文件", async () => {
    const rt = bash()
    const dir = newDir()
    await rt.start({ sessionId: "t7", workspace: dir, sessionDir: dir })
    expect(existsSync(join(dir, "mcp.json"))).toBe(false)
    expect(existsSync(join(dir, "settings.json"))).toBe(false)
    await rt.stop("t7")
  })
})
