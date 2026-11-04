import {afterEach, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {OrchestrationMailbox} from '../../src/orchestration/mailbox.js'
import {createOrchestrationTools} from '../../src/orchestration/tools.js'
const roots: string[] = []
afterEach(() => {for (const dir of roots.splice(0)) rmSync(dir, {recursive: true, force: true})})
it('exposes durable background start, messages, discovery and parent-scoped controls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-control-')); roots.push(dir)
  const service = new OrchestrationService(new OrchestrationStore(dir, 'p'))
  let release!: () => void
  const gate = new Promise<void>(resolve => {release = resolve})
  const mailbox = new OrchestrationMailbox(service, async (_child, message) => {await gate; return {ok: true, output: message.text}})
  const tools = createOrchestrationTools({service, mailbox, start: (agent, text, requestId) => {
    const child = service.store.register('subagent', [requestId, '0'], agent)
    return {child, message: mailbox.send(child.id, text, requestId, 'start')}
  }})
  const invoke = async (name: string, args: unknown, id = 'call') => tools.find(tool => tool.name === name)!.execute(id, args)
  try {
    const started = await invoke('start_subagent', {agent: 'reviewer', task: 'check'})
    const receipt = JSON.parse(started.content[0]!.text)
    expect(receipt.childId).toMatch(/^child-/); expect(receipt.messageId).toMatch(/^message-/)
    expect(receipt.delivery).toBe('queued')
    const sent = await invoke('send_subagent_message', {childId: receipt.childId, message: 'follow up'}, 'next')
    expect(sent.isError).not.toBe(true)
    const unknown = await invoke('send_subagent_message', {childId: 'foreign', message: 'x'})
    expect(unknown.isError).toBe(true)
    const malformed = await invoke('send_subagent_message', {childId: receipt.childId, message: ''})
    expect(malformed.isError).toBe(true)
    const listing = JSON.parse((await invoke('list_subagents', {})).content[0]!.text)
    expect(listing.children[0]).toMatchObject({id: receipt.childId, capabilities: {queue: true, steer: false}})
  } finally {release(); await mailbox.settled(); await mailbox.close()}
})
