import { expect, it } from "vitest"
import { createServer } from "node:net"
import { randomUUID } from "node:crypto"
import { attachKernelChannel } from "../../src/kernel/channel.js"

it("a closed failed channel never delivers its queued handshake to a replacement endpoint", async () => {
  const { Router, context } = await import("zeromq")
  const previous = context.blocky
  // Reproduce ZeroMQ's default: pending messages otherwise survive socket.close().
  context.blocky = true
  const reservations = await Promise.all(Array.from({ length: 5 }, async () => {
    const server = createServer()
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    return server
  }))
  const ports = reservations.map(server => (server.address() as { port: number }).port)
  await Promise.all(reservations.map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  const receiver = new Router({ receiveTimeout: 600, linger: 0 })
  try {
    await expect(attachKernelChannel({
      连接信息: { ip: "127.0.0.1", transport: "tcp", key: randomUUID(), signature_scheme: "hmac-sha256", shell_port: ports[0]!, control_port: ports[1]!, stdin_port: ports[2]!, iopub_port: ports[3]!, hb_port: ports[4]! },
      process: { kill() {} }, language: "R", label: "closed endpoint", handshakeTimeoutMs: 100,
    })).rejects.toThrow("握手没有回音")
    await receiver.bind(`tcp://127.0.0.1:${ports[0]}`)
    // A new kernel at the same endpoint must receive no old key's handshake.
    await expect(receiver.receive()).rejects.toMatchObject({ code: "EAGAIN" })
  } finally {
    receiver.close()
    context.blocky = previous
  }
})
