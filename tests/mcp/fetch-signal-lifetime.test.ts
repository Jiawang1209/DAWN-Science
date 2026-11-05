import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it.each([false, true])('releases actual HTTP response streams after fetch setup GC (same-origin redirect: %s)', async redirect => {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-mcp-cancel-gc-')), report = join(dir, 'result.json')
  try {
    let exitCode = 0, output = ''
    try {
      const result = await promisify(execFile)(process.execPath, ['--expose-gc', '--import', 'tsx', resolve('scripts/diagnose-mcp-cancellation.ts'), '2', '1', report], {
        cwd: process.cwd(), env: { ...process.env, DAWN_MCP_DIAG_GC: '1', DAWN_MCP_DIAG_REDIRECT: redirect ? '1' : '0' }, timeout: 15_000,
      })
      output = result.stdout
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string }
      exitCode = failure.code ?? -1; output = `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`
    }
    expect(exitCode, output).toBe(0)
    const result = JSON.parse(readFileSync(report, 'utf8'))
    expect(result).toMatchObject({ rounds: 2, forceGc: true, redirect, failures: 0, stillOpenBeforeCleanup: 0 })
    expect(result.results.map((r: { streaming: boolean }) => r.streaming)).toEqual([true, false])
    expect(result.results.every((r: { observedClosed: boolean }) => r.observedClosed)).toBe(true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
