/**
 * 缝一：贴图转述的三种走向（2026-08-20，`writeWithImages`）。
 *
 * **白盒**：真起一段 pi 会话要网络与凭证，这里直接往私有表里塞一段假会话、
 * 换掉 `送一轮`，只验分岔本身——哪一路发了什么、说了什么。
 * 端到端那一半（mock 服务器真收到转述文字）归 e2e。
 */
import { describe, expect, it, vi } from "vitest"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"

const 端点 = { baseUrl: "https://v.example/v1", model: "qwen-vl", apiKey: "k" }
const 一张图 = [{ data: "aGk=", mimeType: "image/png" }]

function 摆一段(opts: { vision?: () => typeof 端点 | undefined; input?: string[] }) {
  const rt = new NativeRuntime(opts.vision ? { vision: opts.vision } : {})
  const 内部 = rt as unknown as {
    sessions: Map<string, unknown>
    sinks: Map<string, ((e: AgentEvent) => void)[]>
    送一轮: (sessionId: string, data: string, images?: unknown, behavior?: unknown) => void
  }
  内部.sessions.set("s1", { session: { model: { id: "deepseek-v4", input: opts.input ?? ["text"] } } })
  const 送了: { data: string; images?: unknown }[] = []
  内部.送一轮 = (_id, data, images) => 送了.push({ data, ...(images ? { images } : {}) })
  const 说了: string[] = []
  内部.sinks.set("s1", [(e) => { if (e.kind === "notice") 说了.push(e.text) }])
  return { rt, 送了, 说了 }
}

const 等一拍 = () => new Promise((r) => setTimeout(r, 20))

describe("writeWithImages 的分岔", () => {
  it("模型收图：直接发，一个字不多说", async () => {
    const { rt, 送了, 说了 } = 摆一段({ input: ["text", "image"], vision: () => 端点 })
    rt.writeWithImages("s1" as never, "看这张", 一张图)
    await 等一拍()
    expect(送了).toEqual([{ data: "看这张", images: 一张图 }])
    expect(说了).toEqual([])
  })

  it("不收图、视觉没配：原来那句照说，照发", async () => {
    const { rt, 送了, 说了 } = 摆一段({ vision: () => undefined })
    rt.writeWithImages("s1" as never, "看这张", 一张图)
    await 等一拍()
    expect(送了).toEqual([{ data: "看这张", images: 一张图 }])
    expect(说了.join("")).toContain("没有声明支持图片")
  })

  it("不收图、视觉可用：先转述再发，描述并进文字、图仍然带着", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "一块红色方块" } }] })),
    ))
    try {
      const { rt, 送了, 说了 } = 摆一段({ vision: () => 端点 })
      rt.writeWithImages("s1" as never, "看这张", 一张图)
      await vi.waitFor(() => expect(送了).toHaveLength(1))
      expect(送了[0]!.data).toContain("看这张")
      expect(送了[0]!.data).toContain("一块红色方块")
      expect(送了[0]!.data).toContain("qwen-vl 转述")
      expect(送了[0]!.images).toEqual(一张图)
      expect(说了.join("")).toContain("已由 qwen-vl 转述")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("不收图、视觉挂了：**说清原因，这一轮照发**——对话是要有的", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })))
    try {
      const { rt, 送了, 说了 } = 摆一段({ vision: () => 端点 })
      rt.writeWithImages("s1" as never, "看这张", 一张图)
      await vi.waitFor(() => expect(送了).toHaveLength(1))
      expect(送了[0]!.data).toBe("看这张")
      expect(说了.join("")).toMatch(/视觉转述失败.*500/s)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
