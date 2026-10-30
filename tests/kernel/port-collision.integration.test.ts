import { afterEach, expect, it, vi } from "vitest"
import { createServer, type Server, type Socket } from "node:net"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ChildProcess } from "node:child_process"
import { launchKernelChannel } from "../../src/kernel/channel.js"
import type { KernelConnectionInfo } from "../../src/kernel/types.js"

const interception = vi.hoisted(() => ({ failStartup: false, afterSpawn: undefined as ((kernel: { spawn: ChildProcess; config: KernelConnectionInfo }) => Promise<void>) | undefined }))
vi.mock("spawnteract", async (original) => {
  const actual = await original<typeof import("spawnteract")>()
  return { ...actual, launchSpec: async (spec: Parameters<typeof actual.launchSpec>[0], options: Parameters<typeof actual.launchSpec>[1]) => {
    // Hold real R before its ZMQ bind so another process can deterministically win.
    const argv = spec.argv.map(arg => arg === "IRkernel::main()" ? (interception.failStartup ? 'stop("STARTUP_TEST_FAILURE")' : "Sys.sleep(0.3); IRkernel::main()") : arg)
    const kernel = await actual.launchSpec({ ...spec, argv }, options)
    await interception.afterSpawn?.(kernel as never)
    return kernel
  } }
})

const blockers: Server[] = []
const sockets = new Set<Socket>()
const children: ChildProcess[] = []
const directories: string[] = []
afterEach(async () => {
  interception.afterSpawn = undefined
  interception.failStartup = false
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  await Promise.all(blockers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

async function occupy(port: number) {
  const server = createServer(socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)) })
  blockers.push(server)
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve) })
  return server
}

it.skipIf(!existsSync("/usr/local/bin/R"))("real R recovers a lost port race, reaps the failed process and executes user code once", async () => {
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
  const launches: { pid: number | undefined; port: number }[] = []
  let collisionEvidence = ""
  interception.afterSpawn = async kernel => {
    if (children.length) expect(children[0]!.exitCode !== null || children[0]!.signalCode !== null).toBe(true)
    children.push(kernel.spawn)
    launches.push({ pid: kernel.spawn.pid, port: kernel.config.shell_port })
    for (const stream of [kernel.spawn.stderr, kernel.spawn.stdout]) stream?.on("data", data => { collisionEvidence += String(data) })
    if (children.length === 1) await occupy(kernel.config.shell_port)
  }
  const dir = mkdtempSync(join(tmpdir(), "dawn-port-race-")); directories.push(dir)
  const file = join(dir, "executions.txt")
  const channel = await launchKernelChannel({ interpreter: { language: "R", path: "/usr/local/bin/R" }, cwd: dir, handshakeTimeoutMs: 2500 })
  try {
    expect(launches).toHaveLength(2)
    expect(collisionEvidence).toMatch(/R_zmq_bind[\s\S]*Address already in use/)
    expect(blockers[0]!.listening).toBe(true)
    expect(launches[1]!.port).not.toBe(launches[0]!.port)
    expect(warnings).toHaveBeenCalledOnce()
    let output = ""
    const off = channel.on("stream", ({ message }) => { output += String(message.content.text ?? "") })
    channel.execute(`cat("once\\n", file=${JSON.stringify(file)}, append=TRUE); cat("PORT_RACE_OK =", 6*7, "\\n")`)
    await vi.waitFor(() => expect(output).toContain("PORT_RACE_OK = 42"), { timeout: 10000 })
    off()
    expect(readFileSync(file, "utf8")).toBe("once\n")
    console.log("Controlled real R port collision:", JSON.stringify({ blockerPid: process.pid, launches, recovered: true }))
  } finally { await channel.close() }
}, 30000)

it.skipIf(!existsSync("/usr/local/bin/R"))("persistent real R bind collisions stop after three attempts with process/port evidence and no secret", async () => {
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
  const keys: string[] = []
  const ports: number[] = []
  interception.afterSpawn = async kernel => {
    expect(children.every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true)
    children.push(kernel.spawn)
    keys.push(kernel.config.key)
    ports.push(kernel.config.shell_port)
    await occupy(kernel.config.shell_port)
  }
  const error = await launchKernelChannel({ interpreter: { language: "R", path: "/usr/local/bin/R" }, handshakeTimeoutMs: 1500 })
    .then(channel => { void channel.close(); throw new Error("must not start") }, error => error as Error)
  expect(error.message).toContain("共尝试3次")
  expect(error.message).not.toContain("原因认不出")
  expect(error.message).toContain(`PID=${children[2]!.pid}`)
  expect(error.message).toContain(`shell_port=${ports[2]}`)
  expect(children).toHaveLength(3)
  expect(new Set(ports).size).toBe(3)
  expect(children.every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true)
  expect(warnings).toHaveBeenCalledTimes(2)
  for (const key of keys) expect(`${error.message}\n${JSON.stringify(warnings.mock.calls)}`).not.toContain(key)
}, 30000)

it.skipIf(!existsSync("/usr/local/bin/R"))("non-port real R startup failures retain their cause and do not retry", async () => {
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
  interception.failStartup = true
  interception.afterSpawn = async kernel => { children.push(kernel.spawn) }
  await expect(launchKernelChannel({ interpreter: { language: "R", path: "/usr/local/bin/R" }, handshakeTimeoutMs: 1500 }))
    .rejects.toThrow("STARTUP_TEST_FAILURE")
  expect(children).toHaveLength(1)
  expect(children[0]!.exitCode !== null || children[0]!.signalCode !== null).toBe(true)
  expect(warnings).not.toHaveBeenCalled()
})
