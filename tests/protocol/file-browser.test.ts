import { describe, expect, it } from 'vitest'
import { OPERATIONS, 只读模式该拦 } from '../../src/protocol/operations.js'
import { WORKBENCH_PROTOCOL_VERSION } from '../../src/protocol/version.js'

describe('user browser protocol', () => {
  it('registers the additive 8.54 browser operations with one explicit owner', () => {
    expect(WORKBENCH_PROTOCOL_VERSION).toBe('8.54')
    for (const op of ['browseDirectory', 'readBrowserFile', 'searchBrowserFiles'] as const) {
      const request = OPERATIONS[op].request
      const fields = { path: '/tmp/data.txt', ...(op === 'searchBrowserFiles' ? { query: 'data' } : {}) }
      for (const owner of [{ projectId: 'p' }, { sessionId: 's' }, { connectionId: 'c' }]) expect(request.safeParse({ ...owner, ...fields }).success).toBe(true)
      expect(request.safeParse(fields).success).toBe(false)
      expect(request.safeParse({ projectId: 'p', sessionId: 's', ...fields }).success).toBe(false)
      expect(OPERATIONS[op].mutating).toBe(false)
    }
    expect(OPERATIONS.browseDirectory.request.parse({ connectionId: 'c', initialPath: '/home/user/project' })).toEqual({ connectionId: 'c', initialPath: '/home/user/project', path: '' })
    expect(OPERATIONS.readBrowserFile.request.safeParse({ projectId: 'p', path: '' }).success).toBe(false)
  })
  it('requires actual modification metadata on browser entries like legacy listings', () => {
    const listing = { path: '/workspace', parentPath: '/', projectPath: '/workspace', ignored: 0, omitted: 0 }
    const entry = { name: 'result.txt', kind: 'file' }
    expect(OPERATIONS.browseDirectory.response.safeParse({ ...listing, entries: [entry] }).success).toBe(false)
    expect(OPERATIONS.browseDirectory.response.safeParse({ ...listing, entries: [{ ...entry, modifiedAt: '2026-11-15T00:00:00.000Z' }] }).success).toBe(true)
  })

  it('requires local absolute paths for system opening and blocks it in read-only mode', () => {
    expect(OPERATIONS.openBrowserFile.request.safeParse({ sessionId: 's', path: '/tmp/file.txt' }).success).toBe(true)
    expect(OPERATIONS.openBrowserFile.request.safeParse({ projectId: 'p', path: 'C:/data/file.txt' }).success).toBe(true)
    expect(OPERATIONS.openBrowserFile.request.safeParse({ projectId: 'p', path: '//server/share/file.txt' }).success).toBe(true)
    expect(OPERATIONS.openBrowserFile.request.safeParse({ projectId: 'p', path: 'file.txt' }).success).toBe(false)
    expect(OPERATIONS.openBrowserFile.request.safeParse({ connectionId: 'c', path: '/tmp/file.txt' }).success).toBe(false)
    expect(OPERATIONS.openBrowserFile.mutating).toBe(false)
    expect(只读模式该拦('openBrowserFile')).toBe(true)
  })
})
