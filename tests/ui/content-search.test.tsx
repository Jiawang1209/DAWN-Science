/**
 * 侧栏「按内容」的结果卡（会话全文搜索，2026-09-27，spec §2.2）。
 */
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { ContentSearchResults, 搜索停顿毫秒, type 全文结果 } from "../../src/ui/content-search.js"

const 空 = { matchedSessions: 0, total: 3, scanned: 3, notSearchable: 0, unreadable: 0, tooLarge: 0, elapsedMs: 5 }
const 一张: 全文结果 = {
  ...空,
  matchedSessions: 1,
  sessions: [
    {
      sessionId: "s1",
      title: "生存分析",
      place: { kind: "project", name: "lung" },
      archived: true,
      lastAt: "2026-09-03T10:00:00.000Z",
      hits: [
        { itemId: "r0", nth: 0, where: "user", snippet: "帮我做 Cox 回归", marks: [[4, 7], [8, 10]] },
        { itemId: "c1", nth: 1, where: "toolInput", toolName: "run_code", snippet: "fit <- coxph(…", marks: [[7, 10]] },
      ],
      moreHits: 2,
    },
  ],
}

async function 渲染(结果: 全文结果 | Error, query = "cox 回归") {
  vi.useFakeTimers()
  const search = vi.fn(async () => {
    if (结果 instanceof Error) throw 结果
    return 结果
  })
  const onOpen = vi.fn()
  render(<ContentSearchResults query={query} search={search} onOpen={onOpen} />)
  await act(async () => {
    vi.advanceTimersByTime(搜索停顿毫秒)
  })
  vi.useRealTimers()
  return { search, onOpen }
}

describe("结果卡", () => {
  it("标题、所在、已归档、片段里的词用 <mark>、还有 N 处", async () => {
    await 渲染(一张)
    expect(screen.getByText("生存分析")).toBeTruthy()
    expect(screen.getByText("项目 lung")).toBeTruthy()
    expect(screen.getByText("已归档")).toBeTruthy()
    expect(screen.getByText("打开会取消归档")).toBeTruthy()
    expect([...document.querySelectorAll("mark.cs-mark")].map((m) => m.textContent)).toEqual(["Cox", "回归", "cox"])
    expect(screen.getByText("代码里：")).toBeTruthy()
    expect(screen.getByText("还有 2 处")).toBeTruthy()
  })

  it("点某一处 → onOpen(卡, 那一处)；点卡头 → onOpen(卡)", async () => {
    const { onOpen } = await 渲染(一张)
    fireEvent.click(screen.getByText("代码里："))
    expect(onOpen).toHaveBeenLastCalledWith(一张.sessions[0], 一张.sessions[0]!.hits[1])
    fireEvent.click(screen.getByText("生存分析"))
    expect(onOpen).toHaveBeenLastCalledWith(一张.sessions[0])
  })

  it("不到两个字：不发请求，说「至少两个字」", async () => {
    const { search } = await 渲染(一张, " c ")
    expect(search).not.toHaveBeenCalled()
    expect(screen.getByText("至少两个字")).toBeTruthy()
  })

  it("一段都没有：说出来（不是一片空白）", async () => {
    await 渲染({ ...空, sessions: [] }, "鲸落")
    expect(screen.getByText("没有对话里出现「鲸落」")).toBeTruthy()
  })

  it("截断、读不了、太大、不是内置对话：各说一句", async () => {
    await 渲染({ ...一张, matchedSessions: 40, truncated: "sessions", unreadable: 2, tooLarge: 1, notSearchable: 4 })
    expect(screen.getByText("还有 39 段也有，没列出来——换个更具体的词")).toBeTruthy()
    expect(screen.getByText("2 段的记录读不了，没搜")).toBeTruthy()
    expect(screen.getByText("1 段的记录太大（超过 32 MB），没搜")).toBeTruthy()
    expect(screen.getByText("另有 4 段是外部 CLI / ACP / 终端 / 内核会话，内容不在我们手里，没搜")).toBeTruthy()
  })

  it("超时：说看了几段中的几段", async () => {
    await 渲染({ ...一张, truncated: "time", scanned: 120, total: 500 })
    expect(screen.getByText("搜到一半超时了：看了 500 段中的 120 段")).toBeTruthy()
  })

  it("失败出声", async () => {
    await 渲染(new Error("后端没了"))
    expect(screen.getByRole("alert").textContent).toContain("后端没了")
  })
})

/** 评审补的（2026-09-28）：停顿、迟到、搜下一个词时不闪、列表语义、取消归档之后那张卡 */
describe("打字与请求", () => {
  const 结果 = (title: string): 全文结果 => ({ ...一张, sessions: [{ ...一张.sessions[0]!, sessionId: title, title, archived: false }] })

  it("连着打字：停 250 ms 之后只搜一次，搜的是最后那个词", async () => {
    vi.useFakeTimers()
    const search = vi.fn(async (q: string) => 结果(q))
    const { rerender } = render(<ContentSearchResults query="co" search={search} onOpen={vi.fn()} />)
    for (const q of ["cox", "cox ", "cox 回", "cox 回归"]) {
      await act(async () => {
        vi.advanceTimersByTime(100)
      })
      rerender(<ContentSearchResults query={q} search={search} onOpen={vi.fn()} />)
    }
    expect(search).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(搜索停顿毫秒)
    })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith("cox 回归")
    vi.useRealTimers()
  })

  it("迟到的回复丢掉：先发的后到，不盖住后发的", async () => {
    vi.useFakeTimers()
    const 等着: Record<string, (r: 全文结果) => void> = {}
    const search = vi.fn((q: string) => new Promise<全文结果>((res) => (等着[q] = res)))
    const { rerender } = render(<ContentSearchResults query="甲甲" search={search} onOpen={vi.fn()} />)
    await act(async () => {
      vi.advanceTimersByTime(搜索停顿毫秒)
    })
    rerender(<ContentSearchResults query="乙乙" search={search} onOpen={vi.fn()} />)
    await act(async () => {
      vi.advanceTimersByTime(搜索停顿毫秒)
    })
    expect(search).toHaveBeenCalledTimes(2)
    await act(async () => {
      等着["乙乙"]!(结果("乙的结果"))
    })
    await act(async () => {
      等着["甲甲"]!(结果("甲的结果"))
    })
    expect(screen.getByText("乙的结果")).toBeTruthy()
    expect(screen.queryByText("甲的结果")).toBeNull()
    vi.useRealTimers()
  })

  it("搜下一个词时：上一批结果留着（变淡、aria-busy），不闪成加载", async () => {
    vi.useFakeTimers()
    const search = vi.fn(async (q: string) => 结果(q))
    const { rerender } = render(<ContentSearchResults query="甲甲" search={search} onOpen={vi.fn()} />)
    await act(async () => {
      vi.advanceTimersByTime(搜索停顿毫秒)
    })
    rerender(<ContentSearchResults query="甲甲乙" search={search} onOpen={vi.fn()} />)
    expect(screen.getByText("甲甲")).toBeTruthy()
    expect(screen.queryByText("正在搜对话内容")).toBeNull()
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true")
    await act(async () => {
      vi.advanceTimersByTime(搜索停顿毫秒)
    })
    expect(screen.getByText("甲甲乙")).toBeTruthy()
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("false")
    vi.useRealTimers()
  })
})

describe("结果区的语义与键盘", () => {
  it("结果区有名字；卡是列表项", async () => {
    await 渲染(一张)
    const 区 = screen.getByRole("region", { name: "对话内容的搜索结果" })
    expect(区.querySelector('[role="list"]')).toBeTruthy()
    expect(区.querySelectorAll('[role="listitem"]').length).toBe(1)
  })

  it("结果里上下键在各处之间挪焦点", async () => {
    await 渲染(一张)
    const 可点 = [...document.querySelectorAll<HTMLElement>(".cs-results [data-cs-nav]")]
    expect(可点.length).toBe(3) // 卡头 + 两处
    可点[0]!.focus()
    fireEvent.keyDown(可点[0]!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(可点[1])
    fireEvent.keyDown(可点[1]!, { key: "ArrowUp" })
    expect(document.activeElement).toBe(可点[0])
  })

  it("打开了一张归档的卡且取消归档成功：「已归档」与提示从这张卡上拿掉", async () => {
    vi.useFakeTimers()
    const onOpen = vi.fn(async () => "unarchived" as const)
    render(<ContentSearchResults query="cox 回归" search={async () => 一张} onOpen={onOpen} />)
    await act(async () => {
      vi.advanceTimersByTime(搜索停顿毫秒)
    })
    vi.useRealTimers()
    expect(screen.getByText("已归档")).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText("代码里："))
    })
    expect(screen.queryByText("已归档")).toBeNull()
    expect(screen.queryByText("打开会取消归档")).toBeNull()
  })
})
