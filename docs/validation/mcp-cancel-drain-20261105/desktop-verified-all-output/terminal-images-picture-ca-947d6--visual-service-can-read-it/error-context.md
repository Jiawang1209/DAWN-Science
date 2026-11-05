# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: terminal-images.spec.ts >> picture capability >> rejects attachment explicitly when neither the selected model nor a visual service can read it
- Location: e2e/terminal-images.spec.ts:99:3

# Error details

```
Error: electronApplication.evaluate: Resulting promise was garbage collected.
```

# Test source

```ts
  1  | /** Opt-in observation only: never closes a pipe, kills a process or changes exit budgets. */
  2  | import type { ElectronApplication } from '@playwright/test'
  3  | import { execFile } from 'node:child_process'
  4  | import { appendFileSync, mkdirSync } from 'node:fs'
  5  | import { join } from 'node:path'
  6  | import { collectTree } from '../src/runtime/process-tree.js'
  7  | 
  8  | export async function observeElectronExit(app: ElectronApplication) {
  9  |   const dir = process.env.DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR
  10 |   if (!dir) return { beginClose() {} }
  11 |   mkdirSync(dir, { recursive: true })
  12 |   const child = app.process()
  13 |   const file = join(dir, `exit-${child.pid}.jsonl`)
  14 |   const started = performance.now()
  15 |   const record = (event: string, detail: unknown = {}) => {
  16 |     appendFileSync(file, JSON.stringify({ event, at: new Date().toISOString(), ms: performance.now() - started, detail }) + '\n')
  17 |   }
  18 |   const streamState = (stream: typeof child.stdout) => stream && ({
  19 |     destroyed: stream.destroyed, readableEnded: stream.readableEnded, closed: stream.closed,
  20 |   })
  21 |   const snapshot = () => ({
  22 |     pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode,
  23 |     stdout: streamState(child.stdout), stderr: streamState(child.stderr),
  24 |   })
  25 |   let timer: ReturnType<typeof setTimeout> | undefined
  26 |   let closing = false
  27 |   let closed = false
  28 |   const beginClose = () => {
  29 |     if (closing || closed) return
  30 |     closing = true
  31 |     const owned = child.pid && child.exitCode === null ? collectTree(child.pid).pids : []
  32 |     record('close-requested', { ...snapshot(), owned })
  33 |     timer = setTimeout(() => {
  34 |       record('still-waiting-5s', snapshot())
  35 |       if (owned.length) execFile('ps', ['-p', owned.join(','), '-o', 'pid=,ppid=,state=,comm='], (error, stdout) => {
  36 |         record('owned-processes', { error: error?.message, stdout })
  37 |       })
  38 |       if (process.platform === 'darwin' && child.pid && child.exitCode === null && child.signalCode === null) {
  39 |         execFile('/usr/bin/sample', [String(child.pid), '1', '-file', join(dir, `sample-${child.pid}.txt`)], { timeout: 5000 }, (error) => {
  40 |           record('sample-complete', { error: error?.message })
  41 |         })
  42 |       }
  43 |     }, 5000)
  44 |     timer.unref()
  45 |   }
  46 |   child.once('exit', (code, signal) => record('child-exit', { code, signal, ...snapshot() }))
  47 |   child.once('close', (code, signal) => {
  48 |     closed = true
  49 |     if (timer) clearTimeout(timer)
  50 |     record('child-close', { code, signal, ...snapshot() })
  51 |   })
  52 |   for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
  53 |     stream?.once('end', () => record(`${name}-end`, snapshot()))
  54 |     stream?.once('close', () => record(`${name}-close`, snapshot()))
  55 |   }
  56 |   // Read only our own marker, never persist general stderr or request/config data.
  57 |   let pending = ''
  58 |   child.stderr?.on('data', (chunk: Buffer) => {
  59 |     pending += chunk.toString()
  60 |     const lines = pending.split('\n')
  61 |     pending = lines.pop()!.slice(-4096)
  62 |     for (const line of lines) {
  63 |       const marker = '[DAWN_EXIT_DIAG] '
  64 |       const index = line.indexOf(marker)
  65 |       if (index < 0) continue
  66 |       record('app-event', line.slice(index + marker.length))
  67 |       if (line.includes('before-quit')) beginClose()
  68 |     }
  69 |   })
  70 |   record('attached', snapshot())
> 71 |   await app.evaluate(({ app }) => {
     |             ^ Error: electronApplication.evaluate: Resulting promise was garbage collected.
  72 |     const log = (event: string) => {
  73 |       const resources = process.getActiveResourcesInfo()
  74 |       console.error('[DAWN_EXIT_DIAG] ' + JSON.stringify({ event, resources }))
  75 |     }
  76 |     app.on('before-quit', () => log('before-quit'))
  77 |     app.on('will-quit', () => log('will-quit'))
  78 |     app.on('quit', () => log('quit'))
  79 |     process.once('exit', () => log('process-exit'))
  80 |   })
  81 |   return { beginClose }
  82 | }
  83 | 
```