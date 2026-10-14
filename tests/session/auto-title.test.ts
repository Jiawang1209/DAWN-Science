import { describe, expect, it, vi } from "vitest"
import { AutoSessionTitles } from "../../src/session/auto-title.js"

function setup() {
  const records = new Map<string, { id: string; projectId?: string; connectionId?: string; title?: string }>([
    ["a", { id: "a", projectId: "project-1" }], ["b", { id: "b", projectId: "project-1" }],
    ["c", { id: "c", projectId: "project-2" }],
    ["r1", { id: "r1", projectId: "temp", connectionId: "server-1" }],
    ["r2", { id: "r2", projectId: "temp", connectionId: "server-1" }],
    ["r3", { id: "r3", projectId: "temp", connectionId: "server-2" }],
  ])
  const replies = new Map<string, (text: string) => void>()
  const ask = vi.fn((id: string, _req: unknown) => new Promise<string>(resolve => replies.set(id, resolve)))
  const changed = vi.fn()
  const titles = new AutoSessionTitles({
    get: id => records.get(id), list: () => [...records.values()],
    setInitial: (id, title) => { const r = records.get(id); if (!r || r.title) return false; r.title = title; return true },
    rename: (id, title) => { const r = records.get(id); if (r) r.title = title }, ask, changed,
  })
  return { records, replies, ask, changed, titles }
}
const prompt = "现在500米8月的数据偏差比较大，请帮我检查输入数据、过滤规则，并进行校正。".repeat(3)

describe("自动概括会话标题", () => {
  it("长提问不先照搬为标题，独立概括后只保存结果，不把摘要变成发言", async () => {
    const c = setup()
    c.titles.start("a", prompt)
    expect(c.records.get("a")!.title).not.toContain("现在500米")
    expect(c.ask.mock.calls[0]![1]).toMatchObject({ user: expect.stringContaining(prompt), maxTokens: 128 })
    c.replies.get("a")!("500米8月偏差校正")
    await vi.waitFor(() => expect(c.records.get("a")!.title).toBe("500米8月偏差校正"))
    expect(c.changed).toHaveBeenLastCalledWith("a", "500米8月偏差校正")
  })
  it("同一项目和同一服务器内去重，跨项目或跨服务器不互相加序号", async () => {
    const c = setup()
    for (const id of ["a", "b", "c", "r1", "r2", "r3"]) {
      c.titles.start(id, prompt)
      c.replies.get(id)!("缺失值检查")
      await vi.waitFor(() => expect(c.records.get(id)!.title).toContain("缺失值检查"))
    }
    expect(c.records.get("b")!.title).toBe("缺失值检查 · 2")
    expect(c.records.get("c")!.title).toBe("缺失值检查")
    expect(c.records.get("r2")!.title).toBe("缺失值检查 · 2")
    expect(c.records.get("r3")!.title).toBe("缺失值检查")
  })
  it("手动改名、删除、换归属后，迟到摘要不能覆盖；第二次发送不反复改标题", async () => {
    const c = setup()
    c.titles.start("a", prompt)
    c.titles.start("a", "第二句话")
    expect(c.ask).toHaveBeenCalledTimes(1)
    c.titles.cancel("a")
    c.records.get("a")!.title = "我自己起的名字"
    c.replies.get("a")!("旧摘要")
    c.titles.start("b", prompt)
    c.records.delete("b")
    c.replies.get("b")!("已删会话")
    c.titles.start("c", prompt)
    c.records.get("c")!.projectId = "changed-project"
    c.replies.get("c")!("旧项目的标题")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(c.records.get("a")!.title).toBe("我自己起的名字")
    expect(c.records.has("b")).toBe(false)
    expect(c.records.get("c")!.title).not.toBe("旧项目的标题")
  })
  it("已存在的标题保持，模型返回整段话时退回短标题，不能把正文贴到标题里", async () => {
    const c = setup()
    c.records.get("a")!.title = "手动命名"
    c.titles.start("a", prompt)
    expect(c.ask).not.toHaveBeenCalled()
    c.titles.start("b", prompt)
    c.replies.get("b")!(prompt)
    await vi.waitFor(() => expect(c.records.get("b")!.title).not.toBe("新会话"))
    expect([...c.records.get("b")!.title!].length).toBeLessThanOrEqual(24)
  })
})


it("摘要超时不会卡住会话，回退短标题且终止独立请求", async () => {
  vi.useFakeTimers()
  try {
    const c = setup()
    c.titles.start("a", prompt)
    const req = c.ask.mock.calls[0]![1] as { signal: AbortSignal }
    await vi.advanceTimersByTimeAsync(15_000)
    expect(req.signal.aborted).toBe(true)
    expect(c.records.get("a")!.title).not.toBe("新会话")
    expect([...c.records.get("a")!.title!].length).toBeLessThanOrEqual(24)
  } finally { vi.useRealTimers() }
})
