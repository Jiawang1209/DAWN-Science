/**
 * 「优化输入」下面那行灰字说什么（2026-09-09，协议 7.33）。
 *
 * 起因是作者问：*「优化输入里面的逻辑，是不是基于我们选择的不同的 LLM 而设置的，
 * 应该不是锁死在某一个 LLM 的吧？」*
 *
 * 答案是没锁死——native 会话用的就是它此刻那个模型。**但 cli / ACP 会话与空态屏
 * 够不着自己的模型，只能借配置里第一个 native**，而界面此前对此一个字都不说：
 * 后端早就把 `model` 回过去了，界面把它扔了。
 *
 * 这条用例钉的就是那个缺口，外加它的反面：**没借的时候不许啰嗦**。
 */
import { describe, expect, it } from "vitest"
import { 说这一次 } from "../../src/ui/enhance.js"

const 借了 = { model: "deepseek/deepseek-chat", borrowed: true }
const 没借 = { model: "kimi/kimi-k2", borrowed: false }

describe("说这一次", () => {
  it("**借了别人的模型就要说出来**，并且带上是哪一个", () => {
    const 说 = 说这一次({ ...借了, usedContext: null })
    expect(说).toContain("deepseek/deepseek-chat")
  })

  it("**没借就一个字都不提模型**——那就是你屏幕上那颗 pill，再说一遍是噪音", () => {
    expect(说这一次({ ...没借, usedContext: null })).toBeUndefined()
    expect(说这一次({ ...没借, usedContext: { rounds: [1, 2] } })).not.toContain("kimi")
  })

  it("借了 + 带了上下文：两件事拼一行，各说各的", () => {
    const 说 = 说这一次({ ...借了, usedContext: { rounds: [1, 2] } })
    expect(说).toContain("deepseek/deepseek-chat")
    expect(说).toContain("对话第 1–2 轮")
  })

  it("借了 + 没带上下文并说了原因：两件都在", () => {
    const 说 = 说这一次({ ...借了, usedContext: null, note: "不像开发任务" })
    expect(说).toContain("deepseek/deepseek-chat")
    expect(说).toContain("不像开发任务")
  })

  it("**`note` 压过 `usedContext`**：后端给了理由就说理由，不再报一遍带了什么", () => {
    const 说 = 说这一次({ ...没借, usedContext: { rounds: [1, 2] }, note: "不像开发任务" })
    expect(说).toContain("不像开发任务")
    expect(说).not.toContain("对话第 1–2 轮")
  })

  it("没借、也没有任何上下文可说 → 什么都不说（不留一行空灰字）", () => {
    expect(说这一次({ ...没借, usedContext: null })).toBeUndefined()
  })
})
