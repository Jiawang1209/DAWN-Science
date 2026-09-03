/**
 * 内核运行时的远端分支（远程内核，2026-09-03）。起停与隧道都注入假的：这一层要验的是
 * **顺序与收摊**——起内核 → 五条隧道 → attach；停 = 停内核 → 关通道 → 关隧道；
 * 断线 = 这台服务器名下的全部标死、发一条带 reason 的 exited、隧道关掉。
 */
import { describe, expect, it } from "vitest"
import { KernelRuntime } from "../../src/runtime/kernel.js"
import type { AgentEvent, SessionId } from "../../src/runtime/types.js"

function 假件() {
  const 日志: string[] = []
  const 假通道 = {
    kernelInstanceId: "k-1",
    kernelRevision: 0,
    on: () => () => {},
    execute: () => "m1",
    // 环境探测：回一份能解析的（Python 那条是 base64 的 JSON）
    probe: async () =>
      Buffer.from(JSON.stringify({ version: "3.12.0", executable: "/opt/conda/bin/python" })).toString("base64"),
    interrupt: () => {},
    close: async () => void 日志.push("channel.close"),
    ready: async () => {},
    send: () => {},
    request: async () => ({}),
    onExit: () => () => {},
  }
  const 远端 = {
    起远端内核: async (_e: unknown, o: { 语言: string; cwd: string }) => {
      日志.push(`起:${o.语言}@${o.cwd}`)
      return {
        pid: 7,
        文件: "/tmp/f.json",
        setsid: true,
        连接信息: {
          ip: "127.0.0.1",
          transport: "tcp",
          key: "k",
          signature_scheme: "hmac-sha256",
          shell_port: 1,
          iopub_port: 2,
          stdin_port: 3,
          control_port: 4,
          hb_port: 5,
        },
      }
    },
    停远端内核: async (_e: unknown, k: { pid: number }) => void 日志.push(`停:${k.pid}`),
    五条隧道: async (_c: unknown, 远: { key: string }) => ({
      本地: { ...远, ip: "127.0.0.1", shell_port: 11, iopub_port: 12, stdin_port: 13, control_port: 14, hb_port: 15 },
      关: async () => void 日志.push("隧道.关"),
    }),
    attach: async (o: { 连接信息: { shell_port: number } }) => {
      日志.push(`attach:${o.连接信息.shell_port}`)
      return 假通道 as never
    },
  }
  const executor = {
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async () => Buffer.alloc(0),
    writeFile: async () => {},
    forwardOut: async () => {
      throw new Error("不该直接调")
    },
  }
  return { 日志, 远端, executor }
}

const spec = (executor: unknown) => ({
  sessionId: "c1::python" as SessionId,
  workspace: "/data/p",
  sessionDir: "/tmp/sd",
  kernel: { language: "python" as const, interpreterPath: "/opt/conda/bin/python" },
  remote: {
    executor: executor as never,
    cwd: { get: () => "/data/p", set: () => {} },
    connectionId: "conn-1",
    label: "genek",
  },
})

describe("KernelRuntime · 远端", () => {
  it("起：远端起内核 → 五条隧道 → attach 用本地端口；停：停内核 → 关通道 → 关隧道", async () => {
    const { 日志, 远端, executor } = 假件()
    const rt = new KernelRuntime({ 远端: 远端 as never, installId: () => "ab12" })
    await rt.start(spec(executor) as never)
    expect(日志).toEqual(["起:python@/data/p", "attach:11"])
    await rt.stop("c1::python" as SessionId)
    expect(日志.slice(2)).toEqual(["停:7", "channel.close", "隧道.关"])
  })

  it("执行器不支持 forwardOut → 响亮失败，不起内核", async () => {
    const { 远端, executor } = 假件()
    const rt = new KernelRuntime({ 远端: 远端 as never })
    const 没隧道 = { ...executor, forwardOut: undefined }
    await expect(rt.start(spec(没隧道) as never)).rejects.toThrow(/隧道/)
  })

  it("断线：这台服务器名下的内核全部标死，exited 带 reason=disconnected，隧道关掉；别的服务器不受影响", async () => {
    const { 日志, 远端, executor } = 假件()
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    await rt.start({
      ...spec(executor),
      sessionId: "c2::python",
      remote: { ...spec(executor).remote, connectionId: "conn-2", label: "别的" },
    } as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    expect(收到.map((e) => e.kind)).toEqual(["notice", "exited"])
    expect(收到[1]).toMatchObject({ kind: "exited", reason: "disconnected" })
    expect((收到[0] as { text: string }).text).toMatch(/genek/)
    expect(日志).toContain("隧道.关")
    expect(日志).not.toContain("停:7") // 连接没了，杀不了；留给下次连上的扫残留
    expect(rt.kernelInstanceId("c2::python" as SessionId)).toBe("k-1") // 另一台还活着
  })

  it("环境快照带 where.connectionId —— 同一个 conda env 搬到另一台是另一份快照", async () => {
    const { 远端, executor } = 假件()
    const 收: unknown[] = []
    const rt = new KernelRuntime({
      远端: 远端 as never,
      onEnvironment: (_id, snap) => void 收.push(snap),
    })
    await rt.start(spec(executor) as never)
    // captureEnvironment 是 fire-and-forget 的，让出一轮微任务再看
    await new Promise((r) => setTimeout(r, 0))
    expect(收[0]).toMatchObject({ where: { connectionId: "conn-1" } })
    expect(rt.environmentOf("c1::python" as SessionId)).toMatchObject({ where: { connectionId: "conn-1" } })
  })
})
