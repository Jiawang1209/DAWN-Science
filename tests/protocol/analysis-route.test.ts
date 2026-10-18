import { describe, expect, it } from "vitest"
import { AnalysisRouteDraftSchema, AnalysisRouteSchema, routeActionMessage } from "../../src/protocol/analysis-route.js"

const draft = () => ({
  title: "表达分析", goal: "比较处理组", dataContext: ["data/raw/counts.csv"],
  steps: [step("S1"), step("S2", ["S1"]), step("S3", ["S2"])],
})
const step = (id: string, dependencies: string[] = []) => ({
  id, title: id, purpose: "核对输入", inputs: ["counts"], outputs: ["report"], dependencies,
  status: "pending" as const, blockers: [] as string[], cases: [
    { server: "mlai", caseId: "r/example", title: "Example", coverage: "表达分析", evidence: "metadata" as const },
  ], deliverables: [] as { path: string; note?: string }[],
  execution: { state: "not_run" as const, note: "尚未运行" },
  verification: { state: "unreviewed" as const, note: "尚未审查" }, needsReview: false, notes: [] as string[],
})

// These fixtures are deliberately local to the contract tests; runtime tests construct their own routes.
describe("analysis route contract", () => {
  it("accepts a DAG, independent execution facts and the same case across steps", () => {
    const input = draft()
    const parsed = AnalysisRouteDraftSchema.parse(input)
    expect(parsed).toEqual(input)
    expect(AnalysisRouteSchema.safeParse({ ...input, routeId: "route-a", revision: 1, updatedAt: 1 }).success).toBe(true)
    expect(AnalysisRouteDraftSchema.safeParse({ ...input, revision: 1 }).success).toBe(false)
    expect(AnalysisRouteSchema.safeParse({ ...input, routeId: "route-a", revision: 0, updatedAt: 1 }).success).toBe(false)
  })
  it("rejects duplicate IDs, missing dependencies, repeated dependencies, self edges and cycles", () => {
    const examples = [ [step("S1"), step("S1")], [step("S1", ["missing"])], [step("S1", ["S1"])],
      [step("S1", ["S2", "S2"]), step("S2")], [step("S1", ["S2"]), step("S2", ["S1"])]]
    for (const steps of examples) expect(AnalysisRouteDraftSchema.safeParse({ ...draft(), steps }).success).toBe(false)
  })
  it("requires selected cases to be current candidates and rejects duplicate candidate identities", () => {
    const first = step("S1")
    expect(AnalysisRouteDraftSchema.safeParse({ ...draft(), steps: [{ ...first, selectedCase: { server: "other", caseId: "r/example" } }] }).success).toBe(false)
    expect(AnalysisRouteDraftSchema.safeParse({ ...draft(), steps: [{ ...first, cases: [...first.cases, ...first.cases] }] }).success).toBe(false)
    expect(AnalysisRouteDraftSchema.safeParse({ ...draft(), steps: [{ ...first, selectedCase: { server: "mlai", caseId: "r/example" } }] }).success).toBe(true)
  })
  it.each(["../report.csv", "/tmp/report.csv", "a/../../report.csv", "https://a/report", "C:\\report.csv", "C:report.csv", "a\\..\\report", "//server/share", "a/../report.csv", "file:report.csv"])("rejects unsafe deliverable path %s", (path) => {
    expect(AnalysisRouteDraftSchema.safeParse({ ...draft(), steps: [{ ...step("S1"), deliverables: [{ path }] }] }).success).toBe(false)
  })
  it("requires notes for review conclusions and accepts relative deliverables", () => {
    const first = { ...step("S1"), deliverables: [{ path: "analysis/report.csv" }] }
    expect(AnalysisRouteDraftSchema.safeParse({ ...draft(), steps: [first] }).success).toBe(true)
    expect(AnalysisRouteDraftSchema.safeParse({ ...draft(), steps: [{ ...first, verification: { state: "reviewed", note: "" } }] }).success).toBe(false)
  })
  it("produces scoped read-only requests and a continue request that preserves the authorization gate", () => {
    const route = AnalysisRouteSchema.parse({ ...draft(), routeId: "route-a", revision: 3, updatedAt: 1 })
    for (const action of ["view", "search", "continue"] as const) {
      const message = routeActionMessage(route, "S2", action)
      for (const part of ["route-a", "revision=3", "stepId=S2"]) expect(message).toContain(part)
      if (action !== "continue") expect(message).toContain("不执行")
      else { expect(message).toContain("原有授权"); expect(message).toContain("方案"); expect(message).toContain("其他步骤") }
    }
    expect(() => routeActionMessage(route, "unknown", "view")).toThrow()
  })
})
