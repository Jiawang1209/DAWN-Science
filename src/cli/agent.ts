import { createInterface } from 'node:readline'
import { CliTui } from './tui.js'
import type { AgentEvent } from '../runtime/types.js'
import type { DesktopCliEvent } from './desktop-wire.js'
import type { QuestionRecord, QuestionAnswer } from '../protocol/questions.js'
import { openCliContext } from './context.js'
import { CLI_HELP, plain, toolDetail } from './presentation.js'
import { ResumeCancelled } from './history-picker.js'

type Permission = Extract<AgentEvent, { kind: 'permission_request' }>
export async function runCliAgent(agentId?: string, resume?: string | true): Promise<number> {
  const context = await openCliContext(agentId, resume).catch(error => { if (error instanceof ResumeCancelled) return undefined; throw error })
  if (!context) { process.stdout.write('已取消恢复，返回 Shell。\n'); return 0 }
  const restored = context.resumed ? await context.history().catch(async error => { await context.close(); throw error }) : undefined
  const { call, sessionId } = context
  const input = process.stdin, output = process.stdout, interactive = Boolean(input.isTTY && output.isTTY)
  const rl = interactive ? undefined : createInterface({ input, terminal: false, historySize: 200 })
  const view = interactive ? new CliTui({ model: context.model, workspace: process.cwd(), color: !process.env.NO_COLOR,
    onSubmit: text => { void handle(text).catch(e => { failed = true; say(String(e), true); prompt() }) },
    onInterrupt: () => onInterrupt(), onExit: () => { void shutdown() },
  }) : undefined
  let busy = false, closing = false, failed = false, answering = false, answer = '', permission: Permission | undefined
  let question: { record: QuestionRecord; index: number; answers: QuestionAnswer['answers'] } | undefined
  let finished!: () => void
  const done = new Promise<void>(resolve => { finished = resolve })
  const say = (text: string, urgent = false) => {
    if (view && !closing) view.notice(text, urgent)
    else output.write(plain(text) + '\n')
  }
  const prompt = () => { if (!closing) view?.setState({ busy, permission: Boolean(permission) && !answering, question: Boolean(question) && !answering }) }
  const flush = () => { if (view) view.finish(); else if (answer.trim()) { say('\n' + answer.trim() + '\n'); answer = '' } }
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
      try { await call('abortSession', { sessionId }) }
      finally { await context.close() }
    } finally {
      detachExit(); detach(); input.removeListener('end', onEnd); process.removeListener('SIGTERM', onTerminate); process.removeListener('SIGINT', onInterrupt)
      clearInterval(renew)
      view?.stop(); rl?.close(); if (input.isTTY) input.setRawMode(false); input.pause()
      say('\n已退出 Agent，返回 Shell。'); finished()
    }
  }
  const onEvent = (event: DesktopCliEvent) => {
    if (closing) return
    switch (event.kind) {
      case 'desktop_image':
        flush(); if (view) view.image(event); else say(event.name); break
      case 'output': if (view) view.reply(event.data); else answer += plain(event.data); break
      case 'turn_end': flush(); break
      case 'tool_start':
        flush(); if (view) { view.toolStart(event); break }; say(`  › ${event.toolName}${toolDetail(event.input) ? '\n    ' + toolDetail(event.input).replaceAll('\n', '\n    ') : ''}`); break
      case 'tool_end':
        if (event.isError) failed = true
        if (view) { view.toolEnd(event); break }
        say(`  ${event.isError ? '× 未完成' : '✓ 完成'} · ${event.toolName}`)
        if (event.text.trim()) say(plain(event.text).split('\n').slice(0, 8).map(line => '    ' + line.slice(0, 1200)).join('\n'))
        if (event.truncated && event.fullOutputPath) say('    完整输出：' + event.fullOutputPath)
        break
      case 'notice': say(event.text + (event.rawError ? '\n' + event.rawError : ''), Boolean(event.failed || event.rawError)); if (event.failed) failed = true; break
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
      case 'permission_settled': if (permission?.requestId === event.requestId) { permission = undefined; prompt() }; break
      case 'question':
        if (event.question.state !== 'pending') { if (question?.record.requestId === event.question.requestId) { question = undefined; prompt() }; break }
        if (!interactive) {
          failed = true; say('非交互输入无法回答问题，本次提问已取消。')
          void call('answerQuestion', { sessionId, requestId: event.question.requestId }).catch(e => say(String(e)))
        } else { question = { record: event.question, index: 0, answers: [] }; showQuestion() }
        break
      case 'idle': busy = false; permission = undefined; question = undefined; flush(); prompt(); break
    }
  }
  const detach = context.attach(onEvent)
  const detachExit = context.onExit(() => { void shutdown().catch(() => { finished() }) })
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
      answering = true; prompt()
      try {
        await call('answerPermission', { sessionId, requestId: request.requestId, optionId: option.optionId })
        if (permission === request) permission = undefined
      } finally { answering = false; prompt() }
      return
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
      else {
        answering = true; prompt()
        try {
          await call('answerQuestion', { sessionId, requestId: request.record.requestId, answer: { answers: request.answers } })
          if (question === request) question = undefined
        } catch (error) {
          if (question === request) { request.index--; request.answers.pop(); showQuestion() }
          throw error
        } finally { answering = false; prompt() }
      }
      return
    }
    if (busy) { say('当前回合仍在运行；Ctrl-C 停止，或 /exit 返回 Shell。'); return }
    busy = true; prompt()
    try { await call('writeToSession', { sessionId, data: line, as: 'user' }) }
    catch (e) { busy = false; failed = true; say(e instanceof Error ? e.message : String(e), true); prompt() }
  }
  let pipe = Promise.resolve()
  rl?.on('line', line => {
    if (interactive) void handle(line).catch(e => { failed = true; say(String(e), true); prompt() })
    else pipe = pipe.then(async () => { await handle(line); if (!closing) await context.waitForIdle() })
      .catch(e => { failed = true; say(String(e)) })
  })
  const onEnd = () => { void pipe.then(shutdown).catch(e => { say(String(e)); finished() }) }
  const onInterrupt = () => {
    if (busy) {
      void call('abortSession', { sessionId }).then(() => { busy = false; permission = undefined; question = undefined; answer = ''; say('\n本轮已停止。'); prompt() }).catch(e => say(String(e)))
    } else void shutdown()
  }
  const onTerminate = () => { void shutdown() }
  rl?.on('SIGINT', onInterrupt)
  rl?.on('close', () => { if (!closing) onEnd() })
  input.on('end', onEnd); process.on('SIGTERM', onTerminate); process.on('SIGINT', onInterrupt)
  try {
    if (view) { view.start(); if (restored) view.restore(restored) }
    else {
      say('\nDAWN Science\n')
      status(); say('/exit 返回 Shell · /help 帮助 · Ctrl-C 停止\n')
      if (restored) for (const item of restored.items) if (item.kind === 'text') say(`${item.who === 'user' ? '你' : 'DAWN'}：${item.text}`)
    }
    prompt()
    await done
  } catch (error) {
    try { await shutdown() } catch { /* Preserve the original startup error. */ }
    throw error
  }
  return failed ? 1 : 0
}
