/** Route records are validated against actual main-session results. Model prose,
 * denied calls and metadata mutations are never scientific execution evidence. */
import { 从工具结果收案例 } from '../cases/results.js'
import { parseRouteActionMessage, type AnalysisRoute, type AnalysisRouteDraft } from '../protocol/analysis-route.js'

export interface RouteToolEvidence {
  toolCallId: string
  name: string
  status: 'done' | 'error'
  result: string
  input?: unknown
  filesWritten?: string[]
  stepId?: string | undefined
  execution?: 'ran' | 'failed' | 'not_observed'
}
type BranchEntry = { type?: string; message?: { role?: string; content?: unknown } }
const key = (server: string, id: string) => JSON.stringify([server, id])
const identity = (value: unknown) => JSON.stringify(value)
const scientific = (name: string) => ['run_code', 'bash', 'powershell'].includes(name)
const review = (name: string) => scientific(name) || name === 'read' || name === 'look_at_image'
const contentText = (content: unknown): string => typeof content === 'string' ? content : Array.isArray(content)
  ? content.flatMap((block: { type?: string; text?: string }) => block?.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n') : ''

/** Complete IDs may contain regex characters. Matching uses literal text and
 * identifier boundaries so `full/id-long` cannot authorize `full/id`. */
function containsId(text: string, id: string): boolean {
  for (let offset = 0; offset <= text.length;) {
    const index = text.indexOf(id, offset)
    if (index < 0) return false
    if (!/[A-Za-z0-9_./:-]/.test(text[index - 1] ?? '') && !/[A-Za-z0-9_./:-]/.test(text[index + id.length] ?? '')) return true
    offset = index + 1
  }
  return false
}
function explicitSelection(text: string, caseId: string): boolean {
  const prose = text.replace(/^\[analysis_route_action\].*\n?/, '').replace(/```[^]*?(?:```|$)|~~~[^]*?(?:~~~|$)/g, '').replace(/^\s*>.*$/gm, '')
  const clauses = prose.split(/[。；;\n]/).filter(clause => containsId(clause, caseId))
  // A full ID and a selection verb alone are insufficient: negative, hypothetical
  // and explanatory statements must leave the user's choice unset.
  const uncertain = /[?？]|不|别|勿|未|没|拒绝|是否|能否|要不要|可能|也许|考虑|解释|说明|讨论|为什么|为何|如何|如果|假设|\b(?:not|never|might|maybe|perhaps|should|could|would|can|if)\b|\b(?:don['’]?t|won['’]?t|can['’]?t)\b/i
  if (!clauses.length || clauses.some(clause => uncertain.test(clause.replaceAll(caseId, '')))) return false
  const direct = /(?:请选择|请选用|请采用|请使用|我(?:决定|确定|就)?(?:选择|选用|采用|使用)|(?:^|[：:\s])(?:选择|选用|采用|使用)|照(?:着)?(?:这篇|这个|案例)|^(?:please\s+)?(?:choose|select|use)\b|\bI\s+(?:choose|select|will use|use)\b)/i
  return clauses.some(clause => direct.test(clause))
}

/** Inspect substantive content attached to this case, not filenames, unrelated
 * cases in the same result or a get_case shell containing metadata only. */
function checkedCaseIds(result: string): Set<string> {
  const checked = new Set<string>()
  let root: unknown
  try { root = JSON.parse(result.replace(/^\s*\[[^\]\n]+\]\s*/, '')) } catch { return checked }
  const hasContent = (value: unknown, caseId: string): boolean => {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some(child => hasContent(child, caseId))
    const identity = (value as Record<string, unknown>).case_id
    if (typeof identity === 'string' && identity !== caseId) return false
    return Object.entries(value).some(([field, child]) =>
      ['code', 'content', 'source'].includes(field) && typeof child === 'string' && Boolean(child.trim())
      || Boolean(child && typeof child === 'object' && hasContent(child, caseId)))
  }
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(walk)
    const object = value as Record<string, unknown>
    if (typeof object.case_id === 'string' && hasContent(object, object.case_id)) checked.add(object.case_id)
    Object.values(object).forEach(walk)
  }
  walk(root)
  return checked
}

export function validateRouteEvidence(draft: AnalysisRouteDraft, previous: AnalysisRoute | undefined, tools: readonly RouteToolEvidence[], userText: string): void {
  const cases = new Map<string, { title?: string | undefined; language?: string | undefined; content: boolean }>()
  for (const tool of tools) {
    if (tool.status !== 'done') continue
    const checked = tool.name.endsWith('__get_case') ? checkedCaseIds(tool.result) : new Set<string>()
    // Process each tool separately; the legacy extractor merges by caseId alone.
    for (const { 服务器, 案例 } of 从工具结果收案例([{ name: tool.name, result: tool.result }]).values()) {
      const id = key(服务器, 案例.case_id)
      const old = cases.get(id)
      cases.set(id, { title: 案例.title ?? old?.title, language: 案例.language ?? old?.language, content: checked.has(案例.case_id) || Boolean(old?.content) })
    }
  }
  const byId = new Map(tools.map(tool => [tool.toolCallId, tool]))
  for (const step of draft.steps) {
    const prior = previous?.steps.find(item => item.id === step.id)
    for (const candidate of step.cases) {
      const saved = prior?.cases.find(item => item.server === candidate.server && item.caseId === candidate.caseId)
      const observed = cases.get(key(candidate.server, candidate.caseId))
      if ((!saved || saved.title !== candidate.title) && (!observed || observed.title !== candidate.title)) throw new Error(`案例 ${candidate.server}/${candidate.caseId} 及标题必须来自实际 MLAI 工具结果`)
      if (candidate.language && saved?.language !== candidate.language && observed?.language !== candidate.language) throw new Error(`案例 ${candidate.caseId} 的语言必须来自实际工具结果`)
      if (candidate.evidence === 'content_checked' && saved?.evidence !== 'content_checked' && !observed?.content) throw new Error(`案例 ${candidate.caseId} 尚无实际正文读取结果`)
    }
    if (identity(step.selectedCase) !== identity(prior?.selectedCase)) {
      const choice = step.selectedCase
      if (!choice || !explicitSelection(userText, choice.caseId)) throw new Error('参考案例由用户选择；需要当前用户明确选择对应完整 caseId，或由界面 select 动作提交')
      const shared = draft.steps.filter(item => item.cases.some(candidate => candidate.caseId === choice.caseId))
      const marker = parseRouteActionMessage(userText)
      if (shared.length > 1) {
        const explicit = shared.filter(item => containsId(userText, item.id))
        if (marker?.stepId !== step.id && (explicit.length !== 1 || explicit[0]!.id !== step.id)) throw new Error('同一案例涉及多个步骤，请明确选择对应步骤')
      }
      const servers = new Set(draft.steps.flatMap(item => item.cases.filter(candidate => candidate.caseId === choice.caseId).map(candidate => candidate.server)))
      if (servers.size > 1 && !containsId(userText, choice.server)) throw new Error('同一 caseId 来自多个服务器，请明确选择服务器')
    }
    for (const [label, record, old, predicate, defaultState] of [
      ['执行', step.execution, prior?.execution, scientific, 'not_run'],
      ['审查', step.verification, prior?.verification, review, 'unreviewed'],
    ] as const) {
      // Persisted evidence survives compaction; a fresh claim needs current proof.
      if (record.state === defaultState || identity(record) === identity(old)) continue
      const ids = record.toolCallIds ?? []
      const invalid = ids.some(id => {
        const tool = byId.get(id)
        if (!tool || !predicate(tool.name) || tool.stepId && tool.stepId !== step.id) return true
        if (label === '执行' && (!tool.execution || tool.execution === 'not_observed' || record.state === 'completed' && tool.execution !== 'ran')) return true
        return record.state !== 'failed' && record.state !== 'issues' && tool.status !== 'done'
      })
      if (!ids.length || invalid) throw new Error(`${label}记录必须引用实际且类型相符的工具结果 toolCallIds；工具成功不代表科学结论正确`)
    }
  }
}

export function latestRouteUserText(branch: readonly BranchEntry[]): string {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index]!
    if (entry.type === 'message' && entry.message?.role === 'user') return contentText(entry.message.content)
  }
  return ''
}
export function routeTurnDenial(name: string, branch: readonly BranchEntry[], mcpReadOnly = false): string | undefined {
  const action = parseRouteActionMessage(latestRouteUserText(branch))
  if (!action || action.action === 'continue') return undefined
  const reads = new Set(['read', 'ls', 'grep', 'find', 'look_at_image', 'read_main_session', 'get_analysis_route', 'ask_user_question'])
  if (reads.has(name) || mcpReadOnly || action.action === 'search' && name === 'update_analysis_route') return undefined
  return `路线${action.action === 'view' ? '查看' : '检索'}仅授权本轮读取，不可调用 ${name}；不能借先前执行授权写入或运行。`
}

/** Branch chronology supplies the scope. A new ordinary user turn clears it.
 * Only application-written details prove execution across process restart. */
export function collectRouteToolEvidence(branch: readonly BranchEntry[], live: readonly RouteToolEvidence[] = []): RouteToolEvidence[] {
  const tools = new Map(live.map(tool => [tool.toolCallId, tool]))
  const calls = new Map<string, { input: unknown; stepId?: string }>()
  let stepId: string | undefined
  for (const entry of branch) {
    if (entry.type !== 'message' || !entry.message) continue
    const message = entry.message as { role?: string; content?: unknown; toolCallId?: string; toolName?: string; isError?: boolean; details?: { analysisRouteEvidence?: { execution?: RouteToolEvidence['execution']; stepId?: string; filesWritten?: string[] } } }
    if (message.role === 'user') stepId = parseRouteActionMessage(contentText(message.content))?.stepId
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const call of message.content as { type?: string; id?: string; arguments?: unknown }[]) {
        if (call.type === 'toolCall' && call.id) calls.set(call.id, { input: call.arguments, ...(stepId ? { stepId } : {}) })
      }
    }
    if (message.role !== 'toolResult' || !message.toolCallId || !message.toolName) continue
    const detail = message.details?.analysisRouteEvidence
    const call = calls.get(message.toolCallId)
    const scope = detail?.stepId ?? call?.stepId
    tools.set(message.toolCallId, {
      toolCallId: message.toolCallId, name: message.toolName, status: message.isError ? 'error' : 'done', result: contentText(message.content),
      execution: detail?.execution ?? 'not_observed',
      ...(call ? { input: call.input } : {}), ...(scope ? { stepId: scope } : {}),
      ...(detail?.filesWritten ? { filesWritten: detail.filesWritten } : {}),
    })
  }
  return [...tools.values()]
}
