import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { guardStandardPipes } from '../../src/electron/standard-pipes.js'

describe('desktop standard output survives a detached launcher', () => {
  it('consumes EPIPE only on standard streams and records closure once per stream', () => {
    const stdout = new EventEmitter(), stderr = new EventEmitter(), record = vi.fn()
    guardStandardPipes(stdout, stderr, record)
    const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    expect(() => stderr.emit('error', error)).not.toThrow()
    expect(() => stderr.emit('error', error)).not.toThrow()
    expect(() => stdout.emit('error', error)).not.toThrow()
    expect(record.mock.calls).toEqual([['stderr'], ['stdout']])
    const network = new EventEmitter()
    expect(() => network.emit('error', error)).toThrow(error)
  })
  it.each(['stdout', 'stderr'] as const)('keeps a real child alive when its launcher closes %s', async name => {
    const other = name === 'stdout' ? 'stderr' : 'stdout'
    const modulePath = new URL('../../src/electron/standard-pipes.ts', import.meta.url).href
    const source = `import { guardStandardPipes } from ${JSON.stringify(modulePath)};
      const timer = setInterval(() => process.${name}.write('tick\\n'), 10);
      guardStandardPipes(process.stdout, process.stderr, stream => {
        process.${other}.write('survived:' + stream);
        setTimeout(() => { clearInterval(timer); process.exit(0); }, 100);
      });`
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] })
    let diagnostic = ''
    child[other]!.on('data', chunk => { diagnostic += chunk })
    child[name]!.once('data', () => child[name]!.destroy())
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
    try {
      const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
      expect(code).toBe(0)
      expect(diagnostic).toBe(`survived:${name}`)
    } finally { clearTimeout(timeout); if (child.exitCode === null) child.kill() }
  })

  it('preserves unexpected stream errors for the existing crash/error reporting policy', () => {
    const stdout = new EventEmitter(), stderr = new EventEmitter()
    guardStandardPipes(stdout, stderr)
    const error = Object.assign(new Error('disk failure'), { code: 'EIO' })
    expect(() => stderr.emit('error', error)).toThrow(error)
  })
  it('can remove its handlers without suppressing later unrelated lifecycle owners', () => {
    const stdout = new EventEmitter(), stderr = new EventEmitter()
    const dispose = guardStandardPipes(stdout, stderr)
    dispose()
    expect(stdout.listenerCount('error')).toBe(0)
    expect(stderr.listenerCount('error')).toBe(0)
  })
})
