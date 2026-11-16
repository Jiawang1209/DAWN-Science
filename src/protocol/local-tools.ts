import { z } from 'zod'

export const LocalToolIdSchema = z.enum(['uv', 'pixi', 'conda', 'mamba', 'node', 'npm', 'git'])
export type LocalToolId = z.infer<typeof LocalToolIdSchema>
export const LOCAL_TOOLS: ReadonlyArray<{ id: LocalToolId; label: string; group: 'environment' | 'development'; description: string }> = [
  { id: 'uv', label: 'uv', group: 'environment', description: 'Python packages and environments' },
  { id: 'pixi', label: 'pixi', group: 'environment', description: 'Project packages and environments' },
  { id: 'conda', label: 'Conda', group: 'environment', description: 'Conda packages and environments' },
  { id: 'mamba', label: 'Mamba', group: 'environment', description: 'Conda-compatible packages and environments' },
  { id: 'node', label: 'Node.js', group: 'development', description: 'JavaScript runtime for local commands' },
  { id: 'npm', label: 'npm', group: 'development', description: 'JavaScript packages and scripts' },
  { id: 'git', label: 'Git', group: 'development', description: 'Version control in local commands' },
]
export const LocalToolPathsSchema = z.partialRecord(LocalToolIdSchema, z.string().min(1))
export type LocalToolPaths = z.infer<typeof LocalToolPathsSchema>
export const LocalToolCandidateSchema = z.object({
  path: z.string(), source: z.enum(['settings', 'PATH', 'common']), version: z.string().optional(), problem: z.string().optional(),
}).strict()
export type LocalToolCandidate = z.infer<typeof LocalToolCandidateSchema>
export const LocalToolResultSchema = z.object({ id: LocalToolIdSchema, candidates: z.array(LocalToolCandidateSchema) }).strict()
export type LocalToolResult = z.infer<typeof LocalToolResultSchema>
export const LocalToolStateSchema = z.object({ paths: LocalToolPathsSchema, tools: z.array(LocalToolResultSchema) }).strict()
export type LocalToolState = z.infer<typeof LocalToolStateSchema>
export const localToolOperations = {
  getLocalTools: { request: z.object({}).strict(), response: z.object({ paths: LocalToolPathsSchema }).strict(), mutating: false },
  probeLocalTools: { request: z.object({}).strict(), response: LocalToolStateSchema, mutating: false },
  setLocalTool: { request: z.object({ tool: LocalToolIdSchema, path: z.string() }).strict(), response: z.object({ paths: LocalToolPathsSchema }).strict(), mutating: true },
} as const
