import { CliNextPrompt } from './next-prompt.js'
import { createInterface } from 'node:readline'
import { CliTui } from './tui.js'
import type { AgentEvent } from '../runtime/types.js'
import type { DesktopCliEvent } from './desktop-wire.js'
import type { QuestionRecord, QuestionAnswer } from '../protocol/questions.js'
import { openCliContext } from './context.js'
import { CLI_HELP, plain, toolDetail } from './presentation.js'
import { ResumeCancelled } from './history-picker.js'
import { SessionPermissionSchema, SessionPermissionValueSchema } from '../protocol/permissions.js'
import { permissionLabel, PERMISSION_HELP } from './permissions.js'
import { parsePlanCommand, PLAN_HELP } from './planning.js'
import { SessionPlanSchema, type SessionPlan } from '../protocol/planning.js'
import { 执行那句, 出方案工具名 } from '../protocol/plan.js'

type Permission = Extract<AgentEvent, { kind: 'permission_request' }>
export async function runCliAgent(agentId?: string, resume?: string | true): Promise<number> {
  const context = await openCliContext(agentId, resume).catch(error => { if (error instanceof ResumeCancelled) return undefined; throw error })
  if (!context) { process.stdout.write('已取消恢复，返回 Shell。\n'); return 0 }
  const restored = context.resumed ? await context.history().catch(async error => { await context.close(); throw error }) : undefined
  const { call, sessionId } = context
  const shared = 'shared' in context && context.shared === true
  const workspace = shared ? context.directory : process.cwd()
  const input = process.stdin, output = process.stdout, interactive = Boolean(input.isTTY && output.isTTY)
  const rl = interactive ? undefined : createInterface({ input, terminal: false, historySize: 200 })
  const view = interactive ? new CliTui({ model: context.model, workspace, color: !process.env.NO_COLOR,
    contextButton: Boolean(process.env.DAWN_TERMINAL_ID),
    onDraftChange: () => updateSuggestion(),
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
  const prompt = () => { if (!closing) view?.setState({ busy: busy || planWriting, permission: Boolean(permission) && !answering, question: Boolean(question) && !answering }) }
  const suggestions = view ? new CliNextPrompt(() => context.suggest(), text => view.setSuggestion(text)) : undefined
  const updateSuggestion = () => suggestions?.update(!closing && !busy && !permission && !question && !view?.draft())
  let usageRequest = 0
  let planRevision = 0, planReading = false, planWriting = false
  let planSnapshot: SessionPlan | undefined
  const showPlanState = (state: SessionPlan) => { planSnapshot = state; view?.setPlanState(state) }
  const refreshPlan = async () => {
    if (closing || planReading || planWriting) return
    planReading = true
    const version = planRevision
    try {
      const state = SessionPlanSchema.parse(await context.planning())
      if (!closing && version === planRevision) showPlanState(state)
    } catch { if (!closing && version === planRevision) { planSnapshot = undefined; view?.setPlanState(undefined) } }
    finally { planReading = false; if (!closing && !planWriting && version !== planRevision) void refreshPlan() }
  }
  const preserve = (text: string) => {
    if (!view?.recoverDraft(text)) say('未发送的内容，请重试：\n' + text, true)
  }
  let permissionRevision = 0, permissionReading = false, permissionWriting = false
  let permissionSnapshot: import('../protocol/permissions.js').SessionPermission | undefined
  const refreshPermissions = async () => {
    if (closing || permissionReading || permissionWriting) return
    permissionReading = true
    const version = permissionRevision
    try {
      const next = SessionPermissionSchema.parse(await context.permissions())
      if (!closing && version === permissionRevision) { permissionSnapshot = next; view?.setPermissions(next) }
    } catch { if (!closing && version === permissionRevision) { permissionSnapshot = undefined; view?.setPermissions(undefined) } }
    finally { permissionReading = false }
  }
  const refreshUsage = async () => {
    if (!view || closing) return
    const request = ++usageRequest
    const usage = await context.usage().catch(() => ({}))
    // Absolute snapshots, including history: late responses must not overwrite a newer refresh.
    if (!closing && request === usageRequest) view.setUsage(usage)
  }
  const flush = () => { if (view) view.finish(); else if (answer.trim()) { say('\n' + answer.trim() + '\n'); answer = '' } }
  const status = () => say(`\nAgent · ${context.model}\n权限  ${permissionSnapshot ? permissionLabel(permissionSnapshot) : '未读取'}\n目录  ${workspace}\n记录  ${context.directory}\n`)
  const showQuestion = () => {
    if (!question) return
    if (view) { view.question(question.record, question.index, question.answers); prompt(); return }
    const q = question.record.questions[question.index]!
    say(q.question)
    q.options?.forEach((option, index) => say(`  ${index + 1}. ${option.label}${option.description ? ' · ' + option.description : ''}`))
    say(q.multi_select ? '输入选项编号（逗号分隔）或自己的回答。' : '输入选项编号或自己的回答。')
    prompt()
  }
  const shutdown = async () => {
    if (closing) return
    closing = true
    suggestions?.close()
    try {
      try { if (!shared) await call('abortSession', { sessionId }) }
      finally { await context.close() }
    } finally {
      detachExit(); detach(); input.removeListener('end', onEnd); process.removeListener('SIGTERM', onTerminate); process.removeListener('SIGINT', onInterrupt)
      clearInterval(renew); clearInterval(permissionTimer); clearInterval(planTimer)
      view?.stop(); rl?.close(); if (input.isTTY) input.setRawMode(false); input.pause()
      say('\n已退出 Agent，返回 Shell。'); finished()
    }
  }
  const beginActivity = () => {
    if (!busy) { suggestions?.reset(); busy = true; prompt() }
  }
  const onEvent = (event: DesktopCliEvent) => {
    if (closing) return
    switch (event.kind) {
      case 'desktop_image':
        beginActivity()
        flush(); if (view) view.image(event); else say(event.name); break
      case 'thinking': beginActivity(); break
      case 'output': beginActivity(); if (view) view.reply(event.data); else answer += plain(event.data); break
      case 'turn_end': flush(); break
      case 'model': suggestions?.reset(); updateSuggestion(); void refreshUsage(); break
      case 'config_options': void refreshPermissions(); planRevision++; void refreshPlan(); break
      case 'plan':
        planRevision++
        if (view) view.plan(event.plan)
        else say(`方案 · 第 ${event.plan.version} 版 · ${event.plan.status}\n${event.plan.title}\n${event.plan.markdown}` + (event.plan.status === 'proposed' ? `\n/plan approve ${event.plan.planId} · /plan discard ${event.plan.planId}` : ''))
        void refreshPlan(); break
      case 'turn_usage': case 'compaction_end': void refreshUsage(); break
      case 'tool_start':
        beginActivity()
        void refreshUsage()
        flush(); if (event.toolName === 出方案工具名) break
        if (view) { view.toolStart(event); break }; say(`  › ${event.toolName}${toolDetail(event.input) ? '\n    ' + toolDetail(event.input).replaceAll('\n', '\n    ') : ''}`); break
      case 'tool_end':
        void refreshUsage()
        if (event.isError) failed = true
        if (event.toolName === 出方案工具名 && !event.isError) break
        if (view) { view.toolEnd(event); break }
        say(`  ${event.isError ? '× 未完成' : '✓ 完成'} · ${event.toolName}`)
        if (event.text.trim()) say(plain(event.text).split('\n').slice(0, 8).map(line => '    ' + line.slice(0, 1200)).join('\n'))
        if (event.truncated && event.fullOutputPath) say('    完整输出：' + event.fullOutputPath)
        break
      case 'notice': if (event.failed || event.rawError) suggestions?.reset(); say(event.text + (event.rawError ? '\n' + event.rawError : ''), Boolean(event.failed || event.rawError)); if (event.failed) failed = true; break
      case 'permission_request':
        beginActivity()
        suggestions?.update(false)
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
        if (event.question.state === 'pending') beginActivity()
        suggestions?.update(false)
        if (event.question.state !== 'pending') { view?.question(event.question); if (question?.record.requestId === event.question.requestId) { question = undefined; prompt() }; break }
        if (!interactive) {
          failed = true; say('非交互输入无法回答问题，本次提问已取消。')
          void call('answerQuestion', { sessionId, requestId: event.question.requestId }).catch(e => say(String(e)))
        } else {
          if (question?.record.requestId === event.question.requestId) question.record = event.question
          else question = { record: event.question, index: 0, answers: [] }
          showQuestion()
        }
        break
      case 'idle': busy = false; permission = undefined; question = undefined; flush(); prompt(); void refreshUsage(); void refreshPlan(); updateSuggestion(); break
    }
  }
  const detach = context.attach(onEvent)
  const detachExit = context.onExit(() => { void shutdown().catch(() => { finished() }) })
  const renew = setInterval(() => { void call('acquireLease', { sessionId, holder: 'user' }).catch(e => say(String(e))) }, 120_000)
  renew.unref()
  // Default inheritance can change without a session event. Never overlap reads or race writes.
  const permissionTimer = setInterval(() => { void refreshPermissions() }, 1000)
  permissionTimer.unref()
  const planTimer = setInterval(() => { void refreshPlan() }, 1000)
  planTimer.unref()
  const handle = async (text: string) => {
    const line = text.trim()
    if (closing || !line) { prompt(); return }
    if (line === '/exit' || line === '/quit') { await shutdown(); return }
    if (line === '/help') { say(CLI_HELP); prompt(); return }
    if (line === '/status') { status(); prompt(); return }
    const planCommand = parsePlanCommand(line)
    if (planCommand) {
      if (planCommand.kind === 'help') { say(PLAN_HELP); return }
      if (planCommand.kind === 'status') {
        if (planWriting) { say('方案操作正在处理，请稍候再查看状态。'); return }
        await refreshPlan()
        say((planSnapshot ? planSnapshot.planning ? '先出方案（只看不改）' : '方案期已关闭' : '方案状态未读取，请重试。') + '\n' + PLAN_HELP)
        return
      }
      if (busy || permission || question || planWriting) { say('当前回合仍在运行，请结束后再操作方案。', true); preserve(text); return }
      planWriting = true; planRevision++; suggestions?.reset(); prompt()
      let unsent = text, sending = false
      try {
        if (planCommand.kind === 'enable' || planCommand.kind === 'disable') {
          const state = SessionPlanSchema.parse(await context.planning(planCommand.kind === 'enable'))
          if (closing) return
          showPlanState(state)
          if (planCommand.kind === 'enable' && planCommand.prompt) {
            unsent = '/plan ' + planCommand.prompt
            view?.user(planCommand.prompt); beginActivity(); sending = true
            await call('writeToSession', { sessionId, as: 'user', data: planCommand.prompt })
          } else say((state.planning ? '先出方案已开启：这一段只看不改，批准方案后执行。' : '方案期已退出；已有方案保留，没有批准或启动执行。') + '\n' + PLAN_HELP)
        } else {
          const state = SessionPlanSchema.parse(await context.planning())
          if (closing) return
          showPlanState(state)
          if (!state.plan || state.plan.planId !== planCommand.planId || state.plan.status !== 'proposed') throw Error('这一版方案已经不是当前待审方案，请重新查看方案 ID。')
          const result = await context.answerPlan(planCommand.planId, planCommand.action)
          if (closing) return
          if (planCommand.action === 'approve') {
            if (!result.savedPath) throw Error('方案已处理，但没有收到存档路径，请返回会话核对。')
            unsent = 执行那句(result.savedPath, false)
            view?.user(unsent); beginActivity(); sending = true
            try { await context.executePlan(planCommand.planId) }
            catch (error) { say('方案已批准，但执行消息没有发出。', true); throw error }
          } else say('这版方案没有采用，已退出方案期。')
        }
      } catch (error) {
        if (closing) return
        if (sending) busy = false
        say('方案操作失败：' + (error instanceof Error ? error.message : String(error)), true)
        preserve(unsent)
      } finally { planWriting = false; planRevision++; if (!closing) { void refreshPlan(); prompt(); updateSuggestion() } }
      return
    }
    if (/^\/permissions(?:\s|$)/.test(line)) {
      const argument = line.slice('/permissions'.length).trim()
      if (!argument) { await refreshPermissions(); say((permissionSnapshot ? '当前权限：' + permissionLabel(permissionSnapshot) : '权限未读取，请重试。') + '\n' + PERMISSION_HELP); prompt(); return }
      const tier = SessionPermissionValueSchema.safeParse(argument)
      if (!tier.success) { say(PERMISSION_HELP); prompt(); return }
      if (permissionWriting) { say('正在更改权限，请稍候。'); return }
      permissionWriting = true; permissionRevision++
      try {
        const next = SessionPermissionSchema.parse(await context.permissions(tier.data))
        if (!closing) { permissionSnapshot = next; view?.setPermissions(next); say('当前权限：' + permissionLabel(next)) }
      } catch (error) { say('权限更改失败：' + (error instanceof Error ? error.message : String(error)), true) }
      finally { permissionWriting = false; permissionRevision++; void refreshPermissions(); prompt() }
      return
    }
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
        view?.question(request.record, request.index, request.answers)
        answering = true; prompt()
        try {
          await call('answerQuestion', { sessionId, requestId: request.record.requestId, answer: { answers: request.answers } })
          if (question === request) {
            view?.question({ ...request.record, state: 'answered', answer: { answers: request.answers } })
            question = undefined
          }
        } catch (error) {
          if (question === request) { request.index--; request.answers.pop(); showQuestion(); preserve(line) }
          throw error
        } finally { answering = false; prompt() }
      }
      return
    }
    if (busy || planWriting) { say('当前回合仍在运行；Ctrl-C 停止，或 /exit 返回 Shell。'); return }
    suggestions?.reset()
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
    if (planWriting) { say('方案操作正在处理；/exit 可退出 Agent。'); return }
    if (busy) {
      void call('abortSession', { sessionId }).then(() => { busy = false; permission = undefined; question = undefined; answer = ''; say('\n本轮已停止。'); prompt() }).catch(e => say(String(e)))
    } else void shutdown()
  }
  const onTerminate = () => { void shutdown() }
  rl?.on('SIGINT', onInterrupt)
  rl?.on('close', () => { if (!closing) onEnd() })
  input.on('end', onEnd); process.on('SIGTERM', onTerminate); process.on('SIGINT', onInterrupt)
  try {
    await Promise.all([refreshUsage(), refreshPermissions(), refreshPlan()])
    if (view) { view.start(); if (restored) view.restore(restored) }
    else {
      say('\nDAWN Science\n')
      status(); say('/exit 返回 Shell · /help 帮助 · Ctrl-C 停止\n')
      if (restored) for (const item of restored.items) if (item.kind === 'text') say(`${item.who === 'user' ? '你' : 'DAWN'}：${item.text}`)
    }
    prompt()
    if (restored) updateSuggestion()
    await done
  } catch (error) {
    try { await shutdown() } catch { /* Preserve the original startup error. */ }
    throw error
  }
  return failed ? 1 : 0
}
