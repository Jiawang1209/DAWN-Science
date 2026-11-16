/** App-owned executable aliases for PATH-based local commands. No process.env or shell-profile writes.
 * Each launch reads current selections. Existing processes retain their launch snapshot.
 * Explicit absolute commands and DAWN's own bundled Node entrypoints keep their existing semantics. */
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { LOCAL_TOOLS, type LocalToolPaths } from '../protocol/local-tools.js'

const SHIM_PREFIX = 'dawn-local-tool-shims-'
const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`

/** Also reject aliases selected through a symlink: an alias targeting itself would recurse forever. */
export function isLocalToolShimPath(path: string): boolean {
  let actual: string
  try { actual = realpathSync(path) } catch { actual = resolve(path) }
  return actual.split(/[\\/]/).some(part => part.startsWith(SHIM_PREFIX))
}

export class LocalToolExecution {
  private directory: string | undefined
  private readonly snapshots = new Map<string, string>()
  constructor(private readonly selectedPaths: () => LocalToolPaths, private readonly platform: NodeJS.Platform = process.platform) {}

  environment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const paths = this.selectedPaths()
    const selected = LOCAL_TOOLS.flatMap(({ id }) => paths[id] ? [{ id, path: paths[id]! }] : [])
    if (!selected.length) return { ...source }
    for (const tool of selected) {
      if (isLocalToolShimPath(tool.path)) throw new Error(`Configured ${tool.id} points to a DAWN executable alias; select the original executable`)
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(selected)).digest('hex').slice(0, 24)
    let directory = this.snapshots.get(fingerprint)
    if (!directory) {
      this.directory ??= mkdtempSync(join(tmpdir(), SHIM_PREFIX))
      chmodSync(this.directory, 0o700)
      directory = join(this.directory, fingerprint)
      mkdirSync(directory, { mode: 0o700 })
      for (const { id, path } of selected) {
        const key = `DAWN_LOCAL_TOOL_${id.toUpperCase()}`
        // POSIX exec fails loudly if the saved target disappears; there is no fallback PATH lookup.
        // Git Bash/MSYS can execute Windows .cmd targets; native cmd/PowerShell use the .cmd alias.
        writeFileSync(join(directory, id), `#!/bin/sh\nexec ${this.platform === 'win32' ? `"$${key}"` : shellQuote(path)} "$@"\n`, { mode: 0o700 })
        if (this.platform === 'win32') writeFileSync(join(directory, `${id}.cmd`), `@echo off\r\n@setlocal DisableDelayedExpansion\r\n@"%${key}%" %*\r\n`)
      }
      this.snapshots.set(fingerprint, directory)
    }
    const result = { ...source }
    const pathKey = this.platform === 'win32' ? Object.keys(result).find(key => key.toLowerCase() === 'path') ?? 'PATH' : 'PATH'
    result[pathKey] = directory + (result[pathKey] ? (this.platform === 'win32' ? ';' : ':') + result[pathKey] : '')
    if (this.platform === 'win32') for (const { id, path } of selected) result[`DAWN_LOCAL_TOOL_${id.toUpperCase()}`] = path
    return result
  }

  dispose(): void {
    if (this.directory) rmSync(this.directory, { recursive: true, force: true })
    this.directory = undefined
    this.snapshots.clear()
  }
}
