/** Loopback-only cancellation probe. Observations are captured before forced cleanup. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { MCP池 } from '../src/mcp/客户端.js'
import { mcpHttpFixture } from '../tests/mcp/http-fixture.js'

const rounds = Number(process.argv[2] ?? 100), concurrency = Number(process.argv[3] ?? 8)
const output = resolve(process.argv[4] ?? 'docs/validation/mcp-cancel-drain-20261105/baseline-probe.json')
const forceGc = process.env.DAWN_MCP_DIAG_GC === '1'
const redirect = process.env.DAWN_MCP_DIAG_REDIRECT === '1'
const gc = (globalThis as { gc?: () => void }).gc
if (forceGc && !gc) throw Error('GC probe needs node --expose-gc')
if (![rounds, concurrency].every(n => Number.isInteger(n) && n > 0 && n <= 1000)) throw Error('Expected positive rounds/concurrency <= 1000')
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
async function until(check: () => boolean, ms: number) {
  const deadline = performance.now() + ms
  while (!check() && performance.now() < deadline) await sleep(5)
  return check()
}
const results: { iteration: number; streaming: boolean; releasedWithin1000ms: boolean; releaseMs: number; observedClosed: boolean; snapshot: unknown }[] = []
let next = 0
await Promise.all(Array.from({ length: Math.min(concurrency, rounds) }, async () => {
  while (next < rounds) {
    const iteration = next++, streaming = iteration % 2 === 0
    const f = await mcpHttpFixture('http', streaming, { redirect }), pool = new MCP池({ 取密: () => undefined })
    try {
      const controller = new AbortController()
      const pending = pool.调('probe', f.config, 'hold', {}, undefined, controller.signal)
      if (!await until(() => f.calls.includes('hold'), 5000)) throw Error('Probe never reached hold')
      await pool.调('probe', f.config, 'echo', {})
      if (forceGc) {
        await new Promise<void>(resolve => setImmediate(resolve))
        gc!()
        await new Promise<void>(resolve => setImmediate(resolve))
        gc!()
      }
      const began = performance.now(); f.note('caller-abort'); controller.abort()
      await pending; f.note('caller-settled')
      const releasedWithin1000ms = await until(() => f.closedWaits.length === 1, 1000)
      if (!releasedWithin1000ms) await until(() => f.closedWaits.length === 1, 5000)
      results.push({ iteration, streaming, releasedWithin1000ms, releaseMs: performance.now() - began, observedClosed: f.closedWaits.length === 1, snapshot: f.snapshot() })
    } finally { try { await pool.全关() } finally { await f.close() } }
  }
}))
results.sort((a, b) => a.iteration - b.iteration)
const failures = results.filter(r => !r.releasedWithin1000ms)
const report = { node: process.versions.node, undici: process.versions.undici, rounds, concurrency, forceGc, redirect, failures: failures.length, stillOpenBeforeCleanup: failures.filter(r => !r.observedClosed).length, maxReleaseMs: Math.max(...results.map(r => r.releaseMs)), results }
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, results: undefined }))
if (failures.length) process.exitCode = 1
