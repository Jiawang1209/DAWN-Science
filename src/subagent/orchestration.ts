/** Adapts ordinary Pi subprocess delegations to the shared durable controls. */
import {TaskSettingsSchema,TaskReceiptSchema} from "../orchestration/task-contract.js"
import {TaskObservationSchema} from '../protocol/task-observation.js'
import {existsSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {子目录段} from '../protocol/subagent-id.js'
import {createSubagentTool, createSubagentFollowUp, type SubagentToolOptions, prepareSubagentTask} from './tool.js'
import {loadSubagentsFrom, loadSubagentDefinitions} from './definitions.js'
import {会话文件, 读元} from './run-dir.js'
import {OrchestrationMailbox} from '../orchestration/mailbox.js'
import type {OrchestrationService} from '../orchestration/service.js'

export function createSubagentOrchestration(opts: SubagentToolOptions, service: OrchestrationService, onResult: () => void, onError: (error: unknown) => void) {
  // The mailbox owns admission; re-entering the service inside these adapters would deadlock.
  // Rebuild only the new index; legacy meta/transcripts remain authoritative and untouched.
  const legacyRoot = join(opts.context.agentDirOf(0), '..')
  const actualRoot = opts.运行目录 ? join(opts.运行目录("_", 0), '..', '..') : legacyRoot
  if (opts.运行目录 && existsSync(actualRoot)) {
    for (const call of readdirSync(actualRoot, {withFileTypes: true})) if (call.isDirectory()) {
      const callRoot = join(actualRoot, call.name)
      for (const index of readdirSync(callRoot, {withFileTypes: true})) if (index.isDirectory() && /^\d+$/.test(index.name)) {
        const meta = 读元(join(callRoot, index.name))
        if (!meta) continue
        const receipt=meta.status !== 'running' && meta.receipt ? TaskReceiptSchema.parse(meta.receipt) : undefined
        const known = service.store.list().find(child => child.kind === 'subagent' && child.address[0] === call.name && child.address[1] === index.name)
        const child = known??service.register('subagent', [call.name, index.name], meta.agent)
        if(meta.settings)service.store.bindTask(child.id,TaskSettingsSchema.parse(meta.settings))
        // Registration and legacy reconstruction are separate durable writes. If
        // interrupted between them, an empty epoch-0 identity still needs repair.
        if(known && (known.epoch>0 || known.state!=='idle' || known.result || service.store.messages().some(message=>message.childId===known.id)))continue
        service.store.update(child.id, {state: meta.status === 'ok' ? 'completed' : meta.status === 'running' ? 'interrupted' : 'failed',
          ...(meta.status === 'running' ? {paused: true, reason: '上次退出时仍在执行，请核对已有产物后继续'} : {}),
          ...(meta.status !== 'running' && (meta.result || meta.error || meta.receipt) ? {result: {
            ok: meta.status === 'ok', output: meta.result?.text ?? '',
            ...(meta.error ? {error: meta.error} : {}),
            ...(receipt ? {receipt} : {}),
            ...(meta.observation?{observation:TaskObservationSchema.parse(meta.observation)}:{}),
          }} : {})})
      }
    }
  }
  const raw = {...opts, orchestration: undefined, taskStore:service.store}
  const startTool = createSubagentTool(raw)
  const followUp = createSubagentFollowUp(raw)
  const mailbox = new OrchestrationMailbox(service, async (child, message, signal) => {
    const [toolCallId, rawIndex] = child.address
    if (!toolCallId || rawIndex === undefined || child.address.length !== 2 || !/^\d+$/.test(rawIndex)) throw new Error('子 agent 地址不完整，无法续接')
    const index = Number(rawIndex)
    const dir = opts.运行目录 ? opts.运行目录(toolCallId, index) : opts.context.agentDirOf(index)
    const prompt = `[subagent-message:${message.id}]\n${message.text}`
    if (message.mode === 'start') {
      if (index !== 0) throw new Error('后台初始任务地址无效')
      const result = await startTool.execute(message.requestId, {agent: child.label, task: prompt}, signal)
      const meta = 读元(dir)
      if (result.isError || !meta?.result) return {ok: false, output: '', error: meta?.error ?? result.content.map(item => item.text).join('\n'),...(meta?.receipt?{receipt:meta.receipt}:{}),...(meta?.observation?{observation:meta.observation}:{})}
      return {ok: true, output: meta.result.text,...(meta.receipt?{receipt:meta.receipt}:{}),...(meta.observation?{observation:meta.observation}:{})}
    }
    if (!会话文件(dir)) {
      // Ordinary children always have a transcript subdirectory. Never silently create a fresh conversation.
      throw new Error('子 agent 未留下可续接转录；请核对已有产物后启动新任务')
    }
    const result = await followUp(toolCallId, index, child.label, prompt, signal)
    return {ok: result.ok, output: result.output, ...(result.error ? {error: result.error} : {}),...(result.receipt?{receipt:result.receipt}:{}),...(result.observation?{observation:result.observation}:{})}
  }, onResult, onError)
  return {
    mailbox,
    start(agent: string, task: string, requestId: string, contract?:import("../orchestration/task-contract.js").TaskContract) {
      const definitions = opts.dirs ? loadSubagentsFrom(opts.dirs, {自带停用: opts.自带停用}) : loadSubagentDefinitions(opts.projectRoot)
      if (!definitions.agents.some(definition => definition.name === agent && !definition.disabled)) throw new Error(`没有启用的子 agent：${agent}`)
      const call = 子目录段(requestId)
      const previous = service.store.list().find(child => child.kind === 'subagent' && child.address[0] === call && child.address[1] === '0')
      if (previous && !service.store.messages().some(message => message.childId === previous.id && message.requestId === requestId && message.mode === 'start')) throw new Error('子任务运行地址已存在，不能覆盖旧会话')
      const child = service.register('subagent', [call, '0'], agent)
      prepareSubagentTask({...raw},call,0,{agent,...(contract?{contract}:{})},definitions.agents.find(d=>d.name===agent)?.tools)
      return {child, message: mailbox.send(child.id, task, requestId, 'start')}
    },
  }
}
