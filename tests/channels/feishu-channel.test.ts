/**
 * 飞书通道(远程助理第二格):假飞书 × 假后端操作。
 * 验这一层自己的决定:设备流绑定、只认扫码人、去重(含重启重放)、Reaction 收尾、
 * 斜杠命令、专属会话、最终回答送回、9000 字切段、解绑清干净。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { startFakeFeishuServer, FAKE_OPEN_ID, FAKE_APP_ID } from "../../scripts/fake-feishu-server.mjs"
import type { FakeFeishuServer } from "../../scripts/fake-feishu-server.mjs"
import { fakeFeishuSdk } from "../../src/channels/feishu/sdk.js"
import { FeishuChannel, FEISHU_SECRET_KEY, 切段9000, type FeishuDeps, type FeishuOps } from "../../src/channels/feishu/channel.js"
import type { SessionUpdate } from "../../src/protocol/events.js"
import type { TaskSummary } from "../../src/protocol/entities.js"

let s: FakeFeishuServer
beforeAll(async () => {
  s = await startFakeFeishuServer({ longPollMs: 200 })
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
  let n = 0
  const ops: FeishuOps = {
    createTask: async ({ connectionId, workspace }) => {
      n += 1
      const t: TaskSummary = {
        taskId: `t${n}`,
        sessionId: `s${n}`,
        title: `会话${n}`,
        pinned: false,
        sortOrder: n,
        createdAt: new Date(2026, 7, 25, 0, n).toISOString(),
        ...(connectionId ? { connectionId } : {}),
        ...(workspace ? { workspace } : {}),
      }
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
    listProjects: async () => [{ projectId: "p1", name: "生态中心", workspace: "/u/eco" }],
  }
  const deps: FeishuDeps = {
    sdk: () => fakeFeishuSdk(s.url),
    settings: { get: (k) => 设置.get(k), set: (k, v) => (v ? 设置.set(k, v) : 设置.delete(k)) },
    credentials: { get: (k) => 秘密.get(k), set: (k, v) => void 秘密.set(k, v), delete: (k) => void 秘密.delete(k) },
    events: {
      onUpdate: (cb) => (听众.add(cb), () => 听众.delete(cb)),
      onAnyUpdate: (cb) => (全听.add(cb), () => 全听.delete(cb)),
      pin: (id) => void 钉住的.add(id),
      unpin: (id) => void 钉住的.delete(id),
    },
    ops: () => ops,
    defaultAgentId: () => "native-1",
    whereIs: () => undefined,
  }
  return { deps, 设置, 秘密, 听众, 全听, 钉住的, tasks, 写了, 中止了, 答了 }
}

const 等 = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 手动绑好(不走设备流):settings + 钥匙串直填,等价 confirmed 之后的落位 */
function 直接绑好(w: ReturnType<typeof 假世界>) {
  w.设置.set("feishu.appId", FAKE_APP_ID)
  w.设置.set("feishu.openId", FAKE_OPEN_ID)
  w.设置.set("feishu.domain", "feishu")
  w.秘密.set(FEISHU_SECRET_KEY, "sec")
}

describe("飞书通道", () => {
  beforeEach(async () => {
    await s.reset()
  })

  it("设备流:confirmed 后 bound;secret 进钥匙串、appId/openId 落 settings", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    await ch.startLogin()
    await 等(80)
    expect(ch.status().state).toBe("logging_in")
    await s.确认扫码()
    await 等(300)
    // confirmed 之后 login 视图留 8 秒给界面看「绑好了」(微信同款),state 在那之后才转 bound——
    // 这里看 step 与落位;bound 的判定 = 凭据齐(status 的三元式已由 settings/credentials 断言覆盖)
    expect(ch.status().login?.step).toBe("confirmed")
    expect(w.秘密.get(FEISHU_SECRET_KEY)).toBeTruthy()
    expect(w.设置.get("feishu.appId")).toBe(FAKE_APP_ID)
    expect(w.设置.get("feishu.openId")).toBe(FAKE_OPEN_ID)
    ch.stop()
  })

  it("只认扫码那个人:别人的消息不进会话、不回", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    直接绑好(w)
    ch.start()
    await 等(100)
    await s.发来("坏人的话", { openId: "someone-else" })
    await 等(400)
    expect(w.写了).toHaveLength(0)
    const sent = await s.发出的()
    expect(sent.filter((x) => x.kind === "text")).toHaveLength(0)
    ch.stop()
  })

  it("绑定人的话进会话;收到打 OnIt;同 messageId 重投只进一次;重启重放也挡住", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    直接绑好(w)
    ch.start()
    await 等(100)
    await s.发来("算一下", { messageId: "m-1" })
    await 等(400)
    expect(w.写了).toHaveLength(1)
    expect(w.写了[0]!.data).toBe("算一下")
    const sent = await s.发出的()
    expect(sent.some((x) => x.kind === "reaction" && x.emoji === "OnIt")).toBe(true)
    // 同 id 重投
    await s.发来("算一下", { messageId: "m-1" })
    await 等(400)
    expect(w.写了).toHaveLength(1)
    ch.stop()
    // 重启(新实例,同一份 settings):重放同 id 仍挡住
    const ch2 = new FeishuChannel(w.deps)
    ch2.start()
    await 等(100)
    await s.发来("算一下", { messageId: "m-1" })
    await 等(400)
    expect(w.写了).toHaveLength(1)
    ch2.stop()
  })

  it("最终回答送回飞书,并把 OnIt 换成 DONE;9000 字回答切两段", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    直接绑好(w)
    ch.start()
    await 等(100)
    await s.发来("说个长的", { messageId: "m-9" })
    await 等(400)
    const sid = w.设置.get("feishu.sessionId")!
    const 长文 = "行\n".repeat(5600) // 11200 字
    for (const cb of [...w.听众]) {
      cb({ type: "item", sessionId: sid, item: { type: "turn", who: "agent", final: true, text: 长文 } } as unknown as SessionUpdate)
    }
    await 等(300)
    const sent = await s.发出的()
    const 文本们 = sent.filter((x) => x.kind === "text")
    expect(文本们.length).toBe(2)
    expect(sent.some((x) => x.kind === "reaction" && x.emoji === "DONE" && x.action === "create")).toBe(true)
    expect(sent.some((x) => x.kind === "reaction" && x.emoji === "OnIt" && x.action === "delete")).toBe(true)
    ch.stop()
  })

  it("斜杠命令:/会话 /用 1 /停;「同意」答最近的权限询问", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    直接绑好(w)
    ch.start()
    await 等(100)
    await s.发来("随便说点", { messageId: "a1" }) // 建出第一段会话
    await 等(400)
    await s.发来("/会话", { messageId: "a2" })
    await 等(400)
    let sent = await s.发出的()
    expect(JSON.stringify(sent)).toContain("会话1")
    await s.发来("/停", { messageId: "a3" })
    await 等(400)
    expect(w.中止了).toHaveLength(1)
    // 权限询问 → 同意
    const sid = w.设置.get("feishu.sessionId")!
    for (const cb of [...w.全听]) {
      cb({
        type: "snapshot",
        sessionId: sid,
        snapshot: { pendingPermission: { requestId: "r1", title: "想跑 rm", options: [{ optionId: "o1", name: "允许一次", kind: "allow_once" }] } },
      } as unknown as SessionUpdate)
    }
    await 等(200)
    await s.发来("同意", { messageId: "a4" })
    await 等(400)
    expect(w.答了).toEqual([{ sessionId: sid, requestId: "r1", optionId: "o1" }])
    sent = await s.发出的()
    expect(JSON.stringify(sent)).toContain("放行")
    ch.stop()
  })

  it("审查 debug D2:关掉权限通知 = 不推**也不设待答**,回「同意」不放行没见过的询问", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    直接绑好(w)
    ch.setNotifySettings({ permission: false })
    ch.start()
    await 等(100)
    await s.发来("先建会话", { messageId: "p0" })
    await 等(400)
    const sid = w.设置.get("feishu.sessionId")!
    for (const cb of [...w.全听]) {
      cb({
        type: "snapshot",
        sessionId: sid,
        snapshot: { pendingPermission: { requestId: "危险", title: "想跑 rm -rf", options: [{ optionId: "allow", name: "允许", kind: "allow_once" }] } },
      } as unknown as SessionUpdate)
    }
    await 等(200)
    const 之前 = (await s.发出的()).filter((x) => x.kind === "text").length
    await s.发来("好", { messageId: "p1" })
    await 等(400)
    // 没推权限询问(text 没多一条「想跑」),且「好」没有放行——answerPermission 没被调
    expect(w.答了).toHaveLength(0)
    const 之后 = await s.发出的()
    expect(JSON.stringify(之后)).not.toContain("想跑 rm")
    // 「好」得到的是「现在没有在等你点头的事」,不是放行
    expect(JSON.stringify(之后.slice(之前))).not.toContain("放行")
    ch.stop()
  })

  it("审查 debug D5:解绑清 sessionId 并 unpin,换人绑定不落进前一个人的会话", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    直接绑好(w)
    ch.start()
    await 等(100)
    await s.发来("甲的私密话", { messageId: "j1" })
    await 等(400)
    const 甲会话 = w.设置.get("feishu.sessionId")!
    expect(w.钉住的.has(甲会话)).toBe(true)
    ch.stop()
    await ch.unbind()
    // sessionId 清了、unpin 了
    expect(w.设置.get("feishu.sessionId")).toBeUndefined()
    expect(w.钉住的.has(甲会话)).toBe(false)
    // 乙换号绑上(直接绑好 = 新凭证),start 不会读到残留 sessionId
    直接绑好(w)
    const ch2 = new FeishuChannel(w.deps)
    ch2.start()
    await 等(100)
    await s.发来("我是新扫码的乙", { messageId: "y1" })
    await 等(400)
    // 乙的话进的是**新建**会话,不是甲的 s1
    expect(w.写了.at(-1)!.sessionId).not.toBe(甲会话)
    expect(w.写了.at(-1)!.data).toBe("我是新扫码的乙")
    ch2.stop()
  })

  it("非 text / 非 p2p 不进会话;解绑清 settings 与凭证", async () => {
    const w = 假世界()
    const ch = new FeishuChannel(w.deps)
    直接绑好(w)
    ch.start()
    await 等(100)
    await s.发来("", { messageId: "x1", messageType: "image" })
    await s.发来("群里说的", { messageId: "x2", chatType: "group" })
    await 等(400)
    expect(w.写了).toHaveLength(0)
    await ch.unbind()
    expect(w.秘密.get(FEISHU_SECRET_KEY)).toBeUndefined()
    expect(w.设置.get("feishu.appId")).toBeUndefined()
    expect(ch.status().state).toBe("unbound")
  })
})

describe("切段9000", () => {
  it("优先按换行切;不足一段原样", () => {
    expect(切段9000("短的")).toEqual(["短的"])
    const 两段 = 切段9000("甲\n".repeat(5000)) // 10000 字
    expect(两段.length).toBe(2)
    expect(两段[0]!.endsWith("甲")).toBe(true) // 在换行处切,不把字切成两半
  })
})
