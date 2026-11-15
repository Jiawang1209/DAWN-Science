import { z } from 'zod'
import { FileContentSchema } from './file-content.js'

const owner = {
  projectId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  connectionId: z.string().min(1).optional(),
}
const oneOwner = (r: { projectId?: string | undefined; sessionId?: string | undefined; connectionId?: string | undefined }) =>
  [r.projectId, r.sessionId, r.connectionId].filter(Boolean).length === 1
const ownerMessage = { message: 'projectId、sessionId 与 connectionId 要给且只给一个' }

export const BrowserDirectorySchema = z.object({
  path: z.string().min(1),
  parentPath: z.string().min(1).nullable(),
  projectPath: z.string().min(1),
  entries: z.array(z.object({
    name: z.string(),
    kind: z.enum(['file', 'dir']),
    size: z.int().min(0).optional(),
    modifiedAt: z.string().min(1),
  }).strict()),
  ignored: z.int().min(0),
  omitted: z.int().min(0),
}).strict()

export const BrowserSearchSchema = z.object({
  matches: z.array(z.object({ path: z.string(), kind: z.enum(['file', 'dir']) }).strict()),
  visited: z.int().min(0),
  skippedDirs: z.int().min(0),
  unreadable: z.int().min(0),
  truncated: z.enum(['matches', 'visited', 'time']).optional(),
}).strict()

/** Dedicated UI operations. Do not expose these through agent tool registries. */
export const fileBrowserOperations = {
  browseDirectory: {
    request: z.object({
      ...owner,
      path: z.string().default(''),
      /** Remote origin cwd. Local origins always come from the authoritative owner. */
      initialPath: z.string().min(1).optional(),
    }).strict().refine(oneOwner, ownerMessage),
    response: BrowserDirectorySchema,
    mutating: false,
  },
  readBrowserFile: {
    request: z.object({ ...owner, path: z.string().min(1) }).strict().refine(oneOwner, ownerMessage),
    response: FileContentSchema,
    mutating: false,
  },
  searchBrowserFiles: {
    request: z.object({ ...owner, path: z.string().default(''), query: z.string().min(1) }).strict().refine(oneOwner, ownerMessage),
    response: BrowserSearchSchema,
    mutating: false,
  },
  openBrowserFile: {
    request: z.object({
      projectId: owner.projectId,
      sessionId: owner.sessionId,
      path: z.string().min(1).refine(path => path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]/.test(path), { message: '需要绝对文件路径' }),
    }).strict().refine(oneOwner, ownerMessage),
    response: z.object({ problem: z.string().optional() }).strict(),
    mutating: false,
    sideEffects: true,
  },
} as const
