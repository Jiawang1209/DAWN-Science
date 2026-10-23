import { expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { desktopWorkspace } from '../../src/cli/workspace.js'
it('uses an existing project spelling for the same actual directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'dawn-cwd-'))
  try {
    mkdirSync(join(root, 'actual')); symlinkSync(join(root, 'actual'), join(root, 'alias'))
    expect(desktopWorkspace(join(root, 'actual'), [{ workspace: join(root, 'missing') }, { workspace: join(root, 'alias') }])).toBe(join(root, 'alias'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
