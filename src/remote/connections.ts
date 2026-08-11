/**
 * 连接管理器（②-B · R3）：谁连着、连不上是为什么。
 *
 * 名单在库里（`store/connections.ts`），**状态在这里，在进程内**。
 * 把「连着没有」写进库的话，应用崩一次，下次打开就会看到一台「连着」的服务器，
 * 而它并没有连着——**看起来很确定的错**是本项目最忌的一种。
 *
 * ## 三条纪律
 *
 * 1. **不静默重连**（计划 §3.3）。断了就停在 `disconnected` 并带着原因，
 *    等人再按一次。悄悄重连会让「命令跑在哪台机器的哪个 shell 里」失去答案——
 *    重连之后那边是一个全新的进程，之前的 `cd`、后台任务、临时文件都不在了。
 * 2. **口令从钥匙串取，取完就用，不留副本**。这一层不接受口令参数，
 *    只接受一个「去问钥匙串」的端口。
 * 3. **状态变了就推**，不等界面来问。轮询意味着从断开到被发现之间，
 *    界面显示的是「连着」——那是一个看起来很确定的谎。
 */
import { readFile } from "node:fs/promises"
import { RemoteExecutor, type RemoteState, type SshClientLike } from "./ssh.js"
import type { ConnectionRecord } from "../store/connections.js"

export interface ConnectionsOptions {
  /** 造一个 SSH 客户端。**注入的理由是可测**——单测塞一个假的进来 */
  createClient: () => SshClientLike
  /** 去钥匙串取这台机器的口令 / 私钥 passphrase。**没配就是 undefined** */
  secretFor: (connectionId: string) => string | undefined
  /** ssh-agent 的 socket。**没有就不给**，不传空串 */
  agentSock?: string | undefined
  /** 状态变了。**每一次都推**，包括自己断开与对端断开 */
  onState?: (connectionId: string, state: RemoteState) => void
  /** 读私钥文件。可注入只为可测 */
  readKeyFile?: (path: string) => Promise<Buffer>
}

export class RemoteConnections {
  private readonly 活着 = new Map<string, RemoteExecutor>()
  private readonly 状态 = new Map<string, RemoteState>()

  constructor(private readonly opts: ConnectionsOptions) {}

  /** 此刻的状态。**没见过的一律 `idle`**——那是实话：我们没试过 */
  stateOf(id: string): RemoteState {
    return this.状态.get(id) ?? { kind: "idle" }
  }

  /** 连着的那个执行器。**没连上就是 undefined**，不在这里顺手连一下 */
  executorOf(id: string): RemoteExecutor | undefined {
    return this.状态.get(id)?.kind === "ready" ? this.活着.get(id) : undefined
  }

  /**
   * 连上。**等到真的连上（或失败）才返回。**
   *
   * 已经连着就直接返回——重复按不该把好好的连接掐掉重来
   * （那会连带杀掉它上面所有会话的当前目录与后台任务）。
   */
  async connect(rec: ConnectionRecord): Promise<RemoteState> {
    if (this.状态.get(rec.id)?.kind === "ready") return this.stateOf(rec.id)

    const 私钥 = rec.privateKeyPath
      ? await (this.opts.readKeyFile ?? readFile)(rec.privateKeyPath).catch((e: unknown) => {
          // **读不到就说读不到**，别退回「试试密码吧」——那样人看到的是
          // 「认证失败」，而真正的原因是路径写错了
          throw new Error(
            `读不了私钥 ${rec.privateKeyPath}：${e instanceof Error ? e.message : String(e)}`,
          )
        })
      : undefined
    const 秘密 = this.opts.secretFor(rec.id)

    const ex = new RemoteExecutor({
      config: {
        host: rec.host,
        port: rec.port,
        username: rec.username,
        ...(私钥 ? { privateKey: 私钥 } : {}),
        // **同一个秘密，两种用途**：有私钥时它是 passphrase，没有时它是密码。
        // 分成两个字段要人分得清自己配的是哪一种，而那正是最容易配错的地方
        ...(秘密 ? (私钥 ? { passphrase: 秘密 } : { password: 秘密 }) : {}),
        ...(this.opts.agentSock ? { agentSock: this.opts.agentSock } : {}),
      },
      createClient: this.opts.createClient,
      onState: (s) => this.记下(rec.id, s),
    })
    this.活着.set(rec.id, ex)

    try {
      await ex.connect()
    } catch (e) {
      // `RemoteExecutor` 自己会进 disconnected 并带原因；这里只负责把话传上去
      this.活着.delete(rec.id)
      throw e
    }
    return this.stateOf(rec.id)
  }

  /**
   * 人主动断开。**这与「断线」不是一回事**——
   * 前者停在 `idle`（没连而已），后者停在 `disconnected` 并带着原因。
   * 混成一个的话，界面就没法把「我没连」与「它把我踢了」分开说。
   */
  disconnect(id: string): RemoteState {
    this.活着.get(id)?.close()
    this.活着.delete(id)
    this.记下(id, { kind: "idle" })
    return this.stateOf(id)
  }

  /** 全断。退出时用 */
  closeAll(): void {
    for (const id of [...this.活着.keys()]) this.disconnect(id)
  }

  private 记下(id: string, s: RemoteState): void {
    this.状态.set(id, s)
    // **断了就把执行器扔掉**：留着它，下一条命令会打在一个已经死掉的连接上，
    // 而报错信息会是底层的 socket 错误，不是「这台机器断了」
    if (s.kind === "disconnected") this.活着.delete(id)
    this.opts.onState?.(id, s)
  }
}
