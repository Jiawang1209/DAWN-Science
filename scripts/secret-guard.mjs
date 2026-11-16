/** Fail closed. Only filenames, line numbers and rule ids leave the scanner. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { toolPath, version } from './security-tool.mjs'
const config = resolve(import.meta.dirname, '..', '.gitleaks.toml')
const temporary = mkdtempSync(join(tmpdir(), 'dawn-secret-check-'))
const git = (...args) => {
  const result = spawnSync('git', args, {encoding:'utf8',maxBuffer:128*1024*1024})
  if (result.status !== 0) throw Error('Unable to read Git content; check stopped.')
  return result.stdout
}
const safe = value => JSON.stringify(value.replace(/sk-[\w-]{16,}/g, '[REDACTED]'))
const blocked = path => {
  const name = basename(path)
  return ['credentials.json','handoff.json','.handoff-salt','providers.yaml','models.generated.json'].includes(name)
    || (name.startsWith('.env') && name !== '.env.example' && (name === '.env' || name.startsWith('.env.')))
    || /\.(pem|key)$/i.test(name)
}
let failed = false
function checkPaths(paths) {
  for (const path of new Set(paths.filter(Boolean))) if (blocked(path)) {
    console.error(`runtime-credential-file: ${safe(path)}`); failed = true
  }
}
function scan(args) {
  const report = join(temporary, 'report.json')
  rmSync(report, {force:true})
  const result = spawnSync(toolPath, [...args, '--config', config, '--redact=100', '--no-banner', '--no-color',
    '--log-level','error','--ignore-gitleaks-allow','--gitleaks-ignore-path',temporary,
    '--report-format','json','--report-path',report], {encoding:'utf8',maxBuffer:16*1024*1024,timeout:300_000})
  // Raw stderr and findings can contain source. Never forward either.
  if (result.error || ![0,1].includes(result.status) || !existsSync(report)) throw Error('Secret scanner failed; check stopped.')
  const findings = JSON.parse(readFileSync(report, 'utf8'))
  for (const f of findings) console.error(`secret: ${safe(f.File.replace(temporary+'/', ''))}:${Number(f.StartLine)} (${f.RuleID})`)
  if (findings.length) failed = true
  if (result.status === 1 && !findings.length) throw Error('Secret scanner failed; check stopped.')
}
function history(logOptions) {
  logOptions = `--diff-merges=first-parent ${logOptions}`
  checkPaths(git('log','--format=','--name-only','--diff-filter=ACMR','-z',...logOptions.split(' '),'--').split(/[\0\n]/))
  scan(['git','--log-opts',logOptions,'.'])
}
// Remote-tracking refs are useful only when they belong to this exact destination.
// Direct URLs, divergent push URLs and unknown destinations scan the whole reachable history.
function newBranchHistory(local) {
  const [name, destination] = process.argv.slice(3)
  if (name && destination && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) {
    const source = spawnSync('git', ['remote','get-url',name], {encoding:'utf8'})
    if (source.status === 0 && source.stdout.trim() === destination) return `${local} --not --remotes=${name}`
  }
  return local
}
try {
  if (!existsSync(toolPath)) throw Error('Secret scanner missing. Run npm run security:setup before committing or pushing.')
  const installed = spawnSync(toolPath, ['version'], {encoding:'utf8'})
  if (installed.status !== 0 || installed.stdout.trim() !== version) throw Error('Scanner version mismatch. Run npm run security:setup.')
  const mode = process.argv[2] ?? '--all'
  if (mode === '--staged' || mode === '--all') {
    const paths = mode === '--staged' ? git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split('\0').filter(Boolean)
      : git('ls-files','-z').split('\0').filter(Boolean)
    checkPaths(paths)
    // Read the index rather than worktree files (including force-added ignored files).
    if (paths.length) {
      const snapshot = join(temporary, 'snapshot')
      const {mkdirSync} = await import('node:fs'); mkdirSync(snapshot)
      const result = spawnSync('git', ['checkout-index','--prefix',snapshot+'/', '--stdin','-z'], {input:paths.join('\0')+'\0',encoding:'utf8',maxBuffer:1024*1024})
      if (result.status !== 0) throw Error('Unable to scan staged content; check stopped.')
      scan(['dir',snapshot])
    }
  } else if (mode === '--range') {
    const range = process.argv[3] ?? ''
    if (!/^[a-f\d]{40,64}\.\.[a-f\d]{40,64}$/.test(range)) throw Error('Expected an explicit base..tip commit range.')
    history(range)
  } else if (mode === '--pre-push') {
    const lines = readFileSync(0,'utf8').trim().split('\n').filter(Boolean)
    for (const line of lines) {
      const [,local,,remote] = line.split(/\s+/)
      if (!/^[a-f\d]{40,64}$/.test(local ?? '') || !/^[a-f\d]{40,64}$/.test(remote ?? '')) throw Error('Invalid push update; check stopped.')
      if (/^0+$/.test(local)) continue
      history(/^0+$/.test(remote) ? newBranchHistory(local) : `${remote}..${local}`)
    }
  } else throw Error('Unknown secret check mode.')
  if (failed) process.exitCode = 1
  else console.log('Secret check passed (redacted; no detected credentials).')
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid scanner report; check stopped.' : error.message)
  process.exitCode = 1
} finally { rmSync(temporary, {recursive:true,force:true}) }
