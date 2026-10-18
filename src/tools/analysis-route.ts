/** Controlled session metadata only; never executes analysis or selects a case. */
import { Type } from 'typebox'
import { z } from 'zod'
import { AnalysisRouteDraftSchema, type AnalysisRouteDraft, type AnalysisRouteReadResult, type AnalysisRoute } from '../protocol/analysis-route.js'

const reply = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) }],
  details: undefined,
  ...(isError ? { isError: true } : {}),
})

export function createAnalysisRouteTools(opts: {
  read(): AnalysisRouteReadResult
  update(expectedRevision: number, route: AnalysisRouteDraft, reason?: string): AnalysisRoute
}) {
  const guidelines = [
    '仅在用户要求分析路线、多个分析步骤或继续既有路线相关任务时使用路线工具；普通对话和单项任务无需创建路线。路线保存在当前主会话元数据中，不是 Markdown 解析。',
    'get_analysis_route 读取当前路线。update_analysis_route 用 expectedRevision（首次 0）提交完整结构化路线；保留已有步骤、候选、证据与交付。候选必须来自实际 MLAI 工具返回，content_checked 需要实际读取正文。不得替用户选择案例。',
    '状态是记录，不能充当运行或科学审查证据。只有实际工具结果才可记录 execution/verification toolCallIds；脚本或报告已生成仍可能 not_run。交付路径为工作区相对路径，存在性与是否本步生成由应用另外核对。',
    '按用户选定的一步推进，执行前核对实际输入、依赖、阻塞与授权；不批准其他步骤，不绕过方案门、讨论限制、权限、manual/off 技能。',
  ]
  return [{
    name: 'get_analysis_route',
    label: 'get_analysis_route',
    description: '读取当前主会话分析路线与应用观察到的证据。',
    promptGuidelines: guidelines,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      try { return reply(opts.read()) }
      catch (error) { return reply(error instanceof Error ? error.message : String(error), true) }
    },
  }, {
    name: 'update_analysis_route',
    label: 'update_analysis_route',
    description: '以版本校验更新当前主会话路线元数据；不执行分析，不替用户选案例。',
    executionMode: 'sequential' as const,
    parameters: Type.Object({
      expectedRevision: Type.Integer({ minimum: 0 }),
      route: Type.Unsafe<AnalysisRouteDraft>(z.toJSONSchema(AnalysisRouteDraftSchema)),
      reason: Type.Optional(Type.String()),
    }, { additionalProperties: false }),
    async execute(_id: string, params: { expectedRevision: number; route: AnalysisRouteDraft; reason?: string }) {
      try {
        return reply(opts.update(params.expectedRevision, AnalysisRouteDraftSchema.parse(params.route), params.reason))
      } catch (error) {
        return reply(error instanceof Error ? error.message : String(error), true)
      }
    },
  }]
}
