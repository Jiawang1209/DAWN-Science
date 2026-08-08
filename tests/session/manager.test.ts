import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { SessionStore } from "../../src/store/sessions.js"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { SessionManager } from "../../src/session/manager.js"
import { ProjectStore } from "../../src/store/projects.js"
import type { ProviderRegistry } from "../../src/config/schema.js"
import type { AgentRuntime, SessionSpec } from "../../src/runtime/types.js"

const registry: ProviderRegistry = {
  agents: {
    "ds-agent": { kind: "native", provider: "deepseek", model: "deepseek-v4-flash", capabilities: ["exec"] },
    "claude-code": { kind: "pty", command: "claude", args: [], capabilities: ["mcp", "hooks"] },
  },
}

function makeManager() {
  const db = new Database(":memory:")
  migrate(db)
  const store = new SessionStore(db)
  const runtime = new FakeRuntime()
  const mgr = new SessionManager({
    store,
    registry,
    runtimes: { native: runtime, pty: runtime },
    workspaceRoot: "/tmp/dawn-test",
  })
  return { mgr, store, runtime, db }
}

/**
 * 完整的桩对象，不用 { ...fakeRuntimeInstance } 改写方法——
 * 展开只复制自有属性，类方法在原型上，展开后 attach/write/stop 会全部丢失。
 */
function stubRuntime(over: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    start: async (s) => ({ sessionId: s.sessionId, pid: 1 }),
    attach: () => () => {},
    write: () => {},
    stop: async () => {},
    ...over,
  }
}

describe("SessionManager · 创建与销毁", () => {
  let ctx: ReturnType<typeof makeManager>
  beforeEach(() => {
    ctx = makeManager()
  })

  it("创建会话：先落库，再启动运行时", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    expect(ctx.store.get(s.id)?.state).toBe("alive")
    expect(s.agentId).toBe("ds-agent")
  })

  it("pty agent 同样可创建", async () => {
    const s = await ctx.mgr.create("claude-code", "/tmp/w")
    expect(ctx.store.get(s.id)?.state).toBe("alive")
  })

  it("未知 agentId 响亮报错，且不留下任何记录", async () => {
    await expect(ctx.mgr.create("nope", "/tmp/w")).rejects.toThrow(/nope/)
    expect(ctx.store.list()).toHaveLength(0)
  })

  it("native agent 的 spec 带上 provider 与 model —— 不再是 baseUrl + apiKey", async () => {
    let seen: SessionSpec | undefined
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    const rt = stubRuntime({
      start: async (s) => {
        seen = s
        return { sessionId: s.sessionId, pid: 1 }
      },
    })
    const mgr = new SessionManager({
      store, registry, runtimes: { native: rt, pty: rt }, workspaceRoot: "/tmp/x",
    })
    await mgr.create("ds-agent", "/tmp/w")
    // 连接细节与凭证都交给 pi，上层只说「哪个 provider 的哪个模型」
    expect(seen?.native).toEqual({ provider: "deepseek", model: "deepseek-v4-flash" })
  })

  it("pty agent 的 spec 不带 native", async () => {
    let seen: SessionSpec | undefined
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    const rt = stubRuntime({
      start: async (s) => {
        seen = s
        return { sessionId: s.sessionId, pid: 1 }
      },
    })
    const mgr = new SessionManager({
      store, registry, runtimes: { native: rt, pty: rt }, workspaceRoot: "/tmp/x",
    })
    await mgr.create("claude-code", "/tmp/w")
    expect(seen?.native).toBeUndefined()
  })

  it("运行时启动失败时，会话被标为 exited 而非留在 starting", async () => {
    const failing = stubRuntime({
      start: async () => {
        throw new Error("boom")
      },
    })
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    const mgr = new SessionManager({
      store, registry, runtimes: { native: failing, pty: failing }, workspaceRoot: "/tmp/x",
    })
    await expect(mgr.create("ds-agent", "/tmp/w")).rejects.toThrow(/boom/)
    const rec = store.list()[0]
    expect(rec?.state).toBe("exited")
  })

  it("停止会话后状态落库为 exited", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    await ctx.mgr.stop(s.id)
    expect(ctx.store.get(s.id)?.state).toBe("exited")
  })

  it("运行时自行退出时，exitCode 被回写入库", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    await ctx.runtime.stop(s.id) // 绕过 manager，模拟进程自己死掉
    expect(ctx.store.get(s.id)?.state).toBe("exited")
    expect(ctx.store.get(s.id)?.exitCode).toBe(0)
  })

  it("list 返回落库的会话", async () => {
    await ctx.mgr.create("ds-agent", "/tmp/w")
    await ctx.mgr.create("claude-code", "/tmp/w")
    expect(ctx.mgr.list()).toHaveLength(2)
  })
})

describe("SessionManager · 写权守卫", () => {
  let ctx: ReturnType<typeof makeManager>
  beforeEach(() => {
    ctx = makeManager()
  })

  it("写入需要持有租约，无租约时抛错", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    expect(() => ctx.mgr.write(s.id, "hi", "engine")).toThrow(/租约/)
  })

  it("持有租约后可写入", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    ctx.mgr.leases.acquire(s.id, "engine")
    const seen: string[] = []
    ctx.mgr.attach(s.id, (e) => {
      if (e.kind === "output") seen.push(e.data)
    })
    ctx.mgr.write(s.id, "hi", "engine")
    expect(seen).toEqual(["echo:hi"])
  })

  it("用户抢占后，engine 无法再写入", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    ctx.mgr.leases.acquire(s.id, "engine")
    ctx.mgr.leases.acquire(s.id, "user")
    expect(() => ctx.mgr.write(s.id, "x", "engine")).toThrow(/租约/)
  })

  it("抢占后 user 自己可以写", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    ctx.mgr.leases.acquire(s.id, "engine")
    ctx.mgr.leases.acquire(s.id, "user")
    const seen: string[] = []
    ctx.mgr.attach(s.id, (e) => {
      if (e.kind === "output") seen.push(e.data)
    })
    ctx.mgr.write(s.id, "mine", "user")
    expect(seen).toEqual(["echo:mine"])
  })

  it("stop 会释放租约", async () => {
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    ctx.mgr.leases.acquire(s.id, "engine")
    await ctx.mgr.stop(s.id)
    expect(ctx.mgr.leases.current(s.id)).toBeUndefined()
  })

  it("对未在本进程活动的会话附加观察者会报错", () => {
    expect(() => ctx.mgr.attach("nope", () => {})).toThrow(/nope/)
  })
})

describe("SessionManager · 启动对账", () => {
  it("残留的 alive 记录被显式修正", () => {
    const ctx = makeManager()
    ctx.store.insert({
      id: "stale",
      agentId: "ds-agent",
      workspace: "/w",
      sessionDir: "/w/.dawn/stale",
      state: "alive",
      createdAt: "2026-08-05T00:00:00Z",
    })
    expect(ctx.mgr.reconcileOnStartup()).toBe(1)
    expect(ctx.store.get("stale")?.state).toBe("exited")
  })
})

describe("SessionManager · 按 agent 定义构造 pty runtime", () => {
  // 计划的 CLI 把 pty runtime 写死成 command:'claude'，这样 registry 里
  // 命令不同的 pty agent（如 codex）会错误地起成 claude。
  // G1 判据之一是「四个会话能并存」，混合不同 CLI 的场景必须成立。
  it("ptyRuntimeFor 优先于 runtimes.pty，且能拿到该 agent 的定义", async () => {
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    const wrong = stubRuntime()
    const seen: { agentId: string; command: string }[] = []

    const mgr = new SessionManager({
      store,
      registry,
      runtimes: { native: stubRuntime(), pty: wrong },
      ptyRuntimeFor: (agentId, def) => {
        seen.push({ agentId, command: def.command })
        return stubRuntime()
      },
      workspaceRoot: "/tmp/x",
    })

    await mgr.create("claude-code", "/tmp/w")
    expect(seen).toEqual([{ agentId: "claude-code", command: "claude" }])
  })

  it("未提供 ptyRuntimeFor 时回退到 runtimes.pty", async () => {
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    let used = false
    const mgr = new SessionManager({
      store,
      registry,
      runtimes: {
        native: stubRuntime(),
        pty: stubRuntime({
          start: async (s) => {
            used = true
            return { sessionId: s.sessionId, pid: 1 }
          },
        }),
      },
      workspaceRoot: "/tmp/x",
    })
    await mgr.create("claude-code", "/tmp/w")
    expect(used).toBe(true)
  })

  it("native agent 不走 ptyRuntimeFor", async () => {
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    let called = false
    const mgr = new SessionManager({
      store,
      registry,
      runtimes: { native: stubRuntime(), pty: stubRuntime() },
      ptyRuntimeFor: () => {
        called = true
        return stubRuntime()
      },
      workspaceRoot: "/tmp/x",
    })
    await mgr.create("ds-agent", "/tmp/w")
    expect(called).toBe(false)
  })
})

describe("SessionManager · 项目归属", () => {
  // Part 1 发现的缺口：create() 原本不带 projectId，导致通过它建的会话
  // 不挂在任何项目下，ProjectManager.sessions() 永远返回空。
  it("create 可指定 projectId 并落库", async () => {
    const ctx = makeManager()
    // 外键约束要求项目先存在——会话不能挂到不存在的项目上
    new ProjectStore(ctx.db).insert({
      projectId: "p1", name: "w", workspace: "/tmp/w", createdAt: "2026-08-08T00:00:00Z",
    })
    const s = await ctx.mgr.create("ds-agent", "/tmp/w", { projectId: "p1" })
    expect(ctx.store.get(s.id)?.projectId).toBe("p1")
  })

  it("指向不存在的项目会被外键拒绝 —— 数据库层不允许悬空归属", async () => {
    const ctx = makeManager()
    await expect(ctx.mgr.create("ds-agent", "/tmp/w", { projectId: "nope" })).rejects.toThrow(
      /FOREIGN KEY/i,
    )
  })

  it("不指定 projectId 时留空，而不是编一个 —— 不变式 5", async () => {
    const ctx = makeManager()
    const s = await ctx.mgr.create("ds-agent", "/tmp/w")
    expect(ctx.store.get(s.id)?.projectId).toBeUndefined()
  })
})

describe("SessionManager · 凭证在建会话时解析", () => {
  // 2026-08-08 行为变更：配置加载不再因缺凭证失败（桌面应用不该起不来）。
  // 失败推迟到这里——这才是真正需要凭证的时刻，报错也才有可操作性。
  const noKeyRegistry: ProviderRegistry = {
    agents: {
      "ds-agent": { kind: "native", provider: "deepseek", model: "deepseek-v4-flash", capabilities: ["chat"] },
      "claude-code": { kind: "pty", command: "claude", args: [], capabilities: [] },
    },
  }

  function mgrWith(over: Partial<ConstructorParameters<typeof SessionManager>[0]> = {}) {
    const db = new Database(":memory:")
    migrate(db)
    const store = new SessionStore(db)
    const rt = new FakeRuntime()
    return new SessionManager({
      store, registry: noKeyRegistry,
      runtimes: { native: rt, pty: rt },
      workspaceRoot: "/tmp/x",
      // 默认「一个都没配」。**不注入时管理器不做检查**——CLI 场景下凭证由 pi
      // 自己从环境变量解析，管理器无从知晓，那时不该抢着报错
      hasCredential: () => false,
      ...over,
    })
  }

  it("native agent 缺凭证时报错，且说清楚去哪配", async () => {
    await expect(mgrWith().create("ds-agent", "/tmp/w")).rejects.toThrow(/未配置凭证/)
  })

  it("报错点名是哪个 provider", async () => {
    await expect(mgrWith().create("ds-agent", "/tmp/w")).rejects.toThrow(/"deepseek"/)
  })

  it("凭证已配置时放行 —— app 的凭证库从这里回答有无", async () => {
    const mgr = mgrWith({ hasCredential: (id: string) => id === "deepseek" })
    const s = await mgr.create("ds-agent", "/tmp/w")
    expect(s.agentId).toBe("ds-agent")
  })

  // 「配置里写死的 apiKey 优先于解析器」一条已删除：
  // 返工 R2 之后配置文件里根本没有 apiKey 字段，凭证只有一个来源（app 的凭证库）。
  // **少一个来源就少一处「谁覆盖谁」的规则要记。**

  it("pty agent 不需要凭证，缺了也能起 —— 它用的是自己的登录态", async () => {
    const s = await mgrWith().create("claude-code", "/tmp/w")
    expect(s.agentId).toBe("claude-code")
  })
})
