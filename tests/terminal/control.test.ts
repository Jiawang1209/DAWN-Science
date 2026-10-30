import { describe, expect, it, vi } from 'vitest'
import { TerminalControl } from '../../src/terminal/control.js'
import { LeaseManager } from '../../src/session/lease.js'

function setup(process?: () => string) {
  const write = vi.fn()
  const control = new TerminalControl()
  control.register({ id: 't', pid: 42, cwd: '/work', command: '/bin/bash', cols: 80, rows: 24, write, resize: vi.fn(), ...(process ? { process } : {}) })
  control.output('t', '$ ')
  return { control, write }
}

describe('terminal control ownership and execution', () => {
  it('identifies a standard interpreter prompt for explicit natural-language submissions', async () => {
    let program = 'bash'
    const { control, write } = setup(() => program)
    try {
      expect(await control.detectMode('t')).toBe('shell')
      control.output('t', '\r\x1b[K>>> ')
      program = 'python3'
      expect(await control.detectMode('t')).toBe('python')
      control.output('t', '\r\x1b[K> ')
      program = 'R'
      expect(await control.detectMode('t')).toBe('R')
      expect(write).not.toHaveBeenCalled()
    } finally { control.dispose() }
  })
  it('does not mistake a shell continuation prompt for an R interpreter', async () => {
    const { control, write } = setup(() => 'bash')
    try {
      control.output('t', '\r\x1b[K> ')
      expect(await control.detectMode('t')).toBe('shell')
      control.grant('chat', 't', 'shell')
      await expect(control.execute('chat', 't', 'pwd', async () => {})).rejects.toThrow(/提示符/)
      expect(write).not.toHaveBeenCalled()
    } finally { control.dispose() }
  })
  it('waits for the first shell prompt instead of racing process startup', async () => {
    const control = new TerminalControl()
    control.register({ id: 'startup', pid: 42, cwd: '/work', command: '/bin/bash', cols: 80, rows: 24, write: vi.fn(), resize: vi.fn() })
    try {
      let finished = false
      const detected = control.detectMode('startup').then(mode => { finished = true; return mode })
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(finished).toBe(false)
      control.output('startup', 'bash-3.2$ ')
      expect(await detected).toBe('shell')
    } finally { control.dispose() }
  })
  it('keeps an explicitly shared live lease active while hidden, without reacquiring human control', async () => {
    const { control, write } = setup(), leases = new LeaseManager({ ttlSeconds: 300 })
    const renew = vi.fn(() => { leases.acquire('t', 'engine') })
    control.grant('chat', 't', 'shell')
    await control.snapshot('chat', 't')
    vi.useFakeTimers()
    control.setHost({ grant: () => { leases.acquire('t', 'engine') }, reclaim: () => { leases.acquire('t', 'user') },
      valid: () => leases.current('t')?.holder === 'engine', write, renew })
    control.grant('chat', 't', 'shell')
    try {
      await vi.advanceTimersByTimeAsync(360_000)
      expect(control.state('t').controlled).toBe(true)
      expect(renew).toHaveBeenCalled()
      leases.acquire('t', 'user')
      renew.mockClear()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(control.state('t').controlled).toBe(false)
      expect(renew).not.toHaveBeenCalled()
      await expect(control.snapshot('chat', 't')).rejects.toThrow()
      expect(write).not.toHaveBeenCalled()
    } finally { control.dispose(); vi.useRealTimers() }
  })
  it('closed or replaced terminal instances cannot receive a late permission answer', async () => {
    for (const replace of [false, true]) {
      const { control, write } = setup()
      let answer!: () => void
      try {
        control.grant('chat', 't', 'shell')
        const pending = control.execute('chat', 't', 'echo late', async () => new Promise<void>(r => { answer = r }))
        await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
        control.exited('t')
        if (replace) {
          control.register({ id: 't', pid: 99, cwd: '/work', command: '/bin/bash', cols: 80, rows: 24, write, resize: vi.fn() })
          control.output('t', '$ ')
          control.grant('chat', 't', 'shell')
        }
        answer()
        await expect(pending).rejects.toThrow()
        expect(write).not.toHaveBeenCalled()
      } finally { control.dispose() }
    }
  })

  it('an aborted round cannot send input after approval', async () => {
    const { control, write } = setup(), abort = new AbortController()
    try {
      control.grant('chat', 't', 'shell')
      await expect(control.execute('chat', 't', 'echo late', async () => { abort.abort() }, abort.signal)).rejects.toThrow(/停止/)
      expect(write).not.toHaveBeenCalled()
    } finally { control.dispose() }
  })
  it('an explicit interrupt invalidates an input still awaiting approval', async () => {
    const { control, write } = setup()
    let answer!: () => void
    try {
      control.grant('chat', 't', 'shell')
      const pending = control.execute('chat', 't', 'echo late', async () => new Promise<void>(r => { answer = r }))
      await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
      await control.key('chat', 't', 'ctrl-c', async () => {})
      answer()
      await expect(pending).rejects.toThrow(/控制|授权/)
      expect(write.mock.calls).toEqual([['\x03']])
    } finally { control.dispose() }
  })
  it('requires explicit sharing and isolates owners', async () => {
    const { control, write } = setup()
    try {
      await expect(control.snapshot('chat', 't')).rejects.toThrow(/交给|共享/)
      control.grant('chat', 't', 'shell')
      await expect(control.snapshot('other', 't')).rejects.toThrow(/归属|对话/)
      expect(control.list('other')).toEqual([])
      expect((await control.snapshot('chat', 't')).pid).toBe(42)
      expect(write).not.toHaveBeenCalled()
    } finally { control.dispose() }
  })

  it('rechecks the grant after an asynchronous permission answer', async () => {
    const { control, write } = setup()
    let answer!: () => void
    try {
      control.grant('chat', 't', 'shell')
      const executing = control.execute('chat', 't', 'echo no', async () => new Promise<void>(r => { answer = r }))
      await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
      control.reclaim('t')
      answer()
      await expect(executing).rejects.toThrow(/接回|控制|授权/)
      expect(write).not.toHaveBeenCalled()
    } finally { control.dispose() }
  })

  it('does not reissue a long command and never treats a timeout as completion', async () => {
    const { control, write } = setup()
    try {
      control.grant('chat', 't', 'shell')
      const task = await control.execute('chat', 't', 'sleep 20', async () => {})
      expect(task.state).toBe('running')
      const result = await control.wait('chat', 't', 1)
      expect(result.task?.state).toBe('running')
      await expect(control.execute('chat', 't', 'sleep 20', async () => {})).rejects.toThrow(/运行|完成/)
      expect(write).toHaveBeenCalledTimes(1)
      control.output('t', `\x1b]7777;dawn;${task.id};7\x07\r\n$ `)
      expect((await control.wait('chat', 't', 1)).task).toMatchObject({ state: 'completed', exitCode: 7 })
    } finally { control.dispose() }
  })

  it('manual takeover keeps the terminal alive and invalidates old tasks', async () => {
    const { control, write } = setup()
    try {
      control.grant('chat', 't', 'shell')
      await control.execute('chat', 't', 'sleep 1', async () => {})
      control.reclaim('t')
      expect(control.state('t')).toMatchObject({ controlled: false, alive: true, pid: 42, task: { state: 'unknown' } })
      await expect(control.key('chat', 't', 'enter', async () => {})).rejects.toThrow()
      expect(write).toHaveBeenCalledTimes(1)
      control.exited('t')
      expect(control.state('t').alive).toBe(false)
    } finally { control.dispose() }
  })

  it('rejects a wrong interpreter prompt and pending human input', async () => {
    const { control, write } = setup()
    try {
      control.grant('chat', 't', 'python')
      await expect(control.execute('chat', 't', 'print(1)', async () => {})).rejects.toThrow(/提示符|程序/)
      control.reclaim('t')
      control.output('t', 'echo unfinished')
      control.grant('chat', 't', 'shell')
      await expect(control.execute('chat', 't', 'pwd', async () => {})).rejects.toThrow(/提示符|输入/)
      expect(write).not.toHaveBeenCalled()
    } finally { control.dispose() }
  })
})

it.each(['powershell.exe','pwsh.exe'])('Windows %s空闲提示符能进入DAWN，未提交输入仍拒绝', async program => {
  const {control,write}=setup(()=>program)
  try {
    control.output('t','\r\x1b[KPS C:\\work> ')
    await control.launchCli('t','saved-session')
    expect(write).toHaveBeenLastCalledWith("dawn --resume 'saved-session'\r")
    control.humanInput('t','draft')
    await expect(control.launchCli('t')).rejects.toThrow(/空闲 Shell/)
  } finally { control.dispose() }
})
it('starts the CLI only at an empty, idle shell prompt', async () => {
  let program = 'bash'
  const { control, write } = setup(() => program)
  try {
    control.output('t', 'echo pending')
    await expect(control.launchCli('t')).rejects.toThrow(/空闲 Shell/)
    expect(write).not.toHaveBeenCalled()
    control.output('t', '\r\x1b[K>>> '); program = 'python3'
    await expect(control.launchCli('t')).rejects.toThrow(/空闲 Shell/)
    expect(write).not.toHaveBeenCalled()
    control.output('t', '\r\x1b[K$ '); program = 'bash'
    await control.launchCli('t')
    expect(write).toHaveBeenCalledExactlyOnceWith('dawn\r')
  } finally { control.dispose() }
})
it('can launch and query a zsh prompt with right-side status text without accepting a draft', async () => {
  const { control, write } = setup(() => 'zsh')
  try {
    control.output('t', '\r\x1b[K中文目录 % \x1b[s\x1b[65G1 ↵\x1b[u')
    await control.launchCli('t', 'saved-session')
    expect(write).toHaveBeenCalledExactlyOnceWith("dawn --resume 'saved-session'\r")
    write.mockClear()
    const query = control.currentDirectory('t')
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    const token = /dawn-cwd;([^;]+);/.exec(write.mock.calls[0]![0])![1]
    control.output('t', `\x1b]7777;dawn-cwd;${token};/work/current\x07`)
    expect(await query).toBe('/work/current')
    write.mockClear(); control.humanInput('t', 'echo pending'); control.output('t', 'echo pending')
    await expect(control.launchCli('t')).rejects.toThrow(/空闲 Shell/)
    await expect(control.currentDirectory('t')).rejects.toThrow(/空闲 Shell/)
    expect(write).not.toHaveBeenCalled()
  } finally { control.dispose() }
})
it('does not mistake Ctrl-A then Ctrl-U for clearing an unsubmitted right-side draft', async () => {
  const { control, write } = setup(() => 'bash')
  try {
    control.humanInput('t', 'echo pending'); control.output('t', 'echo pending')
    control.humanInput('t', '\x01\x15'); control.output('t', '\x1b[3G')
    await expect(control.launchCli('t')).rejects.toThrow(/空闲 Shell/)
    await expect(control.currentDirectory('t')).rejects.toThrow(/空闲 Shell/)
    expect(write).not.toHaveBeenCalled()
    control.humanInput('t', '\x03'); control.output('t', '\r\x1b[K$ ')
    await control.launchCli('t'); expect(write).toHaveBeenCalledExactlyOnceWith('dawn\r')
  } finally { control.dispose() }
})

it('does not treat a prompt-like character in unsubmitted input as a ready shell', async () => {
  const { control, write } = setup()
  try {
    control.humanInput('t', 'echo $')
    control.output('t', 'echo $')
    await expect(control.launchCli('t')).rejects.toThrow(/空闲 Shell/)
    expect(write).not.toHaveBeenCalled()
    control.humanInput('t', '\x15')
    control.output('t', '\r\x1b[K$ ')
    await control.launchCli('t')
    expect(write).toHaveBeenCalledExactlyOnceWith('dawn\r')
  } finally { control.dispose() }
})

it('ignores terminal device replies when checking for human pending input', async () => {
  const { control, write } = setup()
  try {
    control.humanInput('t', '\x1b[1;1R\x1b[?1;2c\x1b[>0;276;0c\x1b]11;rgb:ffff/ffff/ffff\x1b\\')
    await control.launchCli('t')
    expect(write).toHaveBeenCalledExactlyOnceWith('dawn\r')
  } finally { control.dispose() }
})
