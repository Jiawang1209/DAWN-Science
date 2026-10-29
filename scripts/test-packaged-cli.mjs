/** Exercise the installed CLI with system Node, before testing the Electron UI. */
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const candidates = process.platform === 'darwin'
  ? [join(root, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'DAWN Science.app', 'Contents', 'Resources', 'app')]
  : [join(root, 'release', process.platform === 'win32' ? 'win-unpacked' : `linux${process.arch === 'x64' ? '' : '-' + process.arch}-unpacked`, 'resources', 'app')]
const appRoot = process.argv[2] ? resolve(process.argv[2]) : candidates.find(existsSync)
if (!appRoot) throw new Error('No native packaged app found; run npm run pack, or pass its resources/app directory')
const entry = join(appRoot, 'dist', 'cli', 'main.js')
const require = createRequire(entry)
// A package under release/ can otherwise fall back to the checkout's development node_modules.
const modules = realpathSync(join(appRoot, 'node_modules'))
for (const name of ['@xterm/headless', '@xterm/addon-unicode11']) {
  const path = relative(modules, realpathSync(require.resolve(name)))
  if (isAbsolute(path) || path === '..' || path.startsWith('..' + sep))
    throw new Error(`${name} resolves outside the packaged app`)
}
const work = mkdtempSync(join(tmpdir(), 'dawn-packaged-cli-'))
try {
  const output = execFileSync(process.execPath, [entry, '--help'], {
    cwd: work, encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL',
    env: { ...process.env, DAWN_CLI_HOME: join(work, 'cli-home') },
  })
  if (!output.includes('DAWN Science') || !output.includes('/exit'))
    throw new Error('Packaged CLI did not print its expected help')
  console.log(`[packaged-cli] --help passed: ${appRoot}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
