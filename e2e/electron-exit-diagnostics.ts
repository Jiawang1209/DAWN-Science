/** Passive process/protocol observer. Native app facts are written independently. */
import type { ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync,readFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectTree } from '../src/runtime/process-tree.js'

export async function observeElectronExit(app: ElectronApplication, defaultDir?:string) {
  const explicitDir=process.env.DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR
  const dir = explicitDir || defaultDir
  const disabled={ beginClose() {}, closeReturned() {}, closeFailed() {}, shutdownProblems:()=>['shutdown-diagnostics-unavailable'],async appReady() {} }
  if (!dir) return disabled
  try{mkdirSync(dir, { recursive: true,mode:0o700 })}catch{return disabled}
  const child = app.process()
  const file = join(dir, `exit-${child.pid}.jsonl`)
  const started = performance.now()
  const record = (event: string, detail: unknown = {}) => {
    try{appendFileSync(file, JSON.stringify({ event, at: new Date().toISOString(), ms: performance.now() - started, detail }) + '\n',{mode:0o600})}catch{/* Passive diagnostics cannot break control flow. */}
  }
  let appClosed=false,contextClosed=false
  const streamState = (stream: typeof child.stdout) => stream && ({
    destroyed: stream.destroyed, readableEnded: stream.readableEnded, closed: stream.closed,
  })
  const snapshot = () => ({
    pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode,
    appClosed,contextClosed,
    stdout: streamState(child.stdout), stderr: streamState(child.stderr),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  let closing = false
  let closed = false
  const beginClose = () => {
    if (closing || closed) return
    closing = true
    // Keep normal fixture shutdown passive: inspect processes only if it stalls.
    const owned = child.pid && child.exitCode === null ? collectTree(child.pid).pids : []
    record('close-requested', { ...snapshot(), owned })
    timer = setTimeout(() => {
      record('still-waiting-5s', snapshot())
      const waiting=owned.length?owned:child.pid&&child.exitCode===null?collectTree(child.pid).pids:[]
      if (waiting.length) execFile('ps', ['-p', waiting.join(','), '-o', 'pid=,ppid=,state=,comm='], (error, stdout) => {
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
  app.once('close',()=>{appClosed=true;record('app-protocol-close',snapshot())})
  const context=app.context()
  context.once('close',()=>{contextClosed=true;record('context-close',snapshot())})
  const pages=new WeakSet<object>();let pageCount=0
  const observePage=(page:ReturnType<ElectronApplication['windows']>[number])=>{
    if(pages.has(page))return
    pages.add(page);const id=++pageCount
    page.once('crash',()=>record('page-crash',{id,...snapshot()}))
    page.once('close',()=>record('page-close',{id,...snapshot()}))
  }
  app.on('window',observePage);context.on('page',observePage)
  for(const page of app.windows())observePage(page)
  for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
    stream?.once('end', () => record(`${name}-end`, snapshot()))
    stream?.once('close', () => record(`${name}-close`, snapshot()))
  }
  // Only classify fixed inspector markers; never retain stderr or websocket URLs.
  let pending = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    pending += chunk.toString()
    const lines = pending.split('\n')
    pending = lines.pop()!.slice(-4096)
    for (const raw of lines) {
      const line=raw.replace(/\r$/,'')
      if(line.startsWith('Debugger ending on '))record('inspector-ending',snapshot())
      if(line==='Waiting for the debugger to disconnect...')record('inspector-waiting-disconnect',snapshot())
    }
  })
  record('attached', snapshot())
  const appReady = async () => {
    record('observer-ready',snapshot())
  }
  const shutdownProblems=():string[]=>{
    const nativeFile=join(dir,`app-${child.pid}.jsonl`)
    if(!existsSync(nativeFile))return['shutdown-diagnostics-unavailable']
    try{
      const events=readFileSync(nativeFile,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line).event as string)
      // Explicit shared diagnostic directories may contain a previous use of this PID.
      const attached=events.lastIndexOf('diagnostics-attached'),current=events.slice(Math.max(0,attached))
      const bad=new Set(['shutdown-drain-timeout','shutdown-drain-failed','shutdown-async-failed','shutdown-fallback-fired'])
      const problems=[...new Set(current.filter(event=>bad.has(event)))]
      if(problems.length)return problems
      if(attached<0)return['shutdown-diagnostics-unavailable']
      if(current.includes('shutdown-async-start')&&!current.includes('shutdown-drained'))return['shutdown-outcome-unobserved']
      return[]
    }catch{return['shutdown-diagnostics-unreadable']}
  }
  return { beginClose, appReady,shutdownProblems,closeReturned:()=>record('close-call-returned',snapshot()),closeFailed:()=>record('close-call-failed',snapshot()) }
}
