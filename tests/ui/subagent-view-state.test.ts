/**
 * 坞里「子 agent」那一格正在看谁（2026-09-27 审查）。
 *
 * ①换看 / 放下**同步**清掉上一个的过程与头信息——不许有一帧是「B 的 id + A 的过程与能不能问」，那一帧里提交会发给 B；
 * ②格子不在眼前（切到别的格、坞收起）或它的父会话既不在主区也不在坞里：放下（→ `App` 那段 effect 退订）。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { 看子agent, 子转录该放下, 放下不该看的子转录, 子槽, $子agent信息, $子转录id } from "../../src/ui/state/subagent-view.js"
import { $rightDockOpen, $rightDockTenant } from "../../src/ui/state/right-dock.js"
import { $侧边会话id } from "../../src/ui/state/side-chat.js"

afterEach(() => {
  子槽.reset()
  $子agent信息.set(undefined)
  $子转录id.set(undefined)
  $rightDockOpen.set(false)
  $侧边会话id.set(undefined)
})

const A = "s1#sub:c1:0"
const B = "s1#sub:c1:1"

describe("看子agent：同步换人", () => {
  it("换看 B 的那一刻，A 的过程与「能问」已经没了", () => {
    $子转录id.set(A)
    子槽.setItems([{ type: "turn", id: "u", who: "user", text: "A 的任务", final: true }])
    $子agent信息.set({ agent: "a", task: "t", status: "ok", canAsk: true })
    const 见过: string[] = []
    const 停 = $子转录id.listen((id) => {
      // 订阅者看到 B 的那一刻（React 就在这一拍重渲染），槽与头信息必须已经清了
      见过.push(`${id}|${子槽.$items.get().length}|${$子agent信息.get()?.canAsk ?? "-"}`)
    })
    看子agent(B)
    停()
    expect(见过).toEqual([`${B}|0|-`])
  })
  it("放下（undefined）也同步清", () => {
    $子转录id.set(A)
    $子agent信息.set({ agent: "a", task: "t", status: "ok", canAsk: true })
    看子agent(undefined)
    expect($子转录id.get()).toBeUndefined()
    expect($子agent信息.get()).toBeUndefined()
  })
  it("还是同一个：什么都不动（不把已取到的清掉）", () => {
    $子转录id.set(A)
    $子agent信息.set({ agent: "a", task: "t", status: "ok", canAsk: true })
    看子agent(A)
    expect($子agent信息.get()?.canAsk).toBe(true)
  })
})

describe("子转录该放下", () => {
  const 在看 = { dockOpen: true, tenant: "subagent", 主: "s1", 侧: undefined } as const
  it("格子开着、父会话是主区那段：留着", () => {
    expect(子转录该放下(A, 在看)).toBe(false)
  })
  it("切到别的格：放下", () => {
    expect(子转录该放下(A, { ...在看, tenant: "chat" })).toBe(true)
  })
  it("坞收起：放下", () => {
    expect(子转录该放下(A, { ...在看, dockOpen: false })).toBe(true)
  })
  it("父会话是坞里那段：留着；坞里换了一段：放下", () => {
    expect(子转录该放下("s2#sub:c1:0", { ...在看, 侧: "s2" })).toBe(false)
    expect(子转录该放下("s2#sub:c1:0", { ...在看, 侧: "s3" })).toBe(true)
  })
  it("什么都没看：无事", () => {
    expect(子转录该放下(undefined, { ...在看, dockOpen: false })).toBe(false)
  })
})

describe("放下不该看的子转录（读此刻的坞与侧边）", () => {
  it("坞从「子 agent」切走 → 放下、同步清", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("subagent")
    看子agent(A)
    放下不该看的子转录("s1")
    expect($子转录id.get()).toBe(A)
    $rightDockTenant.set("chat")
    放下不该看的子转录("s1")
    expect($子转录id.get()).toBeUndefined()
  })
  it("坞里那段走了 → 它派的那个放下", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("subagent")
    $侧边会话id.set("s2")
    看子agent("s2#sub:c9:0")
    放下不该看的子转录("s1")
    expect($子转录id.get()).toBe("s2#sub:c9:0")
    $侧边会话id.set("s3")
    放下不该看的子转录("s1")
    expect($子转录id.get()).toBeUndefined()
  })
})

describe("App.tsx 的接线", () => {
  const src = readFileSync(join(__dirname, "../../src/ui/App.tsx"), "utf8")
  it("换看谁只走 `看子agent`（它同步清槽）——没有直接 `$子转录id.set(`", () => {
    expect(src.includes("$子转录id.set(")).toBe(false)
  })
  it("放下那段 effect 跟着坞开合、坞格、主区与坞里那段一起变", () => {
    const m = src.match(/放下不该看的子转录\(sessionId\)\s*\}, \[([^\]]*)\]\)/)
    expect(m, "放下那段 effect 不在了——这条扫描要跟着改").not.toBeNull()
    const deps = m![1]!.split(",").map((x) => x.trim())
    for (const d of ["sessionId", "侧边id", "rightDockOpen", "rightDockTenant"]) expect(deps).toContain(d)
  })
})
