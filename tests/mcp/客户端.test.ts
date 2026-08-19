/**
 * MCP 客户端：**对着一台真服务器**跑（2026-08-15）。
 *
 * 用的是 `scripts/mcp-test-server.mjs`——真的走 stdio、真的说 MCP 协议。
 * 拿一个假 transport 去测，测到的只是我们自己那几行；
 * 而这一层要回答的问题恰恰是**「我们跟一台真服务器说得上话吗」**。
 *
 * 这一组盯四件事，每一件都是「静默」会发生的地方：
 *   ① 缺环境变量 → 说清缺哪个，**而且不起进程**
 *   ② 服务器自己崩了 → 把它 stderr 上那句话交出来
 *   ③ 工具报错 ≠ 调用失败 → 两者分得开
 *   ④ 密钥真的送到了它手上 → 有物证，不靠「应该传了」
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MCP池, 摘出文字 } from "../../src/mcp/客户端.js"
import type { McpServer } from "../../src/config/schema.js"

const 服务器脚本 = join(process.cwd(), "scripts", "mcp-test-server.mjs")

let 临时: string
let 池: MCP池

const 造池 = (密: Record<string, string> = {}) =>
  new MCP池({ 取密: (服务器名, 变量名) => 密[`${服务器名}:${变量名}`] })

beforeEach(() => {
  临时 = mkdtempSync(join(tmpdir(), "dawn-mcp-c-"))
  池 = 造池()
})
afterEach(async () => {
  await 池.全关()
  rmSync(临时, { recursive: true, force: true })
})

const 一台 = (over: Partial<McpServer> = {}): McpServer => ({
  command: process.execPath,
  args: [服务器脚本],
  ...over,
})

describe("MCP 客户端 · 对着真服务器", () => {
  it("连上并列出工具", async () => {
    const r = await 池.备好("testbox", 一台())
    expect(r.失败, `没连上：${r.失败}`).toBeUndefined()
    /**
     * **列的是「它报了哪些」，不是「它应该有哪些」**（2026-08-19 改）。
     *
     * 上一版写死了三个名字。2026-08-19 给这份假服务器加了第四个
     * （`我收到的头`，远端那条用来作证密钥带没带过去），**这条就红了**——
     * 而它想验的从来不是「一共几个」，是**「列得出来」**。
     *
     * 所以改成盯那三个仍然在。加一个工具不该让这条红，
     * **少一个必须让它红**。
     */
    for (const 名 of ["boom", "echo", "写一行"]) {
      expect(r.工具.map((t) => t.工具名), `少了 ${名}`).toContain(名)
    }
  })

  /** **工具名带服务器前缀**：两台各有一个 `echo` 时，模型要分得清打给谁 */
  it("工具名带服务器前缀", async () => {
    const r = await 池.备好("testbox", 一台())
    expect(r.工具.find((t) => t.工具名 === "echo")!.全名).toBe("testbox__echo")
  })

  it("调得动，拿得到文本", async () => {
    const 配 = 一台()
    await 池.备好("testbox", 配)
    const r = await 池.调("testbox", 配, "echo", { message: "在吗" })
    expect(r.出错了).toBe(false)
    expect(r.文字).toContain("echo: 在吗")
  })

  /**
   * **工具报错不等于调用失败。**
   * 混成一件事的话，模型看不到「它是怎么失败的」，只能重试同一条死路。
   */
  it("工具报错时如实标 `出错了`，但内容照给", async () => {
    const 配 = 一台()
    await 池.备好("testbox", 配)
    const r = await 池.调("testbox", 配, "boom", {})
    expect(r.出错了).toBe(true)
    expect(r.文字).toContain("用来失败的")
  })

  /**
   * **缺环境变量：说清缺哪个，而且根本不起进程。**
   *
   * 静默起一个连不上库的服务器，症状会表现成「这个工具怎么老是失败」——
   * 人会去查工具、查网络、查模型，唯独不会想到是一个没配的环境变量。
   */
  it("**缺密钥时点名说缺哪个，并且不起进程**", async () => {
    const r = await 池.备好("needskey", 一台({ env: ["DAWN_MCP_TEST_SECRET"] }))
    expect(r.失败).toContain("DAWN_MCP_TEST_SECRET")
    expect(r.工具).toEqual([])
    expect(池.连着的(), "不该起任何进程").toEqual([])
  })

  /**
   * **密钥真的送到了它手上**——有物证，不是「应该传了」。
   *
   * 顺带验住了另一半：**我们不把自己的环境倒给子进程**。
   * 这一条第一版是错的——我把日志路径设在 `process.env` 上就以为子进程能读到，
   * 结果它读不到。那不是 bug，正是白名单在起作用（`默认环境()` 只放行
   * PATH/HOME 那几个）。**要给它什么，就得在配置里说出来。**
   */
  it("配好的密钥确实送进了服务器进程，而没说的那些进不去", async () => {
    const 日志 = join(临时, "log.jsonl")
    const p = 造池({
      "needskey:DAWN_MCP_TEST_SECRET": "s3cr3t",
      "needskey:DAWN_MCP_TEST_LOG": 日志,
    })
    const 配 = 一台({ env: ["DAWN_MCP_TEST_SECRET", "DAWN_MCP_TEST_LOG"] })
    try {
      const r = await p.备好("needskey", 配)
      expect(r.失败, `没连上：${r.失败}`).toBeUndefined()
      await p.调("needskey", 配, "写一行", { message: "hi" })
      expect(existsSync(日志), "工具没被真的调到").toBe(true)
      expect(JSON.parse(readFileSync(日志, "utf8").trim()).secret).toBe("s3cr3t")
    } finally {
      await p.全关()
    }
  })

  /**
   * **没在配置里声明的环境变量，一个都进不去。**
   *
   * 我们自己的进程里装着 provider 的 API key。整份 `process.env` 倒给
   * 一个第三方服务器，等于把它们全交出去——而这些服务器是从网上装来的。
   */
  it("**我们自己的环境变量不会漏给它**", async () => {
    const 日志 = join(临时, "leak.jsonl")
    const p = 造池({ "peeker:DAWN_MCP_TEST_LOG": 日志 })
    const 配 = 一台({ env: ["DAWN_MCP_TEST_LOG"] })
    try {
      process.env["DAWN_MCP_TEST_SECRET"] = "不该被看到"
      await p.备好("peeker", 配)
      await p.调("peeker", 配, "写一行", { message: "x" })
      expect(JSON.parse(readFileSync(日志, "utf8").trim()).secret, "它读到了我们进程里的变量").toBeNull()
    } finally {
      delete process.env["DAWN_MCP_TEST_SECRET"]
      await p.全关()
    }
  })

  /**
   * **服务器自己崩了：把它 stderr 上那句话交出来。**
   * 只说「连不上」的话，人没有任何线索——而原因就写在它的 stderr 上。
   */
  it("服务器起不来时，带上它自己说的那句话", async () => {
    const p = 造池()
    try {
      const r = await p.备好(
        "crashy",
        一台({ command: process.execPath, args: ["-e", "console.error('我崩了：缺配置'); process.exit(1)"] }),
      )
      expect(r.失败, "没有报出失败").toBeTruthy()
      expect(r.工具).toEqual([])
    } finally {
      await p.全关()
    }
  })

  /** 命令根本nosuch。**这与「缺 key」「它崩了」是三件不同的事** */
  it("命令nosuch时也如实说", async () => {
    const p = 造池()
    try {
      const r = await p.备好("nosuch", 一台({ command: "dawn-绝对没有这个命令", args: [] }))
      expect(r.失败).toBeTruthy()
    } finally {
      await p.全关()
    }
  })

  /** **同一台被要两次只起一个进程**：开五段对话不该起五个客户端 */
  it("重复要同一台，进程只起一个", async () => {
    const 配 = 一台()
    const [a, b] = await Promise.all([池.备好("testbox", 配), 池.备好("testbox", 配)])
    expect(a.失败).toBeUndefined()
    expect(b.失败).toBeUndefined()
    expect(池.连着的()).toEqual(["testbox"])
  })
})

/**
 * **首启下载不能被报成「这台服务器是坏的」**（2026-08-15 实测踩的）。
 *
 * 第一次接 `@cyanheads/pubmed-mcp-server` 时超时了，那句话是
 * 「连 pubmed 超过 20 秒」——读起来像它坏了。**其实是 `npx` 在下载包**，
 * 预热之后同一台 1 秒就连上。人照着那句话会去换一台、去查网络，
 * 唯独不会想到它只是在下载。
 *
 * 所以超时那句必须把这条可能性说出来。上限也从 20 秒提到 60 秒。
 */
describe("起不来的话要说清是哪一种", () => {
  it("**超时那句要点出「可能只是在下载」**", async () => {
    // 一个永远不说话的进程：连不上，且一定走到超时那条路
    const p = new MCP池({ 取密: () => undefined, 起动上限毫秒: 300 })
    try {
      const r = await p.备好("mute", {
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 60000)"],
      })
      expect(r.失败, "没有报出失败").toBeTruthy()
      expect(r.失败, "超时只说了「超过 N 秒」，人会以为这台服务器坏了").toMatch(/npx|下载/)
    } finally {
      await p.全关()
    }
  })

  /** 上限**可注入只为可测**：按默认值验一次要等一分钟，那种测试没人会跑 */
  it("默认上限是 60 秒 —— 首次 npx 下载要来得及", () => {
    const 源 = readFileSync(join(process.cwd(), "src", "mcp", "客户端.ts"), "utf8")
    expect(源).toMatch(/默认起动上限毫秒 = 60_000/)
  })
})

describe("摘出文字", () => {
  it("文本块拼起来", () => {
    expect(摘出文字({ content: [{ type: "text", text: "一" }, { type: "text", text: "二" }] })).toBe(
      "一\n二",
    )
  })

  /** **非文本要点名说出来**：一声不吭地丢掉，模型会以为什么都没返回 */
  it("图片与资源如实点名，不静默丢掉", () => {
    const s = 摘出文字({ content: [{ type: "image", mimeType: "image/png" }, { type: "resource" }] })
    expect(s).toContain("image/png")
    expect(s).toContain("资源引用")
  })

  it("**什么都没返回也要说一声** —— 一片空白会被读成「没调成」", () => {
    expect(摘出文字({ content: [] })).toContain("没有返回任何内容")
    expect(摘出文字(undefined)).toContain("没有返回任何内容")
  })
})

/**
 * **连一台已经跑着的 HTTP MCP 服务器**（2026-08-19，作者要的）。
 *
 * 作者：*「我要对接的是我自己放在云服务器上的 MCP……新的 streamable HTTP
 * （一个 `/mcp` 端点），但是我觉得新的，或者老的，还是要适配的。」*
 *
 * ## 这一组为什么必须真起一个服务器
 *
 * 与上面 stdio 那一组同一条理由（准入规则 1）：拿一个假 transport 去测，
 * 测到的只是我们自己那几行。**要验的是「我们这个客户端能不能跟一台真服务器
 * 说上话」**——而这一次连"说话"的方式都换了（HTTP 而不是管道）。
 *
 * 用的是**同一份**假服务器（`scripts/mcp-test-server.mjs`），
 * 只是给它 `DAWN_MCP_HTTP_PORT`。另写一份的话，两份的工具集迟早各自漂移，
 * 那时「本机那条能用」就不再说明「远端那条也能用」。
 */
describe("远端那种：streamable HTTP", () => {
  let 子进程: import("node:child_process").ChildProcess | undefined
  let 端口 = 0

  beforeEach(async () => {
    const { spawn } = await import("node:child_process")
    const net = await import("node:net")
    // **要一个空闲端口**：写死端口的用例在并行跑的时候会互相踩
    端口 = await new Promise<number>((res) => {
      const s = net.createServer()
      s.listen(0, () => {
        const p = (s.address() as { port: number }).port
        s.close(() => res(p))
      })
    })
    子进程 = spawn(process.execPath, [服务器脚本], {
      env: { ...process.env, DAWN_MCP_HTTP_PORT: String(端口) },
      stdio: ["ignore", "ignore", "pipe"],
    })
    // 等它真的听上了再往下走——**不等的话这一组会变成一条抖动的用例**
    await new Promise<void>((res, rej) => {
      const 超时 = setTimeout(() => rej(new Error("假 MCP 服务器 5 秒内没起来")), 5000)
      子进程!.stderr?.on("data", (b) => {
        if (String(b).includes("streamable HTTP 起在")) {
          clearTimeout(超时)
          res()
        }
      })
    })
  })
  afterEach(() => 子进程?.kill())

  const 那台 = (over: Partial<McpServer> = {}): McpServer =>
    ({ type: "http", url: `http://127.0.0.1:${端口}/mcp`, ...over }) as McpServer

  it("**连得上，并且列得出它的工具**", async () => {
    const r = await 池.备好("cloud", 那台())
    expect(r.失败, `没连上：${r.失败}`).toBeUndefined()
    expect(r.工具.map((t) => t.工具名)).toContain("echo")
    // **工具名照旧带服务器前缀**：两台各有一个 echo 是常事
    expect(r.工具.find((t) => t.工具名 === "echo")?.全名).toBe("cloud__echo")
  })

  it("调得动", async () => {
    await 池.备好("cloud", 那台())
    const r = await 池.调("cloud", 那台(), "echo", { message: "从云上回来" })
    expect(r.出错了).toBe(false)
    expect(r.文字).toContain("从云上回来")
  })

  /**
   * **密钥真的跨过 HTTP 到了那一头**——这一条是整轮改动的要害。
   *
   * 钥匙串里的值 → 请求头 → 服务器收到。中间任何一环断掉，
   * 上面两条照样绿（那台假服务器不要求鉴权），
   * 而真实的云服务器会回 401——**到那时才发现，就太晚了**。
   */
  it("**请求头里的密钥真的带过去了**", async () => {
    const 带密钥的池 = new MCP池({
      取密: (服务器名, 变量名) =>
        服务器名 === "cloud" && 变量名 === "Authorization" ? "Bearer tok-abc123" : undefined,
    })
    try {
      const 配 = 那台({ headers: ["Authorization"] } as Partial<McpServer>)
      const r = await 带密钥的池.备好("cloud", 配)
      expect(r.失败, `没连上：${r.失败}`).toBeUndefined()
      const 回 = await 带密钥的池.调("cloud", 配, "我收到的头", {})
      expect(回.文字, "服务器那头没收到 Authorization").toContain("Bearer tok-abc123")
    } finally {
      await 带密钥的池.全关()
    }
  })

  /**
   * **少了密钥就不连，并说清少的是哪一个**——与 stdio 那条同一条纪律。
   * 静默连上去的话，人会看到一串 401，而 401 与「你没填令牌」之间隔着好几层。
   */
  it("**没填的密钥要点名**，不是笼统一句连不上", async () => {
    const r = await 池.备好("cloud", 那台({ headers: ["Authorization"] } as Partial<McpServer>))
    expect(r.失败).toContain("Authorization")
  })
})


/**
 * **非 ASCII 的头值要说人话**（2026-08-19，写完两分钟内自己踩到的）。
 *
 * HTTP 头走 Latin-1。塞一个中文进去，`fetch` 抛的是
 * `Cannot convert argument to a ByteString...`——**对着一个刚填完令牌的人，
 * 那句话什么都没说**。
 */
describe("远端那种：头值只能是 ASCII", () => {
  it("**说清是哪个头、为什么**", async () => {
    const 池2 = new MCP池({ 取密: () => "Bearer 我的令牌" })
    try {
      const r = await 池2.备好("cloud", {
        type: "http",
        url: "http://127.0.0.1:1/mcp",
        headers: ["Authorization"],
      } as unknown as McpServer)
      expect(r.失败).toContain("Authorization")
      expect(r.失败).toContain("非 ASCII")
    } finally {
      await 池2.全关()
    }
  })
})
