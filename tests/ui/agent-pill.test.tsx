/**
 * agent 选择器搬家：侧栏左上 → composer 右下（①-B″ · U0）。
 *
 * 作者的原话：*「不同的 API 以及 claude cli 和 codex cli 现在在左上角，
 * 其实应该放到右下角，类似 hermes」*。
 *
 * Hermes 的组件注释把这次搬家写得很清楚：
 * > *"Composer model selector — **the relocated status-bar pill**."*
 * > *"Display follows THIS surface's SessionView — **never the primary-only globals**
 * >  — so side-by-side panes each show their own model."*
 *
 * **它是「一个动作只有一个家」的应用**：选 agent 这件事只在一处发生，
 * 而且就在你要说话的那个输入框旁边。
 *
 * ## 与 Hermes 的一处硬差别，必须在界面上说出来
 *
 * Hermes 的模型可以会话中途换。**我们的 `agentId` 是建会话时绑死的**
 * （`createSession({ projectId, agentId })`）。所以点 pill 里的一项
 * 只能是「用它**新建**一个会话」。
 *
 * 让人以为是就地切换、结果悄悄开了个新会话——那是静默偏离，规格 7.5 明令禁止。
 * 所以菜单标题写死「新建会话，用：」，**歧义从根上消掉，而不是靠用户猜**。
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ConversationView, EmptyConversation, SessionSidebar } from "../../src/ui/views.js"
import type { SessionSummary } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-08-09T00:00:00Z",
}

const AGENTS = ["ds-chat", "claude-cli", "codex-cli"]

/**
 * **agent pill 现在住在初始画面上**（2026-08-12 搬的）。
 *
 * 作者要求把 composer 右下角收成**一颗**（实测 WorkBuddy 就是
 * `◐ Hy3 ⌃` 一颗），而「哪家」与「哪个模型」原本各占一颗——
 * 它们回答的是同一个问题。
 *
 * 搬到哪儿不是随便挑的：**挑 LLM 这件事发生在开口之前**，
 * 而初始画面正是「还没开口」那一屏。会话中途换服务走的是模型 pill
 * （就地换、对话不断，2026-08-11 定的）；「用别的 agent 开一段新对话」
 * 留在命令面板——它与「换模型」不是同一件事，**混进同一个菜单正是
 * 那次「点了以为换模型、结果新开了对话」的来源**。
 */
const conv = (over: Partial<Parameters<typeof EmptyConversation>[0]> = {}) =>
  render(
    <EmptyConversation
      agents={AGENTS}
      onStart={() => {}}
      onOpenSettings={() => {}}
      {...over}
    />,
  )

describe("agent pill · 位置", () => {
  it("**在 composer 里，不在侧栏** —— 这次改动的全部内容", () => {
    const { container } = conv()
    expect(container.querySelector(".composer .agent-pill")).toBeTruthy()
  })

  it("在 composer 的右对齐控件行里，和发送按钮同一行", () => {
    const { container } = conv()
    const row = container.querySelector(".composer .composer-controls")
    expect(row, "需要一个控件行来承载右对齐").toBeTruthy()
    expect(row!.querySelector(".agent-pill")).toBeTruthy()
    expect(row!.querySelector("button[type=submit]")).toBeTruthy()
  })

  /**
   * **它显示的是「按下去会用哪个」**（2026-08-12 换了主语）。
   *
   * 上一版这条是「显示当前会话的 agent」——那时 pill 在 composer 里，
   * 每段对话有自己的 agent。搬到初始画面之后**还没有会话**，
   * 所以它显示的是清单里第一个，也就是**直接开口会用的那个**。
   *
   * 意图没变：**不能显示一个与实际会用的不一致的东西**。
   */
  it("显示的是「直接开口会用哪个」", () => {
    const { container } = conv()
    expect(container.querySelector(".agent-pill")!.textContent).toContain("ds-chat")
  })

  /**
   * **2026-08-11：显示的是「这家服务叫什么」，不是配置里那个键。**
   *
   * 作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」*
   * `ds-chat` 是 `providers.yaml` 里的一个键——**我们的内部标识**。
   * 名字来自 pi 的 provider 表，界面只负责把它用上；**没给就退回 id**。
   */
  it("**用服务的名字，不用配置里那个键** —— `ds-chat` → `DeepSeek`", () => {
    const { container } = conv({
      agentLabel: (id: string) => (id === "ds-chat" ? "DeepSeek" : id),
    })
    const pill = container.querySelector(".agent-pill")!
    expect(pill.textContent).toContain("DeepSeek")
    expect(pill.textContent).not.toContain("ds-chat")
  })

  it("**没给名字就退回 id** —— 那至少是实话，不在界面上编一个", () => {
    const { container } = conv()
    expect(container.querySelector(".agent-pill")!.textContent).toContain("ds-chat")
  })

  /**
   * **2026-08-09（①-C · C1）：分类从两种变成三种。**
   *
   * 原来是 `pty ? "外部 CLI" : "内置"`——那时 claude/codex 确实是 pty 托管的。
   * 现在 `pty` 的语义是**一个真终端**（通用 shell），
   * 外部 CLI 的对话模式是新的 `cli`。
   * **那个二元三元表达式会把 `cli` 说成「内置」，而它恰恰是最外部的那个。**
   */
  /**
   * **2026-08-11：口径从「内置 / 外部 CLI」改成「API / CLI」。**
   *
   * 作者：*「不能在模型厂家的地方写内置，要协商是 cli 还是 API，
   * 这个区分还是很关键的。」*——「内置」说的是我们的实现（跑在本进程里），
   * 而人要判断的是**钱和上下文走哪条路**：API 用你的 key 直接调、模型在这里选；
   * CLI 是外部命令行自己去调，**模型也归它自己管**。
   */
  /**
   * **「是 API 还是 CLI」这条挪到会话里去了**（2026-08-12）。
   *
   * 那是一段**已有会话**的属性（`session.kind`），而这一屏还没有会话。
   * 它现在由对话里那颗模型 pill 上的服务标记承担。
   * 这里删掉不是因为它红了，是**它问的那个东西在这一屏上不存在**。
   */
})

describe("agent pill · 点开之后", () => {
  it("列出全部 agent", () => {
    conv()
    fireEvent.click(screen.getByRole("button", { name: /ds-chat/ }))
    for (const a of AGENTS) {
      expect(screen.getByRole("menuitem", { name: new RegExp(a) })).toBeTruthy()
    }
  })

  it("**明说会新建会话** —— 不能让人以为是就地换模型", () => {
    conv()
    fireEvent.click(screen.getByRole("button", { name: /ds-chat/ }))
    expect(screen.getByRole("menu").textContent).toMatch(/新建会话/)
  })

  it("选一项 → 带着那个 agentId 新建", () => {
    const onNewSession = vi.fn()
    conv({ onStart: onNewSession })
    fireEvent.click(screen.getByRole("button", { name: /ds-chat/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: /codex-cli/ }))
    expect(onNewSession).toHaveBeenCalledWith("codex-cli", undefined, undefined)
  })

  it("选完就收起 —— 菜单不该赖着不走", () => {
    conv()
    fireEvent.click(screen.getByRole("button", { name: /ds-chat/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: /claude-cli/ }))
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("Escape 关掉 —— 打开了就必须关得掉", () => {
    conv()
    fireEvent.click(screen.getByRole("button", { name: /ds-chat/ }))
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
  })

  /**
   * **「会话已结束时仍然能用」这条挪走了**（2026-08-12）。
   *
   * 它守的是「输入框该禁、但换 LLM 开一段新的不该禁」——
   * 而那个场景在**初始画面上不存在**：这一屏永远没有已结束的会话。
   * 同样是主语没了，不是它红了。
   */
})

describe("agent pill · 侧栏那份要真的搬走", () => {
  const sidebar = (agents = AGENTS) =>
    render(
      <SessionSidebar
        projects={[
          {
            projectId: "p1",
            name: "w",
            workspace: "/w",
            createdAt: "2026-08-09T00:00:00Z",
            totalRunCount: 0,
            totalSessionCount: 0,
            unresolvedProblemCount: 0,
          },
        ]}
        排序全集={[]}
        agents={agents}
        activeProjectId="p1"
        activeSessionId={undefined}
        view="conversation"
        onPickProject={() => {}}
        onPickSession={() => {}}
        onShowPanel={() => {}}
      />,
    )

  it("侧栏不再有 agent 下拉 —— 一个动作只有一个家", () => {
    const { container } = sidebar()
    expect(container.querySelector(".agent-pick")).toBeNull()
  })

  it("**侧栏那颗直接建，不再多一层选择**（T3-a 起叫「新建任务」）", () => {
    const onNewTask = vi.fn()
    const { container } = render(
      <SessionSidebar
        projects={[
          {
            projectId: "p1",
            name: "w",
            workspace: "/w",
            createdAt: "2026-08-09T00:00:00Z",
            totalRunCount: 0,
            totalSessionCount: 0,
            unresolvedProblemCount: 0,
          },
        ]}
        排序全集={[]}
        agents={AGENTS}
        activeProjectId="p1"
        activeSessionId={undefined}
        view="conversation"
        onPickProject={() => {}}
        onPickSession={() => {}}
        onNewTask={onNewTask}
        onShowPanel={() => {}}
      />,
    )
    // T3-a：侧栏上那颗改叫「新建任务」，**这条守的东西没变**——
    // 侧栏按下就建，不再在侧栏上多一层挑 agent（那一层在 composer 的 pill 上）
    fireEvent.click(screen.getByRole("button", { name: "新建任务" }))
    expect(onNewTask).toHaveBeenCalled()
    expect(container.querySelector(".agent-pick")).toBeNull()
  })
})

describe("agent pill · 一个会话都没有的时候", () => {
  it("空态也能挑 agent —— 否则第一个会话只能用默认那个", () => {
    const onStart = vi.fn()
    render(<EmptyConversation agents={AGENTS} onStart={onStart} onOpenSettings={() => {}} />)
    /**
     * **pill 现在长在输入卡里**（2026-08-12）。触发器上写的是当前那家的名字，
     * 不再是「换一个 LLM」——作者：*「不要上来就是用 Deepseek 开始，
     * 而是要直接是对话窗口。」* 空态成了一个真的输入卡，
     * 而 pill 在卡里的位置与对话中那张一致。
     *
     * 意图没变：**第一个会话不必只能用默认那个**。
     */
    fireEvent.click(screen.getByRole("button", { name: /切换服务|ds-chat|选择 agent/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: /codex-cli/ }))
    expect(onStart).toHaveBeenCalledWith("codex-cli", undefined, undefined)
  })

  it("**不再让人去左栏找** —— 那里已经没有了", () => {
    const { container } = render(
      <EmptyConversation agents={AGENTS} onStart={() => {}} onOpenSettings={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/左栏/)
  })
})
