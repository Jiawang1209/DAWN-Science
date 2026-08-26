/**
 * 模型与推理强度**钉在发送键左边**（2026-08-27，作者 #3/#4）。
 *
 * 作者报了两件：
 *   #3 推理强度（`thought_level`）此前在底部那颗 `SessionConfigMenu` 里、挨着权限——
 *      它该跟着模型走，摆到发送键左边那一行。
 *   #4 模型对 ACP 会话（`models` 为空、`ModelPill` 自己不画）也掉进了那颗底部菜单、
 *      同样挨着权限。模型不论哪类会话都该固定在顶行同一个槽位。
 *
 * 于是顶行永远是 `[模型] [推理强度] [发送]`：
 *   - 内置 / cli：模型走 `ModelPill`；
 *   - ACP：模型走会话开关里 `category: "model"` 的那颗 `ConfigPill`，同一个槽位。
 *   - 推理强度：会话开关里 `category: "thought_level"` 的那颗 `ConfigPill`，紧跟模型。
 *
 * 底部那颗 `SessionConfigMenu` 只剩其余 ACP 开关；权限那颗（`PermissionPill`）
 * **不动**，仍在附栏——作者只反对模型/推理强度掉下去，不反对权限在下面。
 */
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ConversationView } from "../../src/ui/views.js"
import type { SessionSummary } from "../../src/protocol/index.js"
import type { 会话开关 } from "../../src/ui/state/transcript.js"

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: "s1",
  projectId: "p1",
  agentId: "claude-code-acp",
  kind: "native",
  pinned: false,
  sortOrder: 1,
  state: "alive",
  createdAt: "2026-08-27T00:00:00Z",
  ...over,
})

const 推理: 会话开关 = {
  id: "think",
  name: "推理强度",
  category: "thought_level",
  kind: "select",
  current: "medium",
  options: [
    { value: "low", name: "低" },
    { value: "medium", name: "中" },
    { value: "high", name: "高" },
  ],
}
const 模型开关: 会话开关 = {
  id: "model",
  name: "模型",
  category: "model",
  kind: "select",
  current: "opus",
  options: [
    { value: "opus", name: "Opus 4.6" },
    { value: "sonnet", name: "Sonnet 4.6" },
  ],
}
const 详细: 会话开关 = {
  id: "verbosity",
  name: "详细程度",
  category: "verbosity",
  kind: "select",
  current: "normal",
  options: [
    { value: "normal", name: "正常" },
    { value: "terse", name: "简洁" },
  ],
}
const 权限档开关: 会话开关 = {
  id: "dawn.permission",
  name: "权限",
  category: "mode",
  kind: "select",
  current: "ask",
  options: [{ value: "ask", name: "请求批准" }],
}

/** 先于后一个的 DOM 顺序判定（compareDocumentPosition 的可读封装） */
function 在前(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe("顶行：模型与推理强度钉在发送键左边", () => {
  it("**内置会话**：推理 pill 落在 .composer-controls 里、模型之后发送之前；底部菜单里没有它", () => {
    const { container } = render(
      <ConversationView
        session={session()}
        items={[]}
        onSend={() => {}}
        models={[{ provider: "deepseek", model: "deepseek-v4" }]}
        model={{ provider: "deepseek", model: "deepseek-v4" }}
        onPickModel={() => {}}
        会话开关们={[推理, 详细]}
        onSetConfigOption={() => {}}
      />,
    )
    const 顶行 = container.querySelector(".composer-controls")!
    const 模型pill = 顶行.querySelector(".model-pill")!
    const 推理pill = 顶行.querySelector(".config-pill")!
    const 发送 = 顶行.querySelector(".send-btn")!
    expect(模型pill).not.toBeNull()
    expect(推理pill).not.toBeNull()
    expect(发送).not.toBeNull()
    // 内置会话 models 有值 → 模型走 ModelPill，不再多长一颗模型 config-pill
    expect(顶行.querySelectorAll(".config-pill")).toHaveLength(1)
    // 触发器上写当前那一项的短名
    expect(推理pill.textContent).toContain("中")
    // 顺序：模型 → 推理 → 发送
    expect(在前(模型pill, 推理pill)).toBe(true)
    expect(在前(推理pill, 发送)).toBe(true)

    // 推理强度不在附栏
    expect(container.querySelector(".composer-footer .config-pill")).toBeNull()

    // 底部那颗 SessionConfigMenu 只收剩下的开关，打开看：有「详细程度」，没有「推理强度」
    const 底菜单 = container.querySelector(".composer-footer .sess-config:not(.config-pill)")!
    expect(底菜单).not.toBeNull()
    fireEvent.click(底菜单.querySelector(".sess-config-trigger")!)
    const 弹层 = 底菜单.querySelector(".sess-config-menu")!
    expect(弹层.textContent).toContain("详细程度")
    expect(弹层.textContent).not.toContain("推理强度")
  })

  it("**ACP 会话**：models 为空时模型走 config-pill，模型与推理都在顶行；底部菜单里没有模型/推理/权限档", () => {
    const { container } = render(
      <ConversationView
        session={session({ kind: "native" })}
        items={[]}
        onSend={() => {}}
        models={[]}
        onPickModel={() => {}}
        会话开关们={[模型开关, 推理, 详细, 权限档开关]}
        onSetConfigOption={() => {}}
      />,
    )
    const 顶行 = container.querySelector(".composer-controls")!
    // models 为空 → ModelPill 不画
    expect(顶行.querySelector(".model-pill")).toBeNull()
    // 顶行两颗 config-pill：模型 + 推理
    const 两颗 = 顶行.querySelectorAll(".config-pill")
    expect(两颗).toHaveLength(2)
    const [模型pill, 推理pill] = [两颗[0]!, 两颗[1]!]
    expect(模型pill.textContent).toContain("Opus 4.6")
    expect(推理pill.textContent).toContain("中")
    const 发送 = 顶行.querySelector(".send-btn")!
    expect(在前(模型pill, 推理pill)).toBe(true)
    expect(在前(推理pill, 发送)).toBe(true)

    // 底部菜单只剩「详细程度」——模型 / 推理强度 / 权限档一个都不在里面
    const 底菜单 = container.querySelector(".composer-footer .sess-config:not(.config-pill)")!
    fireEvent.click(底菜单.querySelector(".sess-config-trigger")!)
    const 弹层 = 底菜单.querySelector(".sess-config-menu")!
    expect(弹层.textContent).toContain("详细程度")
    expect(弹层.textContent).not.toContain("模型")
    expect(弹层.textContent).not.toContain("推理强度")
    expect(弹层.textContent).not.toContain("请求批准")
  })

  it("**权限 pill 仍在附栏，没有被搬走**", () => {
    const { container } = render(
      <ConversationView
        session={session()}
        items={[]}
        onSend={() => {}}
        models={[]}
        会话开关们={[模型开关, 推理]}
        onSetConfigOption={() => {}}
        权限={{ 当前: "ask-risky", 跟随默认: false, onPick: () => {} }}
      />,
    )
    expect(container.querySelector(".composer-footer .perm-pill")).not.toBeNull()
    // 权限没跑到顶行去
    expect(container.querySelector(".composer-controls .perm-pill")).toBeNull()
  })
})
