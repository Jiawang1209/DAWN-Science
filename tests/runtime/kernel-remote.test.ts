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
  /** attach 收到的那个「远端进程」句柄。真 `channel.close()` 会 `kill("SIGKILL")` 它，假的也照做 */
  let 进程: { kill(s?: NodeJS.Signals): void } | undefined
  const 假通道 = {
    kernelInstanceId: "k-1",
    kernelRevision: 0,
    on: () => () => {},
    execute: () => "m1",
    // 环境探测：回一份能解析的（Python 那条是 base64 的 JSON）
    probe: async () =>
      Buffer.from(JSON.stringify({ version: "3.12.0", executable: "/opt/conda/bin/python" })).toString("base64"),
    interrupt: () => {},
    close: async () => {
      // 与真 `close()` 同一个顺序：先杀进程（远端那条会走 SSH），再关 socket
      进程?.kill("SIGKILL")
      日志.push("channel.close")
    },
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
    attach: async (o: { 连接信息: { shell_port: number }; process: { kill(s?: NodeJS.Signals): void } }) => {
      日志.push(`attach:${o.连接信息.shell_port}`)
      进程 = o.process
      return 假通道 as never
    },
  }
  const executor = {
    // 每一条走到服务器上的命令都记一笔：断线那条要证明**一条都没发**（连接已经没了）
    exec: async (cmd: string) => {
      日志.push(`exec:${cmd}`)
      return { code: 0, stdout: "", stderr: "" }
    },
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
    expect(日志.slice(2)).toEqual([
      "停:7",
      "exec:kill -KILL 7 2>/dev/null; true", // `channel.close()` 自己那一下，走 SSH
      "channel.close",
      "隧道.关",
    ])
  })

  /**
   * `RemoteLike.forwardOut` 在契约里就是**可选的**（`runtime/types.ts` 写着「测试替身与
   * 旧句柄可以不给」），所以这条不是防御性冗余，是那个可选性的唯一出口。
   *
   * 判据加严（审查 2026-09-04 #11）：**光看得见「隧道」两个字不够**——
   * 这句话要说得出是**哪台机器**，而且必须在**碰服务器之前**就拦下来
   * （已经起了一个连不上的内核，那台进程就只能等下次「扫残留」了）。
   */
  it("执行器不支持 forwardOut → 响亮失败：点名是哪台，且一条命令都没发出去", async () => {
    const { 日志, 远端, executor } = 假件()
    const rt = new KernelRuntime({ 远端: 远端 as never })
    const 没隧道 = { ...executor, forwardOut: undefined }
    await expect(rt.start(spec(没隧道) as never)).rejects.toThrow(/genek.*隧道/)
    expect(日志).toEqual([])
  })

  it("人主动断开：连接还活着，先在服务器上停掉内核（TERM→等→删文件），再本地收摊、出声", async () => {
    const { 日志, 远端, executor } = 假件()
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.服务器要断了("conn-1")
    expect(日志).toContain("停:7")
    expect(日志.indexOf("停:7")).toBeLessThan(日志.indexOf("隧道.关"))
    expect(收到.map((e) => e.kind)).toEqual(["exited"])
    expect(收到[0]).toMatchObject({ kind: "exited", reason: "disconnected" })
    expect(rt.kernelInstanceId("c1::python" as SessionId)).toBeUndefined()
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
    expect(收到.map((e) => e.kind)).toEqual(["exited"])
    expect(收到[0]).toMatchObject({ kind: "exited", reason: "disconnected" })
    expect(日志).toContain("隧道.关")
    expect(日志).not.toContain("停:7") // 连接没了，杀不了；留给下次连上的扫残留
    /**
     * **连接已经断了，这时候还往它上面发命令是没有意义的**——每一条都要卡到超时，
     * 而「断线」这件事本身要求界面立刻收口。所以到服务器上的流量只允许有
     * `channel.close()` 自己那一下 fire-and-forget 的 KILL（发不出去也无所谓，不等回音）：
     * 没有 `停远端内核` 的那串 TERM/轮询/rm，没有扫残留，没有别的。
     */
    expect(日志.filter((x) => x.startsWith("exec:"))).toEqual(["exec:kill -KILL 7 2>/dev/null; true"])
    expect(rt.kernelInstanceId("c2::python" as SessionId)).toBe("k-1") // 另一台还活着
  })

  it("握手还没回来就断线 → 在飞那段的五条隧道也关掉（不然端口漏一辈子）", async () => {
    const { 日志, 远端, executor } = 假件()
    let 放行: ((e: unknown) => void) | undefined
    const 卡住的 = {
      ...远端,
      attach: (o: { 连接信息: { shell_port: number } }) => {
        日志.push(`attach:${o.连接信息.shell_port}`)
        // 隧道已经建好、kernel_info 还没回来——正是最容易撞上断线的那几秒
        return new Promise((_res, rej) => {
          放行 = rej
        }) as never
      },
    }
    const rt = new KernelRuntime({ 远端: 卡住的 as never })
    const 起着 = rt.start(spec(executor) as never)
    起着.catch(() => {}) // 下面会让它失败，先接住免得成 unhandled
    // 等到 attach 那一步（隧道已经建起来了）
    while (!日志.includes("attach:11")) await new Promise((r) => setTimeout(r, 0))
    expect(日志).not.toContain("隧道.关")

    await rt.连接断了("conn-1")
    expect(日志, "在飞的那段隧道没人关").toContain("隧道.关")

    放行?.(new Error("握手没回音"))
    await expect(起着).rejects.toThrow()
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
