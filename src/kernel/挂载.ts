/**
 * 给一段对话挂内核（②「内核接进普通对话」，2026-08-14）。
 *
 * ## 它做的事只有一件：记住「哪个对话有哪些内核」
 *
 * **内核那一层一行都不用改。** `KernelRuntime` 已经是个普通的 `AgentRuntime`——
 * `start(spec)` 起、`attach(id, sink)` 订、`write(id, code)` 送代码进去。
 * 所以「对话里能跑代码」不是新写一套执行，而是**在对话旁边再起一个内核会话**，
 * 把它的输出转发进对话的转录。
 *
 * 这也是作者定的纪律的直接结果：*「尽量在新增加功能的时候，
 * 尽可能不要更改旧功能。」* ——`kind: kernel` 那条既有的路原样留着。
 *
 * ## 六条定案里，这个文件负责三条
 *
 * 1. **懒起**：第一次要跑那门语言的代码时才起，不在建会话时就占一个进程。
 * 2. **每种语言一个，可以共存**（作者 2026-08-14 追问后改的）。
 *    我原先定「一个会话最多一个、换语言就换」，理由是「同时挂会让
 *    『我的 `df` 在哪个里』说不清」——**那个理由站不住**：
 *    送代码时本来就带着语言，而 R 与 Python 的命名空间本来就分开。
 * 3. **每处输出都要标明是哪个内核**：所以这里有 `语言(内核会话id)` 这个反查——
 *    事件从内核回来时只带着它自己的 sessionId，
 *    **不能反查的话，两个内核的输出混在转录里就没有判据**了。
 */
import type { AgentRuntime, SessionHandle, SessionId } from "../runtime/types.js"

/** 目前支持的两门。**与 `kind: kernel` 那条用的是同一套内核** */
export type 内核语言 = "python" | "R"

export interface 挂载选项 {
  /**
   * 起内核用的运行时。**注入进来的**——测试塞 `FakeRuntime`，生产是 `KernelRuntime`。
   * 不在这里 `new` 一个：那会让这一层没法脱离真内核测试。
   */
  runtime: AgentRuntime
  /** 这个对话的工作区。**取不到就起不了内核**——代码总得有个地方跑 */
  workspaceOf: (对话: SessionId) => string | undefined
  /** 每个内核一个隔离目录（与 per-session 隔离同一条纪律） */
  sessionDirOf: (对话: SessionId, 语言: 内核语言) => string
  /**
   * 把内核的事件转发进**对话的**转录（②，2026-08-14）。
   *
   * 内核事件带的是**内核自己的** sessionId（`c1::python`），
   * 直接 ingest 会落到一段根本不存在的会话上——所以要在这里换成对话的 id，
   * **并带上是哪门语言**（协议 5.5 的 `language`）。
   *
   * **可选**：不给就只有工具那条路能拿到输出（文字回给模型），
   * 屏幕上看不见——那正是接上它之前的状态。
   */
  转发?: (对话: SessionId, 语言: 内核语言, 事件: unknown) => void
}

interface 一台 {
  内核会话: SessionId
  handle: SessionHandle
  对话: SessionId
  语言: 内核语言
}

export class 对话内核 {
  /** key：`对话:语言` */
  private readonly 表 = new Map<string, 一台>()
  /** 反查：内核会话 id → 它是谁的、哪门语言 */
  private readonly 反查 = new Map<SessionId, 一台>()

  constructor(private readonly opts: 挂载选项) {}

  private static 键(对话: SessionId, 语言: 内核语言): string {
    return `${对话}:${语言}`
  }

  /** 这个对话现在挂着哪几门语言的内核。**没起过的不算** */
  列(对话: SessionId): 内核语言[] {
    return [...this.表.values()].filter((k) => k.对话 === 对话).map((k) => k.语言)
  }

  有(对话: SessionId, 语言: 内核语言): boolean {
    return this.表.has(对话内核.键(对话, 语言))
  }

  /**
   * 这个内核会话是谁的、哪门语言。
   *
   * **转录给输出打标签靠它**：事件回来时只带内核自己的 sessionId，
   * 反查不到就只能把两个内核的输出混在一起——
   * 而「两处长得一样的东西等于没有判据」是本项目咬过三次的。
   */
  语言(内核会话: SessionId): 内核语言 | undefined {
    return this.反查.get(内核会话)?.语言
  }

  归属(内核会话: SessionId): SessionId | undefined {
    return this.反查.get(内核会话)?.对话
  }

  /**
   * 拿这门语言的内核，**没有就现起一台**（定案 1：懒起）。
   *
   * 起不来时**抛，不返回 undefined**：调用方要把原因原样告诉模型
   * （「没配 Python 解释器」和「内核起崩了」是两回事）。
   */
  async 拿(对话: SessionId, 语言: 内核语言): Promise<一台> {
    const 键 = 对话内核.键(对话, 语言)
    const 已有 = this.表.get(键)
    if (已有) return 已有

    const workspace = this.opts.workspaceOf(对话)
    if (!workspace) {
      throw new Error(`这段对话没有工作目录，起不了 ${语言} 内核——代码总得有个地方跑`)
    }

    const 内核会话 = `${对话}::${语言}` as SessionId
    const handle = await this.opts.runtime.start({
      sessionId: 内核会话,
      workspace,
      sessionDir: this.opts.sessionDirOf(对话, 语言),
    })
    const 一 = { 内核会话, handle, 对话, 语言 }
    this.表.set(键, 一)
    this.反查.set(内核会话, 一)

    /**
     * **一起来就把输出接到对话上**，而不是等第一次执行。
     *
     * 内核在起来的过程中就会吐东西（`status: starting`、有的还会打横幅），
     * 等执行时才接的话，那些**在屏幕上永远不会出现**——
     * 而它们恰恰是「它到底起来没有」的证据。
     */
    const 转 = this.opts.转发
    if (转) this.opts.runtime.attach(内核会话, (e) => 转(对话, 语言, e))
    return 一
  }

  /**
   * 把一段代码送进这门语言的内核，**等它这一轮吐完**再返回。
   *
   * ## 边界是 `status: idle`，不是 `execute_reply`
   *
   * 照抄 `KernelRuntime` 里那条踩出来的纪律：iopub 与 shell 是两条独立通道，
   * **reply 到了不代表输出到齐**（K1 那个「Python 过、R 红」正是这么来的）。
   *
   * ## 不设默认超时
   *
   * 与 bash 那条同一个理由（作者定的）：一段真跑二十分钟的分析，
   * 和「卡死了」在协议上长得一模一样。与其猜一个上限把正常的长任务砍掉，
   * 不如把「已经跑了多久」显示出来、中止交给人按。
   */
  async 执行(
    对话: SessionId,
    语言: 内核语言,
    代码: string,
  ): Promise<{ 内核会话: SessionId; 语言: 内核语言; 输出: unknown[] }> {
    const 一 = await this.拿(对话, 语言)
    const 输出: unknown[] = []

    return new Promise((resolve, reject) => {
      let 解开: (() => void) | undefined
      const 收尾 = () => {
        解开?.()
        resolve({ 内核会话: 一.内核会话, 语言, 输出 })
      }
      try {
        解开 = this.opts.runtime.attach(一.内核会话, (e) => {
          const ev = e as { kind: string; entry?: { kind?: string; state?: string } }
          if (ev.kind === "kernel_output" && ev.entry) {
            输出.push(ev.entry)
            // **这一轮的边界**（见上）
            if (ev.entry.kind === "status" && ev.entry.state === "idle") 收尾()
            return
          }
          /**
           * **内核死了要出声，不能就这么挂着**（定案 4：不静默重起）。
           * 挂着的表现是「发过去了，永远没有回音」——本项目最难查的那种。
           */
          if (ev.kind === "exited") {
            解开?.()
            reject(new Error(`${语言} 内核在这一轮里退出了`))
          }
        })
        this.opts.runtime.write(一.内核会话, 代码)
      } catch (e) {
        解开?.()
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  /**
   * 收掉一个对话名下的所有内核。
   *
   * **一台起不来不该拦住其余的**：逐台收，收不掉的记下来交给调用方说出去，
   * 而不是抛出去让第一个失败吞掉后面几台。
   */
  async 收(对话: SessionId): Promise<{ 收了: 内核语言[]; 没收掉: { 语言: 内核语言; 原因: string }[] }> {
    const 收了: 内核语言[] = []
    const 没收掉: { 语言: 内核语言; 原因: string }[] = []
    for (const 一 of [...this.表.values()].filter((k) => k.对话 === 对话)) {
      try {
        // **`stop` 在运行时上，不在 handle 上**（tsc 当场抓住的想当然）
        await this.opts.runtime.stop(一.内核会话)
        收了.push(一.语言)
      } catch (e) {
        没收掉.push({ 语言: 一.语言, 原因: e instanceof Error ? e.message : String(e) })
      }
      this.表.delete(对话内核.键(对话, 一.语言))
      this.反查.delete(一.内核会话)
    }
    return { 收了, 没收掉 }
  }
}
