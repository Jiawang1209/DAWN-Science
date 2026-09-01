/**
 * 填 key 时当场验一次（B9，2026-09-01，首启审计）。
 *
 * 此前 `setCredential` 只存 key：随便一串字符都算「已填 deepseek ✓」，错要到第一句话才露出来，
 * 而且露出来的是 pi 的 401 原话。定案：存完之后**用对话真会发的那条请求**（`askOnce`，1 个 token）
 * 问一句，结果分三档端到 `getProviders.unusable`：
 *   - `ok`   → 不出现；
 *   - `hard` → key 是错的（401/403 或鉴权字样），向导照 B8 那样拦住「开始使用」；
 *   - `soft` → 没能判定（超时、网络、5xx、认不出的），只说一句，不拦。
 * **存永远成功**——验证只产出结果，从不让保存失败。
 *
 * 归类规则来自 pi 真抛的错误形状（`@earendil-works/pi-ai/dist/utils/error-body.js`：
 * `formatProviderError` 出 `"<status>: <body>"`；`openai` SDK 的 `APIError.message` 是 `"<status> <msg>"`；
 * 连不上是 `"Connection error."`，看不出状态码）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createWorkbenchBackend, type CredentialsPort } from "../../src/workbench/backend.js"
import { 归类key错误, KEY_CHECK_PROMPT } from "../../src/workbench/key-validate.js"

/* ── 归类 ──────────────────────────────────────────────────────────────── */

describe("归类key错误 · 按 pi 真抛的形状", () => {
  it("openai SDK 经 pi 的 formatProviderError：`401: {json body}` → hard，detail 取 body 里的 message", () => {
    // deepseek 401 经 pi：status 从 error.status 取，body 是 JSON.stringify(error.error)，message 不含整段 body → `"401: <body>"`
    const r = 归类key错误(
      new Error('401: {"message":"Authentication Fails, Your api key: ****abcd is invalid","type":"authentication_error","param":null,"code":"invalid_request_error"}'),
    )
    expect(r.kind).toBe("hard")
    expect(r.detail).toBe("Authentication Fails, Your api key: ****abcd is invalid")
  })

  it("openai SDK 自己的 message（body 已折进 message 时 pi 原样给）：`401 Incorrect API key provided…` → hard", () => {
    const r = 归类key错误(new Error("401 Incorrect API key provided: sk-abc. You can find your API key at https://platform.openai.com/account/api-keys."))
    expect(r.kind).toBe("hard")
    expect(r.detail).toContain("Incorrect API key")
  })

  it("anthropic SDK：`401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"invalid x-api-key\"}}` → hard，detail 是里面那句", () => {
    const r = 归类key错误(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'))
    expect(r.kind).toBe("hard")
    expect(r.detail).toBe("invalid x-api-key")
  })

  it("403 也算 key 不对（网关拒了这把 key）；`403 status code (no body)` 是 openai SDK 没拿到 body 时的原话", () => {
    expect(归类key错误(new Error("403 status code (no body)")).kind).toBe("hard")
  })

  it("没有状态码但有鉴权字样 → hard（某些网关把 401 包成 200 SSE 的 error 事件）", () => {
    expect(归类key错误(new Error("Provider returned invalid_api_key")).kind).toBe("hard")
    expect(归类key错误(new Error("Unauthorized")).kind).toBe("hard")
  })

  it("连不上：openai/anthropic SDK 都说 `Connection error.`，看不出状态码 → soft，原话带上", () => {
    const r = 归类key错误(new Error("Connection error."))
    expect(r.kind).toBe("soft")
    expect(r.detail).toBe("Connection error.")
  })

  it("fetch failed / ENOTFOUND / ECONNREFUSED / ETIMEDOUT / Request timed out. → soft", () => {
    for (const m of ["fetch failed", "getaddrinfo ENOTFOUND api.deepseek.com", "connect ECONNREFUSED 127.0.0.1:1", "ETIMEDOUT", "Request timed out."]) {
      expect(归类key错误(new Error(m)).kind, m).toBe("soft")
    }
  })

  it("5xx 与 429 → soft：服务端的事，说明不了 key 对不对", () => {
    expect(归类key错误(new Error('502: {"message":"bad gateway"}')).kind).toBe("soft")
    expect(归类key错误(new Error("500 Internal Server Error")).kind).toBe("soft")
    expect(归类key错误(new Error('429 {"error":{"message":"rate limited"}}')).kind).toBe("soft")
  })

  it("**认不出的一律 soft，绝不当 hard**——把网络问题说成「key 错了」会让人去改一把好 key", () => {
    expect(归类key错误(new Error("Provider finish_reason: network_error")).kind).toBe("soft")
    expect(归类key错误("不是 Error 的东西").kind).toBe("soft")
    expect(归类key错误(new Error("")).kind).toBe("soft")
  })

  it("正文里提到 401 但开头不是状态码的，不算 hard（`500: upstream said 401` 是网关的事）", () => {
    expect(归类key错误(new Error("500: upstream returned 401")).kind).toBe("soft")
  })

  it("太长的原话要截、并说清省了多少（规格 7.5：截断要出声）", () => {
    const r = 归类key错误(new Error("x".repeat(1000)))
    expect(r.detail.length).toBeLessThan(400)
    expect(r.detail).toMatch(/省略 \d+ 字/)
  })
})

/* ── 接进 setCredential / getProviders ─────────────────────────────────── */

function 假钥匙串(...有的: string[]): CredentialsPort {
  const 里面 = new Map(有的.map((id) => [id, "sk-测试"]))
  return {
    get: (id) => 里面.get(id),
    set: (id, s) => void 里面.set(id, s),
    delete: (id) => void 里面.delete(id),
    configured: () => [...里面.keys()],
    isEncrypted: () => true,
  }
}

type 返回 = {
  agents: { agentId: string; kind: string }[]
  unusable?: { providerId: string; reason: string; soft?: boolean; i18n?: { msgid: string; args: (string | number)[] } }[]
}
type 问 = NonNullable<Parameters<typeof createWorkbenchBackend>[0]["askOnce"]>

function 起一套(opts: { askOnce?: 问; available?: (id: string) => Promise<string[]>; timeoutMs?: number } = {}) {
  const registry = { agents: {}, providers: {} }
  const invalidate = vi.fn()
  const backend = createWorkbenchBackend({
    projects: {} as never,
    projectStore: {} as never,
    runs: {} as never,
    sessions: {} as never,
    registry: registry as never,
    events: {} as never,
    credentials: 假钥匙串(),
    invalidateCredentials: invalidate,
    models: { available: opts.available ?? (async () => ["deepseek-chat"]) },
    ...(opts.askOnce ? { askOnce: opts.askOnce } : {}),
    ...(opts.timeoutMs !== undefined ? { keyCheckTimeoutMs: opts.timeoutMs } : {}),
  })
  return {
    backend,
    invalidate,
    填: (providerId = "deepseek") => backend.setCredential({ providerId, secret: "sk-x" }),
    取: () => backend.getProviders({}) as Promise<返回>,
  }
}

describe("setCredential 当场验一次（B9）", () => {
  // 验证失败会进日志（与 B8 同一做法）；这里不看日志，只别让它刷屏
  beforeEach(() => {
    const 吼 = vi.spyOn(console, "error").mockImplementation(() => {})
    return () => 吼.mockRestore()
  })

  it("**发的是对话真会发的那条请求**：目标是 provider + 目录里第一个模型，1 个 token，带标记以便假后端认出来", async () => {
    const askOnce = vi.fn<问>(async () => ({ text: "ok", model: "deepseek/deepseek-chat" }))
    const { 填, 取, invalidate } = 起一套({ askOnce, available: async () => ["deepseek-chat", "deepseek-reasoner"] })
    await 填()
    expect(askOnce).toHaveBeenCalledTimes(1)
    const [目标, req] = askOnce.mock.calls[0]!
    expect(目标).toEqual({ provider: "deepseek", model: "deepseek-chat" })
    expect(req.maxTokens).toBe(1)
    expect(req.user).toContain(KEY_CHECK_PROMPT)
    expect(req.signal).toBeInstanceOf(AbortSignal)
    // 先失效缓存再问：不然问的是旧 key
    expect(invalidate.mock.invocationCallOrder[0]!).toBeLessThan(askOnce.mock.invocationCallOrder[0]!)
    expect((await 取()).unusable).toEqual([])
  })

  it("401 → hard：unusable 里有它，带 i18n，不标 soft", async () => {
    const { 填, 取 } = 起一套({
      askOnce: async () => {
        throw new Error('401: {"message":"Authentication Fails, Your api key: ****abcd is invalid","type":"authentication_error"}')
      },
    })
    await 填()
    expect((await 取()).unusable).toEqual([
      {
        providerId: "deepseek",
        reason: "deepseek 的 key 验证失败：Authentication Fails, Your api key: ****abcd is invalid",
        i18n: { msgid: "{0} 的 key 验证失败：{1}", args: ["deepseek", "Authentication Fails, Your api key: ****abcd is invalid"] },
      },
    ])
  })

  it("连不上 → soft：一样端出去，但标 `soft: true`，话里说可能是网络", async () => {
    const { 填, 取 } = 起一套({
      askOnce: async () => {
        throw new Error("Connection error.")
      },
    })
    await 填()
    const u = (await 取()).unusable
    expect(u).toHaveLength(1)
    expect(u![0]).toMatchObject({ providerId: "deepseek", soft: true })
    expect(u![0]!.reason).toContain("Connection error.")
    expect(u![0]!.reason).toMatch(/网络/)
    expect(u![0]!.i18n!.args).toEqual(["deepseek", "Connection error."])
  })

  it("一直不回话 → 到点放弃（soft，说清等了几秒），信号也拉了；**保存本身早就成功了**", async () => {
    let 收到的信号: AbortSignal | undefined
    const { 填, 取 } = 起一套({
      timeoutMs: 30,
      askOnce: (_目标, req) =>
        new Promise((_r, reject) => {
          收到的信号 = req.signal
          req.signal?.addEventListener("abort", () => reject(Object.assign(new Error("已取消"), { name: "AbortError" })))
        }),
    })
    const 开始 = Date.now()
    await 填()
    expect(Date.now() - 开始).toBeLessThan(2_000)
    expect(收到的信号?.aborted).toBe(true)
    const u = (await 取()).unusable
    expect(u![0]).toMatchObject({ providerId: "deepseek", soft: true })
    expect(u![0]!.i18n!.msgid).toMatch(/秒/)
  })

  it("askOnce 根本不理会信号、也永远不回 → 一样到点放弃，不卡住保存", async () => {
    const { 填, 取 } = 起一套({ timeoutMs: 30, askOnce: () => new Promise(() => {}) })
    await 填()
    expect((await 取()).unusable![0]).toMatchObject({ providerId: "deepseek", soft: true })
  })

  it("没接 askOnce（这次运行没有 native 运行时）→ 不验、不记，什么都不出现", async () => {
    const { 填, 取 } = 起一套()
    await 填()
    expect((await 取()).unusable).toEqual([])
  })

  it("目录里挑不出模型 → 不发请求；B8 的理由照旧在，不多一条", async () => {
    const askOnce = vi.fn<问>(async () => ({ text: "ok", model: "x" }))
    const { 填, 取 } = 起一套({ askOnce, available: async () => [] })
    await 填()
    expect(askOnce).not.toHaveBeenCalled()
    const u = (await 取()).unusable
    expect(u).toHaveLength(1)
    expect(u![0]!.i18n!.msgid).toBe("模型目录里没有 {0} 的模型，挑不出一个来建 agent")
  })

  it("B8 的理由压过验证结果：验时目录读得到、造 agent 时读炸了 → 端出去的是「目录读不出来」，不是验证那句（目录都没有，请求就发不出去）", async () => {
    const 吼 = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      let 第几次 = 0
      const { 填, 取 } = 起一套({
        available: async () => {
          if (第几次++ === 0) return ["deepseek-chat"]
          throw new Error("models.json 解析失败")
        },
        askOnce: async () => {
          throw new Error("401 bad key")
        },
      })
      await 填()
      const u = (await 取()).unusable
      expect(u).toHaveLength(1)
      expect(u![0]!.i18n!.msgid).toBe("模型目录读不出来：{0}")
    } finally {
      吼.mockRestore()
    }
  })

  it("再填一次成功 → 旧的红字撤掉；deleteCredential → 也撤掉", async () => {
    let 第几次 = 0
    const { backend, 填, 取 } = 起一套({
      askOnce: async () => {
        if (第几次++ === 0) throw new Error("401 bad key")
        return { text: "ok", model: "x" }
      },
    })
    await 填()
    expect((await 取()).unusable).toHaveLength(1)
    await 填()
    expect((await 取()).unusable).toEqual([])
    第几次 = 0
    await 填()
    expect((await 取()).unusable).toHaveLength(1)
    await backend.deleteCredential({ providerId: "deepseek" })
    expect((await 取()).unusable).toEqual([])
  })

  it("验证抛了也好、超时也好，setCredential 自己**从不拒绝**——key 已经存进去了", async () => {
    const { backend, 填 } = 起一套({
      askOnce: async () => {
        throw new Error("500 boom")
      },
    })
    await expect(填()).resolves.toEqual({})
    expect(((await backend.listCredentials({})) as { configured: string[] }).configured).toEqual(["deepseek"])
  })
})
