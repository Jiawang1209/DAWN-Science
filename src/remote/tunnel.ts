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
  // sock 对应的通道——只有等 forwardOut 落地、真正开始 pipe 之后才登记，
  // 好让 关() 能在销毁 socket 的同时顺手把通道也结束掉，不用等 'close' 事件绕一圈
  const 通道映射 = new Map<Socket, Duplex>()
  const server = createServer((sock) => {
    在途.add(sock)
    sock.on("close", () => {
      在途.delete(sock)
      const ch = 通道映射.get(sock)
      if (ch) {
        通道映射.delete(sock)
        ch.end()
      }
    })
    sock.on("error", () => sock.destroy())
    c.forwardOut(远端端口).then(
      (ch) => {
        if (sock.destroyed) {
          // 通道落地的时候本地这头已经断了（客户端秒断之类）：不能再 pipe 到一个死 socket 上，
          // 把通道自己结束掉，别让它悬着
          ch.end()
          return
        }
        通道映射.set(sock, ch)
        ch.on("error", () => sock.destroy())
        ch.on("close", () => sock.destroy())
        sock.pipe(ch).pipe(sock)
      },
      // 远端拒了（sshd 关了 AllowTcpForwarding 之类）：本地这条连接也拒，别挂着。
      // 用 resetAndDestroy 显式发 RST——普通 destroy() 在没有待读字节时只是干净地
      // FIN，对端只收到 close 收不到 error，永远等不到「拒绝」这个信号。
      () => sock.resetAndDestroy(),
    )
  })

  let 本地端口 = 0
  let 监听中 = false
  await new Promise<void>((resolve, reject) => {
    // 持久监听，不用 once：listen 阶段的错误经这条 reject 出去；listen 成功之后
    // 这个监听器还留着——那时候早没人在等这个 Promise 了，错误不能悄悄消失进一个
    // 已经 settle 的 Promise 里（规格 7.5：失败必须出声）
    server.on("error", (e) => {
      if (!监听中) {
        reject(e)
        return
      }
      console.error(`[隧道] 本地端口 ${本地端口} 出错：${(e as Error).message}`)
    })
    server.listen(0, "127.0.0.1", () => {
      监听中 = true
      resolve()
    })
  })

  const addr = server.address()
  if (!addr || typeof addr === "string") {
    // 走到这一步 listen 已经成功了，不能把监听中的 server 留在那——先关掉再抛
    await new Promise<void>((r) => server.close(() => r()))
    throw new Error("本地隧道端口拿不到")
  }
  本地端口 = addr.port

  let 关了 = false
  return {
    本地端口,
    关: () =>
      new Promise<void>((r) => {
        if (关了) return r()
        关了 = true
        for (const s of 在途) {
          const ch = 通道映射.get(s)
          if (ch) {
            通道映射.delete(s)
            ch.end()
          }
          s.destroy()
        }
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
