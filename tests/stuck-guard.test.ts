/**
 * 卡死守卫（①-B″ · R1）。
 *
 * 模型退化时会反复发出**完全相同的工具调用**，每次拿回同样的结果，毫无进展。
 * pi 不管这件事（全包 grep `stuck|repeated|no_progress` 零命中），
 * 于是它会一路烧到迭代上限——**烧的是作者的钱**。
 *
 * ## 为什么直接做窗口式
 *
 * wisp-science 在这里留了一道疤，测试名字就叫
 * `interspersed_tool_call_loop_breaks_the_loop`，注释是：
 *
 * > *"the case the **old consecutive-only guard** let run to max_iter"*
 *
 * **连续式守卫会被 A/B/A/B 绕过去。** 他们踩过一次才改成窗口式，
 * 我们直接从窗口式起步——**别人的疤是可以不重复的**。
 */
import { describe, expect, it } from "vitest"
import { StuckGuard, STUCK_REPEAT_LIMIT, STUCK_WINDOW } from "../src/runtime/stuck-guard.js"

/** 造一批工具调用 */
const batch = (...calls: [string, unknown][]) => calls.map(([name, input]) => ({ name, input }))

const ls = batch(["bash", { command: "ls" }])
const pwd = batch(["bash", { command: "pwd" }])

describe("连续重复", () => {
  it("重复次数没到阈值 ⇒ 不判卡死", () => {
    const g = new StuckGuard()
    for (let i = 0; i < STUCK_REPEAT_LIMIT - 1; i++) {
      expect(g.check(ls)).toBeUndefined()
    }
  })

  it("到阈值 ⇒ 判卡死，并给出原因", () => {
    const g = new StuckGuard()
    let verdict: string | undefined
    for (let i = 0; i < STUCK_REPEAT_LIMIT; i++) verdict = g.check(ls)
    expect(verdict).toBeDefined()
    // **不出声地停是不允许的**——原因要能进 transcript
    expect(verdict).toMatch(/相同|重复/)
    expect(verdict).toContain("bash")
  })
})

describe("交替重复 —— 连续式守卫会漏掉这一类", () => {
  it("A/B/A/B/… 同样判卡死", () => {
    const g = new StuckGuard()
    let verdict: string | undefined
    // 交替发送，任意两次相邻的批次都不相同，连续式守卫在这里完全失效
    for (let i = 0; i < STUCK_REPEAT_LIMIT * 2; i++) {
      verdict = g.check(i % 2 === 0 ? ls : pwd)
      if (verdict) break
    }
    expect(verdict, "交替调用没有被判定为卡死——这正是连续式守卫的漏洞").toBeDefined()
  })
})

describe("有进展就不该被误伤", () => {
  it("每次参数都不同 ⇒ 永不判卡死", () => {
    const g = new StuckGuard()
    for (let i = 0; i < STUCK_WINDOW * 3; i++) {
      expect(g.check(batch(["bash", { command: `echo ${i}` }]))).toBeUndefined()
    }
  })

  it("窗口滑出之后旧的重复不再计数", () => {
    const g = new StuckGuard()
    // 先来几次 ls，但不到阈值
    for (let i = 0; i < STUCK_REPEAT_LIMIT - 1; i++) g.check(ls)
    // 再灌满一整个窗口的不同调用，把那几次 ls 挤出去
    for (let i = 0; i < STUCK_WINDOW; i++) g.check(batch(["bash", { command: `echo ${i}` }]))
    // 此时再来一次 ls 不该触发
    expect(g.check(ls)).toBeUndefined()
  })
})

describe("签名", () => {
  it("参数键序不同但内容相同 ⇒ 算同一个调用", () => {
    const g = new StuckGuard()
    let verdict: string | undefined
    for (let i = 0; i < STUCK_REPEAT_LIMIT; i++) {
      // JSON.stringify 对键序敏感，会把这两个当成不同调用而漏判
      verdict = g.check(
        i % 2 === 0
          ? batch(["edit", { path: "a.ts", content: "x" }])
          : batch(["edit", { content: "x", path: "a.ts" }]),
      )
    }
    expect(verdict, "键序不同就被当成不同调用了——签名必须对键排序").toBeDefined()
  })

  it("同名不同参 ⇒ 不同签名", () => {
    const g = new StuckGuard()
    for (let i = 0; i < STUCK_REPEAT_LIMIT * 2; i++) {
      expect(g.check(batch(["read", { path: `f${i}.ts` }]))).toBeUndefined()
    }
  })

  it("一批里多个调用，整批作为一个签名", () => {
    const g = new StuckGuard()
    let verdict: string | undefined
    for (let i = 0; i < STUCK_REPEAT_LIMIT; i++) {
      verdict = g.check(batch(["read", { path: "a" }], ["read", { path: "b" }]))
    }
    expect(verdict).toBeDefined()
  })

  it("循环引用的入参不炸 —— 工具入参是模型给的，不可信", () => {
    const g = new StuckGuard()
    const cyclic: Record<string, unknown> = { name: "x" }
    cyclic.self = cyclic
    expect(() => g.check(batch(["weird", cyclic]))).not.toThrow()
  })
})

describe("重置", () => {
  it("新回合开始时清空 —— 上一轮的重复不该算到这一轮头上", () => {
    const g = new StuckGuard()
    for (let i = 0; i < STUCK_REPEAT_LIMIT - 1; i++) g.check(ls)
    g.reset()
    for (let i = 0; i < STUCK_REPEAT_LIMIT - 1; i++) {
      expect(g.check(ls)).toBeUndefined()
    }
  })
})
