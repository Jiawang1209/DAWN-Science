import {afterEach, describe, expect, it} from 'vitest'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore, childIdentity} from '../../src/orchestration/store.js'

const roots: string[] = []
const root = () => {const dir = mkdtempSync(join(tmpdir(), 'dawn-orchestration-')); roots.push(dir); return dir}
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})

describe('durable child identity and recovery', () => {
  it('keeps backend addresses distinct and stable across reopen', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    const child = store.register('subagent', ['call/1', '0'], 'reviewer')
    expect(child.id).toBe(childIdentity('subagent', ['call/1', '0'], 'parent'))
    expect(child.id).not.toBe(childIdentity('team', ['call/1', '0'], 'parent'))
    expect(new OrchestrationStore(dir, 'parent').get(child.id)).toEqual(child)
    expect(() => store.register('subagent', ['call/1', '0'], 'someone-else')).toThrow(/conflict/)
    const exposed = store.list(); exposed[0]!.label = 'mutated'
    expect(store.get(child.id)?.label).toBe('reviewer')
  })

  it('recovers unknown running work as interrupted without losing previous results', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    const finished = store.register('subagent', ['first', '0'], 'a')
    const running = store.register('bot', ['team', 'b', 'epoch-1'], 'b')
    store.update(finished.id, {state: 'completed', result: {ok: true, output: 'checked output'}})
    store.update(running.id, {state: 'running', epoch: 3})
    const reopened = new OrchestrationStore(dir, 'parent')
    expect(reopened.get(finished.id)?.result).toEqual({ok: true, output: 'checked output'})
    expect(reopened.get(running.id)).toMatchObject({state: 'interrupted', epoch: 3, reason: expect.stringMatching(/核对|interrupted/)})
    expect(store.get(running.id)?.state).toBe('running')
  })

  it('refuses corrupt, future-version and foreign-owner state without overwriting the file', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    store.register('team', ['t', 'm', '1'], 'member')
    const file = join(dir, 'orchestration', 'state.json')
    const good = JSON.parse(readFileSync(file, 'utf8'))
    for (const text of ['{broken', JSON.stringify({...good, version: 999}), JSON.stringify({...good, ownerSessionId: 'other'})]) {
      writeFileSync(file, text)
      expect(() => new OrchestrationStore(dir, 'parent')).toThrow(/orchestration/i)
      expect(readFileSync(file, 'utf8')).toBe(text)
    }
  })

  it('does not publish a transaction whose disk commit failed', () => {
    const dir = root(), store = new OrchestrationStore(dir, 'parent')
    const child = store.register('subagent', ['c', '0'], 'a')
    rmSync(join(dir, 'orchestration'), {recursive: true})
    writeFileSync(join(dir, 'orchestration'), 'occupied')
    expect(() => store.update(child.id, {state: 'running'})).toThrow()
    expect(store.get(child.id)?.state).toBe('idle')
  })
})

it('the same backend address in two parent chats cannot produce an interchangeable child ID', () => {
  const a = new OrchestrationStore(root(), 'parent-a')
  const b = new OrchestrationStore(root(), 'parent-b')
  const first = a.register('subagent', ['call-1', '0'], 'reviewer')
  const second = b.register('subagent', ['call-1', '0'], 'reviewer')
  expect(first.id).not.toBe(second.id)
  expect(b.get(first.id)).toBeUndefined()
})
