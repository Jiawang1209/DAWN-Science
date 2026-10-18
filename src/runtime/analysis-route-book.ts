/** 一段会话的路线簿；只写 runtime 提供的会话元数据路径，不触碰科研数据。
 * 全历史不截断。每次先完整验证并原子落盘，成功之后才发布内存快照。
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, basename } from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { AnalysisRouteSchema, AnalysisRouteDraftSchema } from "../protocol/analysis-route.js"
import type { AnalysisRoute, AnalysisRouteDraft, RouteStep } from "../protocol/analysis-route.js"

const storedSchema = z.object({
  history: z.array(AnalysisRouteSchema),
  reasons: z.array(z.object({ revision: z.number().int().positive(), reason: z.string() }).strict()),
}).strict()
type Stored = z.infer<typeof storedSchema>
const copy = <T>(value: T): T => structuredClone(value)
const started = (step: RouteStep) => step.status !== "pending" && step.status !== "skipped" ||
  step.execution.state !== "not_run" || step.verification.state !== "unreviewed" || step.deliverables.length > 0
const changed = (before: RouteStep, after: RouteStep) =>
  JSON.stringify([before.inputs, before.purpose, [...before.dependencies].sort(), before.selectedCase]) !==
  JSON.stringify([after.inputs, after.purpose, [...after.dependencies].sort(), after.selectedCase])

export class AnalysisRouteBook {
  private stored: Stored = { history: [], reasons: [] }
  constructor(private readonly file: string | undefined) {
    if (!file) return
    try {
      this.stored = storedSchema.parse(JSON.parse(readFileSync(file, "utf8")))
      const history = this.stored.history
      for (let index = 0; index < history.length; index++) {
        const route = history[index]!
        if (route.revision !== index + 1 || route.routeId !== history[0]!.routeId) throw new Error("路线历史版本或身份不连续")
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`分析路线记录无法读取：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
  read(): AnalysisRoute | undefined { return copy(this.stored.history.at(-1)) }
  history(): AnalysisRoute[] { return copy(this.stored.history) }

  replace(expectedRevision: number, draft: AnalysisRouteDraft, reason?: string): AnalysisRoute {
    const current = this.check(expectedRevision)
    const next = AnalysisRouteDraftSchema.parse(draft)
    if (current) {
      const nextIds = new Set(next.steps.map(step => step.id))
      for (const step of current.steps) if (!nextIds.has(step.id)) throw new Error(`不能删除既有步骤 ${step.id}；请跳过此步骤以保留证据`)
      const old = new Map(current.steps.map(step => [step.id, step]))
      const affected = new Set<string>()
      for (const step of next.steps) {
        const previous = old.get(step.id)
        if (!previous) continue
        // A metadata replacement cannot erase previously recorded deliverables.
        const paths = new Set(step.deliverables.map(item => item.path))
        step.deliverables.push(...previous.deliverables.filter(item => !paths.has(item.path)))
        if (changed(previous, step)) affected.add(step.id)
      }
      // Use both graphs: removing a dependency must not hide the old downstream impact.
      const all = [...current.steps, ...next.steps]
      for (let size = -1; size !== affected.size;) {
        size = affected.size
        for (const step of all) if (step.dependencies.some(id => affected.has(id))) affected.add(step.id)
      }
      for (const step of next.steps) if (affected.has(step.id) && (started(step) || (old.has(step.id) && started(old.get(step.id)!)))) {
        step.needsReview = true
        const note = reason?.trim() || "路线输入、目的、依赖或参考案例已变更，请复核此步骤及交付。"
        if (!step.notes.includes(note)) step.notes.push(note)
      }
    }
    const route = AnalysisRouteSchema.parse({ ...next, routeId: current?.routeId ?? randomUUID(), revision: expectedRevision + 1, updatedAt: Date.now() })
    this.publish(route, reason)
    return copy(route)
  }

  act(expectedRevision: number, stepId: string, action: "select" | "skip" | "restore", selection?: { server: string; caseId: string }): AnalysisRoute {
    const current = this.check(expectedRevision)
    if (!current) throw new Error("尚无分析路线")
    const { routeId: _id, revision: _revision, updatedAt: _time, ...draft } = copy(current)
    const step = draft.steps.find(item => item.id === stepId)
    if (!step) throw new Error(`没有此路线步骤：${stepId}`)
    if (action === "select") {
      if (!selection || !step.cases.some(item => item.server === selection.server && item.caseId === selection.caseId)) throw new Error("选择必须属于此步骤候选案例")
      step.selectedCase = { ...selection }
    } else if (action === "skip") step.status = "skipped"
    else if (action === "restore") step.status = "pending"
    else throw new Error(`不支持的路线动作：${String(action)}`)
    return this.replace(expectedRevision, draft)
  }

  interrupt(reason: string): AnalysisRoute | undefined {
    const current = this.read()
    if (!current || !current.steps.some(step => step.status === "in_progress")) return undefined
    const { routeId: _id, revision, updatedAt: _time, ...draft } = current
    for (const step of draft.steps) if (step.status === "in_progress") {
      step.status = "blocked"
      step.blockers.push(`执行已中断：${reason}`)
    }
    return this.replace(revision, draft, reason)
  }
  markNeedsReview(reason: string): AnalysisRoute | undefined {
    const current = this.read()
    if (!current) return undefined
    const { routeId: _id, revision, updatedAt: _time, ...draft } = current
    for (const step of draft.steps) { step.needsReview = true; if (!step.notes.includes(reason)) step.notes.push(reason) }
    return this.replace(revision, draft, reason)
  }

  private check(expectedRevision: number): AnalysisRoute | undefined {
    const current = this.read()
    if (!Number.isInteger(expectedRevision) || expectedRevision !== (current?.revision ?? 0)) throw new Error(`路线版本 revision 已变化：预期 ${expectedRevision}，当前 ${current?.revision ?? 0}`)
    return current
  }
  private publish(route: AnalysisRoute, reason?: string): void {
    const candidate: Stored = { history: [...this.stored.history, route], reasons: [...this.stored.reasons] }
    if (reason) candidate.reasons.push({ revision: route.revision, reason })
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true })
      const temporary = join(dirname(this.file), `.${basename(this.file)}.${randomUUID()}.tmp`)
      try {
        writeFileSync(temporary, JSON.stringify(candidate, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 })
        renameSync(temporary, this.file)
      } finally { rmSync(temporary, { force: true }) }
    }
    this.stored = candidate
  }
}
