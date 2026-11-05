/** Opt-in observation only: never closes a pipe, kills a process or changes exit budgets. */
import type { ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { collectTree } from '../src/runtime/process-tree.js'

export async function observeElectronExit(app: ElectronApplication) {
  const dir = process.env.DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR
  if (!dir) return { beginClose() {}, async appReady() {} }
  mkdirSync(dir, { recursive: true })
  const child = app.process()
  const file = join(dir, `exit-${child.pid}.jsonl`)
  const started = performance.now()
  const record = (event: string, detail: unknown = {}) => {
    appendFileSync(file, JSON.stringify({ event, at: new Date().toISOString(), ms: performance.now() - started, detail }) + '\n')
  }
  const streamState = (stream: typeof child.stdout) => stream && ({
    destroyed: stream.destroyed, readableEnded: stream.readableEnded, closed: stream.closed,
  })
  const snapshot = () => ({
    pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode,
    stdout: streamState(child.stdout), stderr: streamState(child.stderr),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  let closing = false
  let closed = false
  const beginClose = () => {
    if (closing || closed) return
    closing = true
    const owned = child.pid && child.exitCode === null ? collectTree(child.pid).pids : []
    record('close-requested', { ...snapshot(), owned })
    timer = setTimeout(() => {
      record('still-waiting-5s', snapshot())
      if (owned.length) execFile('ps', ['-p', owned.join(','), '-o', 'pid=,ppid=,state=,comm='], (error, stdout) => {
        record('owned-processes', { error: error?.message, stdout })
      })
      if (process.platform === 'darwin' && child.pid && child.exitCode === null && child.signalCode === null) {
        execFile('/usr/bin/sample', [String(child.pid), '1', '-file', join(dir, `sample-${child.pid}.txt`)], { timeout: 5000 }, (error) => {
          record('sample-complete', { error: error?.message })
        })
      }
    }, 5000)
    timer.unref()
  }
  child.once('exit', (code, signal) => record('child-exit', { code, signal, ...snapshot() }))
  child.once('close', (code, signal) => {
    closed = true
    if (timer) clearTimeout(timer)
    record('child-close', { code, signal, ...snapshot() })
  })
  for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
    stream?.once('end', () => record(`${name}-end`, snapshot()))
    stream?.once('close', () => record(`${name}-close`, snapshot()))
  }
  // Read only our own marker, never persist general stderr or request/config data.
  let pending = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    pending += chunk.toString()
    const lines = pending.split('\n')
    pending = lines.pop()!.slice(-4096)
    for (const line of lines) {
      const marker = '[DAWN_EXIT_DIAG] '
      const index = line.indexOf(marker)
      if (index < 0) continue
      record('app-event', line.slice(index + marker.length))
      if (line.includes('before-quit')) beginClose()
    }
  })
  record('attached', snapshot())
  const appReady = async () => {
    try {
      await app.evaluate(({ app }) => {
        const log = (event: string) => {
          const resources = process.getActiveResourcesInfo()
          console.error('[DAWN_EXIT_DIAG] ' + JSON.stringify({ event, resources }))
        }
        app.on('before-quit', () => log('before-quit'))
        app.on('will-quit', () => log('will-quit'))
        app.on('quit', () => log('quit'))
        process.once('exit', () => log('process-exit'))
      })
    } catch (error) {
      // Optional observation failures are recorded separately. Product launch,
      // app.close and the strict child exit assertions remain mandatory.
      record("app-observation-unavailable", { message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { beginClose, appReady }
}
