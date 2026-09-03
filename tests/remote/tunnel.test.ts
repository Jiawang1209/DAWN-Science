/**
 * SSH 端口隧道（远程内核，2026-09-03）。zeromq 在它上面跑的是原样 TCP（Spike F Q4），
 * 所以这里只验三件事：字节双向原样过、五条各自一个本地端口、关掉之后在途连接也断。
 */
import { describe, expect, it } from "vitest"
import { connect } from "node:net"
import { PassThrough, type Duplex } from "node:stream"
import { 隧道, 五条隧道 } from "../../src/remote/tunnel.js"
import type { KernelConnectionInfo } from "../../src/kernel/types.js"

/** 一个「远端」：每次 forwardOut 给一条回声通道，记下要的是哪个端口 */
function 假远端() {
  const 要过: number[] = []
  const 通道们: Duplex[] = []
  return {
    要过,
    通道们,
    forwardOut: async (远端端口: number): Promise<Duplex> => {
      要过.push(远端端口)
      const ch = new PassThrough()
      通道们.push(ch)
      return ch // 回声：写进去的从另一头读出来
    },
  }
}

const 收一段 = (端口: number, 发: string) =>
  new Promise<string>((resolve, reject) => {
    const s = connect(端口, "127.0.0.1", () => s.write(发))
    s.once("data", (d) => {
      resolve(d.toString())
      s.destroy()
    })
    s.once("error", reject)
  })

describe("隧道", () => {
  it("字节原样过：本地连上去写什么，远端通道回什么", async () => {
    const 远 = 假远端()
    const t = await 隧道(远, 5555)
    expect(t.本地端口).toBeGreaterThan(0)
    expect(await 收一段(t.本地端口, "DAWN_REMOTE_OK 42")).toBe("DAWN_REMOTE_OK 42")
    expect(远.要过).toEqual([5555])
    await t.关()
  })

  it("远端 forwardOut 报错时本地连接被拒，不挂着", async () => {
    const t = await 隧道({ forwardOut: async () => { throw new Error("administratively prohibited") } }, 1)
    await expect(收一段(t.本地端口, "x")).rejects.toThrow()
    await t.关()
  })

  it("五条：连接信息换成本地端口与 127.0.0.1，key 不动", async () => {
    const 远 = 假远端()
    const 远端: KernelConnectionInfo = {
      ip: "127.0.0.1", transport: "tcp", key: "k", signature_scheme: "hmac-sha256",
      shell_port: 1, iopub_port: 2, stdin_port: 3, control_port: 4, hb_port: 5,
    }
    const 五 = await 五条隧道(远, 远端)
    const 端口 = [五.本地.shell_port, 五.本地.iopub_port, 五.本地.stdin_port, 五.本地.control_port, 五.本地.hb_port]
    for (const p of 端口) expect(await 收一段(p, "ping")).toBe("ping")
    expect(远.要过).toEqual([1, 2, 3, 4, 5])
    expect(new Set(端口).size).toBe(5)
    expect(五.本地.key).toBe("k")
    expect(五.本地.ip).toBe("127.0.0.1")
    // 一条隧道 = 一条 forwardOut：同一个本地端口连两次，得两条各自的通道
    await 收一段(五.本地.shell_port, "again")
    expect(远.要过.filter((x) => x === 1).length).toBe(2)
    await 五.关()
    // 关了就连不上
    await expect(收一段(五.本地.shell_port, "x")).rejects.toThrow()
  })

  it("并发：同一个本地端口两个连接，各自一条 forwardOut 通道，回声互不串", async () => {
    const 远 = 假远端()
    const t = await 隧道(远, 7777)
    const [a, b] = await Promise.all([收一段(t.本地端口, "A"), 收一段(t.本地端口, "B")])
    expect(a).toBe("A")
    expect(b).toBe("B")
    expect(远.要过).toEqual([7777, 7777])
    expect(远.通道们.length).toBe(2)
    await t.关()
  })

  it("forwardOut 迟到：客户端已经秒断，通道落地时直接结束，不抛也不留 unhandled rejection", async () => {
    let 漏了: unknown
    const 抓 = (e: unknown) => { 漏了 = e }
    process.on("unhandledRejection", 抓)
    try {
      let 通道: PassThrough | undefined
      const 慢远端 = {
        forwardOut: (): Promise<Duplex> =>
          new Promise((resolve) => {
            setTimeout(() => {
              通道 = new PassThrough()
              resolve(通道)
            }, 30)
          }),
      }
      const t = await 隧道(慢远端, 9999)
      await new Promise<void>((resolve, reject) => {
        const s = connect(t.本地端口, "127.0.0.1", () => {
          s.destroy() // 秒断：forwardOut 30ms 后才落地时，本地这头早没了
          resolve()
        })
        s.once("error", reject)
      })
      await new Promise((r) => setTimeout(r, 60)) // 等迟到的 forwardOut 真正落地
      expect(通道).toBeDefined()
      expect(通道!.writableEnded).toBe(true)
      expect(漏了).toBeUndefined()
      await t.关()
    } finally {
      process.off("unhandledRejection", 抓)
    }
  })

  it("关() 顺手把还开着的连接对应的通道也结束掉", async () => {
    const 远 = 假远端()
    const t = await 隧道(远, 8888)
    await new Promise<void>((resolve, reject) => {
      const s = connect(t.本地端口, "127.0.0.1", () => resolve())
      s.once("error", reject)
      // 不写数据、不主动关——模拟内核连着不撒手的状态
    })
    // 客户端的 connect 回调跟服务端的 connection 事件（进而触发 forwardOut）不是同一个 tick，
    // 一次 setImmediate 赌不赢——等 forwardOut 真的落地
    while (远.通道们.length < 1) await new Promise((r) => setTimeout(r, 5))
    await t.关()
    expect(远.通道们.length).toBe(1)
    expect((远.通道们[0] as PassThrough).writableEnded).toBe(true)
  })
})
