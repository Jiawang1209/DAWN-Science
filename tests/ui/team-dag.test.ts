/** 团队面板的纯逻辑（2026-08-23，学自 dsh-agent-teams 的 activity-model） */
import { describe, expect, it } from "vitest"
import { 任务的态, 任务深度, 分列布局, 相关任务, 短标题, 色号, 首字, 节点宽, 列距, type 任务 } from "../../src/ui/team-dag.js"

const 造 = (id: string, status: 任务["status"], deps: string[] = []): 任务 =>
  ({ id, subject: `任务 ${id}`, status, dependencies: deps, attempt: 1, createdAt: 0, updatedAt: 0 }) as 任务

const 六 = [
  造("t1", "completed"),
  造("t2", "in_progress", ["t1"]),
  造("t3", "pending", ["t1"]),
  造("t4", "pending", ["t1"]),
  造("t5", "pending", ["t1"]),
  造("t6", "pending", ["t2", "t3", "t4", "t5"]),
]

describe("任务的态", () => {
  it("领了 = running；待领但上游没完 = blocked；待领能领 = open；完成 / 失败各归各", () => {
    expect(任务的态(六[1]!, 六)).toBe("running")
    expect(任务的态(六[5]!, 六)).toBe("blocked")
    expect(任务的态(六[2]!, 六)).toBe("open")
    expect(任务的态(六[0]!, 六)).toBe("completed")
    expect(任务的态(造("x", "failed"), 六)).toBe("dead")
  })
})

describe("分列布局", () => {
  it("列 = 依赖深度：t1 第 0 列，t2–t5 第 1 列，t6 第 2 列；边从上游右缘到下游左缘", () => {
    expect([...任务深度(六).entries()]).toEqual([["t1", 0], ["t2", 1], ["t3", 1], ["t4", 1], ["t5", 1], ["t6", 2]])
    const 布 = 分列布局(六)
    const x = (id: string) => 布.nodes.find((n) => n.task.id === id)!.x
    expect(x("t1")).toBe(0)
    expect(x("t3")).toBe(节点宽 + 列距)
    expect(x("t6")).toBe(2 * (节点宽 + 列距))
    expect(布.edges).toHaveLength(8)
    expect(布.edges.find((e) => e.from === "t1" && e.to === "t2")?.path).toMatch(/^M92 15C/)
    expect(布.平行).toBe(false)
  })
  it("全没依赖 = 平行网格；环不死循环", () => {
    expect(分列布局([造("a", "pending"), 造("b", "pending")]).平行).toBe(true)
    const 环 = [造("a", "pending", ["b"]), 造("b", "pending", ["a"])]
    expect(() => 分列布局(环)).not.toThrow()
  })
  it("同列按 id 里的数字排：t2 在 t10 前", () => {
    const 布 = 分列布局([造("t10", "pending"), 造("t2", "pending"), 造("t1", "pending")])
    expect(布.nodes.map((n) => n.task.id)).toEqual(["t1", "t2", "t10"])
  })
})

describe("相关任务 / 短标题 / 头像", () => {
  it("上游 + 下游整条链", () => {
    expect([...相关任务("t3", 六)].sort()).toEqual(["t1", "t3", "t6"])
    expect([...相关任务("t1", 六)].sort()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"])
    expect(相关任务("没有", 六).size).toBe(0)
  })
  it("短标题去序号、截到分隔符、最长 18", () => {
    expect(短标题("1. 收集最近两周 git 提交历史并分类")).toBe("收集最近两周 git 提交历史并分类")
    expect(短标题("收集最近两周的全部 git 提交历史并分类归档")).toBe("收集最近两周的全部 git 提交历…")
    expect(短标题("安全 review（含依赖）")).toBe("安全 review")
  })
  it("色号稳定在 0..7；首字取第一个字符", () => {
    expect(色号("git-historian")).toBe(色号("git-historian"))
    expect(色号("a")).toBeGreaterThanOrEqual(0)
    expect(色号("a")).toBeLessThan(8)
    expect(首字("踏勘")).toBe("踏")
    expect(首字("feature-analyst")).toBe("F")
  })
})
