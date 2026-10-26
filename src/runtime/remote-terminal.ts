import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { TerminalScreen } from '../terminal/screen.js'
import type { TerminalControl } from '../terminal/control.js'
import type { RemoteShell, RemoteShellExit } from '../remote/ssh.js'
import { PtyRuntime } from './pty.js'
import type { AgentEvent, AgentRuntime, EventSink, RemoteCwd, SessionHandle, SessionSpec } from './types.js'

interface ExecuteOptions { signal?: AbortSignal; timeoutSec?: number; cwd?: string }
/** PTY merges stdout and stderr; stdout is that actual stream and stderr stays empty. */
interface ExecuteResult { code: number | undefined; stdout: string; stderr: string; cwd?: string }
interface Task {
  token: string; stdout: string; collecting: boolean; started: boolean; done?: { code: number; cwd: string }
  resolve: (result: ExecuteResult) => void; reject: (error: Error) => void
  cancelled: boolean; truncated: boolean; cleanup: () => void
}
interface Presentation { runtime: PtyRuntime; detach: () => void; ready: boolean; replay: string }
interface ClosedEntry { owner?: string; cwd: string; connectionId?: string }
interface Entry {
  spec: SessionSpec; sourceCwd: RemoteCwd; cwd: string; owner?: string; shell?: RemoteShell
  alive: boolean; exited: boolean; ready: boolean; draft: boolean; cols: number; rows: number
  nonce: string; runFunction: string; parser: string; replay: string; screen: TerminalScreen
  portCwd?: { cwd: string }
  integrationQueue?: string[]
  detach: (() => void)[]; startup: { resolve: () => void; reject: (error: Error) => void } | undefined
  task: Task | undefined; presentation: Presentation | undefined; launching: boolean; redrawing: boolean; launchRequested: boolean
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const bounded = (previous: string, data: string) => (previous + data).slice(-128 * 1024)
const CAPTURE_LIMIT = 1024 * 1024
const SETUP_CHUNK_LENGTH = 600

/** A remote shell executes work; an optional local PTY only presents the desktop DAWN CLI. */
export class RemoteTerminalRuntime implements AgentRuntime {
  private readonly entries = new Map<string, Entry>()
  private readonly closed = new Map<string, ClosedEntry>()
  private readonly selectedClosed = new Map<string, ClosedEntry>()
  private readonly selected = new Map<string, string>()
  private readonly sinks = new Map<string, Set<EventSink>>()

  constructor(private readonly opts: {
    terminalControl: TerminalControl
    environment?: (spec: SessionSpec) => Promise<Record<string, string>>
    onExit?: (id: string) => void
  }) {}

  has(id: string): boolean { return this.entries.has(id) || this.closed.has(id) || this.selectedClosed.has(id) }
  ownerOf(id: string): string | undefined { return this.entries.get(id)?.owner ?? this.closedEntry(id)?.owner }
  connectionId(id: string): string | undefined { return this.entries.get(id)?.spec.remote?.connectionId ?? this.closedEntry(id)?.connectionId }
  currentDirectory(id: string): string { return this.entries.get(id)?.cwd ?? this.closedEntry(id)?.cwd ?? this.entry(id).cwd }
  isPresenting(id: string): boolean { const e = this.entries.get(id); return Boolean(e?.presentation || e?.launching) }
  isReady(id: string): boolean {
    const e = this.entries.get(id)
    return Boolean(e?.alive && e.ready && !e.task && !this.opts.terminalControl.hasPendingInput(id))
  }

  bindOwner(id: string, owner: string): void {
    const e = this.entry(id)
    if (e.owner && e.owner !== owner) throw new Error('远端终端已归属另一段对话')
    e.owner = owner
    if (!this.selected.has(owner)) this.select(id)
  }
  select(id: string): void {
    const e = this.entry(id)
    if (!e.owner) return
    if ([...this.entries.values()].some(other => other.owner === e.owner && other.task)) throw new Error('该对话的远端命令正在运行，不能切换终端')
    const previous = this.selected.get(e.owner)
    if (previous && previous !== id) this.selectedClosed.delete(previous)
    this.selected.set(e.owner, id)
    if (e.alive) e.sourceCwd.set(e.cwd)
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    if (!spec.remote?.executor.openShell) throw new Error('远端执行器不支持交互终端')
    if (this.has(spec.sessionId)) throw new Error('远端终端身份已经存在')
    const id = spec.sessionId
    const nonce = randomUUID().replaceAll('-', '')
    const e: Entry = {
      spec, sourceCwd: spec.remote.cwd, cwd: spec.remote.cwd.get(), alive: true, exited: false,
      ready: false, draft: false, cols: 100, rows: 30, nonce, runFunction: `__dawn_run_${nonce}`,
      parser: '', replay: '', screen: new TerminalScreen(100, 30), detach: [], startup: undefined,
      task: undefined, presentation: undefined, launching: false, redrawing: false, launchRequested: false,
    }
    this.entries.set(spec.sessionId, e)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const shell = await spec.remote.executor.openShell({ cols: e.cols, rows: e.rows })
      if (!e.alive) { shell.close(); throw new Error('远端终端已经结束') }
      e.shell = shell
      const port = {
        id: spec.sessionId, pid: 0, cwd: e.cwd, command: 'bash', cols: e.cols, rows: e.rows,
        ...(spec.remote.connectionId ? { connectionId: spec.remote.connectionId } : {}),
        write: this.write.bind(this, id), resize: this.resize.bind(this, id),
      }
      e.portCwd = port
      this.opts.terminalControl.register(port)
      const ready = new Promise<void>((resolve, reject) => {
        e.startup = { resolve, reject }
        timer = setTimeout(() => reject(new Error('远端 Shell 初始化未在 30 秒内确认就绪，无法安全插入命令')), 30_000)
      })
      e.detach.push(shell.onData(data => this.output(e, data)))
      e.detach.push(shell.onExit(event => this.finish(e, event)))
      // A newly allocated PTY can still be in canonical mode before readline starts.
      // First send a short acknowledged command: long startup input can be truncated
      // by the terminal driver's canonical-line limit (notably macOS's 1024 bytes).
      if (e.alive) shell.write(`stty -echo; printf '\\033]7778;dawn;${e.nonce};boot\\007'\r`)
      await ready
      this.emit({ kind: 'started', sessionId: spec.sessionId, pid: 0 })
      return { sessionId: spec.sessionId, pid: 0 }
    } catch (error) {
      try { e.shell?.close() } catch {}
      this.finish(e, { reason: error instanceof Error ? error.message : String(error) })
      throw error
    } finally { clearTimeout(timer); e.startup = undefined }
  }

  private integration(e: Entry): string {
    const prompt = `__dawn_prompt_${e.nonce}`
    const osc = `\\033]7778;dawn;${e.nonce};`
    // These functions and hooks live only in this new interactive shell, never in rc files.
    const functions = `${prompt}() { local __dawn_code=$?; printf '${osc}ready;%s;%s\\007' "$__dawn_code" "$PWD"; }; ` +
      `${e.runFunction}() { printf '${osc}begin;%s\\007' "$1"; builtin eval "$2"; local __dawn_code=$?; printf '${osc}done;%s;%s;%s\\007' "$1" "$__dawn_code" "$PWD"; return "$__dawn_code"; }; ` +
      `dawn() { if [ "$#" -gt 0 ]; then printf '%s\\n' '请从桌面界面选择 DAWN 历史会话' >&2; return 2; fi; printf '${osc}launch\\007'; }; `
    const bash = `bind 'set input-meta on'; bind 'set output-meta on'; bind 'set convert-meta off'; case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in 'declare -a'*) PROMPT_COMMAND=(${prompt} "\${PROMPT_COMMAND[@]}");; *) PROMPT_COMMAND="${prompt}\${PROMPT_COMMAND:+; $PROMPT_COMMAND}";; esac`
    const zsh = `setopt MULTIBYTE; precmd_functions=(${prompt} \${precmd_functions[@]})`
    const utf8 = `__dawn_utf8_${e.nonce}`
    const valid = '[Uu][Tt][Ff]-8|[Uu][Tt][Ff]8'
    const locale = `${utf8}() { case "$(locale charmap 2>/dev/null)" in ${valid}) return 0;; esac; ` +
      `local __dawn_locales __dawn_candidate; __dawn_locales="$(LC_ALL=C locale -a 2>/dev/null)" || return 1; ` +
      `for __dawn_candidate in C.UTF-8 C.utf8 en_US.UTF-8 en_US.utf8; do ` +
      `case $'\\n'"$__dawn_locales"$'\\n' in *$'\\n'"$__dawn_candidate"$'\\n'*) export LC_ALL="$__dawn_candidate"; case "$(locale charmap 2>/dev/null)" in ${valid}) return 0;; esac;; esac; done; return 1; }; `
    return `${locale}if ${utf8}; then if cd -- ${quote(e.cwd)}; then ${functions}if [ -n "\${BASH_VERSION-}" ]; then ${bash}; elif [ -n "\${ZSH_VERSION-}" ]; then ${zsh}; else printf '${osc}error;仅支持 Bash 或 zsh\\007'; fi; printf '\\033[2J\\033[H'; else printf '${osc}error;无法进入远端目录\\007'; fi; else printf '${osc}error;服务器没有可用的 UTF-8 locale，无法安全创建中文终端\\007'; fi; stty echo; unset -f ${utf8}`
  }

  private output(e: Entry, data: string): void {
    if (!e.alive) return
    // The model observes the actual remote shell, including while a local CLI is visible.
    this.opts.terminalControl.output(e.spec.sessionId, data)
    e.screen.write(data)
    e.replay = bounded(e.replay, data)
    this.parse(e, data)
    if (!e.presentation && !e.redrawing) this.emit({ kind: 'output', sessionId: e.spec.sessionId, data })
  }

  private parse(e: Entry, data: string): void {
    const prefix = `\x1b]7778;dawn;${e.nonce};`
    e.parser += data
    const collect = (text: string) => {
      const task = e.task
      if (!task?.collecting) return
      const remaining = CAPTURE_LIMIT - task.stdout.length
      task.stdout += text.slice(0, remaining)
      if (text.length > remaining) task.truncated = true
    }
    for (;;) {
      const start = e.parser.indexOf(prefix)
      if (start < 0) {
        const count = Math.max(0, e.parser.length - prefix.length + 1)
        collect(e.parser.slice(0, count)); e.parser = e.parser.slice(count)
        return
      }
      collect(e.parser.slice(0, start)); e.parser = e.parser.slice(start)
      const end = e.parser.indexOf('\x07', prefix.length)
      if (end < 0) return
      const marker = e.parser.slice(prefix.length, end)
      e.parser = e.parser.slice(end + 1)
      if (marker === 'boot') {
        if (e.startup && !e.ready) {
          // Keep installation input ASCII even when readline starts in a C locale;
          // otherwise its meta-key handling can corrupt UTF-8 before eval sees it.
          const script = [...Buffer.from(this.integration(e), 'utf8')].map(byte => `\\0${byte.toString(8).padStart(3, '0')}`).join('')
          const variable = `__dawn_setup_${e.nonce}`
          // Even after ACK, zsh/Bash can briefly restore canonical mode between
          // prompts. Acknowledge each short chunk instead of flooding that buffer.
          e.integrationQueue = []
          for (let i = 0; i < script.length; i += SETUP_CHUNK_LENGTH) {
            e.integrationQueue.push(`${variable}${i === 0 ? '=' : '+='}${quote(script.slice(i, i + SETUP_CHUNK_LENGTH))}; printf '\\033]7778;dawn;${e.nonce};part\\007'\r`)
          }
          e.integrationQueue.push(`builtin eval "$(printf '%b' "$${variable}")"; unset ${variable}\r`)
          e.shell!.write(e.integrationQueue.shift()!)
        }
        continue
      }
      if (marker === 'part') { const next = e.integrationQueue?.shift(); if (next) e.shell!.write(next); continue }
      if (marker === 'launch') { e.launchRequested = true; continue }
      if (marker.startsWith('error;')) { e.startup?.reject(new Error(marker.slice(6))); continue }
      const ready = /^ready;(\d+);([\s\S]*)$/.exec(marker)
      if (ready) {
        e.cwd = ready[2]!; e.ready = true; e.draft = false
        if (e.portCwd) e.portCwd.cwd = e.cwd
        if (e.owner && this.selected.get(e.owner) === e.spec.sessionId) e.sourceCwd.set(e.cwd)
        e.startup?.resolve()
        const task = e.task
        // Blank prompts queued by an interrupt may precede the next task's begin.
        if (task && !task.cancelled && !task.started) { e.ready = false; continue }
        if (task) {
          e.task = undefined; task.cleanup()
          if (!task.cancelled) {
            if (!task.done) task.reject(new Error('远端命令未报告完整结果，可能被中断'))
            else task.resolve({ code: task.done.code,
              stdout: task.stdout.replaceAll('\r\n', '\n') + (task.truncated ? `\n[远端终端输出已截断：最多保留 ${CAPTURE_LIMIT} 字符]\n` : ''),
              stderr: '', cwd: task.done.cwd })
          }
        }
        if (e.launchRequested) {
          e.launchRequested = false
          queueMicrotask(() => { void this.launchCli(e.spec.sessionId).catch(error => {
            this.emit({ kind: 'output', sessionId: e.spec.sessionId, data: `\r\n${error instanceof Error ? error.message : String(error)}\r\n` })
          }) })
        }
        continue
      }
      const task = e.task
      if (!task) continue
      if (marker === `begin;${task.token}`) { task.started = true; task.collecting = true; continue }
      const done = /^done;([^;]+);(\d+);([\s\S]*)$/.exec(marker)
      if (done?.[1] === task.token) {
        task.collecting = false
        task.done = { code: Number(done[2]), cwd: done[3]! }
      }
    }
  }

  executeForOwner(owner: string, command: string, options: ExecuteOptions): Promise<ExecuteResult> | undefined {
    const selected = this.selected.get(owner)
    if (selected === undefined) return undefined
    const entry = this.entries.get(selected)
    if (!entry) return Promise.reject(new Error('选中的远端终端已经结束或断开，请明确重新选择终端'))
    return this.execute(entry, command, options)
  }

  private async execute(e: Entry, command: string, options: ExecuteOptions): Promise<ExecuteResult> {
    if (!e.alive) throw new Error('选中的远端终端已经结束或断开，请明确重新选择终端')
    if (!this.isReady(e.spec.sessionId)) throw new Error('远端终端仍在运行或有未提交输入，请等待 Shell 就绪')
    if (options.signal?.aborted) throw new Error('命令已取消，未发送到远端')
    if (options.timeoutSec !== undefined && (!Number.isFinite(options.timeoutSec) || options.timeoutSec < 0)) throw new Error('命令超时必须是非负秒数')
    e.ready = false
    return new Promise<ExecuteResult>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let interrupt: ReturnType<typeof setInterval> | undefined
      const cancel = (reason: string) => {
        if (e.task !== task || task.cancelled) return
        task.cancelled = true; task.cleanup(); reject(new Error(reason))
        // The first signal can race foreground process-group setup. Keep requesting
        // interruption until the private hook confirms that this same task is idle.
        interrupt = setInterval(() => {
          if (e.task !== task || !e.alive) return
          try { e.shell!.write('\x03\r') } catch {}
        }, 100)
        interrupt.unref?.()
        // Enter also requests a fresh prompt if Ctrl-C races the previous prompt hook.
        try { e.shell!.write('\x03\r') } catch { /* The shell exit callback reports transport loss. */ }
      }
      const abort = () => cancel('远端命令已取消并发送 Ctrl-C，请等待 Shell 再次就绪')
      const task: Task = {
        token: randomUUID(), stdout: '', collecting: false, started: false, resolve, reject, cancelled: false, truncated: false,
        cleanup: () => { clearTimeout(timer); clearInterval(interrupt); options.signal?.removeEventListener('abort', abort) },
      }
      e.task = task
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.timeoutSec !== undefined) timer = setTimeout(() => cancel('远端命令超时，已发送 Ctrl-C；不能确认任务已完成'), options.timeoutSec * 1000)
      const payload = options.cwd ? `cd -- ${quote(options.cwd)} && builtin eval ${quote(command)}` : command
      try { e.shell!.write(`${e.runFunction} ${quote(task.token)} ${quote(payload)}\r`) }
      catch (error) { task.cleanup(); e.task = undefined; reject(error) }
    })
  }

  write(id: string, data: string): void {
    const e = this.entry(id)
    if (!e.alive) throw new Error('远端终端已经结束或断开')
    if (e.presentation) {
      if (!e.presentation.ready) throw new Error('DAWN 本地呈现正在启动')
      e.presentation.runtime.write(id, data); return
    }
    if (e.launching) throw new Error('DAWN 本地呈现正在启动')
    if (e.task) throw new Error('Agent 命令正在占用远端 Shell，请先等待完成或取消')
    if (data.includes('\x03') || /[\r\n]/.test(data) && (e.draft || /[^\r\n]/.test(data))) e.ready = false
    if (/[\r\n\x03]/.test(data)) e.draft = false
    else if (/[^\x00-\x1f\x7f]/.test(data)) e.draft = true
    e.shell!.write(data)
  }

  attach(id: string, sink: EventSink): () => void {
    if (!this.entries.has(id) && this.has(id)) return () => {}
    const set = this.sinks.get(id) ?? new Set<EventSink>()
    this.sinks.set(id, set); set.add(sink)
    const e = this.entries.get(id)
    const replay = e?.presentation?.replay ?? e?.replay
    if (replay) sink({ kind: 'output', sessionId: id, data: replay })
    return () => { set.delete(sink) }
  }

  resize(id: string, cols: number, rows: number): void {
    const e = this.entry(id)
    if (!e.alive) return
    e.shell!.resize(cols, rows); e.cols = cols; e.rows = rows; e.screen.resize(cols, rows)
    e.presentation?.runtime.resize(id, cols, rows)
  }

  async launchCli(id: string): Promise<void> {
    const e = this.entry(id)
    if (!this.isReady(id) || e.launching || e.presentation) throw new Error('请先回到空闲远端 Shell，取消未提交输入后再进入 DAWN')
    if (!this.opts.environment) throw new Error('本地 DAWN 呈现环境尚未配置')
    e.launching = true
    try {
      const environment = await this.opts.environment(e.spec)
      await mkdir(e.spec.sessionDir, { recursive: true })
      if (!e.alive) throw new Error('远端终端已经结束或断开')
      if (!this.isReady(id)) throw new Error('远端 Shell 已发生变化，请等待就绪后重试')
      const runtime = new PtyRuntime({ command: 'dawn', cols: e.cols, rows: e.rows, environment: async () => environment })
      const presentation: Presentation = { runtime, detach: () => {}, ready: false, replay: '' }
      e.presentation = presentation
      presentation.detach = runtime.attach(id, event => {
        if (event.kind === 'output') {
          presentation.replay = bounded(presentation.replay, event.data)
          this.emit({ ...event, sessionId: id })
        } else if (event.kind === 'exited') {
          presentation.detach()
          if (e.presentation === presentation) e.presentation = undefined
          if (e.alive) void this.redraw(e)
        }
      })
      // Local cwd is deliberately the isolated session directory, never a remote path.
      await runtime.start({ ...e.spec, workspace: e.spec.sessionDir })
      if (!e.alive) { await runtime.stop(id); throw new Error('远端终端已经结束或断开') }
      presentation.ready = true
    } catch (error) {
      e.presentation?.detach(); e.presentation = undefined
      if (e.alive) await this.redraw(e)
      throw error
    } finally { e.launching = false }
  }

  private async redraw(e: Entry): Promise<void> {
    e.redrawing = true
    try {
      const screen = await e.screen.snapshot(e.rows)
      if (!e.alive || e.presentation) return
      const data = `\x1b[?1049l\x1b[2J\x1b[H${screen.text.replaceAll('\n', '\r\n')}\x1b[${screen.cursorY + 1};${screen.cursorX + 1}H`
      this.emit({ kind: 'output', sessionId: e.spec.sessionId, data })
    } finally { e.redrawing = false }
  }

  async stop(id: string): Promise<void> {
    const e = this.entries.get(id)
    if (!e || e.exited) return
    const presentation = e.presentation
    if (presentation) { presentation.detach(); e.presentation = undefined }
    try { e.shell?.close() } finally { this.finish(e, { reason: '远端终端已关闭' }) }
    if (presentation) await presentation.runtime.stop(id)
  }

  private finish(e: Entry, event: RemoteShellExit): void {
    if (e.exited) return
    e.exited = true; e.alive = false; e.ready = false
    const id = e.spec.sessionId
    const closed: ClosedEntry = { cwd: e.cwd,
      ...(e.owner ? { owner: e.owner } : {}),
      ...(e.spec.remote?.connectionId ? { connectionId: e.spec.remote.connectionId } : {}),
    }
    this.entries.delete(id)
    this.closed.set(id, closed)
    while (this.closed.size > 32) {
      const oldest = this.closed.keys().next().value!
      const metadata = this.closed.get(oldest)!
      if (metadata.owner && this.selected.get(metadata.owner) === oldest) this.selectedClosed.set(oldest, metadata)
      this.closed.delete(oldest)
    }
    e.replay = ''; e.parser = ''; delete e.integrationQueue; delete e.shell
    const error = new Error(event.reason || '远端终端已经结束或断开')
    e.startup?.reject(error)
    if (e.task) { e.task.cleanup(); if (!e.task.cancelled) e.task.reject(error); e.task = undefined }
    e.startup = undefined
    for (const detach of e.detach.splice(0)) { try { detach() } catch {} }
    if (e.presentation) { e.presentation.detach(); void e.presentation.runtime.stop(e.spec.sessionId); e.presentation = undefined }
    this.opts.terminalControl.exited(e.spec.sessionId)
    e.screen.dispose()
    try { this.opts.onExit?.(id) } catch { /* Resource release cannot depend on observers. */ }
    this.emit({ kind: 'exited', sessionId: e.spec.sessionId, exitCode: event.code ?? 0 })
    this.sinks.delete(e.spec.sessionId)
  }
  private entry(id: string): Entry {
    const entry = this.entries.get(id)
    if (!entry) throw new Error(this.has(id) ? '远端终端已经结束或断开' : '没有这个远端终端')
    return entry
  }
  private closedEntry(id: string): ClosedEntry | undefined { return this.closed.get(id) ?? this.selectedClosed.get(id) }
  private emit(event: AgentEvent): void {
    for (const sink of [...(this.sinks.get(event.sessionId) ?? [])]) {
      try { sink(event) } catch { /* One UI observer must not prevent terminal cleanup. */ }
    }
  }
}
