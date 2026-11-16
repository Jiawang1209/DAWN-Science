/** Download only a checksum-pinned official scanner; no binary is tracked or packaged. */
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { releases, toolDir, toolPath, version } from './security-tool.mjs'
try {
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const release = releases[`${platform}_${process.arch}`]
  if (!release) throw Error('Unsupported scanner platform')
  if (!existsSync(toolPath)) {
    const name = `gitleaks_${version}_${platform}_${process.arch}.${release[0]}`
    const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${version}/${name}`)
    if (!response.ok) throw Error('Scanner download failed')
    const data = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(data).digest('hex') !== release[1]) throw Error('Scanner checksum mismatch')
    const temporary = mkdtempSync(join(tmpdir(), 'dawn-security-install-'))
    try {
      const archive = join(temporary, name); writeFileSync(archive, data, {mode: 0o600})
      execFileSync('tar', ['-xf', archive, '-C', temporary, basename(toolPath)], {stdio: 'pipe'})
      mkdirSync(toolDir, {recursive: true, mode: 0o700})
      chmodSync(join(temporary, basename(toolPath)), 0o755)
      // The cache and temporary directory can live on different volumes.
      const { copyFileSync } = await import('node:fs')
      copyFileSync(join(temporary, basename(toolPath)), `${toolPath}.tmp`)
      renameSync(`${toolPath}.tmp`, toolPath)
    } finally { rmSync(temporary, {recursive: true, force: true}) }
  }
  if (execFileSync(toolPath, ['version'], {encoding:'utf8'}).trim() !== version) throw Error('Scanner version mismatch')
  if (!process.argv.includes('--no-hooks')) {
    let hooks = ''
    try { hooks = execFileSync('git', ['config','--get','core.hooksPath'], {encoding:'utf8',stdio:'pipe'}).trim() } catch {}
    if (hooks && hooks !== '.githooks') throw Error('Existing custom hooksPath retained; integrate .githooks/secret checks manually')
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {stdio:'pipe'})
  }
  console.log(`Secret guard ready (Gitleaks ${version}).`)
} catch (error) {
  // All messages above are fixed text. Never dump a downloader/process object or environment.
  console.error(error instanceof Error && !('status' in error) ? error.message : 'Secret guard setup failed.')
  process.exitCode = 1
}
