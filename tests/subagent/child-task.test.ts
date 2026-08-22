/**
 * 子侧任务的执行逻辑（①-B″ · S1 第三片）。
 *
 * 这一层不认识进程、不认识 stdin/stdout——那是 `child.ts` 的事。
 * 它只回答：**给一个规格和一个 pi 会话，怎么得到一条 `done`。**
 *
 * 拆开的理由是可测：真跑 pi 要有模型、要有凭证、要发网络请求，
 * 而这里要验的全是**边界行为**（空输出、报错、异常），
 * 那些恰恰是真会话里最难稳定复现的。真链路由另一条集成测试守。
 */
import { describe, expect, it } from "vitest"
import { runChildTask } from "../../src/subagent/child-task.js"
import type { SubagentChildSpec } from "../../src/subagent/protocol.js"
import type { ChildPiSession } from "../../src/subagent/child-task.js"

const SPEC: SubagentChildSpec = {
  agent: "scout",
  task: "找认证代码",
  systemPrompt: "你是踏勘员。",
  provider: "deepseek",
  model: "deepseek-v4-flash",
  cwd: "/tmp/w",
  agentDir: "/tmp/w/.dawn/x/pi",
}

/** 一个假的 pi 会话：`prompt()` 时按脚本吐事件 */
function fakeSession(script: {
  deltas?: string[]
  throws?: string
  emitError?: string
}): () => Promise<ChildPiSession> {
  return async () => {
    let cb: ((e: unknown) => void) | undefined
    return {
      subscribe(fn) {
        cb = fn
        return () => {
          cb = undefined
        }
      },
      async prompt() {
        for (const d of script.deltas ?? []) {
          cb?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: d } })
        }
        if (script.emitError) cb?.({ type: "error", errorMessage: script.emitError })
        if (script.throws) throw new Error(script.throws)
      },
    }
  }
}

describe("正常跑完", () => {
  it("助手的文本增量攒成一条输出", async () => {
    const r = await runChildTask(SPEC, fakeSession({ deltas: ["找到了 ", "三处", "认证代码"] }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.output).toBe("找到了 三处认证代码")
  })
})

describe("**空输出算失败，不算成功且无内容**", () => {
  /**
   * 这条是刻意的取舍，理由与执行器那边「退出码 0 但没给出 done」同源：
   *
   * chain 模式会把上一步的输出当 `{previous}` 传给下一步。
   * 把空串当成功传下去，下一步就会**基于一段并不存在的结论**去做计划——
   * 而它看不出这段结论是空的。**空结果必须在这里就变成失败。**
   */
  it("一个字都没吐 —— 报失败并说清", async () => {
    const r = await runChildTask(SPEC, fakeSession({ deltas: [] }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/没有|输出/)
  })

  /**
   * **团队成员例外**（2026-08-22 作者实测定的）：成员常把意见写进文件、最后一句没说话——那是做完了。
   * 记成完成，但结果里明说「没有文字结果」，下游与队长看到的是实话。
   */
  it("成员模式：没文字 = 完成，但结果里明说没有文字结果、要去核文件", async () => {
    const r = await runChildTask({ ...SPEC, member: { team: "t", name: "审稿", sessionDir: "/x", resume: false } }, fakeSession({ deltas: [] }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.output).toMatch(/审稿.*没有给出文字结果/)
    expect(r.ok && r.output).toMatch(/核对产物/)
  })

  it("只吐了空白也算空", async () => {
    const r = await runChildTask(SPEC, fakeSession({ deltas: ["  ", "\n"] }))
    expect(r.ok).toBe(false)
  })
})

describe("出错时说清楚", () => {
  it("prompt 抛异常 —— 转成 done(ok:false)，不让它冒泡", async () => {
    const r = await runChildTask(SPEC, fakeSession({ throws: "余额不足" }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain("余额不足")
  })

  it("**事件流里的错误也要带出来** —— 它不会让 prompt 抛", async () => {
    const r = await runChildTask(
      SPEC,
      fakeSession({ deltas: ["写了一半"], emitError: "上游 429" }),
    )
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain("上游 429")
    // 已经吐出来的那半截也要带上——排查时它是唯一的线索
    expect(!r.ok && r.error).toContain("写了一半")
  })

  it("建会话就失败 —— 同样是一条 done，不是崩溃", async () => {
    const r = await runChildTask(SPEC, async () => {
      throw new Error("模型 deepseek/xxx 不存在")
    })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain("不存在")
  })
})

describe("收尾", () => {
  it("**订阅要退掉** —— 子进程虽然马上就退，但泄漏的订阅会挡住 exit", async () => {
    let unsubscribed = false
    await runChildTask(SPEC, async () => ({
      subscribe() {
        return () => {
          unsubscribed = true
        }
      },
      async prompt() {
        // 什么都不吐，走失败分支——**失败路径上也必须退订**
      },
    }))
    expect(unsubscribed).toBe(true)
  })
})
