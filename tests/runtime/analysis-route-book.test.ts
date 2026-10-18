import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { AnalysisRouteBook } from "../../src/runtime/analysis-route-book.js"
import type { AnalysisRouteDraft, RouteStep } from "../../src/protocol/analysis-route.js"
const dirs: string[] = []
const location = () => { const dir = mkdtempSync(join(tmpdir(), "dawn-route-")); dirs.push(dir); return { dir, file: join(dir, "session", "analysis-route.json") } }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const step = (id: string, dependencies: string[] = []): RouteStep => ({
  id, title: id, purpose: "核对输入", inputs: ["counts"], outputs: ["report"], dependencies, status: "pending", blockers: [],
  cases: [{ server: "mlai", caseId: "r/example", title: "Example", coverage: "表达分析", evidence: "metadata" }],
  deliverables: [], execution: { state: "not_run", note: "尚未运行" }, verification: { state: "unreviewed", note: "尚未审查" }, needsReview: false, notes: [],
})
const draft = (): AnalysisRouteDraft => ({ title: "表达分析", goal: "比较处理组", dataContext: ["data/raw/counts.csv"], steps: [step("S1"), step("S2", ["S1"]), step("S3", ["S2"]), step("independent")] })
const asDraft = ({ routeId: _id, revision: _revision, updatedAt: _time, ...rest }: NonNullable<ReturnType<AnalysisRouteBook["read"]>>) => rest

describe("AnalysisRouteBook", () => {
  it("starts empty, CAS writes complete revisions, restores history, and protects returned values", () => {
    const { file } = location(), book = new AnalysisRouteBook(file)
    expect(book.read()).toBeUndefined(); expect(book.history()).toEqual([])
    const first = book.replace(0, draft())
    expect(first.revision).toBe(1); expect(first.routeId).toBeTruthy()
    first.steps[0]!.notes.push("mutated")
    expect(book.read()!.steps[0]!.notes).toEqual([])
    const second = book.replace(1, { ...draft(), title: "修订标题" }, "补充标题")
    expect(second.routeId).toBe(first.routeId); expect(second.revision).toBe(2)
    expect(() => book.replace(1, draft())).toThrow(/revision|版本/i)
    expect(new AnalysisRouteBook(file).read()).toEqual(second)
    expect(new AnalysisRouteBook(file).history()).toHaveLength(2)
    const history = book.history(); history[0]!.title = "mutated"
    expect(book.history()[0]!.title).toBe("表达分析")
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ history: expect.any(Array) })
  })
  it("rejects corrupt persisted JSON and structural history rather than overwriting", () => {
    const { dir, file } = location(); mkdirSync(join(dir, "session")); writeFileSync(file, "{bad")
    expect(() => new AnalysisRouteBook(file)).toThrow()
    writeFileSync(file, JSON.stringify({ history: [] , current: draft() }))
    expect(() => new AnalysisRouteBook(file)).toThrow()
  })
  it("publishes neither memory nor history if atomic persistence fails and cleans temporary files", () => {
    const { dir, file } = location(), book = new AnalysisRouteBook(file)
    const first = book.replace(0, draft())
    rmSync(file); mkdirSync(file)
    expect(() => book.replace(1, { ...draft(), title: "cannot save" })).toThrow()
    expect(book.read()).toEqual(first); expect(book.history()).toEqual([first])
    expect(readdirSync(join(dir, "session"))).toEqual(["analysis-route.json"])
  })
  it("selects only candidates and skip/restore retain facts and review flags", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.deliverables = [{ path: "analysis/script.R" }]; initial.steps[0]!.needsReview = true
    book.replace(0, initial)
    expect(() => book.act(1, "S1", "select", { server: "mlai", caseId: "missing" })).toThrow()
    expect(() => book.act(1, "S1", "select")).toThrow()
    const selected = book.act(1, "S1", "select", { server: "mlai", caseId: "r/example" })
    expect(selected.steps[0]!.selectedCase).toEqual({ server: "mlai", caseId: "r/example" }); expect(selected.steps[0]!.status).toBe("pending")
    expect(book.act(2, "S1", "skip").steps[0]!.status).toBe("skipped")
    const restored = book.act(3, "S1", "restore").steps[0]!
    expect(restored.status).toBe("pending"); expect(restored.deliverables).toEqual(initial.steps[0]!.deliverables)
    expect(restored.needsReview).toBe(true); expect(restored.execution.state).toBe("not_run")
    expect(() => book.act(3, "S1", "skip")).toThrow(/revision|版本/i)
    expect(() => book.act(4, "unknown", "skip")).toThrow()
  })
  it.each(["inputs", "purpose", "dependencies", "selectedCase"] as const)("marks started downstream steps on %s change, preserving delivery and independent work", (field) => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[1]!.status = "delivered"; initial.steps[1]!.deliverables = [{ path: "analysis/report.csv" }]
    initial.steps[2]!.status = "in_progress"; initial.steps[3]!.status = "delivered"
    const first = book.replace(0, initial), next = asDraft(structuredClone(first))
    if (field === "inputs") next.steps[0]!.inputs = ["changed"]
    if (field === "purpose") next.steps[0]!.purpose = "新方法"
    if (field === "dependencies") next.steps[0]!.dependencies = ["independent"]
    if (field === "selectedCase") next.steps[0]!.selectedCase = { server: "mlai", caseId: "r/example" }
    next.steps[1]!.deliverables = []
    const result = book.replace(1, next, "上游变更")
    expect(result.steps.map(s => s.needsReview)).toEqual([false, true, true, false])
    expect(result.steps[1]!.deliverables).toEqual([{ path: "analysis/report.csv" }]); expect(book.history()[0]).toEqual(first)
  })
  it("marks the changed delivered step itself and old downstream edges for review", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.status = "delivered"; initial.steps[1]!.status = "delivered"
    const first = book.replace(0, initial), next = asDraft(structuredClone(first))
    next.steps[0]!.purpose = "改变方法"; next.steps[1]!.dependencies = []
    const result = book.replace(1, next)
    expect(result.steps[0]!.needsReview).toBe(true); expect(result.steps[1]!.needsReview).toBe(true)
    expect(result.steps[2]!.needsReview).toBe(false)
  })
  it("can explicitly resolve review flags without changing input, while new changes re-flag started work", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.status = "delivered"; initial.steps[0]!.needsReview = true
    book.replace(0, initial)
    initial.steps[0]!.needsReview = false
    initial.steps[0]!.verification = { state: "reviewed", note: "已重新核对输入和方法" }
    expect(book.replace(1, initial).steps[0]!.needsReview).toBe(false)
    initial.steps[0]!.purpose = "新输入处理"
    expect(book.replace(2, initial).steps[0]!.needsReview).toBe(true)
  })
  it("preserves execution, verification, tool IDs and notes when a draft resets evidence", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    const first = initial.steps[0]!
    first.execution = { state: "completed", note: "实际运行成功", toolCallIds: ["run-1"] }
    first.verification = { state: "reviewed", note: "已经检查产物", toolCallIds: ["read-1"] }
    first.notes = ["人工备注"]
    book.replace(0, initial)
    const reset = draft()
    reset.steps[0]!.execution.toolCallIds = []
    reset.steps[0]!.verification.toolCallIds = []
    const saved = book.replace(1, reset).steps[0]!
    expect(saved.execution).toEqual(first.execution); expect(saved.verification).toEqual(first.verification)
    expect(saved.notes).toContain("人工备注")
    const correction = asDraft(book.read()!)
    correction.steps[0]!.execution = { state: "failed", note: "重核日志发现运行失败", toolCallIds: ["run-2"] }
    const corrected = book.replace(2, correction).steps[0]!
    expect(corrected.execution.toolCallIds).toEqual(["run-1", "run-2"])
    expect(corrected.notes.join(" ")).toContain("实际运行成功")
  })
  it.each(["unreviewed", "reviewed", "issues"] as const)("does not clear review without a new review explanation (%s)", state => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.needsReview = true
    initial.steps[0]!.verification = { state: "reviewed", note: "旧核对说明" }
    initial.steps[0]!.notes = ["保留旧提示"]
    book.replace(0, initial)
    initial.steps[0]!.needsReview = false; initial.steps[0]!.notes = []
    initial.steps[0]!.verification = { state, note: "旧核对说明" }
    const result = book.replace(1, initial).steps[0]!
    expect(result.needsReview).toBe(true); expect(result.notes).toContain("保留旧提示")
  })
  it("requires reviewed/issues rather than a changed unreviewed note to resolve review", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.needsReview = true
    book.replace(0, initial)
    initial.steps[0]!.needsReview = false
    initial.steps[0]!.verification = { state: "unreviewed", note: "还没核对，只换一句话" }
    expect(book.replace(1, initial).steps[0]!.needsReview).toBe(true)
    initial.steps[0]!.verification = { state: "issues", note: "已复核，确认存在数据缺失" }
    expect(book.replace(2, initial).steps[0]!.needsReview).toBe(false)
    initial.steps[0]!.needsReview = false; initial.steps[0]!.purpose = "方法又改了"
    initial.steps[0]!.status = "delivered"
    initial.steps[0]!.verification = { state: "reviewed", note: "新的复核说明" }
    expect(book.replace(3, initial).steps[0]!.needsReview).toBe(true)
  })
  it("retains old tool evidence when updated review records provide new IDs", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.verification = { state: "reviewed", note: "最初核对", toolCallIds: ["read-1"] }
    book.replace(0, initial)
    initial.steps[0]!.verification = { state: "issues", note: "核对后发现新问题", toolCallIds: ["read-2"] }
    const result = book.replace(1, initial).steps[0]!
    expect(result.verification).toEqual({ state: "issues", note: "核对后发现新问题", toolCallIds: ["read-1", "read-2"] })
    expect(result.notes.join(" ")).toContain("最初核对")
  })
  it("marks all started steps for review when the route data context changes", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.status = "delivered"; initial.steps[3]!.status = "in_progress"
    book.replace(0, initial)
    initial.dataContext = ["new data"]
    expect(book.replace(1, initial).steps.map(s => s.needsReview)).toEqual([true, false, false, true])
  })
  it("marks started steps for review when the global analysis goal changes", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.status = "delivered"; initial.steps[3]!.status = "in_progress"
    book.replace(0, initial)
    initial.goal = "分析时间趋势"
    expect(book.replace(1, initial).steps.map(s => s.needsReview)).toEqual([true, false, false, true])
  })
  it("marks started self and downstream steps when expected output contracts change", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.status = "delivered"; initial.steps[1]!.status = "delivered"
    initial.steps[2]!.status = "in_progress"; initial.steps[3]!.status = "delivered"
    book.replace(0, initial)
    initial.steps[0]!.outputs = ["时间趋势报告"]
    expect(book.replace(1, initial).steps.map(s => s.needsReview)).toEqual([true, true, true, false])
  })
  it("keeps review flags unchanged when only route or step titles change", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[0]!.status = "delivered"; initial.steps[1]!.status = "delivered"
    book.replace(0, initial)
    initial.title = "路线新名称"; initial.steps[0]!.title = "步骤新名称"
    expect(book.replace(1, initial).steps.every(s => !s.needsReview)).toBe(true)
  })
  it("can add and reorder steps without changing existing IDs or causing spurious review", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft()
    initial.steps[1]!.status = "delivered"; book.replace(0, initial)
    initial.steps.reverse(); initial.steps.push(step("S4", ["S3"]))
    const result = book.replace(1, initial)
    expect(result.steps.map(s => s.id)).toEqual(["independent", "S3", "S2", "S1", "S4"])
    expect(result.steps.every(s => !s.needsReview)).toBe(true)
  })
  it("does not equate delivered with executed/reviewed and preserves stable step ids", () => {
    const book = new AnalysisRouteBook(undefined), initial = draft(); initial.steps[0]!.status = "delivered"
    const first = book.replace(0, initial)
    expect(first.steps[0]!.execution.state).toBe("not_run"); expect(first.steps[0]!.verification.state).toBe("unreviewed")
    expect(() => book.replace(1, { ...draft(), steps: [step("replacement")] })).toThrow(/步骤|step/i)
  })
  it("interrupts only active work and marks explicit rewind review without deleting evidence", () => {
    const { file } = location(), book = new AnalysisRouteBook(file), initial = draft()
    initial.steps[0]!.status = "in_progress"; initial.steps[1]!.status = "delivered"
    book.replace(0, initial)
    const result = book.interrupt("应用退出")!
    expect(result.steps.map(s => s.status)).toEqual(["blocked", "delivered", "pending", "pending"])
    expect(result.steps[0]!.blockers.join(" ")).toContain("应用退出")
    expect(book.interrupt("再次退出")).toBeUndefined()
    const reviewed = book.markNeedsReview("对话已回退")!
    expect(reviewed.steps.every(s => s.needsReview)).toBe(true)
    expect(reviewed.steps[0]!.notes.join(" ")).toContain("对话已回退")
    expect(new AnalysisRouteBook(file).read()).toEqual(reviewed)
    expect(existsSync(file)).toBe(true)
  })
})
