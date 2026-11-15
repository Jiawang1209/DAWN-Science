import { describe, expect, it, vi } from 'vitest'
import { join, parse } from 'node:path'

// Model a regular file directly under the native filesystem root without creating root-owned fixtures.
const content = vi.hoisted(() => Buffer.from('root-level result'))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    realpathSync: vi.fn((path: string) => path),
    statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: content.length })),
    readFileSync: vi.fn(() => Buffer.from(content)),
    openSync: vi.fn(() => 42),
    readSync: vi.fn((_fd: number, buffer: Buffer, offset: number, length: number, position: number) => content.copy(buffer, offset, position, position + length)),
    closeSync: vi.fn(),
  }
})

import { readLocalBrowserFile } from '../../src/files/browser.js'

describe('browser previews at filesystem root', () => {
  it('reads root-level regular files without treating their parent root as a workspace guard', () => {
    const root = parse(process.cwd()).root
    const file = join(root, 'dawn-browser-root-preview.md')
    expect(readLocalBrowserFile(join(root, 'project'), file)).toEqual({ kind: 'text', mediaType: 'text/markdown', text: content.toString(), bytes: content.length })
  })
})
