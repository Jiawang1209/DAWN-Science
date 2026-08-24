/**
 * 记忆快照渲染(2026-08-25):三段 + 分支过滤 + 固定职责文本。
 */
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { MemoryStore } from "../../src/memory/store.js"
import { 渲染快照 } from "../../src/memory/snapshot.js"

describe("记忆快照", () => {
  it("三轨齐 → 各出一段 + 固定职责文本;全空回空串(不注入)", () => {
    const 根 = mkdtempSync(join(tmpdir(), "snap-"))
    const ws = mkdtempSync(join(tmpdir(), "ws-"))
    const s = new MemoryStore(根)
    expect(渲染快照(s, ws, undefined)).toBe("")
    s.add("user", "偏好中文")
    s.add("key", "口径用基线年龄", { workspace: ws })
    const 文 = 渲染快照(s, ws, undefined)
    expect(文).toContain("偏好中文")
    expect(文).toContain("口径用基线年龄")
    expect(文).toContain("memory_propose") // 固定职责文本
    expect(文).toContain("skill_propose")
  })

  it("key 按分支过滤:[branch:dev] 在 main 不注入;无标记 = 全部;分支名一并注入", () => {
    const 根 = mkdtempSync(join(tmpdir(), "snap-"))
    const ws = mkdtempSync(join(tmpdir(), "ws-"))
    const s = new MemoryStore(根)
    s.add("key", "只在 dev", { workspace: ws, branches: ["dev"] })
    s.add("key", "全分支可见", { workspace: ws })
    const 文 = 渲染快照(s, ws, "main")
    expect(文).not.toContain("只在 dev")
    expect(文).toContain("全分支可见")
    expect(文).toContain("main")
    // 没给分支(非 git):不过滤,两条都在
    const 全 = 渲染快照(s, ws, undefined)
    expect(全).toContain("只在 dev")
  })

  it("没有工作区:key 段不渲染,全局轨照常;条目里的 [id:] 剥掉不进上下文", () => {
    const 根 = mkdtempSync(join(tmpdir(), "snap-"))
    const s = new MemoryStore(根)
    s.add("memory", "全局事实一条")
    const 文 = 渲染快照(s, undefined, undefined)
    expect(文).toContain("全局事实一条")
    expect(文).not.toContain("[id:")
  })
})
