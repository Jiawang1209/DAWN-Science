/** Deterministic engineering fixture shared by dev:mock and e2e. The real runtime,
 * metadata tools, MCP reads, gates, writer and route book still execute. */
const text = value => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(block => block.text ?? '').join('\n') : ''
const parse = value => {
  try { return JSON.parse(text(value).replace(/^\s*\[[^\]\n]+\]\s*/, '')) }
  catch { return undefined }
}
const step = (id, title, dependencies = []) => ({
  id, title, purpose: '核对输入并说明本步分析条件', inputs: ['用户数据仍需核对'],
  outputs: ['本步说明报告'], dependencies, status: 'pending', blockers: [], cases: [], deliverables: [],
  execution: { state: 'not_run', note: '尚未运行科研代码' },
  verification: { state: 'unreviewed', note: '尚未独立审查' }, needsReview: false, notes: [],
})
const draft = () => ({
  title: '演示分析路线', goal: '通过真实工具演示逐步路线与生成产物；不证明科学分析质量',
  dataContext: ['工程夹具，尚未提供科研输入'],
  steps: [step('S1', '输入与 Alpha 多样性'), step('S2', 'Beta 多样性', ['S1']), step('S3', '汇总与审查', ['S2'])],
})
const routeOnly = route => {
  const { routeId, revision, updatedAt, ...value } = structuredClone(route)
  return value
}
const alphaCandidate = server => ({
  server, caseId: '20251017-e2e-alpha-diversity', title: 'Alpha多样性分析测试案例',
  language: 'r', coverage: 'Alpha 多样性步骤参考', evidence: 'metadata',
})
function context(body) {
  const messages = body.messages ?? []
  const index = messages.findLastIndex(message => message.role === 'user')
  if (index < 0) return
  const user = text(messages[index].content)
  let action
  if (user.startsWith('[analysis_route_action] ')) {
    try { action = JSON.parse(user.split('\n')[0].slice('[analysis_route_action] '.length)) }
    catch { /* Invalid markers never enter the route fixture. */ }
  }
  if (!user.includes('演示分析路线') && !action) return
  if (!(body.tools ?? []).some(tool => (tool.function?.name ?? tool.name) === 'get_analysis_route')) return
  const names = new Map(messages.flatMap(message => (message.tool_calls ?? []).map(call => [call.id, call.function?.name])))
  const results = messages.slice(index + 1).filter(message => message.role === 'tool').map(message => ({
    name: message.name ?? names.get(message.tool_call_id), data: parse(message.content), raw: text(message.content),
  }))
  const read = results.find(result => result.name === 'get_analysis_route')
  const route = results.findLast(result => result.name === 'update_analysis_route' && result.data?.routeId)?.data ?? read?.data?.route
  return { user, action, results, route }
}
const update = (route, next, say) => ({
  toolName: 'update_analysis_route', args: { expectedRevision: route.revision, route: next }, say,
})

export function analysisRouteMockTool(body) {
  const current = context(body)
  if (!current) return
  const { action, results, route } = current
  if (!results.length) return { toolName: 'get_analysis_route', args: {}, say: '读取本会话路线与版本。' }
  if (results.some(result => result.name === 'get_analysis_route' && result.data?.error)) return
  if (action?.action === 'view') return
  const search = (body.tools ?? []).map(tool => tool.function?.name ?? tool.name).find(name => name?.endsWith('__search_cases'))
  const server = search?.slice(0, -'__search_cases'.length)

  if (!action) {
    if (!route) return { toolName: 'update_analysis_route', args: { expectedRevision: 0, route: draft() }, say: '建立三个步骤的结构化路线。' }
    if (!search) return
    if (!results.some(result => result.name === search)) {
      return { toolName: search, args: { query: 'guide-alpha' }, say: '从实际 MLAI 工具检索候选。' }
    }
    if (results.filter(result => result.name === 'update_analysis_route').length < 2) {
      const next = routeOnly(route)
      next.steps[0].cases = [alphaCandidate(server)]
      return update(route, next, '绑定真实候选，等待用户选步或选案例。')
    }
  }
  if (action?.action === 'search' && route && search) {
    if (!results.some(result => result.name === search)) {
      return { toolName: search, args: { query: 'guide-alpha' }, say: '只读检索本步真实候选。' }
    }
    if (!results.some(result => result.name === 'update_analysis_route')) {
      const next = routeOnly(route)
      const target = next.steps.find(item => item.id === action.stepId)
      if (!target) return
      const candidate = alphaCandidate(server)
      if (!target.cases.some(item => item.server === candidate.server && item.caseId === candidate.caseId)) target.cases.push(candidate)
      return update(route, next, '仅更新本步候选元数据。')
    }
  }
  if (action?.action === 'continue' && route) {
    const path = `results/reports/analysis-route-${action.stepId}.md`
    const write = results.find(result => result.name === 'write')
    if (!write) {
      return {
        toolName: 'write',
        args: { path, content: '# 分析路线工程演示\n\n仅生成本步说明报告。未运行科研代码，未产生统计结论，尚未独立审查。\n' },
        say: '仅生成本步工程说明报告，科研分析未运行。',
      }
    }
    if (!results.some(result => result.name === 'update_analysis_route')) {
      const next = routeOnly(route)
      const target = next.steps.find(item => item.id === action.stepId)
      if (!target) return
      const denied = /不能|不可|只讨论|拒绝|不批准|only|denied/i.test(write.raw)
      if (denied) {
        target.status = 'blocked'
        target.blockers = ['本轮写入被授权门拒绝，未生成报告']
      } else {
        target.status = 'delivered'
        target.deliverables.push({ path, note: '工程夹具说明报告；仅生成，科研代码未运行' })
      }
      return update(route, next, '据实际写入结果保留交付记录与未运行状态。')
    }
  }
}

export function analysisRouteMockReply(body) {
  const current = context(body)
  if (!current) return
  switch (current.action?.action) {
    case 'view': return '本步用于核对输入与说明分析条件；本轮仅查看，尚未执行科研分析。'
    case 'search': return '已只读检索候选并记录：`20251017-e2e-alpha-diversity` Alpha多样性分析测试案例；仍由用户选择。'
    case 'continue': return '本步工程说明已处理；是否生成以真实写入结果为准。科研代码未运行，尚未独立审查。'
    default: return '三步路线已记录；真实候选为 `20251017-e2e-alpha-diversity` Alpha多样性分析测试案例。请选一步继续；这只验证工程接线。'
  }
}
