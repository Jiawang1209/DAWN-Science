/**
 * 点了桌面通知之后「回到那段」（2026-09-28）：路由五种情形 + 门（启动时点的、窗口是点出来的——推丢了也要回到那段）。
 */
import { describe, expect, it, vi } from "vitest"
import { 回到那段, 通知回段门, type 回到那段依赖 } from "../../src/ui/open-session-route.js"
import type { ProjectSummary, SessionSummary, TaskSummary } from "../../src/protocol/index.js"

const 会话 = (sessionId: string, projectId: string, 多: Partial<SessionSummary> = {}) => ({ sessionId, projectId, ...多 }) as SessionSummary
const 任务 = (sessionId: string, workspace?: string) => ({ sessionId, ...(workspace ? { workspace } : {}) }) as TaskSummary
const 项目 = (projectId: string, workspace: string) => ({ projectId, workspace }) as ProjectSummary

function 依赖(o: Partial<回到那段依赖> = {}) {
  const 记 = { 开坞: 0, 切到: [] as [string, string | undefined][], 没了: 0 }
  const d: 回到那段依赖 = {
    侧边id: () => "side",
    tasks: () => [任务("t1", "/w/a")],
    sessions: () => [会话("s1", "pA"), 会话("old", "pA", { archivedAt: "2026-09-01" })],
    projects: () => [项目("pA", "/w/a"), 项目("pB", "/w/b")],
    查后端: async () => undefined,
    开坞: () => void 记.开坞++,
    切到: (id, pid) => void 记.切到.push([id, pid]),
    说没了: () => void 记.没了++,
    ...o,
  }
  return { d, 记 }
}

describe("回到那段：路由", () => {
  it("坞里挂着的那段 → 开坞，主区不动", async () => {
    const { d, 记 } = 依赖()
    expect(await 回到那段("side", d)).toBe("dock")
    expect(记).toEqual({ 开坞: 1, 切到: [], 没了: 0 })
  })
  it("任务名单里有 → 跟着切到任务的项目", async () => {
    const { d, 记 } = 依赖()
    expect(await 回到那段("t1", d)).toBe("main")
    expect(记.切到).toEqual([["t1", "pA"]])
  })
  it("当前项目 / 临时会话里有 → 切段，项目不动", async () => {
    const { d, 记 } = 依赖()
    expect(await 回到那段("s1", d)).toBe("main")
    expect(记.切到).toEqual([["s1", undefined]])
  })
  it("本地名单没有、后端在别的项目里找到 → 切项目再切段，不报「不在了」", async () => {
    const 查后端 = vi.fn(async () => 会话("x", "pB"))
    const { d, 记 } = 依赖({ 查后端 })
    expect(await 回到那段("x", d)).toBe("other")
    expect(查后端).toHaveBeenCalledWith("x")
    expect(记).toEqual({ 开坞: 0, 切到: [["x", "pB"]], 没了: 0 })
  })
  it("哪儿都没有 / 已归档 / 后端问不到 → 说一句，不静默", async () => {
    for (const 查后端 of [async () => undefined, async () => 会话("old", "pA", { archivedAt: "2026-09-01" }), async () => Promise.reject(new Error("断了"))]) {
      const { d, 记 } = 依赖({ 查后端 })
      expect(await 回到那段("old", d)).toBe("gone")
      expect(记).toEqual({ 开坞: 0, 切到: [], 没了: 1 })
    }
  })
})

describe("通知回段门", () => {
  it("门没开（名单还在取）时推来的不路由；开门拉一次，拉到的那段才路由", async () => {
    const 路由 = vi.fn(async () => {})
    const 取 = vi.fn(async () => "s1")
    const 门 = 通知回段门({ 取, 路由, 说: () => {} })
    await 门.推醒("s1")
    expect(取).not.toHaveBeenCalled()
    expect(路由).not.toHaveBeenCalled()
    await 门.开门()
    expect(路由).toHaveBeenCalledExactlyOnceWith("s1")
    await 门.开门()
    expect(取, "只有第一次开门算数").toHaveBeenCalledTimes(1)
  })
  it("冷启动（窗口是点通知点出来的、没有任何推送）：开门拉到就回到那段；没有就什么都不做", async () => {
    const 路由 = vi.fn(async () => {})
    await 通知回段门({ 取: async () => "cold", 路由, 说: () => {} }).开门()
    expect(路由).toHaveBeenCalledExactlyOnceWith("cold")
    路由.mockClear()
    await 通知回段门({ 取: async () => undefined, 路由, 说: () => {} }).开门()
    expect(路由).not.toHaveBeenCalled()
  })
  it("门开之后被推醒：去拉（读了就清），推来的 id 只在拉失败时兜底，失败要出声", async () => {
    const 路由 = vi.fn(async () => {})
    const 说 = vi.fn()
    const 队: (string | undefined)[] = [undefined, "s2", undefined]
    const 门 = 通知回段门({ 取: async () => 队.shift(), 路由, 说 })
    await 门.开门()
    await 门.推醒("s2")
    expect(路由).toHaveBeenCalledExactlyOnceWith("s2")
    await 门.推醒("s2")
    expect(路由, "已经拉走了：同一下点击不会切两次").toHaveBeenCalledTimes(1)
    const 坏门 = 通知回段门({ 取: async () => Promise.reject(new Error("没接上")), 路由, 说 })
    await 坏门.开门()
    await 坏门.推醒("s3")
    expect(说).toHaveBeenCalledTimes(2)
    expect(路由).toHaveBeenLastCalledWith("s3")
  })
})
