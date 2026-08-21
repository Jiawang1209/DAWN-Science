/**
 * 微信通道（远程助理 T2）：假微信 × 假后端操作。
 * 验的是这一层自己的决定：只认扫码那个人、斜杠命令、专属会话、最终回答送回去、-14 停轮询。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { startFakeIlinkServer, FAKE_BOT_TOKEN, FAKE_USER_ID } from "../../scripts/fake-ilink-server.mjs"
import { IlinkClient } from "../../src/channels/weixin/ilink.js"
import { WeixinChannel, WEIXIN_TOKEN_KEY, type WeixinDeps, type WeixinOps } from "../../src/channels/weixin/channel.js"
import type { SessionUpdate } from "../../src/protocol/events.js"
import type { TaskSummary } from "../../src/protocol/entities.js"

let s: Awaited<ReturnType<typeof startFakeIlinkServer>>
beforeAll(async () => {
  s = await startFakeIlinkServer({ longPollMs: 200 })
})
afterAll(() => s.close())

function 假世界() {
  const 设置 = new Map<string, string>()
  const 秘密 = new Map<string, string>()
  const 听众 = new Set<(u: SessionUpdate) => void>()
  const 全听 = new Set<(u: SessionUpdate) => void>()
  const 钉住的 = new Set<string>()
  const tasks: TaskSummary[] = []
  const 写了: { sessionId: string; data: string }[] = []
  const 中止了: string[] = []
  const 答了: { sessionId: string; requestId: string; optionId?: string }[] = []
  let 前台 = false
  let 现在 = 1_000_000
  let n = 0
  const ops: WeixinOps = {
    createTask: async ({ agentId, connectionId, workspace }) => {
      n += 1
      const t: TaskSummary = {
        taskId: `t${n}`,
        sessionId: `s${n}`,
        title: `会话${n}`,
        pinned: false,
        sortOrder: n,
        createdAt: new Date(2026, 7, 21, 0, n).toISOString(),
        ...(connectionId ? { connectionId } : {}),
        ...(workspace ? { workspace } : {}),
      }
      void agentId
      tasks.push(t)
      return t
    },
    listTasks: async () => tasks,
    listConnections: async () => [{ id: "c1", label: "实验室" }],
    writeToSession: async (r) => void 写了.push(r),
    abortSession: async ({ sessionId }) => void 中止了.push(sessionId),
    subscribeSession: async () => ({}),
    acquireLease: async () => ({}),
    answerPermission: async (r) => void 答了.push(r),
    listProjects: async () => [{ projectId: "p1", name: "生态中心", workspace: "/Users/u/Applied-Ecology" }],
  }
  const deps: WeixinDeps = {
    client: (baseUrl) => new IlinkClient({ baseUrl: baseUrl ?? s.url, qrBaseUrl: s.url, cdnBaseUrl: `${s.url}/c2c` }),
    settings: { get: (k) => 设置.get(k), set: (k, v) => (v ? 设置.set(k, v) : 设置.delete(k)) },
    credentials: { get: (k) => 秘密.get(k), set: (k, v) => void 秘密.set(k, v), delete: (k) => void 秘密.delete(k) },
    events: {
      onUpdate: (cb) => {
        听众.add(cb)
        return () => 听众.delete(cb)
      },
      onAnyUpdate: (cb) => {
        全听.add(cb)
        return () => 全听.delete(cb)
      },
      pin: (id) => void 钉住的.add(id),
      unpin: (id) => void 钉住的.delete(id),
    },
    isForeground: () => 前台,
    now: () => 现在,
    ops: () => ops,
    defaultAgentId: () => "ds-chat",
    whereIs: (id) => (tasks.find((t) => t.sessionId === id)?.connectionId ? { label: "实验室", cwd: "/home/u/proj" } : undefined),
  }
  const 已绑 = () => {
    秘密.set(WEIXIN_TOKEN_KEY, FAKE_BOT_TOKEN)
    设置.set("weixin.botId", "fakebot@im.bot")
    设置.set("weixin.userId", FAKE_USER_ID)
    设置.set("weixin.baseUrl", s.url)
  }
  const 广播 = (u: SessionUpdate) => {
    for (const cb of 全听) cb(u)
    for (const cb of 听众) cb(u)
  }
  const 会话说 = (sessionId: string, text: string, final = true, who: "agent" | "user" = "agent") =>
    广播({ workbenchProtocolVersion: "7.14", sessionId, revision: 1, type: "item", item: { type: "turn", id: "i1", who, text, final } } as unknown as SessionUpdate)
  const 会话退出 = (sessionId: string, exitCode: number) =>
    广播({ workbenchProtocolVersion: "7.14", sessionId, revision: 1, type: "state", state: "exited", exitCode } as unknown as SessionUpdate)
  const 会话问权限 = (sessionId: string, requestId: string, title: string) =>
    广播({
      workbenchProtocolVersion: "7.14",
      sessionId,
      revision: 1,
      type: "snapshot",
      snapshot: {
        pendingPermission: { requestId, title, options: [{ optionId: "a", name: "允许", kind: "allow_once" }, { optionId: "r", name: "拒绝", kind: "reject_once" }] },
      },
    } as unknown as SessionUpdate)
  return { deps, 设置, 秘密, tasks, 写了, 中止了, 答了, 钉住的, 已绑, 会话说, 会话退出, 会话问权限, 设前台: (v: boolean) => (前台 = v), 走时: (ms: number) => (现在 += ms) }
}

const 等到 = async (f: () => boolean | Promise<boolean>, 说明: string, ms = 3000) => {
  const 起 = Date.now()
  while (Date.now() - 起 < ms) {
    if (await f()) return
    await new Promise((r) => setTimeout(r, 30))
  }
  throw new Error(`等超时：${说明}`)
}

beforeEach(async () => {
  // 上一条用例停掉的通道可能还有一个长轮询在路上——等它过去，免得它把这条的消息吞了
  await new Promise((r) => setTimeout(r, 300))
  await fetch(`${s.url}/__fake/reset`, { method: "POST" })
})

describe("绑定", () => {
  it("扫码走到确认：token 进钥匙串、id 进设置、状态变 bound、轮询自己起来", async () => {
    const w = 假世界()
    const ch = new WeixinChannel(w.deps)
    try {
    expect(ch.status().state).toBe("unbound")
    await ch.startLogin()
    expect(ch.status()).toMatchObject({ state: "logging_in", login: { step: "wait" } })
    expect(ch.status().login?.qrUrl).toContain("fake.weixin")
    await s.推进扫码("scan")
    await 等到(() => ch.status().login?.step === "scaned", "已扫")
    await s.推进扫码("need_code")
    await 等到(() => ch.status().login?.step === "need_verifycode", "要配对码")
    ch.submitVerifyCode("0000")
    await 等到(() => ch.status().login?.step === "verify_code_wrong", "码错了要说")
    ch.submitVerifyCode("1234")
    await s.推进扫码("confirm")
    // 扫码循环每步歇 1 s，几步下来要几秒
    await 等到(() => ch.status().state === "bound", "绑好", 10_000)
    expect(w.秘密.get(WEIXIN_TOKEN_KEY)).toBe(FAKE_BOT_TOKEN)
    expect(w.设置.get("weixin.userId")).toBe(FAKE_USER_ID)
    // 绑好就开始听：塞一条，它会建专属会话并写进去
    await s.发来("你好")
    await 等到(() => w.写了.length === 1, "写进会话")
    expect(w.写了[0]).toMatchObject({ data: "你好", sessionId: "s1" })
    expect(ch.status().sessionId).toBe("s1")
    } finally {
      // **失败也要停**：不停的话它的轮询会把后面用例的消息吃掉
      ch.cancelLogin()
      ch.stop()
    }
  })
})

describe("收与发", () => {
  it("**只认扫码那个人**：别人的话不写进会话、不回", async () => {
    const w = 假世界()
    w.已绑()
    const ch = new WeixinChannel(w.deps)
    ch.start()
    await s.发来("我是谁", { from: "stranger@im.wechat" })
    await s.发来("我是主人")
    await 等到(() => w.写了.length === 1, "只写了主人那条")
    expect(w.写了[0]!.data).toBe("我是主人")
    expect(await s.发出的()).toHaveLength(0)
    ch.stop()
  })

  it("会话的最终回答送回微信，带着最近一条的 context_token；非最终的不发", async () => {
    const w = 假世界()
    w.已绑()
    const ch = new WeixinChannel(w.deps)
    ch.start()
    await s.发来("问一句", { context_token: "CTX-9" })
    await 等到(() => w.写了.length === 1, "写进去")
    const sid = w.设置.get("weixin.sessionId")!
    w.会话说(sid, "还在想", false)
    w.会话说(sid, "答：42")
    await 等到(async () => (await s.发出的()).length === 1, "回到微信")
    const 发 = await s.发出的()
    expect(发[0]).toMatchObject({ to_user_id: FAKE_USER_ID, context_token: "CTX-9", item_list: [{ type: 1, text_item: { text: "答：42" } }] })
    // 别的会话说话不发
    w.会话说("别的会话", "不该发")
    await new Promise((r) => setTimeout(r, 150))
    expect(await s.发出的()).toHaveLength(1)
    ch.stop()
  })

  it("-14 → 停轮询、状态 stale、错误说清要重新扫码", async () => {
    const w = 假世界()
    w.已绑()
    const ch = new WeixinChannel(w.deps)
    ch.start()
    await s.让失效()
    await 等到(() => ch.status().state === "stale", "变 stale")
    expect(ch.status().lastError).toMatch(/重新扫码/)
  })
})

describe("斜杠命令", () => {
  it("/会话 /用 /新建 @服务器 /停 /在哪 /帮助 各回各的；不认识的原样进模型", async () => {
    const w = 假世界()
    w.已绑()
    const ch = new WeixinChannel(w.deps)
    ch.start()
    const 回了 = async (n: number) => 等到(async () => (await s.发出的()).length >= n, `回了第 ${n} 条`)
    const 最后 = async () => ((await s.发出的()).at(-1) as { item_list: { text_item: { text: string } }[] }).item_list[0]!.text_item.text

    await s.发来("/会话")
    await 回了(1)
    expect(await 最后()).toContain("还没有会话")

    await s.发来("/新建 @实验室")
    await 回了(2)
    expect(await 最后()).toContain("实验室")
    expect(w.tasks[0]).toMatchObject({ connectionId: "c1" })

    await s.发来("/新建")
    await 回了(3)
    await s.发来("/会话")
    await 回了(4)
    expect(await 最后()).toMatch(/▶ 1\. 会话2[\s\S]*2\. 会话1 ·服务器/)

    await s.发来("/用 2")
    await 回了(5)
    expect(await 最后()).toContain("会话1")
    expect(w.设置.get("weixin.sessionId")).toBe("s1")

    await s.发来("/在哪")
    await 回了(6)
    expect(await 最后()).toMatch(/会话1[\s\S]*实验室[\s\S]*\/home\/u\/proj/)

    await s.发来("/停")
    await 回了(7)
    expect(w.中止了).toEqual(["s1"])

    await s.发来("/用 99")
    await 回了(8)
    expect(await 最后()).toContain("没有第 99 段")

    await s.发来("/帮助")
    await 回了(9)
    expect(await 最后()).toContain("/用 N")

    await s.发来("/什么鬼 参数")
    await 等到(() => w.写了.some((x) => x.data === "/什么鬼 参数"), "不认识的原样进模型")
    expect(w.写了.at(-1)!.sessionId).toBe("s1")

    // 换会话时旧的解钉、新的钉上
    expect([...w.钉住的]).toEqual(["s1"])
    ch.stop()
  })
})

describe("解绑", () => {
  it("清掉钥匙串与设置、停轮询、状态回 unbound", async () => {
    const w = 假世界()
    w.已绑()
    const ch = new WeixinChannel(w.deps)
    ch.start()
    await ch.unbind()
    expect(w.秘密.has(WEIXIN_TOKEN_KEY)).toBe(false)
    expect(w.设置.get("weixin.botId")).toBeUndefined()
    expect(ch.status().state).toBe("unbound")
    vi.restoreAllMocks()
  })
})

describe("通知（T3）", () => {
  const 最后 = async () => ((await s.发出的()).at(-1) as { item_list: { text_item: { text: string } }[] }).item_list[0]!.text_item.text
  const 发了几条 = async () => (await s.发出的()).length

  it("跑完：这一轮超过 60 s 才推，带标题与用时；绑着的那段不推（回答本身会过去）", async () => {
    const w = 假世界()
    w.已绑()
    await w.deps.ops().createTask({ agentId: "x" }) // s1 会话1
    const ch = new WeixinChannel(w.deps)
    ch.start()
    w.会话说("s1", "问", true, "user")
    w.走时(10_000)
    w.会话说("s1", "短答")
    await new Promise((r) => setTimeout(r, 150))
    expect(await 发了几条()).toBe(0)
    w.会话说("s1", "再问", true, "user")
    w.走时(125_000)
    w.会话说("s1", "长答")
    await 等到(async () => (await 发了几条()) === 1, "推了跑完")
    expect(await 最后()).toMatch(/『会话1』跑完了（用时 2 分 5 秒）/)
    // 绑着的那段：不再推「跑完」
    w.设置.set("weixin.sessionId", "s1")
    w.会话说("s1", "问", true, "user")
    w.走时(125_000)
    w.会话说("s1", "答")
    await 等到(async () => (await 发了几条()) === 2, "回答送过去")
    expect(await 最后()).toBe("答")
    ch.stop()
  })

  it("出错：非零退出码推；窗口在前台时不推（等权限除外）", async () => {
    const w = 假世界()
    w.已绑()
    await w.deps.ops().createTask({ agentId: "x" })
    const ch = new WeixinChannel(w.deps)
    ch.start()
    w.会话退出("s1", 1)
    await 等到(async () => (await 发了几条()) === 1, "推了出错")
    expect(await 最后()).toMatch(/『会话1』出错退出了（退出码 1）/)
    w.设前台(true)
    w.会话退出("s1", 2)
    await new Promise((r) => setTimeout(r, 150))
    expect(await 发了几条()).toBe(1)
    w.会话问权限("s1", "req1", "运行 rm -rf build")
    await 等到(async () => (await 发了几条()) === 2, "等权限照推")
    expect(await 最后()).toMatch(/想：运行 rm -rf build[\s\S]*同意/)
    ch.stop()
  })

  it("微信里回「同意」→ answerPermission 选 allow_once；同一问不推两次；回「拒绝」选 reject", async () => {
    const w = 假世界()
    w.已绑()
    await w.deps.ops().createTask({ agentId: "x" })
    const ch = new WeixinChannel(w.deps)
    ch.start()
    w.会话问权限("s1", "req1", "写文件 a.txt")
    w.会话问权限("s1", "req1", "写文件 a.txt")
    await 等到(async () => (await 发了几条()) === 1, "推了一次")
    await s.发来("同意")
    await 等到(() => w.答了.length === 1, "答了")
    expect(w.答了[0]).toEqual({ sessionId: "s1", requestId: "req1", optionId: "a" })
    await 等到(async () => (await 发了几条()) === 2, "回了确认")
    expect(await 最后()).toContain("放行了")

    w.会话问权限("s1", "req2", "删目录")
    await 等到(async () => (await 发了几条()) === 3, "推了第二问")
    await s.发来("拒绝")
    await 等到(() => w.答了.length === 2, "答了第二问")
    expect(w.答了[1]).toMatchObject({ requestId: "req2", optionId: "r" })

    await s.发来("同意")
    await 等到(async () => (await 发了几条()) === 5, "没在等时说清楚")
    expect(await 最后()).toContain("没有在等你点头的事")
    ch.stop()
  })

  it("通知开关能关：done 关了就不推跑完", async () => {
    const w = 假世界()
    w.已绑()
    await w.deps.ops().createTask({ agentId: "x" })
    const ch = new WeixinChannel(w.deps)
    expect(ch.notifySettings()).toEqual({ done: true, error: true, permission: true, quietWhenFocused: true })
    ch.setNotifySettings({ done: false })
    ch.start()
    w.会话说("s1", "问", true, "user")
    w.走时(125_000)
    w.会话说("s1", "答")
    await new Promise((r) => setTimeout(r, 150))
    expect(await 发了几条()).toBe(0)
    ch.stop()
  })

  it("/新建 #项目名：在那个项目里开", async () => {
    const w = 假世界()
    w.已绑()
    const ch = new WeixinChannel(w.deps)
    ch.start()
    await s.发来("/新建 #Applied-Ecology")
    await 等到(async () => (await 发了几条()) === 1, "回了")
    expect(await 最后()).toContain("项目「Applied-Ecology」")
    expect(w.tasks[0]).toMatchObject({ workspace: "/Users/u/Applied-Ecology" })
    await s.发来("/新建 #不存在")
    await 等到(async () => (await 发了几条()) === 2, "回了")
    expect(await 最后()).toContain("生态中心")
    ch.stop()
  })
})
