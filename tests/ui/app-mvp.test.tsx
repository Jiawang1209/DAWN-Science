/**
 * MVP 主路径的 App 级测试（Task 2.23）。
 *
 * **这是本阶段最重要的一条。**
 *
 * 2026-08-08 的复盘：上一版有四处缺陷，全部长在**接线**上——
 * 「新建会话」没人调、终端 `output=""` 写死、产出栏 `facts={undefined}` 写死、
 * 打开文件夹用 `window.prompt`。363 个测试一个都没拦住，因为它们全是
 * **叶子组件 + 手喂 props**：证明了「给它数据它显示得对」，
 * 证明不了「有没有人给它数据」。
 *
 * 所以这里：
 *   - 只渲染 `App`，断言**用户看得见的结果**，不看组件的 props
 *   - 用**真的 `createClient`** 配假传输，这样 seq 连续性、信封校验、
 *     版本判断走的都是真实逻辑，而不是测试里再写一遍
 *   - **所有假响应都过一遍协议的 response schema**——夹具写错形状会当场炸。
 *     这一条在第一次跑的时候就抓到了我自己：`files` 是 `string[]`，
 *     我按对象数组写了
 */
import { describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react"
import { App } from "../../src/ui/App.js"
import { createClient, type RawResponse } from "../../src/ui/client.js"
import { OPERATIONS, WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"
import type { SessionUpdate } from "../../src/protocol/index.js"

const RUN = {
  runId: "r1",
  projectId: "p1",
  sessionId: "s1",
  origin: "agent" as const,
  requestType: "agent_turn",
  status: "completed" as const,
  startedAt: "2026-08-08T00:00:00Z",
  finishedAt: "2026-08-08T00:01:00Z",
  hasError: false,
}

const CHANGES = {
  files: ["src/model.py"],
  // 三条硬要求之一：产出可能混进用户自己的手改，必须说出来
  mayIncludeUserEdits: true,
  baselineHead: "abc1234",
  computedAt: "2026-08-08T00:01:00Z",
}

const COST = {
  visible: true as const,
  inputTokens: 1200,
  outputTokens: 340,
  totalUSD: 0.0031,
}

const SESSION = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native" as const,
  state: "alive" as const,
  createdAt: "2026-08-08T00:00:00Z",
}

const proj = (workspace: string) => ({
  projectId: "p1",
  name: "proj",
  workspace,
  createdAt: "2026-08-08T00:00:00Z",
  totalRunCount: 0,
  totalSessionCount: 0,
  unresolvedProblemCount: 0,
})

function harness(over: { projects?: unknown[]; runs?: unknown[]; pick?: string | null } = {}) {
  const calls: { op: string; req: unknown }[] = []
  let emit: ((raw: unknown) => void) | undefined

  const projects = [...(over.projects ?? [])]
  const runs = over.runs ?? []
  const sessions: unknown[] = []

  const pickDirectory = vi.fn(async () => (over.pick === undefined ? "/w/proj" : over.pick))

  const data = (op: string, req: unknown): unknown => {
    switch (op) {
      case "getCapabilities":
        return {
          workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
          operations: Object.keys(OPERATIONS),
          entityTypes: [],
          maxPageSize: 200,
          readOnly: false,
        }
      case "listProjects":
        return projects
      case "listCredentials":
        return { configured: ["ds"], encrypted: true }
      case "getProviders":
        return {
          agents: [{ agentId: "ds-chat", kind: "native", provider: "deepseek", model: "m" }],
          providers: [{ providerId: "deepseek", models: ["m"] }],
        }
      case "listSessions":
        return sessions
      case "listRuns":
        return runs
      case "getRun":
        return { ...RUN, fileChanges: CHANGES, cost: COST }
      case "getProvenance":
        return { resourceId: "r1", provenanceComplete: true }
      case "openProject": {
        const p = proj((req as { workspace: string }).workspace)
        projects.push(p)
        return p
      }
      case "createSession":
        sessions.push(SESSION)
        return SESSION
      case "subscribeSession":
        return {
          sessionId: "s1", kind: "native", revision: 0, items: [],
          terminal: "", terminalTrimmed: false, state: "alive",
        }
      case "acquireLease":
        return {
          sessionId: "s1",
          holder: "user",
          expiresAt: "2026-08-08T00:05:00Z",
          fingerprint: "f",
        }
      default:
        return {}
    }
  }

  const invoke = async (op: string, req: unknown): Promise<RawResponse> => {
    calls.push({ op, req })
    const raw = data(op, req)
    // 夹具必须合协议。写错形状当场炸，而不是留到界面上以一种更难懂的方式失败
    const def = (OPERATIONS as Record<string, { response: { parse(v: unknown): unknown } }>)[op]
    if (def) def.response.parse(raw)
    return {
      ok: true,
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      data: raw,
      warnings: [],
    }
  }

  const client = createClient(
    invoke,
    (cb) => {
      emit = cb
      return () => {
        emit = undefined
      }
    },
    pickDirectory,
  )

  return {
    client,
    calls,
    pickDirectory,
    push: (e: unknown) => act(() => emit?.(e)),
  }
}

type Harness = ReturnType<typeof harness>

/** 服务端推的是**累积后的整条**——界面按 id 覆盖，不必自己拼增量 */
const agentSays = (text: string, revision: number, final = false): SessionUpdate =>
  ({
    workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
    sessionId: "s1",
    revision,
    type: "item",
    item: { type: "turn", id: "a1", who: "agent", text, final },
  }) as SessionUpdate

/** 走完「打开项目 → 新建会话」。 */
async function openAndStart(h: Harness) {
  render(<App client={h.client} />)
  fireEvent.click(await screen.findByRole("button", { name: "打开文件夹为新项目" }))
  await waitFor(() => expect(h.calls.some((c) => c.op === "openProject")).toBe(true))

  // 2026-08-09：不再有「点开 → 挑 agent」那一步。侧栏按下就用默认 agent 建，
  // 换 agent 的入口搬到了 composer 右下角的 pill
  fireEvent.click(await screen.findByRole("button", { name: /新建会话/ }))
  await waitFor(() => expect(h.calls.some((c) => c.op === "createSession")).toBe(true))
  // **等到会话真的挂上再返回**。只等 createSession 落在 calls 里是不够的——
  // 那一刻 setSessionId 还没被 React 处理完，事件会因为「不是当前会话」被滤掉
  await screen.findByPlaceholderText(/回车发送/)
  await waitFor(() => expect(h.calls.some((c) => c.op === "subscribeSession")).toBe(true))
}

describe("MVP 主路径 · 打开项目", () => {
  it("用原生目录选择器，不是让人往 prompt 里粘路径", async () => {
    const h = harness()
    render(<App client={h.client} />)
    fireEvent.click(await screen.findByRole("button", { name: "打开文件夹为新项目" }))
    await waitFor(() => expect(h.pickDirectory).toHaveBeenCalled())
    expect(h.calls.find((c) => c.op === "openProject")?.req).toEqual({ workspace: "/w/proj" })
  })

  it("用户取消选择 ⇒ 什么都不做，不报错", async () => {
    const h = harness({ pick: null })
    render(<App client={h.client} />)
    fireEvent.click(await screen.findByRole("button", { name: "打开文件夹为新项目" }))
    await waitFor(() => expect(h.pickDirectory).toHaveBeenCalled())
    expect(h.calls.some((c) => c.op === "openProject")).toBe(false)
  })

  it("重开 app 时自动选中已有项目 —— 有项目却还要求你再打开一次文件夹是荒谬的", async () => {
    const h = harness({ projects: [proj("/w/proj")] })
    render(<App client={h.client} />)
    const btn = (await screen.findByRole("button", { name: /新建会话/ })) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
  })
})

describe("MVP 主路径 · 说一句话，看见回复", () => {
  it("从零走到「agent 的回复出现在界面上」", async () => {
    const h = harness()
    await openAndStart(h)

    const box = (await screen.findByPlaceholderText(/回车发送/)) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "你好" } })
    fireEvent.submit(box.form!)
    await waitFor(() => expect(h.calls.some((c) => c.op === "writeToSession")).toBe(true))

    h.push(agentSays("在", 1))
    h.push(agentSays("在，我在", 2, true))

    // **这一条就是上一版做不到的事**
    expect(await screen.findByText("在，我在")).toBeDefined()
  })

  it("自己说的话来自事件流，不是本地乐观追加 —— 事件流是对话的唯一事实来源", async () => {
    const h = harness()
    await openAndStart(h)

    const box = (await screen.findByPlaceholderText(/回车发送/)) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "跑一下测试" } })
    fireEvent.submit(box.form!)
    await waitFor(() => expect(h.calls.some((c) => c.op === "writeToSession")).toBe(true))

    // 事件还没回来时界面上不该已经有它
    expect(screen.queryByText("跑一下测试")).toBeNull()

    h.push({
      workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
      sessionId: "s1", revision: 1, type: "item",
      item: { type: "turn", id: "u1", who: "user", text: "跑一下测试", final: true },
    })
    expect(await screen.findByText("跑一下测试")).toBeDefined()
  })

  it("新建会话会自动取写权，否则第一句就被租约挡下", async () => {
    const h = harness()
    await openAndStart(h)
    await waitFor(() => expect(h.calls.some((c) => c.op === "acquireLease")).toBe(true))
  })

  it("订阅了会话 —— 没有这一步，回复永远到不了界面", async () => {
    const h = harness()
    await openAndStart(h)
    await waitFor(() => expect(h.calls.some((c) => c.op === "subscribeSession")).toBe(true))
  })
})

describe("MVP 主路径 · 看见它改了什么、花了多少", () => {
  it("产出栏显示的是 client 返回的数据，不是写死的字面量", async () => {
    // 上一版这里是 `facts={undefined}`，于是永远显示「无法确定」，
    // 三条硬要求里的第一条在真实界面上永远不会出现
    const h = harness({ runs: [RUN] })
    await openAndStart(h)
    fireEvent.click(screen.getByRole("button", { name: "项目概览" }))

    expect(await screen.findByText("src/model.py")).toBeDefined()
    expect(screen.getByText(/可能包含你自己的修改/)).toBeDefined()
  })

  it("成本栏显示真实数字", async () => {
    const h = harness({ runs: [RUN] })
    await openAndStart(h)
    fireEvent.click(screen.getByRole("button", { name: "项目概览" }))
    expect(await screen.findByText(/1200/)).toBeDefined()
  })

  it("取了 getRun —— 产出与成本只有它带得来，listRuns 只给摘要", async () => {
    const h = harness({ runs: [RUN] })
    await openAndStart(h)
    await waitFor(() => expect(h.calls.some((c) => c.op === "getRun")).toBe(true))
  })
})

describe("MVP 主路径 · 异常要出声", () => {
  it("**revision 跳号时重新取快照，而不是只报警**", async () => {
    // 这是 snapshot + revision 相对旧设计（seq + 环形缓冲）真正的收获：
    // 旧设计少的那一段补不回来，只能告诉用户「丢了」；新设计能自愈。
    const h = harness()
    await openAndStart(h)
    const before = h.calls.filter((c) => c.op === "subscribeSession").length

    h.push(agentSays("一", 1))
    h.push(agentSays("五", 9))

    await waitFor(() =>
      expect(h.calls.filter((c) => c.op === "subscribeSession").length).toBeGreaterThan(before),
    )
  })

  it("跳号后连着来的更新不会每条都触发一次重取", async () => {
    const h = harness()
    await openAndStart(h)
    const before = h.calls.filter((c) => c.op === "subscribeSession").length
    h.push(agentSays("一", 1))
    h.push(agentSays("五", 9))
    h.push(agentSays("六", 10))
    h.push(agentSays("七", 11))
    await waitFor(() =>
      expect(h.calls.filter((c) => c.op === "subscribeSession").length).toBe(before + 1),
    )
  })

  it("畸形更新被丢弃并出声，不流进对话", async () => {
    const h = harness()
    await openAndStart(h)
    h.push({ garbage: true })
    expect(await screen.findByText(/不合协议/)).toBeDefined()
  })
})
