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
  pinned: false,
  sortOrder: 1,
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

function harness(
  over: {
    projects?: unknown[]
    runs?: unknown[]
    pick?: string | null
    /**
     * 让 `createSession` 挂起，由用例决定何时 resolve。
     *
     * **它复现的是一个只在负载下才露头的真实缺陷**：慢的会话创建回调
     * 会把用户刚切过去的视图拽回对话。e2e 里它两次出现在全量跑（56 条串行
     * Electron）中，单独跑必绿——因为轻负载下 `createSession`
     * 总是快于用户的下一次点击。**时序改成可控的，缺陷就是确定的。**
     */
    deferCreateSession?: boolean
    /** 建出来的会话是 pty（托管 claude / codex），不是内置 native */
    pty?: boolean
    /** 建出来的会话是 cli（外部 CLI 的对话模式），可带模型清单 */
    cliAgent?: { models?: string[] | undefined }
  } = {},
) {
  const calls: { op: string; req: unknown }[] = []
  let releaseCreate: (() => void) | undefined
  let emit: ((raw: unknown) => void) | undefined

  const projects = [...(over.projects ?? [])]
  const runs = over.runs ?? []
  const sessions: unknown[] = []
  /** 任务（T3-a）。侧栏上唯一那颗入口造出来的东西 */
  const tasks: { taskId: string; workspace?: string; sessionId?: string; pinned: boolean; sortOrder: number; createdAt: string }[] = []

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
        return over.cliAgent
          ? {
              agents: [
                {
                  agentId: "claude",
                  kind: "cli",
                  pinned: false,
                  sortOrder: 1,
                  command: "claude",
                  model: "sonnet",
                  ...(over.cliAgent.models ? { models: over.cliAgent.models } : {}),
                },
              ],
              providers: [],
            }
          : {
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
      /**
       * **2026-08-11：侧栏顶上那颗「新建会话」建的是临时会话。**
       *
       * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
       * 夹具让两条路走同一份假数据——这些用例问的是「说一句话看不看得见回复」，
       * 与它属不属于项目无关。
       */
      case "createTemporarySession": {
        const made = over.cliAgent
          ? { ...SESSION, agentId: "claude", kind: "cli" as const }
          : over.pty
            ? { ...SESSION, agentId: "claude", kind: "pty" as const }
            : SESSION
        sessions.push(made)
        return made
      }
      /**
       * **任务这条路**（T3-a，2026-08-12）。侧栏上唯一那颗入口走它。
       *
       * 与上面两条共用同一份假会话：这些用例问的是
       * 「说一句话看不看得见回复」，与它归在哪一栏无关。
       */
      case "createTask": {
        const made = over.cliAgent
          ? { ...SESSION, agentId: "claude", kind: "cli" as const }
          : over.pty
            ? { ...SESSION, agentId: "claude", kind: "pty" as const }
            : SESSION
        sessions.push(made)
        const ws = (req as { workspace?: string }).workspace
        const t = {
          taskId: `t${tasks.length + 1}`,
          ...(ws ? { workspace: ws } : {}),
          sessionId: made.sessionId,
          pinned: false,
          sortOrder: tasks.length + 1,
          createdAt: "2026-08-12T00:00:00Z",
        }
        tasks.push(t)
        return t
      }
      case "listTasks":
        return tasks
      case "listTemporarySessions":
        return sessions
      case "subscribeSession":
        return {
          sessionId: "s1", kind: over.cliAgent ? "cli" : over.pty ? "pty" : "native", revision: 0, items: [],
          terminal: over.pty ? "$ claude\r\n" : "", terminalTrimmed: false, state: "alive",
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
    if ((op === "createSession" || op === "createTemporarySession" || op === "createTask") && over.deferCreateSession) {
      await new Promise<void>((r) => (releaseCreate = r))
    }
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
    /** 放行挂起的 createSession */
    releaseCreateSession: () => act(() => releaseCreate?.()),
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

/**
 * 开一段**没有工作路径**的对话（T3-a 起就是「新建任务」这一颗）。
 *
 * 2026-08-12 之前是两步：「新建会话」→ 首页上挑一个 LLM →「开始」。
 * 现在一步——作者量的 WorkBuddy 就是这样：
 * *「新建任务之后，直接就是干净的对话窗口。」*
 * 挑 LLM 那一步搬到了 composer 的 pill 上（也是作者定的位置）。
 */
async function 从首页开始(话 = "开始"): Promise<void> {
  /**
   * **「新建任务」不建任何东西**（2026-08-12 作者定案）——它只把人送回初始画面，
   * **开口那一刻才建出来**：*「我一旦直接开始对话，其实就算是一个普通的会话了。」*
   *
   * 所以这里从「点一下」变成「点一下 + 说一句」。
   */
  fireEvent.click(await screen.findByRole("button", { name: "新建任务" }))
  const box = (await screen.findByPlaceholderText(/今天帮你做些什么/)) as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: 话 } })
  fireEvent.submit(box.form!)
}

/** 走到「对话已经挂上、能说话了」。 */
async function openAndStart(h: Harness) {
  render(<App client={h.client} />)
  await 从首页开始()
  await waitFor(() => expect(h.calls.some((c) => c.op === "createTask")).toBe(true))
  // **等到会话真的挂上再返回**。只等 createTask 落在 calls 里是不够的——
  // 那一刻 setSessionId 还没被 React 处理完，事件会因为「不是当前会话」被滤掉
  await screen.findByPlaceholderText(/今天帮你做些什么/)
  await waitFor(() => expect(h.calls.some((c) => c.op === "subscribeSession")).toBe(true))
}

/**
 * 从命令面板里跑一条命令。
 *
 * **「打开文件夹为新项目」不在侧栏上了**（T3-a：入口只剩「新建任务」一个），
 * 但**能力没丢**——它在命令面板里。本项目的纪律是
 * 「悬停才出现的东西必须另有一个入口（当前行常驻、命令面板、或者带上文字）」，
 * 命令面板正是那个「另一个入口」。它真正的家是对话里那个工作目录入口（T3-b）。
 */
async function 从命令面板(标题: RegExp): Promise<void> {
  fireEvent.keyDown(document, { key: "k", metaKey: true })
  fireEvent.click(await screen.findByText(标题))
}

/**
 * **入口换了，判据没换**（T4，2026-08-13）。
 *
 * 这两条原本走命令面板里的「打开文件夹为新项目」，而那条命令连同
 * `openProject` 操作一起在协议 5.0 里摘掉了——项目不再是「先建、再往里放会话」
 * 的东西，**它是从任务的工作目录长出来的**。
 *
 * 它们守的从来不是那条命令，是两件仍然成立的事：
 * ①**选目录要用原生选择器**，不能让人往输入框里粘路径（`window.prompt` 那次的教训）；
 * ②**取消就是什么都不做**，不报错、也不悄悄用一个别的目录。
 * 所以主语换成输入卡上那颗 chip——**那是这个动作现在唯一的家**。
 */
describe("MVP 主路径 · 给任务选工作目录", () => {
  it("用原生目录选择器，不是让人往 prompt 里粘路径", async () => {
    const h = harness()
    render(<App client={h.client} />)
    fireEvent.click(await screen.findByRole("button", { name: /选择工作目录/ }))
    await waitFor(() => expect(h.pickDirectory).toHaveBeenCalled())

    // 选完之后开口，任务就带着这个目录建出来
    const box = (await screen.findByPlaceholderText(/今天帮你做些什么/)) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "开始" } })
    fireEvent.submit(box.form!)
    await waitFor(() =>
      expect((h.calls.find((c) => c.op === "createTask")?.req as { workspace?: string })?.workspace)
        .toBe("/w/proj"),
    )
  })

  it("用户取消选择 ⇒ 什么都不做，不报错", async () => {
    const h = harness({ pick: null })
    render(<App client={h.client} />)
    fireEvent.click(await screen.findByRole("button", { name: /选择工作目录/ }))
    await waitFor(() => expect(h.pickDirectory).toHaveBeenCalled())

    // chip 还写着「选择工作目录」——**没设就说没设**，不编一个出来
    expect(await screen.findByRole("button", { name: /选择工作目录/ })).toBeDefined()

    const box = (await screen.findByPlaceholderText(/今天帮你做些什么/)) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "开始" } })
    fireEvent.submit(box.form!)
    // 取消之后照样能开口，只是**这一段没有工作目录**（普通对话）
    await waitFor(() => expect(h.calls.some((c) => c.op === "createTask")).toBe(true))
    expect((h.calls.find((c) => c.op === "createTask")?.req as { workspace?: string }).workspace)
      .toBeUndefined()
  })

  it("重开 app 时自动选中已有项目 —— 有项目却还要求你再打开一次文件夹是荒谬的", async () => {
    const h = harness({ projects: [proj("/w/proj")] })
    render(<App client={h.client} />)
    const btn = (await screen.findByRole("button", { name: "新建任务" })) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
  })
})

describe("MVP 主路径 · 说一句话，看见回复", () => {
  it("从零走到「agent 的回复出现在界面上」", async () => {
    const h = harness()
    await openAndStart(h)

    const box = (await screen.findByPlaceholderText(/今天帮你做些什么/)) as HTMLTextAreaElement
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

    const box = (await screen.findByPlaceholderText(/今天帮你做些什么/)) as HTMLTextAreaElement
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
    const h = harness({ runs: [RUN], projects: [proj("/w/proj")] })
    await openAndStart(h)
    fireEvent.click(screen.getByRole("button", { name: "项目概览" }))

    expect(await screen.findByText("src/model.py")).toBeDefined()
    expect(screen.getByText(/可能包含你自己的修改/)).toBeDefined()
  })

  /**
   * **成本记在 run 上，`listRuns` 与 `getRun` 都带着它**
   * （`store/runs.ts` 的 `toRun` 里就有）。上一版夹具只在 `getRun` 里给成本、
   * 列表里不给——**那是现实中不存在的形状**，同一条 run 不会一边有一边没有。
   *
   * 「只有 getRun 带得来」说的是**产出**（`fileChanges` 是每次现算的 diff），
   * 不是成本。下面那条测试盯的正是产出，与这条不冲突。
   */
  it("成本栏显示真实数字", async () => {
    const h = harness({ runs: [{ ...RUN, cost: COST }], projects: [proj("/w/proj")] })
    await openAndStart(h)
    fireEvent.click(screen.getByRole("button", { name: "项目概览" }))
    /**
     * 2026-08-11：1200 现在写作 `1.2k`（作者：*「token 的消耗，
     * 变换一下单位 k tokens」*）。**断言的意图没变**——
     * 摆的是真数字，不是「尚未记录」那种占位。
     */
    expect(await screen.findByText(/1\.2k/)).toBeDefined()
  })

  it("取了 getRun —— 产出与成本只有它带得来，listRuns 只给摘要", async () => {
    const h = harness({ runs: [RUN], projects: [proj("/w/proj")] })
    await openAndStart(h)
    await waitFor(() => expect(h.calls.some((c) => c.op === "getRun")).toBe(true))
  })

  /**
   * **窗口重新拿到焦点时，账本要重取。**
   *
   * 产出栏的数字不是存下来的，是 `getRun` **每次调用现算**的
   * （`backend.ts` 里的 `diffSince(workspace, baseline)`）。
   * 所以「作者切到编辑器改了几个文件，再切回 DAWN」这个场景里，
   * **屏幕上那份 diff 已经是旧的了**，而它长得和新的一模一样——
   * 没有任何东西会说它过期了。
   *
   * 这是 ①-B″ · U4 追加项（文件监听）的那一半收益，用零依赖的方式拿到。
   * 剩下的一半（并排放着、不切窗口也刷新）连同 worktree 隔离留到阶段 ③——
   * 理由记在 DEVELOPMENT_HISTORY。
   */
  it("**窗口重新获得焦点时重取账本** —— 产出栏是现算的，切出去再回来它已经旧了", async () => {
    const h = harness({ runs: [RUN], projects: [proj("/w/proj")] })
    await openAndStart(h)
    fireEvent.click(screen.getByRole("button", { name: "项目概览" }))
    await waitFor(() => expect(h.calls.some((c) => c.op === "getRun")).toBe(true))

    const before = h.calls.filter((c) => c.op === "listRuns").length
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    await waitFor(() =>
      expect(h.calls.filter((c) => c.op === "listRuns").length).toBeGreaterThan(before),
    )
  })

  it("**没开着项目概览就不重取** —— 没人在看的时候不该打 IPC", async () => {
    const h = harness({ runs: [RUN], projects: [proj("/w/proj")] })
    await openAndStart(h)
    // 停在对话页，不打开概览
    const before = h.calls.filter((c) => c.op === "listRuns").length
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(h.calls.filter((c) => c.op === "listRuns").length).toBe(before)
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

describe("慢的会话创建不该把人从当前视图上拽走", () => {
  /**
   * **2026-08-09 由 e2e 在负载下抓到的真实缺陷。**
   *
   * `startSession` 的 `.then` 里无条件 `setView("conversation")`。
   * 用户在会话建好之前点了「项目概览」，那个迟到的回调就会把他拽回对话——
   * 而且**不会再有任何东西把他送回去**，屏幕就那么停在错的地方。
   *
   * 它在 e2e 全量跑（56 条串行 Electron）里出现过两次，单独跑必绿：
   * 轻负载下 `createSession` 总快于用户的下一次点击。
   * **「只在忙的时候错」不是偶发，是窗口小。**
   */
  it("会话建好之前切到项目概览 —— 回调到达后**仍然停在项目概览**", async () => {
    const h = harness({ projects: [proj("/w/proj")], deferCreateSession: true })
    const { container } = render(<App client={h.client} />)
    const panels = () => container.querySelectorAll(".panel").length

    await 从首页开始()
    await waitFor(() =>
    expect(h.calls.some((c) => c.op === "createTask")).toBe(true),
  )

    // 会话还没建好，用户已经切走了
    fireEvent.click(screen.getByRole("button", { name: "项目概览" }))
    await waitFor(() => expect(panels()).toBeGreaterThan(0))

    // 迟到的回调到了
    h.releaseCreateSession()

    // **仍然在项目概览上。** 修复前这里会被拽回对话，composer 冒出来
    await waitFor(() => expect(h.calls.some((c) => c.op === "subscribeSession")).toBe(true))
    
    expect(screen.queryByPlaceholderText(/今天帮你做些什么/)).toBeNull()
    expect(panels()).toBeGreaterThan(0)
  })

  it("**没切走的话照常进对话** —— 修复不能把正常路径也一起改掉", async () => {
    const h = harness({ projects: [proj("/w/proj")] })
    render(<App client={h.client} />)
    await 从首页开始()
    expect(await screen.findByPlaceholderText(/今天帮你做些什么/)).toBeDefined()
  })
})

describe("PTY 会话：终端就是这个会话本身", () => {
  /**
   * **2026-08-09 作者试用后推翻了此前的设计。**
   *
   * 原设计把终端做成一个默认折叠的抽屉（`views.test.tsx` 里那条
   * 「默认收起 —— 终端是下钻视图，不是主界面」就是它）。
   * 作者实测的结果是 **claude / codex 在 app 里「不好使」**，根因两条叠加：
   *
   *   1. 主区域给的是对话视图 + 输入框，而 **PTY 的输出根本不进对话记录**
   *      （`workbench/events.ts` 的 `output` 分支：pty 只进 terminal）
   *   2. 那个输入框把文本原样送进 PTY，**不带 `\r`**——
   *      CLI 收到了字符却永远等不到提交
   *
   * 合起来是**一个看起来能用、实际把输入送进黑洞的输入框，
   * 配一个默认折叠的、装着全部真相的终端**。比彻底起不来更糟：
   * 起不来至少会报错。
   *
   * 新设计：**对 PTY 会话，终端就是主体。** 没有输入框，
   * 按键由 xterm 直接交给 PTY（回车天然是 `\r`）。
   */
  /**
   * **2026-08-11 改口径：终端在 dock 里，不铺主区。**
   *
   * 作者：*「终端，我们要学习 Claude app、Codex app，要点击之后，
   * 界面下方单独出现一个地方」*，随后又：*「应该在对话框的这边，
   * 侧边栏这边不能有终端。」*
   *
   * 所以这一条从「铺满主区」改成验**它不铺主区**——
   * 真链路那一条（终端真的能敲命令）在 `e2e/pty-session.spec.ts`。
   */
  it("**终端不铺主区**，它在下面那条 dock 里", async () => {
    const h = harness({ projects: [proj("/w/proj")], pty: true })
    const { container } = render(<App client={h.client} />)
    await 从首页开始()
    await waitFor(() => expect(screen.queryByText(/这是一段终端会话/)).not.toBeNull())
    expect(container.querySelector(".main .term-view")).toBeNull()
  })

  it("**没有输入框** —— 那个框只会把字送进黑洞", async () => {
    const h = harness({ projects: [proj("/w/proj")], pty: true })
    render(<App client={h.client} />)
    await 从首页开始()
    await waitFor(() => expect(screen.queryByRole("button", { name: "发送" })).toBeNull())
    expect(screen.queryByPlaceholderText(/今天帮你做些什么/)).toBeNull()
  })

  it("native 会话仍然是对话 + 输入框，主区里没有终端", async () => {
    const h = harness({ projects: [proj("/w/proj")] })
    const { container } = render(<App client={h.client} />)
    await 从首页开始()
    expect(await screen.findByPlaceholderText(/今天帮你做些什么/)).toBeDefined()
    expect(container.querySelector(".term-host")).toBeNull()
  })

  /**
   * **2026-08-11：侧栏那一行「终端」是新的，而且它是活的。**
   *
   * 这条断言原来是「不该有任何名字带终端的按钮」——那时它指的是一个
   * 永远禁用的残留。现在终端有了自己的家（底部 dock），
   * 侧栏那一行是它的入口：**必须点得动**，否则又是一次
   * 「看不见/点不动的能力等于不存在」。
   */
  it("**侧栏有「终端」入口，且是能点的**", async () => {
    const h = harness({ projects: [proj("/w/proj")] })
    render(<App client={h.client} />)
    const 入口 = await screen.findByRole("button", { name: "终端" })
    expect((入口 as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("cli 会话也能换模型（①-C 后续）", () => {
  /**
   * **作者试用后报的**：*「我的一个对话里面，不能切换不同的模型。
   * 点击新的模型之后，就默认的跳入新的对话里面了。」*
   *
   * 根因不是坏了，是**没做**：cli 会话里根本没有 model pill——
   * 那里只有 agent pill，而它的菜单是「新建会话，用：」，点了必然新建。
   *
   * 模型清单**只能由配置声明**（Spike H）：两个外部 CLI 都没有
   * 「列出可选项」的接口。没声明就不显示 pill——**不假装有得选**。
   */
  const cliHarness = (models?: string[]) =>
    harness({
      projects: [proj("/w/proj")],
      pty: false,
      cliAgent: { models: models ?? undefined },
    })

  it("**声明了 models 就显示模型选择器**", async () => {
    const h = cliHarness(["opus", "sonnet"])
    render(<App client={h.client} />)
    await 从首页开始()
    expect(await screen.findByRole("button", { name: /sonnet/ })).toBeDefined()
  })

  it("**没声明就不显示** —— 取不到就不假装有得选", async () => {
    const h = cliHarness(undefined)
    render(<App client={h.client} />)
    await 从首页开始()
    await screen.findByPlaceholderText(/今天帮你做些什么/)
    expect(screen.queryByRole("button", { name: /sonnet|opus/ })).toBeNull()
  })

  it("**选一个之后走 setSessionModel，不是新建会话**", async () => {
    const h = cliHarness(["opus", "sonnet"])
    render(<App client={h.client} />)
    await 从首页开始()
    fireEvent.click(await screen.findByRole("button", { name: /sonnet/ }))
    fireEvent.click(await screen.findByRole("menuitem", { name: /opus/ }))
    await waitFor(() => expect(h.calls.some((c) => c.op === "setSessionModel")).toBe(true))
    // **不是新建**：会话数没变（顶上那颗 2026-08-11 起建的是临时会话）
    expect(
      h.calls.filter((c) => c.op === "createTask"),
    ).toHaveLength(1)
  })
})
