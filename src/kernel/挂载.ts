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
    return 一
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
