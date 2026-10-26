import { EventEmitter } from "node:events"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { Client, type ClientChannel } from "ssh2"
import { RemoteExecutor, type SshClientLike } from "../../src/remote/ssh.js"
import { startLoopbackSsh } from "../helpers/loopback-ssh.js"

function setup(options: { noShell?: boolean; pending?: boolean; shellError?: Error } = {}) {
  const client = new EventEmitter() as EventEmitter & SshClientLike
  const channels: ReturnType<typeof channel>[] = []
  const windows: unknown[] = []
  let reply!: (err: Error | undefined, ch: ClientChannel) => void
  const createClient = vi.fn(() => client)
  client.connect = vi.fn(() => { queueMicrotask(() => client.emit("ready")) })
  client.end = vi.fn(() => { client.emit("close") })
  client.exec = (_cmd, cb) => {
    const ch = channel()
    cb(undefined, ch as unknown as ClientChannel)
    queueMicrotask(() => { ch.emit("data", Buffer.from("DAWNENV_PATH=/usr/bin\n")); ch.emit("close") })
  }
  if (!options.noShell) client.shell = vi.fn((window, cb) => {
    windows.push(window)
    reply = cb
    if (!options.pending) {
      const ch = channel()
      channels.push(ch)
      cb(options.shellError, ch as unknown as ClientChannel)
    }
  })
  const executor = new RemoteExecutor({ config: { host: "unused.invalid", username: "test" }, createClient })
  return { client, channels, windows, executor, createClient, reply: (ch: ReturnType<typeof channel>) => reply(undefined, ch as unknown as ClientChannel) }
}

function channel() {
  return Object.assign(new EventEmitter(), {
    stderr: new EventEmitter(),
    write: vi.fn(),
    setWindow: vi.fn(),
    close: vi.fn(),
  })
}

const size = { cols: 100, rows: 32 }

describe("SSH interactive shell", () => {
  it("opens a PTY on the connected client and forwards input and dimensions", async () => {
    const f = setup()
    await f.executor.connect()
    const shell = await f.executor.openShell(size)
    shell.write("printf hello\r")
    shell.resize(132, 40)
    expect(f.windows).toEqual([{ term: "xterm-256color", ...size }])
    expect(f.channels[0]!.write).toHaveBeenCalledWith("printf hello\r")
    expect(f.channels[0]!.setWindow).toHaveBeenCalledWith(40, 132, 0, 0)
    expect(f.createClient).toHaveBeenCalledTimes(1)
  })

  it("decodes UTF-8 split across buffers without mixing stdout and stderr", async () => {
    const f = setup()
    await f.executor.connect()
    const shell = await f.executor.openShell(size)
    const output: string[] = []
    shell.onData(data => output.push(data))
    const ch = f.channels[0]!
    const bytes = Buffer.from("中文")
    ch.emit("data", bytes.subarray(0, 1))
    ch.stderr.emit("data", Buffer.from("警告"))
    ch.emit("data", bytes.subarray(1, 4))
    ch.emit("data", bytes.subarray(4))
    expect(output.join("")).toBe("警告中文")
  })

  it("keeps the first prompt emitted before the caller can subscribe", async () => {
    const f = setup()
    await f.executor.connect()
    const opening = f.executor.openShell(size)
    f.channels[0]!.emit("data", Buffer.from("remote> "))
    const shell = await opening
    const data = vi.fn()
    shell.onData(data)
    expect(data).toHaveBeenCalledExactlyOnceWith("remote> ")
  })

  it("unsubscribes listeners and reports the remote exit only once", async () => {
    const f = setup()
    await f.executor.connect()
    const shell = await f.executor.openShell(size)
    const removedData = vi.fn(), removedExit = vi.fn(), exit = vi.fn()
    shell.onData(removedData)()
    shell.onExit(removedExit)()
    shell.onExit(exit)
    const ch = f.channels[0]!
    ch.emit("data", Buffer.from("ok"))
    ch.emit("exit", 7, null)
    ch.emit("close")
    ch.emit("close")
    expect(exit).toHaveBeenCalledExactlyOnceWith({ code: 7 })
    expect(removedData).not.toHaveBeenCalled()
    expect(removedExit).not.toHaveBeenCalled()
    const late = vi.fn()
    shell.onExit(late)
    expect(late).toHaveBeenCalledExactlyOnceWith({ code: 7 })
  })

  it("reports a signal exit and channel errors", async () => {
    const f = setup()
    await f.executor.connect()
    const a = await f.executor.openShell(size), b = await f.executor.openShell(size)
    const exitA = vi.fn(), exitB = vi.fn()
    a.onExit(exitA); b.onExit(exitB)
    f.channels[0]!.emit("exit", null, "TERM")
    f.channels[0]!.emit("close")
    f.channels[1]!.emit("error", new Error("channel failed"))
    expect(exitA).toHaveBeenCalledExactlyOnceWith({ signal: "TERM" })
    expect(exitB).toHaveBeenCalledExactlyOnceWith({ reason: "channel failed" })
    expect(f.executor.current().kind).toBe("ready")
  })

  it("closes only its own channel and ignores input after closing", async () => {
    const f = setup()
    await f.executor.connect()
    const a = await f.executor.openShell(size), b = await f.executor.openShell(size)
    const exit = vi.fn()
    a.onExit(exit)
    a.close(); a.close(); a.write("ignored"); a.resize(80, 24)
    b.write("still connected")
    expect(f.channels[0]!.close).toHaveBeenCalledTimes(1)
    expect(f.channels[0]!.write).not.toHaveBeenCalled()
    expect(f.channels[0]!.setWindow).not.toHaveBeenCalled()
    expect(f.channels[1]!.write).toHaveBeenCalledWith("still connected")
    expect(exit).toHaveBeenCalledTimes(1)
    expect(f.client.end).not.toHaveBeenCalled()
    expect(f.executor.current().kind).toBe("ready")
  })

  it.each(["close", "end", "error"])("ends every shell on SSH %s without reconnecting", async event => {
    const f = setup()
    await f.executor.connect()
    const a = await f.executor.openShell(size), b = await f.executor.openShell(size)
    const exitA = vi.fn(), exitB = vi.fn()
    a.onExit(exitA); b.onExit(exitB)
    f.client.emit(event, ...(event === "error" ? [new Error("transport failed")] : []))
    expect(exitA).toHaveBeenCalledTimes(1)
    expect(exitB).toHaveBeenCalledTimes(1)
    expect(exitA.mock.calls[0]![0].reason).toBeTruthy()
    await expect(f.executor.openShell(size)).rejects.toThrow(/disconnected/)
    expect(f.createClient).toHaveBeenCalledTimes(1)
  })

  it("ends all shells when the user disconnects", async () => {
    const f = setup()
    await f.executor.connect()
    const shell = await f.executor.openShell(size)
    const exit = vi.fn()
    shell.onExit(exit)
    f.executor.close()
    expect(exit).toHaveBeenCalledTimes(1)
    expect(f.executor.current().kind).toBe("idle")
  })

  it("still closes every channel and SSH when an observer throws during shutdown", async () => {
    const f = setup()
    await f.executor.connect()
    const a = await f.executor.openShell(size), b = await f.executor.openShell(size)
    a.onData(() => { throw new Error("broken data observer") })
    a.onExit(() => { throw new Error("broken exit observer") })
    const aExit = vi.fn(), bExit = vi.fn()
    a.onExit(aExit); b.onExit(bExit)
    f.channels[0]!.emit("data", Buffer.from([0xe4]))
    expect(() => f.executor.close()).not.toThrow()
    expect(aExit).toHaveBeenCalledTimes(1)
    expect(bExit).toHaveBeenCalledTimes(1)
    expect(f.channels[0]!.close).toHaveBeenCalledTimes(1)
    expect(f.channels[1]!.close).toHaveBeenCalledTimes(1)
    expect(f.client.end).toHaveBeenCalledTimes(1)
    expect(f.executor.current().kind).toBe("idle")
  })

  it("rejects a pending open immediately on disconnect and closes its late channel", async () => {
    const f = setup({ pending: true })
    await f.executor.connect()
    const opening = f.executor.openShell(size)
    const rejected = expect(opening).rejects.toThrow(/关闭|断|disconnected/)
    f.client.emit("close")
    await rejected
    const late = channel()
    f.reply(late)
    expect(late.close).toHaveBeenCalledTimes(1)
  })

  it("rejects unconnected and unsupported clients without attempting a connection", async () => {
    const f = setup({ noShell: true })
    await expect(f.executor.openShell(size)).rejects.toThrow(/idle|还没连上/)
    expect(f.createClient).not.toHaveBeenCalled()
    await f.executor.connect()
    await expect(f.executor.openShell(size)).rejects.toThrow(/不支持|unsupported/i)
    expect(f.createClient).toHaveBeenCalledTimes(1)
  })

  it("propagates shell refusal without disconnecting SSH", async () => {
    const f = setup({ shellError: new Error("PTY denied") })
    await f.executor.connect()
    await expect(f.executor.openShell(size)).rejects.toThrow("PTY denied")
    expect(f.executor.current().kind).toBe("ready")
  })

  it("rejects invalid dimensions before opening or resizing a channel", async () => {
    const f = setup()
    await f.executor.connect()
    for (const cols of [0, -1, 1.5, NaN, Infinity]) {
      await expect(f.executor.openShell({ cols, rows: 24 })).rejects.toThrow(/尺寸|dimension/i)
    }
    const shell = await f.executor.openShell(size)
    expect(() => shell.resize(80, 0)).toThrow(/尺寸|dimension/i)
    expect(f.channels[0]!.setWindow).not.toHaveBeenCalled()
  })

  it("does not give an interactive shell an implicit timeout", async () => {
    const f = setup()
    await f.executor.connect()
    vi.useFakeTimers()
    try {
      const shell = await f.executor.openShell(size)
      const exit = vi.fn()
      shell.onExit(exit)
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
      expect(exit).not.toHaveBeenCalled()
      expect(f.channels[0]!.close).not.toHaveBeenCalled()
    } finally { vi.useRealTimers(); f.executor.close() }
  })
})

it("real loopback SSH runs an isolated persistent PTY, resizes it, interrupts a command and reuses one connection", async () => {
  const fixture = await startLoopbackSsh()
  const executor = new RemoteExecutor({ config: fixture, createClient: () => new Client() })
  try {
    await executor.connect()
    expect(executor.loginEnv()["HOME"]).toBe(fixture.workspace)
    const shell = await executor.openShell(size)
    let output = ""
    shell.onData(data => { output += data })
    const wait = async (text: string) => { await vi.waitFor(() => expect(output).toContain(text), { timeout: 5000 }) }
    shell.write("printf '%s%s\\n' READY_ 中文\r")
    await wait("READY_中文")
    shell.write("mkdir 'child dir'; cd 'child dir'; export SHELL_TEST_VALUE=共享上下文; printf '%s' \"$PWD|$SHELL_TEST_VALUE\" > state.txt\r")
    await vi.waitFor(async () => expect(await readFile(join(fixture.workspace, "child dir/state.txt"), "utf8")).toBe(`${fixture.workspace}/child dir|共享上下文`))
    shell.resize(132, 40)
    shell.write("stty size > dimensions.txt\r")
    await vi.waitFor(async () => expect((await readFile(join(fixture.workspace, "child dir/dimensions.txt"), "utf8")).trim()).toBe("40 132"))
    shell.write("sleep 30\r")
    await wait("sleep 30")
    shell.write("\x03")
    shell.write("printf '%s%s\\n' INTERRUPT_ OK\r")
    await wait("INTERRUPT_OK")
    const command = await executor.exec("printf 'exec=%s' \"$HOME\"")
    expect(command.stdout).toBe(`exec=${fixture.workspace}`)
    expect(fixture.connections).toBe(1)
    const exit = vi.fn()
    shell.onExit(exit)
    shell.write("exit 7\r")
    await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith({ code: 7 }))
    expect(executor.current().kind).toBe("ready")
    const second = await executor.openShell({ cols: 80, rows: 24 })
    second.close()
    expect(executor.current().kind).toBe("ready")
    expect(fixture.connections).toBe(1)
  } finally { executor.close(); await fixture.close() }
}, 20000)
