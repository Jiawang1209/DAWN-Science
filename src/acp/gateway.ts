/**
 * DAWN 工具网关（B1 路线 B，2026-08-17）。
 *
 * ACP agent 会**自己拉起**我们在 `session/new` 里声明的那些 MCP 服务器
 * （见 `runtime/acp/runtime.ts`）。于是那台服务器是一个**独立进程**——
 * 它拿不到我们的内核、技能与账本。这个文件就是那条回来的路。
 *
 * ```
 * ACP agent ──stdio/MCP──▶ scripts/dawn-mcp-server.mjs ──socket──▶ 这里 ──▶ DAWN
 * ```
 *
 * ## 为什么是本地 socket，不是 HTTP 端口
 *
 * 端口是**整台机器可见**的：同一台机器上任何一个进程都能连上去，
 * 而这条通道后面是内核执行与账本写入。Unix socket 落在私有目录里、
 * 权限 `0600`；Windows 命名管道不走文件系统，靠令牌。
 *
 * ## 令牌只走环境变量，绝不落盘
 *
 * 路径是猜得到的（进程列表里就有），**令牌不是**。它随 `env` 交给
 * 那个子进程，进程一退就没了。写进文件等于把它留在磁盘上，
 * 而这条通道的权限比一份配置文件大得多。
 *
 * ## 每一次调用都记账
 *
 * 这是路线 B 与 wisp 那套「能力网关」的**实质区别**：
 * 我们不是在裁剪能力（裁不动——ACP 进程有它自己的 bash），
 * 而是在**延伸账本**：它经这条路做的每一件事都落一条 Run，
 * 父账挂在那一轮 ACP 回合上。记账在 `wiring` 那一侧接。
 */
import { createServer, type Server, type Socket } from "node:net"
import { randomBytes } from "node:crypto"
import { chmodSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

/** 一个可以给出去的工具。`schema` 是 MCP 的 inputSchema（JSON Schema） */
export interface 网关工具 {
  name: string
  description: string
  schema: Record<string, unknown>
}

export interface 网关装配 {
  /** 这一段会话能用哪些工具。**按会话问**——将来可以按项目授权 */
  工具们: (sessionId: string) => 网关工具[]
  /**
   * 真正干活。**返回给模型看的文本**。
   *
   * 抛出的错会被原样交给对面的 agent——**它需要知道为什么不行**，
   * 才可能改道（这与我们对自己工具的做法一致）。
   */
  调用: (
    sessionId: string,
    工具名: string,
    参数: Record<string, unknown>,
  ) => Promise<{ 文本: string; 出错?: boolean }>
  /** 存放 socket 的私有目录（POSIX 用）。测试可注入 */
  runtimeDir?: string
}

export interface 网关句柄 {
  /** 交给子进程的连接方式。**令牌只在这里出现一次** */
  地址: { path: string; token: string }
  关掉: () => void
}

/**
 * socket 的地址。
 *
 * **Windows 走命名管道**——那边没有 Unix domain socket，
 * 而 `\\.\pipe\` 下的名字不是文件，也就没有文件权限可依赖（靠令牌）。
 * 这与 `runtime/acp/launch.ts` 里那三条是同一类问题：
 * **一处跨平台的差别，写在一个地方，配一条能在本机验三个平台的判据。**
 */
export function 网关地址(id: string, runtimeDir: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? `\\\\.\\pipe\\dawn-${id}` : join(runtimeDir, `${id}.sock`)
}

/** 开一台网关。**每次运行一台**，会话身份由连接时报上来 */
export function 开网关(装配: 网关装配): 网关句柄 {
  const id = randomBytes(8).toString("hex")
  const token = randomBytes(24).toString("hex")
  const 目录 = 装配.runtimeDir ?? join(process.env["TMPDIR"] ?? "/tmp", "dawn-gateway")
  if (process.platform !== "win32") mkdirSync(目录, { recursive: true, mode: 0o700 })
  const path = 网关地址(id, 目录)

  const server: Server = createServer((sock) => 接一条(sock, 装配))
  server.listen(path, () => {
    // **只有本人能连**：POSIX 上再加一道文件权限，命名管道没有这一层
    if (process.platform !== "win32") {
      try {
        chmodSync(path, 0o600)
      } catch {
        /* 已经被删了：那就没有可保护的东西了 */
      }
    }
  })
  server.on("error", (e) => console.error("[网关] 起不来：", e.message))

  return {
    地址: { path, token },
    关掉: () => {
      server.close()
      if (process.platform !== "win32") rmSync(path, { force: true })
    },
  }

  function 接一条(sock: Socket, 装: 网关装配): void {
    let 认过了 = false
    let 会话 = ""
    let 缓冲 = ""
    sock.setEncoding("utf8")
    sock.on("data", (块: string) => {
      缓冲 += 块
      let i: number
      while ((i = 缓冲.indexOf("\n")) >= 0) {
        const 行 = 缓冲.slice(0, i).trim()
        缓冲 = 缓冲.slice(i + 1)
        if (!行) continue
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(行) as Record<string, unknown>
        } catch {
          // **不猜**：连不上协议的一律断开，而不是继续读下一行
          sock.destroy()
          return
        }
        /**
         * **第一句必须是认证**。
         *
         * 令牌不对就断开，且**不说为什么**——一个会告诉你「令牌错了」
         * 的接口，等于确认了「令牌是对的那条路存在」。
         */
        if (!认过了) {
          if (msg["token"] !== token || typeof msg["sessionId"] !== "string") {
            sock.destroy()
            return
          }
          认过了 = true
          会话 = msg["sessionId"]
          sock.write(`${JSON.stringify({ ok: true })}\n`)
          continue
        }
        void 应答(sock, 装, 会话, msg)
      }
    })
    // 对面（那个 MCP 进程）随时会被 agent 收掉，**断了不是错误**
    sock.on("error", () => sock.destroy())
  }
}

async function 应答(
  sock: Socket,
  装: 网关装配,
  会话: string,
  msg: Record<string, unknown>,
): Promise<void> {
  const id = msg["id"]
  const 回 = (body: Record<string, unknown>) => sock.write(`${JSON.stringify({ id, ...body })}\n`)
  try {
    if (msg["method"] === "tools/list") {
      回({ result: { tools: 装.工具们(会话) } })
      return
    }
    if (msg["method"] === "tools/call") {
      const p = (msg["params"] ?? {}) as { name?: string; arguments?: Record<string, unknown> }
      if (typeof p.name !== "string") {
        回({ error: "少了工具名" })
        return
      }
      const r = await 装.调用(会话, p.name, p.arguments ?? {})
      回({ result: r })
      return
    }
    回({ error: `网关不认识这个方法：${String(msg["method"])}` })
  } catch (e) {
    /**
     * **原样交给对面**。它需要知道为什么不行，才可能改道——
     * 这与我们对自己那几个工具的做法一致（工具报错是给模型读的）。
     */
    回({ error: e instanceof Error ? e.message : String(e) })
  }
}
