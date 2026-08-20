/**
 * ACP 运行时（A1，2026-08-16）。
 *
 * **对着那台假 ACP agent 起真进程**——不是打桩。
 *
 * 理由与假模型服务器一模一样：协议、stdio、NDJSON 分帧、我们的收发、
 * 事件流全是真的，**假的只是「另一端是谁」**。
 * 打桩的话，这一组能证明的只有「我调了我自己写的那个函数」。
 */
import { afterEach, describe, expect, it } from "vitest"
import { join } from "node:path"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { AcpRuntime } from "../../src/runtime/acp/runtime.js"
import type { AgentEvent, SessionSpec } from "../../src/runtime/types.js"

const 假agent = join(import.meta.dirname, "..", "..", "scripts", "fake-acp-agent.mjs")

/** 用当前这个 node 起假 agent。**生产走 `算命令` 里那条 `node` 记号** */
const 起一个 = (env: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  return new AcpRuntime({ commandOf: () => ({ command: process.execPath, args: [假agent] }) })
}

const spec = (id: string): SessionSpec =>
  ({ sessionId: id, agentId: "acp-x", workspace: process.cwd(), sessionDir: process.cwd() }) as SessionSpec

let 关掉: (() => Promise<void>) | undefined
afterEach(async () => {
  await 关掉?.()
  关掉 = undefined
  /**
   * **`FAKE_ACP_` 开头的一律清掉。**
   *
   * 这里原先是一张手打的清单，而它已经漏过两次：
   * A2 加的两个漏过一次（症状是「等不到权限询问」，看起来像功能坏了），
   * 2026-08-17 加 `FAKE_ACP_LIKE_CLAUDE` 时又漏了一次——那次更难查，
   * 因为泄漏出去的用例**单独跑是绿的**，只有整个文件一起跑才红。
   *
   * **一条用例把状态漏给下一条，比它自己红更难查**；
   * 而一张要人记得去加的清单，迟早会有人忘。按前缀扫就不用记了。
   */
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("FAKE_ACP_")) delete process.env[k]
  }
})

/** 收事件，直到某一条出现（或超时）。**超时要说清在等什么** */
function 等到(收: AgentEvent[], 判: (e: AgentEvent) => boolean, 说明: string, ms = 15_000) {
  return new Promise<AgentEvent>((成, 败) => {
    const 到点 = Date.now() + ms
    const 转 = setInterval(() => {
      const 命中 = 收.find(判)
      if (命中) {
        clearInterval(转)
        成(命中)
      } else if (Date.now() > 到点) {
        clearInterval(转)
        败(new Error(`等不到${说明}。收到的是：${收.map((e) => e.kind).join(", ")}`))
      }
    }, 20)
  })
}

describe("整条路", () => {
  it("**起得来、说得上话**：一句话进去，回话流出来", async () => {
    const rt = 起一个()
    const s = spec("a1")
    const 收: AgentEvent[] = []
    // **先 attach 再 start**：`started` 是在 start 里发的，晚一步就收不到
    const h = await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    expect(h.pid).toBeGreaterThan(0)

    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")

    const 话 = await 等到(收, (e) => e.kind === "output" && e.data.includes("假 ACP agent 已应答"), "那句暗号")
    expect(话.kind).toBe("output")

    // **一轮要收口**：账本靠 `idle` 关账，不收口的话那一轮永远开着
    await 等到(收, (e) => e.kind === "idle", "回合收口")
  })

  /** 它说的话要**原样带回来**——证明我们真的把 prompt 送过去了，不是自说自话 */
  it("送过去的话真的到了对面", async () => {
    const rt = 起一个()
    const s = spec("a2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "这句话要回来")
    await 等到(收, (e) => e.kind === "output" && e.data.includes("这句话要回来"), "回声")
  })
})

describe("失败必须出声", () => {
  /**
   * **握手失败是最常见的一种**（多半是没登录），
   * 而它此前唯一的表现方式是「点了没反应」。
   */
  it("initialize 报错时，start 抛出一句人话", async () => {
    const rt = 起一个({ FAKE_ACP_FAIL_INIT: "1" })
    const s = spec("a3")
    await expect(rt.start(s)).rejects.toThrow(/握手失败/)
    关掉 = () => rt.stop(s.sessionId)
  })

  /**
   * **工作目录不在时，说的要是这件事**（2026-08-16 写指纹那条用例时撞出来的）。
   *
   * `spawn` 对「cwd 不存在」报的也是 `ENOENT`，与「命令不存在」一模一样——
   * 不单独判的话，我们会指着一个好端端的命令说它起不来，
   * 而真正的原因是**那个项目文件夹被删了**。人照着那句话去查命令，永远查不出来。
   */
  it("工作目录不在时，说的是目录不在，不是命令起不来", async () => {
    const rt = 起一个()
    const s = { ...spec("a7"), workspace: "/tmp/这个目录肯定不存在-dawn-acp" } as SessionSpec
    await expect(rt.start(s)).rejects.toThrow(/工作目录不在了/)
  })

  /** 命令根本不存在时，要说清是**哪一个命令**起不来 */
  it("适配器起不来时说清是哪个命令", async () => {
    const rt = new AcpRuntime({
      commandOf: () => ({ command: "这个命令肯定不存在-dawn", args: [] }),
    })
    const s = spec("a4")
    await expect(rt.start(s)).rejects.toThrow(/起不来 ACP 适配器「这个命令肯定不存在-dawn」/)
  })
})

describe("token：**累计要变差值**", () => {
  /**
   * **这一条是整组里最容易悄悄错的。**
   *
   * ACP 的 `usage` 是「整个会话累计」（SDK 注释原文
   * `Sum of all token types across session`）。照我们「每轮相加」的记法直接加，
   * 一段十轮的会话会被算成十几倍——那时它连「一个参考」都算不上。
   *
   * 假 agent 每轮各加 12/8，所以三轮之后累计是 36/24，
   * **而我们每轮该报的都是 12/8**。
   */
  it("三轮报三次增量，不是三次累计", async () => {
    const rt = 起一个({ FAKE_ACP_USAGE: "1" })
    const s = spec("a5")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 用量: { input?: number; output?: number }[] = []
    rt.attach(s.sessionId, (e) => {
      if (e.kind === "turn_usage") 用量.push(e.usage)
    })

    for (let i = 0; i < 3; i++) {
      const 收: AgentEvent[] = []
      const 退 = rt.attach(s.sessionId, (e) => 收.push(e))
      rt.write(s.sessionId, `第 ${i} 轮`)
      await 等到(收, (e) => e.kind === "idle", `第 ${i} 轮收口`)
      退()
    }

    expect(用量).toHaveLength(3)
    for (const u of 用量) {
      expect(u.input, `报成了累计值：${JSON.stringify(用量)}`).toBe(12)
      expect(u.output).toBe(8)
    }
  })

  /** **没报就不发**：补一个 0 会让「这一轮没花」与「它不报」变成同一句话 */
  it("适配器不报 usage 时，我们一条都不发", async () => {
    const rt = 起一个()
    const s = spec("a6")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")
    await 等到(收, (e) => e.kind === "idle", "收口")
    expect(收.filter((e) => e.kind === "turn_usage")).toHaveLength(0)
  })
})

/**
 * 权限询问（A2，2026-08-16）。
 *
 * **这是 ACP 相对 `cli` 最实的那个差别**：`cli` 那条我们没有话语权，
 * 只能事后从输出里读它干了什么；ACP 这边它会**停下来问**。
 */
describe("权限：它问，我们答", () => {
  it("**选项原样带上来**——不是我们自己编的一套", async () => {
    const rt = 起一个({ FAKE_ACP_ASK: "1" })
    const s = spec("p1")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下那个 csv")

    const 问 = (await 等到(收, (e) => e.kind === "permission_request", "权限询问")) as Extract<
      AgentEvent,
      { kind: "permission_request" }
    >
    expect(问.title).toContain("观测.csv")
    expect(问.options.map((o) => o.optionId)).toEqual(["yes", "always", "no"])
    // **kind 也要带**：界面据它决定「允许」画成什么样
    expect(问.options[0]?.kind).toBe("allow_once")

    // 答一个，**对方要收到同一个 id**
    rt.answerPermission?.(s.sessionId, 问.requestId, "always")
    const 回声 = await 等到(
      收,
      (e) => e.kind === "output" && e.data.includes("【权限结果】"),
      "它把答案说回来",
    )
    expect((回声 as { data: string }).data).toContain('"optionId":"always"')
    expect((回声 as { data: string }).data).toContain('"outcome":"selected"')
  })

  /** 不给 optionId = 取消。**它与「拒绝」不是一回事**：拒绝是决定，取消是这一轮不做了 */
  it("不给 optionId 就是取消", async () => {
    const rt = 起一个({ FAKE_ACP_ASK: "1" })
    const s = spec("p2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下")
    const 问 = (await 等到(收, (e) => e.kind === "permission_request", "权限询问")) as Extract<
      AgentEvent,
      { kind: "permission_request" }
    >
    rt.answerPermission?.(s.sessionId, 问.requestId)
    const 回声 = await 等到(收, (e) => e.kind === "output" && e.data.includes("【权限结果】"), "答案")
    expect((回声 as { data: string }).data).toContain('"outcome":"cancelled"')
  })

  /**
   * **一个选项都没有时，只能取消，而且要出声。**
   *
   * 摆一张没有按钮的卡等于让人对着它干瞪眼；静默不回它会一直卡着。
   * 两害相权，如实取消并说一句。
   */
  it("它一个选项都不给时，按取消处理并出声", async () => {
    const rt = 起一个({ FAKE_ACP_ASK_NO_OPTIONS: "1" })
    const s = spec("p3")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下")
    await 等到(收, (e) => e.kind === "notice" && e.text.includes("一个选项都没给"), "那句说明")
    // **不该冒出一张空卡**
    expect(收.filter((e) => e.kind === "permission_request")).toHaveLength(0)
    /**
     * **而且这一轮要真的走完。**
     *
     * 第一版只断言那句说明——但静默不回它也会有那句说明，
     * 而对面会一直等（表现是「它卡住了」）。**收口才是「我们真的答了」的证据。**
     */
    await 等到(收, (e) => e.kind === "idle", "这一轮收口（不答的话它会一直卡着）")
  })

  /** 同一个 id 答两次：第二次要被忽略，否则对方会收到两条回复 */
  it("答两次只算一次", async () => {
    const rt = 起一个({ FAKE_ACP_ASK: "1" })
    const s = spec("p4")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "读一下")
    const 问 = (await 等到(收, (e) => e.kind === "permission_request", "权限询问")) as Extract<
      AgentEvent,
      { kind: "permission_request" }
    >
    rt.answerPermission?.(s.sessionId, 问.requestId, "yes")
    rt.answerPermission?.(s.sessionId, 问.requestId, "no")
    const 回声 = await 等到(收, (e) => e.kind === "output" && e.data.includes("【权限结果】"), "答案")
    expect((回声 as { data: string }).data).toContain('"optionId":"yes"')
    /**
     * **判据要盯「对面收到了什么」，不是「我们这边看起来正常」。**
     *
     * 第一版只断言「回声只有一条」——而假 agent 对一条 id 对不上的回复
     * 本来就静静丢掉，于是把去重删掉之后用例照样绿（变异测试当场抓到）。
     * 现在假 agent 会把「意外的回复」说出来，那才是协议违规的事实形式。
     */
    await new Promise((r) => setTimeout(r, 300))
    expect(收.filter((e) => e.kind === "output" && e.data.includes("【权限结果】"))).toHaveLength(1)
    expect(
      收.filter((e) => e.kind === "output" && e.data.includes("【意外的回复】")),
      "同一个询问被答了两次——对面收到了两条回复",
    ).toHaveLength(0)
  })
})

/**
 * 会话开关（A3，2026-08-16）。
 *
 * **ACP 里没有「换模型」这个操作**——它有的是一串 `configOptions`，
 * 每一条是「选一个」或「开/关」，而「模型」只是 `category` 的一个取值。
 * 规范里专门写着：**category 是给 UX 用的，客户端必须优雅处理未知或缺失的**。
 */
describe("会话开关", () => {
  it("**照单全收**：三条不同形状都要认得", async () => {
    const rt = 起一个()
    const s = spec("c1")
    const 收: AgentEvent[] = []
    // start 里就会发一条，所以要先挂上——**它比 `started` 还早**
    const 原start = rt.start.bind(rt)
    const p = 原start(s)
    await p
    关掉 = () => rt.stop(s.sessionId)
    rt.attach(s.sessionId, (e) => 收.push(e))
    // 触发一次广播：改一个开关，回复里带整份新的
    await rt.setConfigOption?.(s.sessionId, "yolo", "1")

    /**
     * **要最后一条，不是第一条。**
     *
     * `attach` 会**补发当前状态**（A3 修那个「新订阅者收不到当前状态」的洞时加的），
     * 所以挂上监听的那一刻就有一条——那是**改之前**的。
     * 只取第一条的话，这条用例验的是初始值，而不是「改成功了」。
     */
    await 等到(收, (e) => e.kind === "config_options", "开关")
    const 全部 = 收.filter((e) => e.kind === "config_options")
    const 事 = 全部[全部.length - 1] as Extract<AgentEvent, { kind: "config_options" }>
    const 表 = new Map(事.options.map((o) => [o.id, o]))
    expect([...表.keys()]).toEqual(["model", "thought", "yolo"])

    // ① select：可选项与当前值
    expect(表.get("model")?.kind).toBe("select")
    expect(表.get("model")?.options.map((o) => o.value)).toEqual(["sonnet", "opus"])
    expect(表.get("model")?.category).toBe("model")

    /**
     * ② **分组要摊平**。ACP 的 select 可选项可以是 `Option[]` 也可以是
     * `Group[]`——不摊的话那一条会变成一个没有选项的空菜单，
     * 而空菜单与「它没给选项」在屏幕上一模一样。
     */
    expect(表.get("thought")?.options.map((o) => o.value)).toEqual(["low", "high"])

    // ③ boolean：`currentValue` 是真布尔，统一成字符串
    expect(表.get("yolo")?.kind).toBe("boolean")
    expect(表.get("yolo")?.current, "boolean 的线上形状没转对").toBe("1")
  })

  it("改一个 select，广播里是新值", async () => {
    const rt = 起一个()
    const s = spec("c2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    await rt.setConfigOption?.(s.sessionId, "model", "opus")
    // 同上：`attach` 补发的那一条是改之前的，要看最后一条
    await 等到(收, (e) => e.kind === "config_options", "开关")
    const 全部 = 收.filter((e) => e.kind === "config_options")
    const 事 = 全部[全部.length - 1] as Extract<AgentEvent, { kind: "config_options" }>
    expect(事.options.find((o) => o.id === "model")?.current).toBe("opus")
  })

  /**
   * **一个开关都没有时不发**——上层据此决定「不画那个菜单」。
   *
   * **这条在单元这一层只覆盖「开会话之后」的广播。**
   * 开会话那一次是在 `start()` 里面发的，而用例只能在 `start()`
   * **之后**才挂得上监听——变异测试当场证明了这一点：
   * 把「有才发」改成「一律发」，这条照样绿。
   * 「开会话时不该冒出空菜单」由 e2e 那条（看界面上有没有那颗按钮）盯着。
   */
  it("开完会话之后，适配器不给开关就一条都不发", async () => {
    const rt = 起一个({ FAKE_ACP_NO_CONFIG: "1" })
    const s = spec("c3")
    const 收: AgentEvent[] = []
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")
    await 等到(收, (e) => e.kind === "idle", "收口")
    expect(收.filter((e) => e.kind === "config_options")).toHaveLength(0)
  })
})

/**
 * **不给 `configOptions` 的适配器**（2026-08-17，拿真的量出来的）。
 *
 * `@zed-industries/claude-code-acp` 0.16.2 只给 `models` 与 `modes`，
 * 而 `session/set_config_option` 在它那儿是 `-32601 Method not found`。
 * 不合成的话，真 claude 接进来**模型与模式菜单是空的**——
 * 而空菜单看起来像「这个 agent 不让换模型」，不像「我们没读那个字段」。
 */
describe("适配器只给 models / modes 时", () => {
  it("**合成两个开关**，模型与模式都出得来", async () => {
    const rt = 起一个({ FAKE_ACP_LIKE_CLAUDE: "1" })
    const s = spec("m1")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    await 等到(收, (e) => e.kind === "config_options", "开关")
    const 事 = 收.filter((e) => e.kind === "config_options").at(-1) as Extract<
      AgentEvent,
      { kind: "config_options" }
    >
    const 表 = new Map(事.options.map((o) => [o.category, o]))

    /**
     * **模型用 `modelId`，模式用 `id`。** 这一处不对称是真适配器里量出来的；
     * 写成一样的话模型那一支会全军覆没（每项都少了 value），
     * 而表现是「菜单是空的」——与「它不让换模型」在屏幕上没有区别。
     */
    expect(表.get("model")?.options.map((o) => o.value)).toEqual(["default", "haiku"])
    expect(表.get("mode")?.options.map((o) => o.value)).toEqual(["default", "acceptEdits"])
    expect(表.get("model")?.current).toBe("default")
    expect(表.get("mode")?.current).toBe("default")
  })

  it("改模型走 `session/set_model`，而且当前值真的变了", async () => {
    const rt = 起一个({ FAKE_ACP_LIKE_CLAUDE: "1" })
    const s = spec("m2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    const 那个 = (收.find((e) => e.kind === "config_options") as Extract<
      AgentEvent,
      { kind: "config_options" }
    >).options.find((o) => o.category === "model")!
    await rt.setConfigOption?.(s.sessionId, 那个.id, "haiku")
    const 事 = 收.filter((e) => e.kind === "config_options").at(-1) as Extract<
      AgentEvent,
      { kind: "config_options" }
    >
    /**
     * 这条路与原生那条有一处实质不同：**它回的是空的 `{}`**，
     * 不带整份新开关。所以当前值得我们自己改——不改的话菜单会弹回旧值，
     * 看起来像「点了没生效」。
     */
    expect(事.options.find((o) => o.category === "model")?.current).toBe("haiku")
  })

  it("改模式走 `session/set_mode`", async () => {
    const rt = 起一个({ FAKE_ACP_LIKE_CLAUDE: "1" })
    const s = spec("m3")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    const 那个 = (收.find((e) => e.kind === "config_options") as Extract<
      AgentEvent,
      { kind: "config_options" }
    >).options.find((o) => o.category === "mode")!
    await rt.setConfigOption?.(s.sessionId, 那个.id, "acceptEdits")
    const 事 = 收.filter((e) => e.kind === "config_options").at(-1) as Extract<
      AgentEvent,
      { kind: "config_options" }
    >
    expect(事.options.find((o) => o.category === "mode")?.current).toBe("acceptEdits")
  })

  /**
   * **按支补，不是全有全无。**
   *
   * 真 codex（1.4.0）`configOptions` 里 `model` 与 `mode` 两个 category 都有，
   * 于是它那儿一个都不合成。这台假 agent 有 model 没有 mode——
   * 正好用来钉住「一支一支地看」：
   *
   * - 已经有 model 了还合成一个 → 菜单里**两个模型菜单**，
   *   而「两处长得一样的东西，等于没有判据」；
   * - 缺 mode 却不补 → 那一支的菜单是空的。
   */
  it("已有的那一支不合成，缺的那一支照补", async () => {
    const rt = 起一个()
    const s = spec("m4")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    const 事 = 收.find((e) => e.kind === "config_options") as Extract<
      AgentEvent,
      { kind: "config_options" }
    >
    // 已经有 model 了：不再多一个
    expect(事.options.filter((o) => o.category === "model")).toHaveLength(1)
    expect(事.options.find((o) => o.category === "model")?.id).toBe("model")
    // 这台假 agent 的 configOptions 里没有 mode 那一支：补上
    expect(事.options.map((o) => o.id)).toEqual(["model", "thought", "yolo", "__dawn_mode"])
  })

  /**
   * **换了模型，后面的 token 要记在新的那个头上**（A4）。
   * 合成那条路是我们自己改当前值的，最容易漏掉这一步。
   */
  it("合成的模型开关也参与「用量记在谁头上」", async () => {
    const rt = 起一个({ FAKE_ACP_LIKE_CLAUDE: "1", FAKE_ACP_USAGE: "1" })
    const s = spec("m5")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    const 那个 = (收.find((e) => e.kind === "config_options") as Extract<
      AgentEvent,
      { kind: "config_options" }
    >).options.find((o) => o.category === "model")!
    await rt.setConfigOption?.(s.sessionId, 那个.id, "haiku")
    rt.write(s.sessionId, "在吗")
    await 等到(收, (e) => e.kind === "turn_usage", "用量")
    const 用 = 收.find((e) => e.kind === "turn_usage") as Extract<
      AgentEvent,
      { kind: "turn_usage" }
    >
    expect(用.model).toMatch(/\/haiku$/)
  })
})

/**
 * 会话恢复（A3 之三，2026-08-16）。
 *
 * **四种情形，各自要有各自的说法**——这一组的价值全在这句话上：
 *   ① 支持 + 指纹对得上 → 接回去
 *   ② **它不支持** → 直接新开，**不要说成「失败」**
 *      （「不支持」是它本来就没这个能力，「失败」是出了问题）
 *   ③ 指纹变了（人改了配置里的 command）→ 新开 **+ 说清楚为什么**
 *   ④ load 真的失败 → 新开 **+ 把原因摆出来**
 *
 * 静默重开的表现是「我上次聊的东西呢」，而那时人会以为是我们把历史弄丢了。
 */
describe("会话恢复", () => {
  const 起带凭据 = (
    prior: { acpSessionId: string; fingerprint: string } | undefined,
    env: Record<string, string> = {},
  ) => {
    for (const [k, v] of Object.entries(env)) process.env[k] = v
    const 记下: { id: string; fp: string }[] = []
    const rt = new AcpRuntime({
      commandOf: () => ({ command: process.execPath, args: [假agent] }),
      ...(prior ? { priorOf: () => prior } : {}),
      onSessionId: (_s, id, fp) => 记下.push({ id, fp }),
    })
    return { rt, 记下 }
  }

  it("**指纹对得上、它也支持 → 真的接回去**", async () => {
    const s = spec("r1")
    const 指纹 = AcpRuntime.指纹({ command: process.execPath, args: [假agent] }, s.workspace)
    const { rt } = 起带凭据({ acpSessionId: "上一段", fingerprint: 指纹 }, { FAKE_ACP_CAN_LOAD: "1" })
    const 收: AgentEvent[] = []
    /**
     * **先发起 start，再立刻挂监听，最后才 await。**
     *
     * 接回/接不上那几句话都是在 `start()` **里面**发的，
     * `await` 之后再挂就晚了——这几条第一版全是这么红的，
     * 报的是「等不到那句话」，看起来像功能没实现。
     * 段是在 `start()` 第一拍同步建好的，所以这样挂得上。
     *
     * 「不支持时不出声」那条也用同一副写法：**挂得早，才证明得了「一句都没说」**。
     */
    const 起 = rt.start(s)
    rt.attach(s.sessionId, (e) => 收.push(e))
    await 起
    关掉 = () => rt.stop(s.sessionId)
    rt.write(s.sessionId, "在吗")
    // 那句痕迹是假 agent 在 `session/load` 里留的
    await 等到(收, (e) => e.kind === "output" && e.data.includes("【接回了上一段】"), "接回的痕迹")
  })

  /**
   * **它不支持时，一句话都不该说。**
   * 把「不支持」说成「接不回」是误导——前者是它本来就没这个能力。
   */
  it("它不支持 load 时，直接新开且不抱怨", async () => {
    const s = spec("r2")
    const 指纹 = AcpRuntime.指纹({ command: process.execPath, args: [假agent] }, s.workspace)
    const { rt } = 起带凭据({ acpSessionId: "上一段", fingerprint: 指纹 })
    const 收: AgentEvent[] = []
    /**
     * **先发起 start，再立刻挂监听，最后才 await。**
     *
     * 接回/接不上那几句话都是在 `start()` **里面**发的，
     * `await` 之后再挂就晚了——这几条第一版全是这么红的，
     * 报的是「等不到那句话」，看起来像功能没实现。
     * 段是在 `start()` 第一拍同步建好的，所以这样挂得上。
     *
     * 「不支持时不出声」那条也用同一副写法：**挂得早，才证明得了「一句都没说」**。
     */
    const 起 = rt.start(s)
    rt.attach(s.sessionId, (e) => 收.push(e))
    await 起
    关掉 = () => rt.stop(s.sessionId)
    rt.write(s.sessionId, "在吗")
    await 等到(收, (e) => e.kind === "idle", "收口")
    expect(收.filter((e) => e.kind === "notice"), "不支持不是失败，不该出声").toHaveLength(0)
  })

  /** 人改了配置里的 command：**不许硬接**，而且要说清楚为什么 */
  it("指纹变了就不接，并说清楚", async () => {
    const s = spec("r3")
    const { rt } = 起带凭据(
      { acpSessionId: "上一段", fingerprint: "另一台适配器的指纹" },
      { FAKE_ACP_CAN_LOAD: "1" },
    )
    const 收: AgentEvent[] = []
    /**
     * **先发起 start，再立刻挂监听，最后才 await。**
     *
     * 接回/接不上那几句话都是在 `start()` **里面**发的，
     * `await` 之后再挂就晚了——这几条第一版全是这么红的，
     * 报的是「等不到那句话」，看起来像功能没实现。
     * 段是在 `start()` 第一拍同步建好的，所以这样挂得上。
     *
     * 「不支持时不出声」那条也用同一副写法：**挂得早，才证明得了「一句都没说」**。
     */
    const 起 = rt.start(s)
    rt.attach(s.sessionId, (e) => 收.push(e))
    await 起
    关掉 = () => rt.stop(s.sessionId)
    rt.write(s.sessionId, "在吗")
    const 说 = (await 等到(
      收,
      (e) => e.kind === "notice" && e.text.includes("启动命令与上次不同"),
      "那句说明",
    )) as { text: string }
    expect(说.text).toContain("新开了一段")
  })

  /** load 真的失败：**把原因摆出来**，不要静默重开 */
  it("接不上时说清原因", async () => {
    const s = spec("r4")
    const 指纹 = AcpRuntime.指纹({ command: process.execPath, args: [假agent] }, s.workspace)
    const { rt } = 起带凭据(
      { acpSessionId: "上一段", fingerprint: 指纹 },
      { FAKE_ACP_CAN_LOAD: "1", FAKE_ACP_LOAD_FAILS: "1" },
    )
    const 收: AgentEvent[] = []
    /**
     * **先发起 start，再立刻挂监听，最后才 await。**
     *
     * 接回/接不上那几句话都是在 `start()` **里面**发的，
     * `await` 之后再挂就晚了——这几条第一版全是这么红的，
     * 报的是「等不到那句话」，看起来像功能没实现。
     * 段是在 `start()` 第一拍同步建好的，所以这样挂得上。
     *
     * 「不支持时不出声」那条也用同一副写法：**挂得早，才证明得了「一句都没说」**。
     */
    const 起 = rt.start(s)
    rt.attach(s.sessionId, (e) => 收.push(e))
    await 起
    关掉 = () => rt.stop(s.sessionId)
    rt.write(s.sessionId, "在吗")
    await 等到(
      收,
      (e) => e.kind === "notice" && e.text.includes("接不回上一段") && e.text.includes("被要求在 load 时失败"),
      "接不上的原因",
    )
    // **仍然要能说话**：接不上不等于这一段废了
    await 等到(收, (e) => e.kind === "output" && e.data.includes("假 ACP agent 已应答"), "新开的那段能用")
  })

  /** **一拿到就落库**：进程随时会退，留在内存里等于随时会丢 */
  it("会话 id 与指纹一起交出去", async () => {
    /**
     * **工作目录要挑一个「不会碰巧出现在命令里」的。**
     *
     * 第一版用的是默认的 `process.cwd()`——而假 agent 的路径就在它下面，
     * 于是「指纹里有没有工作目录」这条断言**永远成立**：
     * 把 workspace 从指纹里删掉，用例照样绿（变异测试抓到的）。
     */
    const s = { ...spec("r5"), workspace: tmpdir() } as SessionSpec
    const { rt, 记下 } = 起带凭据(undefined)
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    expect(记下).toHaveLength(1)
    expect(记下[0]?.id).toMatch(/^fake-acp-/)
    expect(记下[0]?.fp, "指纹要带上工作目录").toContain(s.workspace)
  })
})

/**
 * token 记在谁头上（A4，2026-08-16）。
 *
 * ## 为什么不是「模型」而是「agent/模型」
 *
 * ACP 那边**模型是一个可选的开关**——很多适配器压根不报。
 * 只写模型名的话，不报的那些会全部挤进同一格「未记录」，
 * 而它们其实是**不同的 agent**（claude-acp 与 codex-acp 花的不是一回事）。
 */
describe("用量记在谁头上", () => {
  const 起带名 = (agentId: string | undefined, env: Record<string, string> = {}) => {
    for (const [k, v] of Object.entries(env)) process.env[k] = v
    return new AcpRuntime({
      commandOf: () => ({ command: process.execPath, args: [假agent] }),
      ...(agentId ? { agentIdOf: () => agentId } : {}),
    })
  }

  it("**有模型开关时是 `agent/模型`**", async () => {
    const rt = 起带名("claude-acp", { FAKE_ACP_USAGE: "1" })
    const s = spec("u1")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")
    const u = (await 等到(收, (e) => e.kind === "turn_usage", "用量")) as Extract<
      AgentEvent,
      { kind: "turn_usage" }
    >
    expect(u.model).toBe("claude-acp/sonnet")
  })

  /** **换了模型，后面的账就记在新的那个头上** */
  it("换模型之后，记的是新的", async () => {
    const rt = 起带名("claude-acp", { FAKE_ACP_USAGE: "1" })
    const s = spec("u2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    await rt.setConfigOption?.(s.sessionId, "model", "opus")
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")
    const u = (await 等到(收, (e) => e.kind === "turn_usage", "用量")) as Extract<
      AgentEvent,
      { kind: "turn_usage" }
    >
    expect(u.model).toBe("claude-acp/opus")
  })

  /**
   * **它不报模型时，仍然要有一个名字**。
   * 退回 agent 名不是编造——我们确实只知道这么多。
   */
  it("没有模型开关时，退回 agent 名", async () => {
    const rt = 起带名("codex-acp", { FAKE_ACP_USAGE: "1", FAKE_ACP_NO_CONFIG: "1" })
    const s = spec("u3")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "在吗")
    const u = (await 等到(收, (e) => e.kind === "turn_usage", "用量")) as Extract<
      AgentEvent,
      { kind: "turn_usage" }
    >
    expect(u.model).toBe("codex-acp")
  })
})

describe("客户端的手（T1）", () => {
  /** 用一个临时目录当工作区：假 agent 要在里面读、写 */
  const 带工作区 = (id: string) => {
    const 工作区 = mkdtempSync(join(tmpdir(), "dawn-acp-hands-"))
    writeFileSync(join(工作区, "手-读.txt"), "读到了")
    return { s: { ...spec(id), workspace: 工作区 } as SessionSpec, 工作区 }
  }

  it("**握手声明了 fs 与 terminal**，假 agent 七个方法各调一次都有回音", async () => {
    const rt = 起一个({ FAKE_ACP_USE_HANDS: "1" })
    const { s, 工作区 } = 带工作区("h1")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "用手")
    await 等到(收, (e) => e.kind === "idle", "回合收口")
    const 话 = 收
      .filter((e): e is Extract<AgentEvent, { kind: "output" }> => e.kind === "output")
      .map((e) => e.data)
      .join("")

    expect(话).not.toContain("客户端没声明")
    expect(话).toContain('【手·读】{"result":{"content":"读到了"}}')
    expect(话).toContain('【手·写】{"result":{}}')
    expect(readFileSync(join(工作区, "手-写.txt"), "utf8")).toBe("假 agent 写的")
    // 越界：code 要是 -32602，且话里有那条路径
    expect(话).toMatch(/【手·越界】\{"error":\{"code":-32602,"message":"[^"]*dawn-不给写/)
    expect(话).toMatch(/【手·开】\{"result":\{"terminalId":"t\d+"\}\}/)
    expect(话).toContain('【手·退】{"result":{"exitCode":0}}')
    expect(话).toContain('"output":"终端通了","truncated":false,"exitStatus":{"exitCode":0}')
    expect(话).toContain('【手·放】{"result":{}}')
  })

  it("session/new 带上 `_meta.claudeCode.options.disallowedTools`", async () => {
    const rt = 起一个({ FAKE_ACP_ECHO_NEW_PARAMS: "1" })
    const s = spec("h2")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "看参数")
    const 话 = await 等到(
      收,
      (e) => e.kind === "output" && e.data.includes("【session/new 参数】"),
      "假 agent 复述参数",
    )
    expect(话.kind === "output" && 话.data).toContain('"disallowedTools":["Grep","Glob","NotebookEdit"]')
  })
})
