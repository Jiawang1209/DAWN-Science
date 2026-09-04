/**
 * 内核运行时的远端分支（远程内核，2026-09-03）。起停与隧道都注入假的：这一层要验的是
 * **顺序与收摊**——起内核 → 五条隧道 → attach；停 = 停内核 → 关通道 → 关隧道；
 * 断线 = 这台服务器名下的全部标死、发一条带 reason 的 exited、隧道关掉。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { KernelRuntime } from "../../src/runtime/kernel.js"
import type { AgentEvent, SessionId } from "../../src/runtime/types.js"

/**
 * 假时钟一旦漏到下一条用例，`setTimeout` 就永远不响——症状是**别的用例超时**，
 * 而它们与时间毫无关系（2026-09-04 踩的：一条断言先抛了，那条用例末尾的
 * `useRealTimers()` 就再也没执行到）。收在这里，别再指望每条用例自己收尾。
 */
afterEach(() => void vi.useRealTimers())

function 假件(选: { 远端活着?: () => boolean; 心跳口慢?: boolean } = {}) {
  const 日志: string[] = []
  /**
   * 一次 `attach` 一条通道，**各自记住自己那个「远端进程」句柄**。
   * 共用一个的话，两台会话的 close 会去杀同一个句柄——「分离不发信号」这条判据
   * 就被另一台的句柄骗过去了（2026-09-04 踩的）。真 `close()` 会 `kill("SIGKILL")`，假的也照做。
   */
  const 造通道 = (进程: { kill(s?: NodeJS.Signals): void }) => ({
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
      进程.kill("SIGKILL")
      日志.push("channel.close")
    },
    ready: async () => {},
    send: () => {},
    request: async () => ({}),
    onExit: () => () => {},
  })
  /**
   * 假的 zmq 心跳口：`回音` 是可控的——测试把它拨成 false 来演「心跳沉默」。
   * `心跳口慢` 把开口那一步卡住，用来演「开口的那几十毫秒里会话被收掉了」。
   */
  let 回音 = true
  let ping次 = 0
  let 放行: (() => void) | undefined
  const 心跳口 = {
    开心跳口: async () => {
      if (选.心跳口慢) await new Promise<void>((r) => (放行 = r))
      return {
        ping: async () => {
          ping次++
          return 回音
        },
        关: () => void 日志.push("心跳.关"),
      }
    },
    设回音: (v: boolean) => (回音 = v),
    ping次数: () => ping次,
    开口卡住了: () => 放行 !== undefined,
    放行开口: () => 放行?.(),
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
      return 造通道(o.process) as never
    },
    开心跳口: 心跳口.开心跳口,
  }
  const executor = {
    // 每一条走到服务器上的命令都记一笔：断线那条要证明**一条都没发**（连接已经没了）
    exec: async (cmd: string) => {
      日志.push(`exec:${cmd}`)
      // `kill -0` 那条是心跳的结论 / 接回的认领：`DAWNALIVE` 与 `DAWNFILE` 同一份答案（假机器上文件跟着进程走）
      if (cmd.includes("kill -0")) {
        const 活 = 选.远端活着?.() ?? true
        return { code: 0, stdout: `DAWNALIVE=${活 ? 1 : 0}\nDAWNFILE=${活 ? 1 : 0}\n`, stderr: "" }
      }
      return { code: 0, stdout: "", stderr: "" }
    },
    readFile: async () => Buffer.alloc(0),
    writeFile: async () => {},
    forwardOut: async () => {
      throw new Error("不该直接调")
    },
  }
  return { 日志, 远端, executor, 心跳口 }
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
      "心跳.关", // 先停心跳：不然停到一半它去确认、判死、再收一遍
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

  it("断线：这台服务器名下的内核全部分离，detached 带 reason=disconnected，隧道关掉；别的服务器不受影响", async () => {
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
    // 掉线 = 分离，不是死（接回，2026-09-04 定案 6）：记录留着等接回，但已经不在 `sessions` 里
    expect(收到.map((e) => e.kind)).toEqual(["detached"])
    expect(收到[0]).toMatchObject({ kind: "detached", reason: "disconnected" })
    expect(rt.kernelInstanceId("c1::python" as SessionId)).toBeUndefined()
    expect(日志).toContain("隧道.关")
    expect(日志).not.toContain("停:7") // 连接没了，杀不了；留给下次连上的扫残留
    /**
     * **一条命令都不许发出去**（审查 2026-09-04）。两个理由，第二个是要命的：
     *
     * ① 连接已经断了，往它上面发命令没有意义——每一条都要卡到超时，
     *    而「断线」这件事本身要求界面立刻收口。
     * ② `channel.close()` 会 `kill("SIGKILL")` 那个句柄，而远端句柄把它翻成
     *    SSH 上的 `kill -KILL <pid>`——**那是我们正打算接回的那台内核**。
     *    杀掉它，`分离的` 里留下的记录就指向一具尸体。以前这条侥幸没杀成，
     *    只因为 `RemoteConnections.记下` 先把执行器丢了；那是别处的实现顺序，
     *    不是这里的保证（假 SSH 的 `dropLink` 一来链路还是通的）。所以由
     *    `连接断了` 把这个句柄的枪下了再关通道。
     */
    expect(日志.filter((x) => x.startsWith("exec:"))).toEqual([])
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

describe("KernelRuntime · 猝死察觉", () => {
  it("心跳沉默 → SSH 确认 → 进程没了 → 收摊、删远端文件、exited{reason:died}", async () => {
    vi.useFakeTimers()
    let 活 = true
    const { 日志, 远端, executor, 心跳口 } = 假件({ 远端活着: () => 活 })
    const rt = new KernelRuntime({ 远端: 远端 as never, installId: () => "ab12" })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    心跳口.设回音(false)
    活 = false
    await vi.advanceTimersByTimeAsync(10_500)
    await vi.runOnlyPendingTimersAsync()
    expect(收到.map((e) => e.kind)).toContain("exited")
    expect(收到.find((e) => e.kind === "exited")).toMatchObject({ reason: "died" })
    expect(日志).toContain("心跳.关")
    expect(日志).toContain("隧道.关")
    expect(日志.some((l) => l.startsWith("exec:rm -f '/tmp/f.json' '/tmp/f.json.log'"))).toBe(true)
    expect(rt.kernelInstanceId("c1::python" as SessionId)).toBeUndefined()
    vi.useRealTimers()
  })

  it("心跳沉默但进程在（R 忙着）→ 不判死", async () => {
    vi.useFakeTimers()
    const { 远端, executor, 心跳口 } = 假件({ 远端活着: () => true })
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    心跳口.设回音(false)
    await vi.advanceTimersByTimeAsync(10_500)
    await vi.runOnlyPendingTimersAsync()
    expect(收到.map((e) => e.kind)).not.toContain("exited")
    expect(rt.kernelInstanceId("c1::python" as SessionId)).toBe("k-1")
    vi.useRealTimers()
  })

  it("确认活着(id)：远端答 0 → 猝死收摊并回 false；本机会话回 undefined", async () => {
    let 活 = true
    const { 远端, executor } = 假件({ 远端活着: () => 活 })
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    expect(await rt.确认活着("c1::python" as SessionId)).toBe(true)
    活 = false
    expect(await rt.确认活着("c1::python" as SessionId)).toBe(false)
    expect(rt.kernelInstanceId("c1::python" as SessionId)).toBeUndefined()
    expect(await rt.确认活着("nope" as SessionId)).toBeUndefined()
  })

  /**
   * 审查 2026-09-04：`起心跳给` 在 `await 开心跳口(...)` 前后是两个世界。
   * 开口要连一个 socket，那几十毫秒里会话完全可能已经被收掉（掉线、`stop`、猝死）。
   * 把心跳挂到一条不在 `sessions` 里的记录上，它会一直 ping 下去、那个 zmq 口永远没人关——
   * 没有任何一条路会再碰它，因为所有 `停()` 都是从 `sessions` / `分离的` 里找出来调的。
   */
  it("开心跳口那几十毫秒里会话被收掉 → 当场关口，不留一个 ping 到天荒地老的心跳", async () => {
    vi.useFakeTimers()
    const { 日志, 远端, executor, 心跳口 } = 假件({ 心跳口慢: true })
    const rt = new KernelRuntime({ 远端: 远端 as never })
    const 起着 = rt.start(spec(executor) as never)
    // 微任务推到「开心跳口」那一步：隧道、attach 都过了，会话已经在 sessions 里
    await vi.advanceTimersByTimeAsync(0)
    expect(心跳口.开口卡住了()).toBe(true)

    await rt.连接断了("conn-1") // 就在这一刻掉线：会话被挪出 sessions
    心跳口.放行开口()
    await 起着

    expect(日志, "开出来的那个口没人关").toContain("心跳.关")
    const 之前 = 心跳口.ping次数()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(心跳口.ping次数(), "心跳挂在一条已经不在的记录上，还在 ping").toBe(之前)
    vi.useRealTimers()
  })
})

describe("KernelRuntime · 分离与接回", () => {
  it("掉线：关通道、关隧道、停心跳，发 detached（不是 exited）；记录留着，变量面板答「等接回」", async () => {
    const { 日志, 远端, executor } = 假件()
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    expect(收到.map((e) => e.kind)).toEqual(["detached"])
    expect(日志).toContain("channel.close")
    expect(日志).toContain("隧道.关")
    expect(日志).toContain("心跳.关")
    expect(rt.等着接回的文件("conn-1")).toEqual(["f.json"])
    expect(await rt.variables("c1::python" as SessionId)).toMatchObject({ supported: false, reason: expect.stringContaining("等接回") })
  })

  it("接回：进程在 → 扫残留之后重建隧道、重握手，发 reattached；同一个会话 id 又能用", async () => {
    const { 日志, 远端, executor } = 假件({ 远端活着: () => true })
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    日志.length = 0
    await rt.接回远端("conn-1")
    expect(收到.map((e) => e.kind)).toEqual(["detached", "reattached"])
    expect(收到[1]).toMatchObject({ kind: "reattached", 掉线时在飞: false })
    expect(日志.some((l) => l.startsWith("exec:") && l.includes("kill -0 7"))).toBe(true)
    expect(日志).toContain("attach:11")
    expect(rt.等着接回的文件("conn-1")).toEqual([])
    expect(rt.kernelInstanceId("c1::python" as SessionId)).toBe("k-1")
  })

  it("掉线时有段在飞 → reattached 带 掉线时在飞:true", async () => {
    const { 远端, executor } = 假件({ 远端活着: () => true })
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    rt.write("c1::python" as SessionId, "x = 1")
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    await rt.接回远端("conn-1")
    expect(收到[1]).toMatchObject({ kind: "reattached", 掉线时在飞: true })
  })

  it("接回：进程没了 → 尽力停、发 exited{reason:lost}，记录清掉", async () => {
    const { 日志, 远端, executor } = 假件({ 远端活着: () => false })
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    await rt.接回远端("conn-1")
    expect(收到.map((e) => e.kind)).toEqual(["detached", "exited"])
    expect(收到[1]).toMatchObject({ reason: "lost" })
    expect(日志).toContain("停:7")
    expect(rt.等着接回的文件("conn-1")).toEqual([])
  })

  it("接回：握手不通 → 关隧道、停远端、exited{reason:lost}", async () => {
    const { 日志, 远端, executor } = 假件({ 远端活着: () => true })
    let 第几次 = 0
    const 坏attach = {
      ...远端,
      attach: async (o: never) => {
        第几次++
        if (第几次 === 1) return 远端.attach(o)
        throw new Error("握手超时")
      },
    }
    const rt = new KernelRuntime({ 远端: 坏attach as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    await rt.接回远端("conn-1")
    expect(收到.map((e) => e.kind)).toEqual(["detached", "exited"])
    expect(收到[1]).toMatchObject({ reason: "lost" })
    expect(日志.filter((l) => l === "隧道.关")).toHaveLength(2)
    expect(日志).toContain("停:7")
  })

  it("人按「断开」时那台在 detached → 放弃接回：exited{reason:abandoned}，不碰服务器", async () => {
    const { 日志, 远端, executor } = 假件()
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    日志.length = 0
    await rt.断开了("conn-1")
    expect(收到.map((e) => e.kind)).toEqual(["detached", "exited"])
    expect(收到[1]).toMatchObject({ reason: "abandoned" })
    expect(日志.filter((l) => l.startsWith("exec:"))).toEqual([])
    expect(rt.等着接回的文件("conn-1")).toEqual([])
  })

  /**
   * 审查 2026-09-04：接回途中那台内核**必须一直在 `分离的` 里**。
   * 原来的写法在循环顶上就把记录删了，于是这几秒里它谁都不属于：
   * 人按「断开」时 `放弃接回` 找不到它（一声不吭，`exited` 永远不来），
   * 而循环那头照样把会话装回 `sessions`——一台人已经说了不要的内核又活了。
   */
  it("接回途中人按「断开」→ abandoned 照样发一次，会话不复活，半建的隧道收掉", async () => {
    const { 日志, 远端, executor } = 假件({ 远端活着: () => true })
    let 第几次 = 0
    let 放行隧道: (() => void) | undefined
    const 慢隧道 = {
      ...远端,
      // 只卡接回那一次（第一次是 `start` 建的那五条，卡住它测试连起都起不来）
      五条隧道: async (c: never, 远: never) => {
        if (++第几次 > 1) await new Promise<void>((r) => (放行隧道 = r))
        return 远端.五条隧道(c, 远)
      },
    }
    const rt = new KernelRuntime({ 远端: 慢隧道 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    日志.length = 0

    const 接着 = rt.接回远端("conn-1")
    while (!放行隧道) await new Promise((r) => setTimeout(r, 0))
    await rt.断开了("conn-1") // 人在这一刻按「断开」
    放行隧道!()
    await 接着

    expect(收到.map((e) => e.kind)).toEqual(["detached", "exited"])
    expect(收到[1]).toMatchObject({ reason: "abandoned" })
    expect(rt.kernelInstanceId("c1::python" as SessionId), "被放弃的会话又活回来了").toBeUndefined()
    expect(rt.等着接回的文件("conn-1")).toEqual([])
    expect(日志, "半建的那条隧道没人关").toContain("隧道.关")
  })

  /**
   * 审查 2026-09-04：接回途中**又断一次**。原来那几秒里记录不在 `分离的`、隧道也没登记，
   * 于是 `连接断了` 两处都扫不到它——五个本地监听端口就此漏掉。
   * 登记进 `起中隧道`（`start` 用的同一张表）之后，它归 `连接断了` 管；
   * 而内核仍留在 `分离的` 里等下一次接回——**又断一次不是「丢了」**。
   */
  it("接回途中又断了一次 → 半建的隧道被 `连接断了` 关掉，内核仍等着下次接回", async () => {
    const { 日志, 远端, executor } = 假件({ 远端活着: () => true })
    let 第几次 = 0
    let 放行握手: ((e: unknown) => void) | undefined
    const 卡住的 = {
      ...远端,
      attach: async (o: never) => {
        第几次++
        if (第几次 === 1) return 远端.attach(o)
        日志.push("attach:卡住")
        return new Promise((_res, rej) => {
          放行握手 = rej
        }) as never
      },
    }
    const rt = new KernelRuntime({ 远端: 卡住的 as never })
    await rt.start(spec(executor) as never)
    const 收到: AgentEvent[] = []
    rt.attach("c1::python" as SessionId, (e) => void 收到.push(e))
    await rt.连接断了("conn-1")
    日志.length = 0

    const 接着 = rt.接回远端("conn-1")
    // 隧道已经重建、握手还没回来——正是最容易再撞上一次断线的那几秒
    while (!放行握手) await new Promise((r) => setTimeout(r, 0))
    expect(日志).not.toContain("隧道.关")
    await rt.连接断了("conn-1")
    expect(日志, "接回途中那条隧道没人关，端口漏一辈子").toContain("隧道.关")

    放行握手!(new Error("握手没回音"))
    await 接着
    // 又断一次 ≠ 死：那台内核多半还在服务器上，留着等下一次连上再接
    expect(收到.map((e) => e.kind)).toEqual(["detached"])
    expect(rt.等着接回的文件("conn-1")).toEqual(["f.json"])
    expect(日志).not.toContain("停:7")
  })

  it("别的服务器的内核不受这台掉线 / 接回影响", async () => {
    const { 远端, executor } = 假件({ 远端活着: () => true })
    const rt = new KernelRuntime({ 远端: 远端 as never })
    await rt.start(spec(executor) as never)
    await rt.start({
      ...spec(executor),
      sessionId: "c2::python",
      remote: { ...spec(executor).remote, connectionId: "conn-2" },
    } as never)
    await rt.连接断了("conn-1")
    expect(rt.等着接回的文件("conn-2")).toEqual([])
    expect(rt.kernelInstanceId("c2::python" as SessionId)).toBe("k-1")
  })
})
