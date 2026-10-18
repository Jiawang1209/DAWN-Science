/** Renderer-only cache of backend route authority. Ownership and request generations
 * are per active session; nothing here is persisted or inferred from prose. */
import { t, tf } from "../i18n/index.js"
import { atom } from "nanostores"
import {
  routeContinueBlockers,
  parseRouteActionMessage,
  type AnalysisRoute,
  type AnalysisRouteReadResult,
  type RouteAction,
  type AnalysisRouteActionResult,
} from "../../protocol/analysis-route.js"
type Ticket = { sessionId: string | undefined; generation: number; request: number }
type RouteState = { sessionId?: string | undefined; result?: AnalysisRouteReadResult | undefined }
export class RouteController {
  readonly $state = atom<RouteState>({})
  private generation = 0
  private request = 0
  activate(sessionId: string | undefined): void {
    this.generation++
    this.$state.set({ sessionId })
  }
  captureOwner(): () => boolean {
    const generation = this.generation
    const owner = this.$state.get().sessionId
    return () => this.generation === generation && this.$state.get().sessionId === owner
  }
  begin(): Ticket {
    return { sessionId: this.$state.get().sessionId, generation: this.generation, request: ++this.request }
  }
  accept(ticket: Ticket, result: AnalysisRouteReadResult): boolean {
    const current = this.$state.get()
    if (
      ticket.sessionId !== current.sessionId ||
      ticket.generation !== this.generation ||
      ticket.request !== this.request
    )
      return false
    if (current.result?.route && (!result.route || result.route.revision < current.result.route.revision)) return false
    this.$state.set({ sessionId: current.sessionId, result })
    return true
  }
  receive(sessionId: string, route: AnalysisRoute | undefined): void {
    const current = this.$state.get()
    if (sessionId !== current.sessionId) return
    if (current.result?.route && (!route || route.revision < current.result.route.revision)) return
    if (route?.revision === current.result?.route?.revision) return
    this.$state.set({
      sessionId,
      result: {
        supported: true,
        ...(current.result?.history ? { history: current.result.history } : {}),
        ...(route ? { route } : {}),
      },
    })
  }
}
export function displayRouteMessage(text: string): string {
  const ref = parseRouteActionMessage(text)
  if (!ref) return text
  const action = ref.action === "view" ? t("查看步骤") : ref.action === "search" ? t("补找案例") : t("继续这一步")
  return `${action} ${ref.stepId}\n\n${text.includes("\n") ? text.slice(text.indexOf("\n") + 1) : ""}`
}
export function resolveRouteFile(path: string, remote: boolean, workspace?: string): string {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[a-z][a-z0-9+.-]*:/i.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(t("交付路径必须是工作区内相对路径"))
  if (!remote) return path
  if (!workspace?.startsWith("/") || workspace.includes("\0") || workspace.split("/").includes(".."))
    throw new Error(t("远端工作区路径未知，无法读取交付文件"))
  return `${workspace.replace(/\/+$/, "")}/${path}`
}
export async function performRouteAction(options: {
  action: RouteAction
  request: () => Promise<AnalysisRouteActionResult>
  active: () => boolean
  send: (text: string) => void | Promise<void>
  echo?: ((text: string) => () => void) | undefined
  receive: (route: AnalysisRoute) => void
}): Promise<void> {
  if (!options.active()) throw new Error(t("会话已切换，请在当前会话重试"))
  const result = await options.request()
  if (!options.active()) throw new Error(t("会话已切换，请在当前会话重试"))
  if (result.route) options.receive(result.route)
  if (!["view", "search", "continue"].includes(options.action)) return
  if (!result.message) throw new Error(t("路线操作未返回消息，请刷新后重试"))
  const undo = options.echo?.(result.message)
  try {
    await options.send(result.message)
  } catch (error) {
    undo?.()
    throw error
  }
}

/** Translate only application-generated reasons; authored conditions remain verbatim. */
export function localizedRouteBlockers(route: AnalysisRoute, stepId: string): string[] {
  const step = route.steps.find((item) => item.id === stepId)
  if (!step) return [tf("没有此路线步骤：{0}", stepId)]
  const messages = new Map<string, string>([
    [`步骤 ${step.id} 已跳过，请先恢复。`, tf("步骤 {0} 已跳过，请先恢复。", step.id)],
    [`步骤 ${step.id} 已在进行中。`, tf("步骤 {0} 已在进行中。", step.id)],
    [`步骤 ${step.id} 已交付；需要继续时请先恢复。`, tf("步骤 {0} 已交付；需要继续时请先恢复。", step.id)],
    [`步骤 ${step.id} 需要复核。`, tf("步骤 {0} 需要复核。", step.id)],
  ])
  const statusNames = {
    pending: t("待开始"),
    in_progress: t("进行中"),
    blocked: t("已阻塞"),
    delivered: t("已交付"),
    skipped: t("已跳过"),
  }
  for (const id of step.dependencies) {
    const dependency = route.steps.find((item) => item.id === id)
    messages.set(`缺失前置步骤 ${id}。`, tf("缺失前置步骤 {0}。", id))
    if (!dependency) continue
    messages.set(
      `前置步骤 ${id} 尚未交付（${dependency.status}）。`,
      tf("前置步骤 {0} 尚未交付（{1}）。", id, statusNames[dependency.status]),
    )
    messages.set(`前置步骤 ${id} 需要复核。`, tf("前置步骤 {0} 需要复核。", id))
    for (const reason of dependency.blockers)
      messages.set(`前置步骤 ${id}：${reason}`, tf("前置步骤 {0}：{1}", id, reason))
  }
  return routeContinueBlockers(route, stepId).map((reason) =>
    step.blockers.includes(reason) ? reason : (messages.get(reason) ?? reason),
  )
}
