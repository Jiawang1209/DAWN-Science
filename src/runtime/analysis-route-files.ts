/** Relative route paths are references, never proof of output generation. */
import { realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { 工作区内相对路径 } from '../files/paths.js'
import type { AnalysisRoute, AnalysisRouteEvidence } from '../protocol/analysis-route.js'
import type { RouteToolEvidence } from './analysis-route-evidence.js'

export function routeDeliverableEvidence(
  route: AnalysisRoute,
  tools: readonly RouteToolEvidence[],
  workspace: string | undefined,
  remote: boolean,
): AnalysisRouteEvidence['deliverables'] {
  return route.steps.flatMap(step => [...new Set(step.deliverables.map(item => item.path))].map(path => {
    const stepId = step.id
    if (!workspace) return { stepId, path, state: 'unknown' as const }
    const target = resolve(workspace, path)
    if (!工作区内相对路径(workspace, target)) return { stepId, path, state: 'unknown' as const }
    let state: 'exists' | 'missing' | 'unknown' = 'unknown'
    // Remote paths are never checked against the local filesystem.
    if (!remote) {
      try {
        const real = realpathSync(target)
        if (!工作区内相对路径(realpathSync(workspace), real)) return { stepId, path, state: 'unknown' as const }
        state = statSync(real).isFile() ? 'exists' : 'unknown'
      } catch (error) {
        state = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unknown'
      }
    }
    const observed = tools.some(tool => {
      if (tool.status !== 'done' || tool.stepId !== stepId) return false
      if (tool.filesWritten?.some(file => 工作区内相对路径(workspace, file) === path)) return true
      if (tool.name !== 'write' || typeof tool.input !== 'object' || !tool.input) return false
      const inputPath = (tool.input as { path?: unknown }).path
      return typeof inputPath === 'string' && 工作区内相对路径(workspace, inputPath) === path
    })
    return { stepId, path, state: observed && state !== 'missing' ? 'observed' as const : state }
  }))
}
