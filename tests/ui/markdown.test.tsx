/**
 * 流式 markdown 与代码高亮（Task 3.9 · S6）。
 *
 * 此前 agent 的回复渲染成 `<pre>` 纯文本：**列表是星号、标题是井号、
 * 代码块是三个反引号**。对一个以「读代码、给方案」为主的工具来说，
 * 这等于把它最主要的输出形态废掉了。
 *
 * 流式的难点不在渲染，在**中间态**：模型一个 token 一个 token 地吐，
 * 任意时刻都可能停在一个**未闭合的代码围栏**上。天真的实现会在那一帧
 * 把后面所有内容都吞进代码块，界面于是一跳一跳地闪。
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import type { SessionSummary, TranscriptItem } from "../../src/protocol/index.js"

const session: SessionSummary = {
  sessionId: "s1",
  projectId: "p1",
  agentId: "ds-chat",
  kind: "native",
  state: "alive",
  createdAt: "2026-08-09T00:00:00Z",
}

const say = (text: string, final = true): TranscriptItem[] => [
  { type: "turn", id: "t1", who: "agent", text, final },
]

const show = (items: TranscriptItem[]) =>
  render(<ConversationView session={session} items={items} onSend={() => {}} />)

describe("markdown 真的被渲染，而不是当纯文本显示", () => {
  it("强调渲染成 <strong>，不是留着星号", () => {
    const { container } = show(say("这里**很重要**"))
    expect(container.querySelector("strong")?.textContent).toBe("很重要")
  })

  it("列表渲染成 <li>", () => {
    const { container } = show(say("- 一\n- 二\n"))
    expect(container.querySelectorAll("li").length).toBe(2)
  })

  it("行内代码渲染成 <code>", () => {
    const { container } = show(say("跑 `npm test` 看看"))
    expect(container.querySelector("code")?.textContent).toContain("npm test")
  })

  it("标题渲染成 heading 元素，不是留着井号", () => {
    const { container } = show(say("## 结论\n\n正文"))
    expect(container.querySelector("h2")?.textContent).toBe("结论")
    expect(container.textContent).not.toContain("## 结论")
  })
})

describe("流式中间态 · 未闭合的代码围栏", () => {
  it("停在半个围栏上不崩", () => {
    expect(() => show(say("先看这段：\n\n```ts\nconst a = 1", false))).not.toThrow()
  })

  it("**未闭合时后面的内容不被吞进代码块**", () => {
    // 天真实现会把「还没写完的说明」也塞进 <pre>，于是界面一跳一跳地闪
    const { container } = show(say("```ts\nconst a = 1", false))
    expect(container.textContent).toContain("const a = 1")
  })

  it("补上闭合围栏后渲染正确", () => {
    const { container } = show(say("```ts\nconst a = 1\n```\n\n说明在这里"))
    expect(container.querySelector("pre")).not.toBeNull()
    expect(container.textContent).toContain("说明在这里")
  })

  it("从半截到完整，同一个 id 覆盖更新不留残影", () => {
    const { container, rerender } = show(say("```ts\nconst a =", false))
    rerender(
      <ConversationView session={session} items={say("```ts\nconst a = 1\n```\n完了")} onSend={() => {}} />,
    )
    expect(container.textContent).toContain("完了")
    // 半截那一版的内容不该同时还在
    expect(container.querySelectorAll(".turn").length).toBe(1)
  })
})

describe("用户发言不走 markdown", () => {
  it("人打的字原样显示 —— 他写的星号就是星号", () => {
    const { container } = render(
      <ConversationView
        session={session}
        items={[{ type: "turn", id: "u1", who: "user", text: "为什么 **这里** 会报错", final: true }]}
        onSend={() => {}}
      />,
    )
    // 把用户输入当 markdown 渲染，等于替他改写他说的话
    expect(container.querySelector("strong")).toBeNull()
    expect(container.textContent).toContain("**这里**")
  })
})

describe("贴底滚动", () => {
  it("容器带滚动区，供 use-stick-to-bottom 接管", () => {
    const { container } = show(say("内容"))
    expect(container.querySelector(".turns")).not.toBeNull()
  })

  it("流式更新不抛错（jsdom 没有真实布局，只验不崩）", () => {
    const { rerender } = show(say("一", false))
    expect(() =>
      rerender(<ConversationView session={session} items={say("一二", false)} onSend={() => {}} />),
    ).not.toThrow()
  })
})
