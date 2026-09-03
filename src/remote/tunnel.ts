/**
 * SSH 端口隧道（远程内核，2026-09-03，spec `2026-09-03-远程内核-design.md`）。
 *
 * 一条隧道 = 本地一个 `net.Server`（`127.0.0.1:0`），每个入站 socket 开一条 `forwardOut`
 * 通道对接——一条 `forwardOut` 就是一条 TCP 连接，不能共享：断了重连（zeromq 的行为）得要
 * 一条全新的通道，接到一条已经用过或已经死掉的通道上没有意义。zeromq 在上面跑的是原样 TCP，
 * `enchannel` 不知道中间隔着 SSH（Spike F Q4 实测）。
 * 这一层**只认识 `forwardOut`**，不认识 ssh2 的 Client——注入进来，单测塞回声通道。
 */
import { createServer, type Socket } from "node:net"
import type { Duplex } from "node:stream"
import type { KernelConnectionInfo } from "../kernel/types.js"

export interface 可转发 {
  /** 到远端 `127.0.0.1:<端口>` 的一条通道 */
  forwardOut(远端端口: number): Promise<Duplex>
}

export interface 一条隧道 {
  本地端口: number
  /** 关掉监听与所有在途连接。幂等 */
  关(): Promise<void>
}

export async function 隧道(c: 可转发, 远端端口: number): Promise<一条隧道> {
  const 在途 = new Set<Socket>()
  const server = createServer((sock) => {
    在途.add(sock)
    sock.on("close", () => 在途.delete(sock))
    sock.on("error", () => sock.destroy())
    c.forwardOut(远端端口).then(
      (ch) => {
        ch.on("error", () => sock.destroy())
        ch.on("close", () => sock.destroy())
        sock.on("close", () => ch.end())
        sock.pipe(ch).pipe(sock)
      },
      // 远端拒了（sshd 关了 AllowTcpForwarding 之类）：本地这条连接也拒，别挂着。
      // 用 resetAndDestroy 显式发 RST——普通 destroy() 在没有待读字节时只是干净地
      // FIN，对端只收到 close 收不到 error，永远等不到「拒绝」这个信号。
      () => sock.resetAndDestroy(),
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const addr = server.address()
  if (!addr || typeof addr === "string") throw new Error("本地隧道端口拿不到")
  let 关了 = false
  return {
    本地端口: addr.port,
    关: () =>
      new Promise<void>((r) => {
        if (关了) return r()
        关了 = true
        for (const s of 在途) s.destroy()
        server.close(() => r())
      }),
  }
}

/** 五个端口各一条。任一条建不起来就把已开的关掉再抛——不留半套 */
export async function 五条隧道(
  c: 可转发,
  远端: KernelConnectionInfo,
): Promise<{ 本地: KernelConnectionInfo; 关(): Promise<void> }> {
  const 名 = ["shell_port", "iopub_port", "stdin_port", "control_port", "hb_port"] as const
  const 开了: 一条隧道[] = []
  try {
    const 本地: KernelConnectionInfo = { ...远端, ip: "127.0.0.1" }
    for (const k of 名) {
      const t = await 隧道(c, 远端[k])
      开了.push(t)
      本地[k] = t.本地端口
    }
    return { 本地, 关: async () => void (await Promise.all(开了.map((t) => t.关()))) }
  } catch (e) {
    await Promise.all(开了.map((t) => t.关()))
    throw e
  }
}
