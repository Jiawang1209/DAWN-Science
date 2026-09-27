/**
 * 会话全文搜索的 App 级接线（2026-09-28 评审补）。
 *
 * 叶子组件的测试证明「给它目标它会跳」；这里证明的是 **App 有没有把目标给对、用完有没有撤掉**：
 * - 点结果卡的一处 → 打开那段 → 那一条被描上（`data-search-hit`）
 * - **跳过之后离开再回来，不再被拽回旧的那一处**（`ConversationView` 按会话 key 重挂，`已跳` 会归零）
 * - 找不到那一处时说一句——离开再回来**不再说第二遍**
 * - 命令面板「搜索对话内容」在框已经开着时也把焦点放回框里
 *
 * 用真的 `createClient` 配假传输，与 app-mvp 同一个做法；假响应过一遍协议 schema。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { App } from "../../src/ui/App.js"
import { createClient, type RawResponse } from "../../src/ui/client.js"
import { OPERATIONS, WORKBENCH_PROTOCOL_VERSION } from "../../src/protocol/index.js"
import { setRightDockOpen } from "../../src/ui/state/right-dock.js"
import { $notes } from "../../src/ui/state/connection.js"

const 会话 = (sessionId: string, title: string) => ({
  sessionId,
  title,
  projectId: "tmp",
  agentId: "ds-chat",
  kind: "native" as const,
  pinned: false,
  sortOrder: 1,
  state: "exited" as const,
  createdAt: "2026-08-08T00:00:00Z",
})

const 任务 = (n: number, sessionId: string, title: string) => ({
  taskId: `t${n}`,
  title,
  sessionId,
  pinned: false,
  sortOrder: n,
  createdAt: "2026-08-12T00:00:00Z",
})

const 转录: Record<string, unknown[]> = {
  s1: [
    { type: "turn", id: "r0", who: "user", text: "鲸落 Cox 回归", final: true },
    { type: "turn", id: "r1", who: "agent", text: "好的", final: true },
  ],
  s2: [{ type: "turn", id: "x0", who: "user", text: "别的事", final: true }],
}

function harness(命中: { itemId: string; nth: number }) {
  const calls: { op: string; req: unknown }[] = []
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
        return []
      case "listCredentials":
        return { configured: ["ds"], encrypted: true }
      case "getProviders":
        return {
          agents: [{ agentId: "ds-chat", kind: "native", provider: "deepseek", model: "m" }],
          providers: [{ providerId: "deepseek", models: ["m"] }],
        }
      case "listSessions":
      case "listTemporarySessions":
        return [会话("s1", "甲会话"), 会话("s2", "乙会话")]
      case "listTasks":
        return [任务(1, "s1", "甲会话"), 任务(2, "s2", "乙会话")]
      case "listRuns":
        return []
      case "subscribeSession": {
        const sid = (req as { sessionId: string }).sessionId
        return { sessionId: sid, kind: "native", revision: 0, items: 转录[sid] ?? [], terminal: "", terminalTrimmed: false, state: "exited" }
      }
      case "searchSessionContent":
        return {
          matchedSessions: 1,
          total: 2,
          scanned: 2,
          notSearchable: 0,
          unreadable: 0,
          tooLarge: 0,
          elapsedMs: 3,
          sessions: [
            {
              sessionId: "s1",
              title: "甲会话",
              archived: false,
              lastAt: "2026-09-03T10:00:00.000Z",
              hits: [{ itemId: 命中.itemId, nth: 命中.nth, where: "user", snippet: "鲸落 Cox 回归", marks: [[0, 2]] }],
              moreHits: 0,
            },
          ],
        }
      default:
        return {}
    }
  }
  const invoke = async (op: string, req: unknown): Promise<RawResponse> => {
    calls.push({ op, req })
    const raw = data(op, req)
    const def = (OPERATIONS as Record<string, { response: { parse(v: unknown): unknown } }>)[op]
    if (def) def.response.parse(raw)
    return { ok: true, workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, data: raw, warnings: [] }
  }
  const client = createClient(
    invoke,
    () => () => {},
    async () => null,
  )
  return { client, calls }
}

const 侧栏 = () => document.querySelector<HTMLElement>(".sidebar")!
const 当前转录行 = (id: string) => document.querySelector<HTMLElement>(`.conversation [data-turn-id="${id}"]`)

async function 搜并点第一处() {
  fireEvent.click(await screen.findByRole("button", { name: /^搜索$/ }))
  fireEvent.click(screen.getByRole("button", { name: "按内容" }))
  fireEvent.change(screen.getByPlaceholderText("搜说过的话、回复、跑过的代码（至少两个字）"), { target: { value: "鲸落" } })
  fireEvent.click(await within(侧栏()).findByText("你："))
}

/** 关掉搜索（三列回来），在侧栏里点那一行 */
async function 侧栏点(标题: string) {
  if (document.querySelector(".side-search")) fireEvent.click(screen.getByRole("button", { name: /^搜索$/ }))
  fireEvent.click(await within(侧栏()).findByText(标题))
}

let 滚: ReturnType<typeof vi.fn>
beforeEach(() => {
  setRightDockOpen(false)
  $notes.set([])
  滚 = vi.fn()
  Element.prototype.scrollIntoView = 滚 as unknown as Element["scrollIntoView"]
})
afterEach(() => {
  // @ts-expect-error jsdom 本来没有它
  delete Element.prototype.scrollIntoView
})

describe("全文搜索 · 点结果 → 打开 → 跳到", () => {
  it("点一处：那段打开，那一条被描上", async () => {
    const h = harness({ itemId: "r0", nth: 0 })
    render(<App client={h.client} />)
    await 搜并点第一处()
    await waitFor(() => expect(当前转录行("r0")?.getAttribute("data-search-hit")).toBe("true"))
    expect(h.calls.some((c) => c.op === "searchSessionContent")).toBe(true)
    expect(滚).toHaveBeenCalled()
  })

  it("**跳过之后换一段再回来：不再被拽回那一处**（目标用完即撤）", async () => {
    const h = harness({ itemId: "r0", nth: 0 })
    render(<App client={h.client} />)
    await 搜并点第一处()
    await waitFor(() => expect(当前转录行("r0")?.getAttribute("data-search-hit")).toBe("true"))

    await 侧栏点("乙会话")
    await waitFor(() => expect(当前转录行("x0")).not.toBeNull())
    滚.mockClear()
    await 侧栏点("甲会话")
    await waitFor(() => expect(当前转录行("r0")).not.toBeNull())
    // 给跳转那条 effect 足够的帧（它逐帧最多找 12 帧）
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(当前转录行("r0")?.getAttribute("data-search-hit")).toBeNull()
    expect(滚).not.toHaveBeenCalled()
  })

  it(
    "找不到那一处：说一句；换一段再回来**不再说第二遍**",
    async () => {
      const h = harness({ itemId: "没有这条", nth: 7 })
      render(<App client={h.client} />)
      await 搜并点第一处()
      await waitFor(() => expect($notes.get().some((n) => n.includes("没找到那一处"))).toBe(true), { timeout: 4_500 })

      $notes.set([])
      await 侧栏点("乙会话")
      await waitFor(() => expect(当前转录行("x0")).not.toBeNull())
      await 侧栏点("甲会话")
      await waitFor(() => expect(当前转录行("r0")).not.toBeNull())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 3_300))
      })
      expect($notes.get().filter((n) => n.includes("没找到那一处"))).toEqual([])
    },
    15_000,
  )
})

describe("命令面板「搜索对话内容」", () => {
  it("框已经开着、焦点在别处：再叫一次，焦点回到框里，切到按内容", async () => {
    const h = harness({ itemId: "r0", nth: 0 })
    render(<App client={h.client} />)
    fireEvent.click(await screen.findByRole("button", { name: /^搜索$/ }))
    const 名字框 = screen.getByPlaceholderText("搜索项目与会话的名字")
    名字框.blur()
    expect(document.activeElement).not.toBe(名字框)

    fireEvent.keyDown(document, { key: "k", metaKey: true })
    fireEvent.click(await screen.findByText("搜索对话内容"))

    const 内容框 = await screen.findByPlaceholderText("搜说过的话、回复、跑过的代码（至少两个字）")
    await waitFor(() => expect(document.activeElement).toBe(内容框))
  })
})
