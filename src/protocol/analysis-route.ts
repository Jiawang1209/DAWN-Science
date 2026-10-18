/** 会话分析路线的共享契约。状态仅是记录，不代替执行证据或科学验收。 */
import { z } from "zod"

const text = z.string().trim().min(1)
const selection = z.object({ server: text, caseId: text }).strict()
const execution = z.object({
  state: z.enum(["not_run", "partial", "completed", "failed"]), note: text,
  toolCallIds: z.array(text).optional(),
}).strict()
const verification = z.object({
  state: z.enum(["unreviewed", "reviewed", "issues"]), note: text,
  toolCallIds: z.array(text).optional(),
}).strict()
/** POSIX 工作区相对路径；不将引用存在性或符号链接安全性当作已核实。 */
const relativePath = text.refine((path) => !path.startsWith("/") && !path.includes("\\") &&
  !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.includes("\0") &&
  !path.split("/").some((part) => part === ".." || part === "." || part === ""), "交付路径必须是工作区内相对路径")

export const RouteStepSchema = z.object({
  id: text, title: text, purpose: text, inputs: z.array(text), outputs: z.array(text), dependencies: z.array(text),
  status: z.enum(["pending", "in_progress", "blocked", "delivered", "skipped"]), blockers: z.array(text),
  cases: z.array(z.object({
    server: text, caseId: text, title: text, language: text.optional(), coverage: text,
    evidence: z.enum(["metadata", "content_checked"]),
  }).strict()),
  selectedCase: selection.optional(), deliverables: z.array(z.object({ path: relativePath, note: text.optional() }).strict()),
  execution, verification, needsReview: z.boolean(), notes: z.array(text),
}).strict()
export type RouteStep = z.infer<typeof RouteStepSchema>
export type RouteAction = "view" | "search" | "continue" | "select" | "skip" | "restore"

const draftShape = {
  title: text, goal: text, dataContext: z.array(text), steps: z.array(RouteStepSchema).min(1),
}
function validateGraph(route: { steps: RouteStep[] }, ctx: z.RefinementCtx): void {
  const ids = new Set<string>()
  const fail = (message: string) => ctx.addIssue({ code: "custom", path: ["steps"], message })
  for (const step of route.steps) {
    if (ids.has(step.id)) fail(`重复步骤ID：${step.id}`)
    ids.add(step.id)
    const cases = new Set<string>()
    for (const candidate of step.cases) {
      const key = JSON.stringify([candidate.server, candidate.caseId])
      if (cases.has(key)) fail(`步骤 ${step.id} 有重复案例`)
      cases.add(key)
    }
    if (step.selectedCase && !cases.has(JSON.stringify([step.selectedCase.server, step.selectedCase.caseId]))) fail(`步骤 ${step.id} 选择必须属于候选案例`)
  }
  const graph = new Map(route.steps.map(step => [step.id, step.dependencies]))
  for (const step of route.steps) {
    if (new Set(step.dependencies).size !== step.dependencies.length) fail(`步骤 ${step.id} 有重复依赖`)
    for (const dependency of step.dependencies) if (!ids.has(dependency)) fail(`步骤 ${step.id} 缺失依赖：${dependency}`)
  }
  // Iterative topological sort avoids stack exhaustion on long model-produced routes.
  const remaining = new Map(route.steps.map(step => [step.id, new Set(step.dependencies).size]))
  const children = new Map<string, string[]>()
  for (const [id, dependencies] of graph) for (const dependency of new Set(dependencies)) {
    children.set(dependency, [...(children.get(dependency) ?? []), id])
  }
  const queue = [...remaining].filter(([, count]) => count === 0).map(([id]) => id)
  for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]!) ?? []) {
    const count = remaining.get(child)! - 1; remaining.set(child, count)
    if (count === 0) queue.push(child)
  }
  if (queue.length !== ids.size) fail("步骤依赖存在环或缺失节点")
}
export const AnalysisRouteDraftSchema = z.object(draftShape).strict().superRefine(validateGraph)
export const AnalysisRouteSchema = z.object({
  ...draftShape, routeId: text, revision: z.number().int().min(1), updatedAt: z.number().int().nonnegative(),
}).strict().superRefine(validateGraph)
export type AnalysisRouteDraft = z.infer<typeof AnalysisRouteDraftSchema>
export type AnalysisRoute = z.infer<typeof AnalysisRouteSchema>

/** 只生成用户可见请求，调用方仍走原有发送、授权和方案门。 */
export function routeActionMessage(route: AnalysisRoute, stepId: string, action: "view" | "search" | "continue"): string {
  const step = route.steps.find(item => item.id === stepId)
  if (!step) throw new Error(`没有此路线步骤：${stepId}`)
  const reference = `[analysis_route routeId=${route.routeId} revision=${route.revision} stepId=${stepId}]`
  if (action === "view") return `${reference} 请只解释此步骤「${step.title}」的目的、输入、预期输出和已记录证据；不执行代码，不修改文件或路线状态。`
  if (action === "search") return `${reference} 请只为此步骤「${step.title}」检索和说明真实候选案例；不执行分析，不修改科研文件，不替我选择案例。`
  return `${reference} 请仅继续选定步骤「${step.title}」。保留会话原有授权和方案门；需要批准时先停下，检查前置依赖与阻塞原因。不要自动执行其他步骤，不把此请求视为批准整条路线。`
}
