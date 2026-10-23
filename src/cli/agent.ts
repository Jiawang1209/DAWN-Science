import { createInterface, clearLine, cursorTo } from 'node:readline'
import type { AgentEvent } from '../runtime/types.js'
import type { QuestionRecord, QuestionAnswer } from '../protocol/questions.js'
import { openCliContext } from './context.js'
import { CLI_HELP, plain, toolDetail } from './presentation.js'

type Permission = Extract<AgentEvent, { kind: 'permission_request' }>
export async function runCliAgent(agentId?: string): Promise<number> {
  const context = await openCliContext(agentId)
  const { workbench, call, sessionId } = context
  const input = process.stdin, output = process.stdout, interactive = Boolean(input.isTTY && output.isTTY)
  const color = (n: string, text: string) => interactive && !process.env.NO_COLOR ? `\x1b[${n}m${text}\x1b[0m` : text
  const rl = createInterface({ input, output, terminal: interactive, historySize: 200 })
  let busy = false, closing = false, failed = false, answer = '', permission: Permission | undefined
  let question: { record: QuestionRecord; index: number; answers: QuestionAnswer['answers'] } | undefined
  let finished!: () => void
  const done = new Promise<void>(resolve => { finished = resolve })
  const say = (text: string) => {
    if (interactive) { clearLine(output, 0); cursorTo(output, 0) }
    output.write(plain(text) + '\n')
  }
  const prompt = () => {
    if (!interactive || closing) return
    rl.setPrompt(color('38;2;30;145;130', permission ? '允许 › ' : question ? '回答 › ' : busy ? '' : 'DAWN › '))
    if (!busy || permission || question) rl.prompt(true)
  }
  const flush = () => { if (answer.trim()) { say('\n' + answer.trim() + '\n'); answer = '' } }
  const status = () => say(`\nAgent · ${context.model}\n目录  ${process.cwd()}\n记录  ${context.directory}\n`)
  const showQuestion = () => {
    if (!question) return
    const q = question.record.questions[question.index]!
    say(q.question)
    q.options?.forEach((option, index) => say(`  ${index + 1}. ${option.label}${option.description ? ' · ' + option.description : ''}`))
    say(q.multi_select ? '输入选项编号（逗号分隔）或自己的回答。' : '输入选项编号或自己的回答。')
    prompt()
  }
  const shutdown = async () => {
    if (closing) return
    closing = true
    try {
      await call('abortSession', { sessionId })
      await workbench.closeAsync()
    } finally {
      detach(); input.removeListener('end', onEnd); process.removeListener('SIGTERM', onTerminate); process.removeListener('SIGINT', onInterrupt)
      clearInterval(renew)
      rl.close(); if (input.isTTY) input.setRawMode(false); input.pause()
      say('\n已退出 Agent，返回 Shell。'); finished()
    }
  }
  const onEvent = (event: AgentEvent) => {
    if (closing) return
    switch (event.kind) {
      case 'output': answer += plain(event.data); break
      case 'turn_end': flush(); break
      case 'tool_start':
        flush(); say(`  › ${event.toolName}${toolDetail(event.input) ? '\n    ' + toolDetail(event.input).replaceAll('\n', '\n    ') : ''}`); break
      case 'tool_end':
        if (event.isError) failed = true
        say(`  ${event.isError ? '× 未完成' : '✓ 完成'} · ${event.toolName}`)
        if (event.text.trim()) say(plain(event.text).split('\n').slice(0, 8).map(line => '    ' + line.slice(0, 1200)).join('\n'))
        if (event.truncated && event.fullOutputPath) say('    完整输出：' + event.fullOutputPath)
        break
      case 'notice': say(event.text + (event.rawError ? '\n' + event.rawError : '')); if (event.failed) failed = true; break
      case 'permission_request':
        flush()
        if (!interactive) {
          failed = true; say('非交互输入无法确认权限，本次操作已拒绝。')
          void call('answerPermission', { sessionId, requestId: event.requestId }).catch(e => say(String(e)))
        } else {
          permission = event; say('\n需要确认：' + event.title)
          event.options.forEach((option, index) => say(`  ${index + 1}. ${option.name}`))
          say('输入编号，或 y / n。'); prompt()
        }
        break
      case 'permission_settled': if (permission?.requestId === event.requestId) permission = undefined; break
      case 'question':
        if (event.question.state !== 'pending') { if (question?.record.requestId === event.question.requestId) question = undefined; break }
        if (!interactive) {
          failed = true; say('非交互输入无法回答问题，本次提问已取消。')
          void call('answerQuestion', { sessionId, requestId: event.question.requestId }).catch(e => say(String(e)))
        } else { question = { record: event.question, index: 0, answers: [] }; showQuestion() }
        break
      case 'idle': busy = false; permission = undefined; question = undefined; flush(); prompt(); break
    }
  }
  const detach = workbench.sessions.attach(sessionId, onEvent)
  const renew = setInterval(() => { void call('acquireLease', { sessionId, holder: 'user' }).catch(e => say(String(e))) }, 120_000)
  renew.unref()
  const handle = async (text: string) => {
    const line = text.trim()
    if (closing || !line) { prompt(); return }
    if (line === '/exit' || line === '/quit') { await shutdown(); return }
    if (line === '/help') { say(CLI_HELP); prompt(); return }
    if (line === '/status') { status(); prompt(); return }
    if (permission) {
      const request = permission
      const option = /^y(?:es)?$/i.test(line) ? request.options.find(o => o.kind.startsWith('allow'))
        : /^n(?:o)?$/i.test(line) ? request.options.find(o => o.kind.startsWith('reject')) : request.options[Number(line) - 1]
      if (!option) { say('请输入有效编号，或 y / n。'); prompt(); return }
      await call('answerPermission', { sessionId, requestId: request.requestId, optionId: option.optionId }); return
    }
    if (question) {
      const request = question, q = request.record.questions[request.index]!
      const numeric = /^\d+(?:\s*,\s*\d+)*$/.test(line) && Boolean(q.options?.length)
      const indexes = numeric ? line.split(',').map(n => Number(n.trim()) - 1) : []
      if (numeric && (indexes.some(i => !q.options?.[i]) || new Set(indexes).size !== indexes.length || !q.multi_select && indexes.length > 1)) {
        say('请输入有效选项编号。'); prompt(); return
      }
      request.answers.push({ id: q.id, selected: numeric ? indexes.map(i => q.options![i]!.label) : [], ...(!numeric ? { custom: line } : {}) })
      if (++request.index < request.record.questions.length) showQuestion()
      else { question = undefined; await call('answerQuestion', { sessionId, requestId: request.record.requestId, answer: { answers: request.answers } }) }
      return
    }
    if (busy) { say('当前回合仍在运行；Ctrl-C 停止，或 /exit 返回 Shell。'); return }
    busy = true
    try { await call('writeToSession', { sessionId, data: line, as: 'user' }) }
    catch (e) { busy = false; failed = true; say(e instanceof Error ? e.message : String(e)); prompt() }
  }
  let pipe = Promise.resolve()
  rl.on('line', line => {
    if (interactive) void handle(line).catch(e => { failed = true; say(String(e)); prompt() })
    else pipe = pipe.then(async () => { await handle(line); if (!closing) await workbench.nativeRuntime.waitForIdle(sessionId) })
      .catch(e => { failed = true; say(String(e)) })
  })
  const onEnd = () => { void pipe.then(shutdown).catch(e => { say(String(e)); finished() }) }
  const onInterrupt = () => {
    if (busy) {
      void call('abortSession', { sessionId }).then(() => { busy = false; permission = undefined; question = undefined; answer = ''; say('\n本轮已停止。'); prompt() }).catch(e => say(String(e)))
    } else void shutdown()
  }
  const onTerminate = () => { void shutdown() }
  rl.on('SIGINT', onInterrupt)
  rl.on('close', () => { if (!closing) onEnd() })
  input.on('end', onEnd); process.on('SIGTERM', onTerminate); process.on('SIGINT', onInterrupt)
  output.write('\n' + color('1;38;2;30;145;130', 'DAWN Science') + '\n\n')
  say(`Agent · ${context.model}\n${process.cwd()}\n`)
  say('/exit 返回 Shell · /help 帮助 · Ctrl-C 停止\n')
  prompt()
  await done
  return failed ? 1 : 0
}
