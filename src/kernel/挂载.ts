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
import type { AgentRuntime, RemoteLike, SessionHandle, SessionId } from "../runtime/types.js"

/**
 * **静默**超时（笔记本，2026-08-26）：这段执行连着这么久一点动静都没有，才当它卡住/死了、兜底拒掉。
 *
 * **是「静默」不是「总时长」**：一段真跑二十分钟的训练循环会一路吐进度，
 * 按总时长砍就把它错杀了。所以每收到一条这台内核的事件（输出或状态）就把表重置——
 * 只有**整整 5 分钟一条都没有**才算「卡住或死了」，那才是要兜的信号。
 * 砍正常长任务的活仍交给「中断」按钮和「已经跑了多久」的显示（见 `执行` 的注释）。
 */
export const 静默超时 = 5 * 60_000

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
   * 这门语言的解释器路径。**没配就是 undefined**（2026-08-14 补的）。
   *
   * 作者：*「有的人其实只用 R，有的人只用 Python，
   * 我们在解释器路径里面，也可以自由配置。」*——**只配一门是常态**，
   * 所以「另一门没配」不是异常，是一个要好好说话的正常状态。
   *
   * **第一版我漏了这个参数**，`start()` 里压根没传 `kernel`——
   * 于是那套东西起不了真内核，而单元测试全绿（假内核不需要解释器）。
   * 这正是「测试绿了不等于能用」的又一例。
   */
  interpreterOf: (语言: 内核语言, 对话: SessionId) => string | undefined | Promise<string | undefined>
  /**
   * 这段对话长在哪台服务器上（远程内核，2026-09-03）。缺省 = 本机。
   *
   * **每次现取**——句柄握的是「这台机器」，断线重连后仍成立；
   * 缓存下来的话，重连换了一条 SSH 连接，内核就起在一个已经死掉的执行器上。
   */
  remoteOf?: (对话: SessionId) => { executor: RemoteLike; cwd: string; connectionId: string; label: string } | undefined
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
  /**
   * 某段对话名下的内核状态变了（笔记本，2026-08-26）。
   *
   * 起来了、开始跑、跑完了、退出了、被收掉了——每一步都叫一次，
   * 调用方拿 `状态列表(对话)` 取整份重发（与 `team_changed` 同一种「整份换掉」的推法）。
   * **可选**：不接的话状态只是记在这里，谁来问谁拿。
   *
   * 第二个参数是**这一次变的是哪台、变成了什么**（审查 2026-08-26）：转录要在起内核、
   * 内核退出时出声，而 `状态列表` 只有「现在的样子」——`starting` 那一小段表里没有这台，
   * 光看列表说不出「正在起」。退出时带 `reason`（运行时给了退出码才有）。
   */
  状态变了?: (对话: SessionId, 变化: 内核状态变化) => void
  /**
   * 执行前的「接回门」（接回，2026-09-04 定案 9）：这段对话的服务器刚连上时，扫残留 + 接回还在路上，
   * `detached` 的那台此刻既不能写、也不该被当成死了起新的。装配层给一条 promise，等它 settle 再看状态。
   * 不给 / 给 undefined = 没门，直接看状态。
   */
  接回门?: (对话: SessionId) => Promise<void> | undefined
}

/** 某一台内核这一次的状态变化。`state: "exited"` 时 `reason` 可有（非零退出码等） */
export interface 内核状态变化 {
  language: 内核语言
  state: 内核状态
  reason?: string
  /** 是我们自己 `收()` 掉的，不是内核自己退出——转录不该为它喊「内核退出了」 */
  收掉?: true
  /**
   * 这台在哪台服务器上（远程内核，定案 2）。**`置状态` announce 的每一条都带**——
   * busy / idle / exited / detached 全在内；原先挑「哪几条该带」，而挑不出判据，
   * 所以改成状态一变就现取一次（接回，2026-09-04）。
   *
   * 另外手写的那几条各自也带：`starting`（那一刻内核还没起来，`起来了` 里什么都还不知道）、
   * 静默（`reason: "silent"`）；`接回了` 把服务器带在它自己那层里。
   * **不带的只有两条**：`起失败`（那台从没进表，转录只说不来）与 `收掉`（是我们自己收的，不点名）。
   */
  服务器?: string
  /**
   * **刚起来的那一下**（定案 2，审查 2026-09-04）：`starting` 之后第一条 `idle` 才有，
   * 后面每一轮跑完回到 idle 都没有。
   *
   * 带的是「代码到底在哪儿跑」这三件事——远端会话里它们全不是默认值，
   * 不说的话，一句「内核已起来」等于什么都没说。
   */
  起来了?: { 解释器: string; cwd?: string; 服务器?: string }
  /** 「正在起」之后起失败了（`runtime.start` 抛）：`reason` 是原因。转录要接一句，否则「正在起…」永远没有下文 */
  起失败?: true
  /**
   * 接回来了（接回，2026-09-04 定案 10）：`detached` 之后回到 `idle` 的那一条才有。
   * `掉线时在飞` 为真时转录要补一句「掉线时正在跑的那段可能已经跑完，输出没收到」。
   */
  接回了?: { 服务器?: string; 掉线时在飞: boolean }
}

/**
 * 一台内核的生命周期（笔记本，2026-08-26）。
 * `starting` 只存在于 `runtime.start` 还没解析的那一小段；表里能查到的台起码是 `idle`。
 *
 * `detached`（接回，2026-09-04 定案 6）：与服务器掉线了，进程多半还在服务器上活着——**不是死**。
 * 表里留着这台（变量在服务器上没动），`拿` 不摘它也不起新的；等运行时 `reattached` 回 `idle`，
 * 或 `exited{lost}` 才算没撑过去。
 */
export type 内核状态 = "starting" | "idle" | "busy" | "exited" | "detached"

/**
 * 给界面看的一台内核。**故意与协议的 `KernelState` 同形**：内核层不 import 协议
 * （方向是协议依赖运行时，不反过来），所以这里另写一份，`wiring.ts` 直接透传。
 */
export interface 内核状态项 {
  language: 内核语言
  state: 内核状态
}

interface 一台 {
  内核会话: SessionId
  handle: SessionHandle
  对话: SessionId
  语言: 内核语言
  状态: 内核状态
  /** 内部状态监听的注销。**收掉时要调**，别给停掉的内核留一只挂着的耳朵 */
  解监听: () => void
  /**
   * 同一台内核一次只跑一段（审查 Critical）：两段同时 attach 会在第一个 idle 上一起收尾，
   * 把对方的输出认成自己的——你在笔记本里跑的那段会收走模型 run_code 的输出，
   * cell、账本、不在场缓冲全说错，状态还会在还在跑的时候翻回 idle。后一段排在这条 promise 后面
   */
  队列: Promise<unknown>
  /** 还在排队、没送进内核的段数。>0 时运行时回的 idle 不算数——下一段马上就写，中间不该露一个 idle */
  排队中: number
  /**
   * 此刻真在内核上跑、还没等到 idle 的那一段的「拒绝钩子」（笔记本，2026-08-26）。
   *
   * **常驻监听才是判死的权威，不是每段执行自己那只临时耳朵。** 内核起来就死时，
   * 进程退出、运行时删掉会话、`exited` 事件发出——都可能发生在 `真执行` 里那只
   * per-execute attach 注册进去**之前**：那只耳朵一条 `exited` 都收不到，Promise 永远不解，
   * cell 永远转，它后面排队的段也全堵死。常驻监听（`起一台` 里那只）从内核一起来就在听，
   * 它把 `exited` 认出来时若 `在飞` 还挂着，就替这段执行喊出「没跑完就退了」。
   */
  在飞?: { reject: (e: Error) => void } | undefined
}

export class 对话内核 {
  /** key：`对话:语言` */
  private readonly 表 = new Map<string, 一台>()
  /** 反查：内核会话 id → 它是谁的、哪门语言 */
  private readonly 反查 = new Map<SessionId, 一台>()
  /**
   * 正在起的那一台(审查 debug H4)。**懒起是 TOCTOU**:两次并发 `拿(同一对话,同一语言)`
   * 都看到表里没有,各 `await runtime.start` 起一台,后者覆盖 `表`、前者成了泄漏的孤儿内核
   * (进程还活着、再没人 close)。把「正在起」的 promise 也记下来,第二个调用等同一个 promise,
   * 而不是再起一台。起失败/起完都从这张表里摘掉。
   */
  private readonly 起中 = new Map<string, Promise<一台>>()

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

  /** 这个对话名下每台内核现在的状态，**按起的先后**。没起过的不算 */
  状态列表(对话: SessionId): 内核状态项[] {
    return [...this.表.values()]
      .filter((k) => k.对话 === 对话)
      .map((k) => ({ language: k.语言, state: k.状态 }))
  }

  /**
   * 这台内核的会话 id（`<对话>::<语言>`）。**没起过就是 undefined**——
   * 后端按对话 + 语言问变量、中断时要拿这个去找运行时。
   */
  内核会话id(对话: SessionId, 语言: 内核语言): SessionId | undefined {
    return this.表.get(对话内核.键(对话, 语言))?.内核会话
  }

  /**
   * 问这台内核现在有哪些变量。
   *
   * 两种 undefined 都原样返回：**没这台内核**，或**这个运行时不认识变量**
   * （`variables` 不在 `AgentRuntime` 契约里，只有内核运行时有——
   * 与 `SessionManager.variables` 同一副透传写法）。
   */
  async 变量(对话: SessionId, 语言: 内核语言): Promise<unknown> {
    const 一 = this.表.get(对话内核.键(对话, 语言))
    if (!一) return undefined
    // `variables` 不在 `AgentRuntime` 契约里（只有 KernelRuntime 有），所以按能力探测而不是硬转
    const rt: unknown = this.opts.runtime
    if (typeof rt === "object" && rt !== null && "variables" in rt && typeof rt.variables === "function") {
      return await (rt.variables as (id: SessionId) => Promise<unknown>)(一.内核会话)
    }
    return undefined
  }

  /**
   * 中断这门语言的内核**这一轮**（不杀内核，变量都还在）。
   *
   * 抛而不吞：「没起过」与「这个运行时根本不会中断」是两回事，
   * 都要让按按钮的人看得见。
   */
  async 中断(对话: SessionId, 语言: 内核语言): Promise<void> {
    const 一 = this.表.get(对话内核.键(对话, 语言))
    if (!一) throw new Error(`没有这台内核：${语言}`)
    if (!this.opts.runtime.abort) throw new Error("这个运行时不支持中断")
    await this.opts.runtime.abort(一.内核会话)
  }

  /**
   * 改一台的状态并出声。**相同不叫**：省得每条 busy 重复推一份一样的列表。
   * 远端的每条都点名服务器（**现取**，与 `起一台` 同一条纪律）：`exited{died}` 那句「在 `<服务器>` 上没了」要用。
   */
  private 置状态(一: 一台, 状态: 内核状态, reason?: string): void {
    if (一.状态 === 状态) return
    一.状态 = 状态
    const 远 = this.opts.remoteOf?.(一.对话)
    this.opts.状态变了?.(一.对话, {
      language: 一.语言,
      state: 状态,
      ...(reason ? { reason } : {}),
      ...(远 ? { 服务器: 远.label } : {}),
    })
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
    if (已有 && 已有.状态 !== "exited") return 已有
    if (已有) {
      /**
       * 退出了的那台留在表里只会让下一次报「没有这个内核会话」（运行时早把它删了）——
       * 摘掉，下面按「没有」起新的一台。变量自然没了，转录那边由退出通知说过了。
       */
      已有.解监听()
      this.表.delete(键)
      this.反查.delete(已有.内核会话)
    }

    // TOCTOU 收口(H4):已经有人在起同一台就等它,不再起第二台
    const 起中的 = this.起中.get(键)
    if (起中的) return 起中的

    const p = this.起一台(对话, 语言, 键)
    this.起中.set(键, p)
    try {
      return await p
    } finally {
      // 起完(已进表)或起失败,都从「正在起」里摘掉
      this.起中.delete(键)
    }
  }

  private async 起一台(对话: SessionId, 语言: 内核语言, 键: string): Promise<一台> {
    const workspace = this.opts.workspaceOf(对话)
    if (!workspace) {
      throw new Error(`这段对话没有工作目录，起不了 ${语言} 内核——代码总得有个地方跑`)
    }

    const interpreterPath = await this.opts.interpreterOf(语言, 对话)
    if (!interpreterPath) {
      /**
       * **没配就明说没配，并说清去哪儿配。**
       *
       * 只用 R 或只用 Python 的人很多（作者点出来的），所以这条会经常走到——
       * 笼统回一句「起不来」会让模型换着法子重试同一条死路。
       */
      throw new Error(
        `还没配 ${语言} 的解释器路径，起不了内核。去「设置 → 内核」里填一个${
          语言 === "R" ? " R" : " Python"
        } 可执行文件的路径。`,
      )
    }

    const 内核会话 = `${对话}::${语言}` as SessionId
    // 这段对话在哪台机器上，内核就在哪台起（远程内核）。**现取**，不缓存
    const 远 = this.opts.remoteOf?.(对话)
    // 起之前先说一声「正在起」：解释器有了、目录有了，剩下的就是等进程——这一段人得看得见
    // 远端要带上是哪台：远端起内核比本机慢得多，而「在等谁」是这段等待里唯一有用的信息
    this.opts.状态变了?.(对话, { language: 语言, state: "starting", ...(远 ? { 服务器: 远.label } : {}) })
    let handle: SessionHandle
    try {
      handle = await this.opts.runtime.start({
        sessionId: 内核会话,
        workspace,
        sessionDir: this.opts.sessionDirOf(对话, 语言),
        // **这一项是内核运行时用来起进程的**，漏了它就起不来（第一版就漏了）
        kernel: { language: 语言, interpreterPath },
        /**
         * 远端会话：把「哪台服务器、哪个目录」交给运行时（远程内核，2026-09-03）。
         * `cwd` 定死在起内核那一刻的目录（定案 2）——内核的工作目录进程起来就不再变了，
         * 给一个会跟着模型 `cd` 漂的 getter 只会让「图存到哪了」说不清。
         */
        ...(远
          ? {
              remote: {
                executor: 远.executor,
                cwd: { get: () => 远.cwd, set: () => {} },
                connectionId: 远.connectionId,
                label: 远.label,
              },
            }
          : {}),
      })
    } catch (e) {
      // 说过「正在起」就得说「起不来」：这台从没进表，`状态列表` 里看不出它来过
      this.opts.状态变了?.(对话, { language: 语言, state: "exited", reason: e instanceof Error ? e.message : String(e), 起失败: true })
      throw e
    }
    /**
     * `runtime.start` 解析即算起来了——`KernelRuntime.start` 要等到 kernel_info 应答才返回，
     * 所以这里不用再等一条 `started` 事件；`starting` 只存在于上面那个 await 期间，
     * 而那时它还不在表里，`状态列表` 看不到（起不起得来还没定，不该先显示一台）。
     */
    const 一: 一台 = { 内核会话, handle, 对话, 语言, 状态: "idle", 解监听: () => {}, 队列: Promise.resolve(), 排队中: 0 }
    this.表.set(键, 一)
    this.反查.set(内核会话, 一)

    /**
     * **无条件**接一个内部监听跟踪状态，与 `转发` 分开：转发是给转录看的、可以不接，
     * 而状态是这一层自己的账。
     *
     * 内核运行时把每条 `translateOutput` 结果原样发出（`src/runtime/kernel.ts` :113），
     * 其中就有真内核每轮开头吐的 `status: busy` 与收尾的 `status: idle`，
     * 所以这里两个都认；`starting` 那条不改状态（表里的台已经起来了）。
     */
    一.解监听 = this.opts.runtime.attach(内核会话, (e) => {
      const ev = e as { kind: string; entry?: { kind?: string; state?: string } }
      if (ev.kind === "kernel_output" && ev.entry?.kind === "status") {
        if (ev.entry.state === "busy") this.置状态(一, "busy")
        // 后面还有排着的段：这个 idle 只是两段之间的缝，对笔记本来说它还在跑
        else if (ev.entry.state === "idle" && 一.排队中 === 0) this.置状态(一, "idle")
      } else if (ev.kind === "detached") {
        /**
         * **掉线 = 分离，不是死**（接回，定案 6）。运行时已把它挪出 `sessions`、留着连接信息等接回；
         * 这里只换状态、拒掉在飞的那段——它多半在服务器上跑完了，只是我们不在场，所以措辞是「没收到」不是「没跑完」。
         * 表里不摘：变量在服务器上没动，`拿` 见到 `detached` 也不起新的（定案 9）。
         */
        // 已经死了的不会再「分离」（审查 2026-09-04）：晚到的一条 detached 会把 exited 翻成 detached，
        // 而 `拿` 只摘 exited——那台从此既摘不掉也起不了新的，这段对话再也跑不了代码
        if (一.状态 === "exited") return
        const 远 = this.opts.remoteOf?.(对话)
        一.状态 = "detached"
        this.opts.状态变了?.(对话, {
          language: 语言,
          state: "detached",
          reason: (e as { reason?: string }).reason ?? "disconnected",
          ...(远 ? { 服务器: 远.label } : {}),
        })
        const 飞 = 一.在飞
        if (飞) {
          一.在飞 = undefined
          飞.reject(new Error("与服务器断开，这段的结果没收到"))
        }
      } else if (ev.kind === "reattached") {
        // 认领回来了（定案 10）：同一个会话 id、同一个进程、变量都在。这条 idle 带 `接回了`，转录据此出声
        // 死了的接不回来（审查 2026-09-04，与 detached 同一个坑）：`exited` 之后晚到的一条会把它翻回 idle，
        // 于是 `拿` 把一台运行时早就不认识的内核当活的用，下一次 `write` 撞「没有这个内核会话」
        if (一.状态 === "exited") return
        const 远 = this.opts.remoteOf?.(对话)
        一.状态 = "idle"
        this.opts.状态变了?.(对话, {
          language: 语言,
          state: "idle",
          接回了: { 掉线时在飞: (e as { 掉线时在飞?: boolean }).掉线时在飞 === true, ...(远 ? { 服务器: 远.label } : {}) },
        })
      } else if (ev.kind === "exited") {
        const code = (e as { exitCode?: number }).exitCode
        // 运行时说得出原因就用它的（远端断线 = `disconnected`），说不出才退回退出码
        const reason = (e as { reason?: string }).reason
        this.置状态(一, "exited", reason ?? (typeof code === "number" && code !== 0 ? `退出码 ${code}` : undefined))
        /**
         * **常驻监听叫醒在飞的执行**（内核起来就死的那条路）。per-execute attach 可能压根
         * 没赶上这条 `exited`（进程退得比它注册还快），那这里就是唯一还听得见死讯的耳朵——
         * 有在飞就替它拒掉，别让 cell 永远转。`真执行` 拒完自己会把 `在飞` 清掉，这里再清一次兜底。
         */
        const 飞 = 一.在飞
        if (飞) {
          一.在飞 = undefined
          飞.reject(new Error(`${一.语言} 内核这一段没跑完就退出了`))
        }
      }
    })
    // **「起来了」这一条要带上三件事**（定案 2）：解释器、（远端的）机器与目录。
    // 只有这一刻说得出它们——后面每一轮跑完也回 idle，那些 idle 不该再重复一遍
    this.opts.状态变了?.(对话, {
      language: 语言,
      state: "idle",
      起来了: { 解释器: interpreterPath, ...(远 ? { cwd: 远.cwd, 服务器: 远.label } : {}) },
    })

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
   * ## 不设总时长上限，只兜「静默」
   *
   * 与 bash 那条同一个理由（作者定的）：一段真跑二十分钟的分析，
   * 和「卡死了」在协议上长得一模一样——按总时长砍就把正常的长任务错杀了。
   * 所以这里**不设总时长上限**，把「已经跑了多久」显示出来、中止交给人按。
   * 唯一的兜底是 `静默超时`：**连着 5 分钟一条输出/状态都没有**才拒——
   * 一路吐进度的长 cell 不受它影响（见 `真执行` 里的「静默表」）。
   */
  async 执行(
    对话: SessionId,
    语言: 内核语言,
    代码: string,
    opts?: {
      /**
       * 这段**真送进内核**的那一刻叫一次（排队的段在这之前只是排着）。
       * 「中断」要知道此刻在内核上跑的是哪一段——排着的那些不该被它标上。
       */
      开始了?: () => void
    },
  ): Promise<{ 内核会话: SessionId; 语言: 内核语言; 输出: unknown[] }> {
    let 一 = await this.拿(对话, 语言)
    if (一.状态 === "detached") {
      /**
       * 服务器可能刚连上、接回还在路上（接回，定案 9）：等门。门后重新 `拿`——要么 `idle`（接回了）、
       * 要么 `exited`（没撑过去，`拿` 会摘掉它起新的一台）、要么仍 `detached`（还没连上，`真执行` 会回错）。
       */
      await this.opts.接回门?.(对话)
      一 = await this.拿(对话, 语言)
    }
    // 排队（见 `一台.队列`）：前一段失败了也不拖住后一段——失败是它自己的，队列只管顺序
    一.排队中++
    const 跑 = 一.队列.then(() => {
      一.排队中--
      return this.真执行(一, 语言, 代码, opts?.开始了)
    })
    一.队列 = 跑.catch(() => {})
    return 跑
  }

  /** 真把一段送进这台内核并等它的 idle。**只能经 `执行()` 的队列进来** */
  private 真执行(
    一: 一台,
    语言: 内核语言,
    代码: string,
    开始了?: () => void,
  ): Promise<{ 内核会话: SessionId; 语言: 内核语言; 输出: unknown[] }> {
    const 输出: unknown[] = []
    // 运行时对空代码静默不执行（`KernelRuntime.write` 直接 return），等 idle 等不到——
    // 不收口的话这台永远 busy，后面排的段全卡住。空的就当跑完了，什么都没有
    if (代码.trim() === "") return Promise.resolve({ 内核会话: 一.内核会话, 语言, 输出 })

    /**
     * **写之前先看这台还活着没有**（内核起来就死的兜底之一）。前一段已经把它拖成 exited，
     * 或常驻监听已经认定它退出了：这时再 `write` 只会撞上「没有这个内核会话」，
     * 或者更糟——静默不写、然后永远等不到 idle。活死人不写，直接拒。
     */
    if (一.状态 === "exited") {
      return Promise.reject(new Error(`${语言} 内核这一段没跑完就退出了`))
    }
    // 掉线期间不写、也不起新的（定案 9）：那台在服务器上等着被认领，写进去只会撞上「没有这个内核会话」
    if (一.状态 === "detached") {
      return Promise.reject(new Error("与服务器断开，内核等着接回；连上后再试"))
    }

    return new Promise((resolve, reject) => {
      let 解开: (() => void) | undefined
      let 定时: ReturnType<typeof setTimeout> | undefined
      /** 这段已经有结果了。常驻监听先于 per-execute 那只耳朵拒掉它时，同一条事件还会再到这里——到了也不能再武装表 */
      let 已结束 = false
      /** resolve / reject 任一条路都要走：摘耳朵、停表、清掉「在飞」，别给这台留悬着的钩子 */
      const 清理 = () => {
        已结束 = true
        解开?.()
        if (定时) clearTimeout(定时)
        if (一.在飞 === 飞) 一.在飞 = undefined
      }
      // 常驻监听靠它叫醒这段执行（见 `一台.在飞`）：per-execute attach 没赶上死讯时的另一条路
      const 飞 = {
        reject: (e: Error) => {
          清理()
          reject(e)
        },
      }
      一.在飞 = 飞
      const 收尾 = () => {
        清理()
        resolve({ 内核会话: 一.内核会话, 语言, 输出 })
      }
      /**
       * **静默表**（重新武装式）：一响就是「这台连着 `静默超时` 一条动静都没有」。
       * 每收到这台的一条事件就 `clearTimeout` + 重新起一个——所以一路吐进度的长 cell
       * 永远不会到点；只有真的**整段沉默**才会。重置只是一次清表 + 一次 `setTimeout`，很便宜。
       */
      let 说过静默 = false
      /**
       * 这只表**重新武装了几次**（审查 2026-09-04）。判「到点的这一响还算不算数」不能只看 `在飞`：
       * 远端确认要走一趟 SSH，那期间内核完全可能吐出一条输出——监听那边 `clearTimeout` + 重新武装了，
       * 但**已经在跑的这个回调停不下来**，探针一回来它照样能拒掉一段刚说过话的执行
       * （「内核 5 分钟没有任何动静」，而它十毫秒前才说过话）。所以每次武装记一代，
       * 每个 await 之后先看自己这一代还是不是最新的，不是就整个作废。
       */
      let 静默代 = 0
      const 武装超时 = () => {
        const 我这代 = ++静默代
        if (定时) clearTimeout(定时)
        定时 = setTimeout(() => {
          void (async () => {
            /**
             * **远端先确认**（接回，2026-09-04 定案 5）：远端没有 exit 事件，静默既可能是「死了」也可能是
             * 「R 算得正忙」（IRkernel 单线程，长计算期间连心跳都不答）。`确认活着` 只有内核运行时有：
             * `true` = 进程在、继续等、**每段只出声一次**（`reason: "silent"`，状态仍 busy）；
             * `false` = 进程真没了 → 与 `exited` 那只耳朵同一句话拒掉这段（下面）；
             * `undefined` = 本机或问不了 → 照旧 5 分钟拒（本机有 exit 事件，静默就是卡住）。
             */
            const rt = this.opts.runtime as { 确认活着?: (id: SessionId) => Promise<boolean | undefined> }
            const r = typeof rt.确认活着 === "function" ? await rt.确认活着(一.内核会话).catch(() => undefined) : undefined
            // 问的期间内核说话了（表重新武装 → 换代了），或这段已经有结果了（`在飞` 换了人 / 已结束）：这一响作废
            if (静默代 !== 我这代 || 已结束 || 一.在飞 !== 飞) return
            if (r === true) {
              if (!说过静默) {
                说过静默 = true
                const 远 = this.opts.remoteOf?.(一.对话)
                this.opts.状态变了?.(一.对话, { language: 语言, state: "busy", reason: "silent", ...(远 ? { 服务器: 远.label } : {}) })
              }
              武装超时()
              return
            }
            清理()
            /**
             * `false` = 运行时确认进程没了。**它多半已经发过 `exited`**，那条会先到常驻监听、
             * 先把这段拒掉——于是上面那三道闸就把这里挡住了，这一支根本走不到。
             * 走到它的是另一种次序：运行时确认了死、`exited` 还没传过来。
             * 那这只表就是这段执行**最后一根线**了（它刚刚被 `清理()` 停掉），
             * 这时候只 `return` 等于把 cell 挂在那儿永远转——所以照 `exited` 那只耳朵的原话拒掉。
             * 之后 `exited` 真到了再拒一次也无妨：settle 过的 promise 上再 reject 是空操作。
             */
            reject(
              r === false
                ? new Error(`${语言} 内核这一段没跑完就退出了`)
                : new Error("内核 5 分钟没有任何动静——它可能卡住或死了；可以中断后再试"),
            )
          })()
        }, 静默超时)
      }
      try {
        解开 = this.opts.runtime.attach(一.内核会话, (e) => {
          // 常驻监听已经替这段拒过了（detached / exited 先到它那儿）：同一条事件再到这里不能把表重新武装起来
          if (已结束) return
          // 收到这台的任何一条事件都把静默表清零：有动静就不算「卡住或死了」
          武装超时()
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
           * 这是快路：per-execute attach 赶上了死讯就当场拒（常驻监听是没赶上时的兜底）。
           */
          if (ev.kind === "exited") {
            清理()
            reject(new Error(`${语言} 内核这一段没跑完就退出了`))
          } else if (ev.kind === "detached") {
            // 掉线的快路（定案 6），与 exited 同一副写法；常驻监听是没赶上时的兜底
            清理()
            reject(new Error("与服务器断开，这段的结果没收到"))
          }
        })
        /**
         * 写代码前就置 busy，不等内核那条 `status: busy` 回来：
         * 真内核会发它，但要走一趟 ZMQ 才到，这一小段里笔记本看到的仍是 idle；
         * 而假运行时（测试）根本不发。先置、后写，回来的 busy 因「相同不叫」不会重复推。
         */
        this.置状态(一, "busy")
        开始了?.()
        /**
         * **最后一道兜底超时**（笔记本，2026-08-26）。常驻监听 + 快路管的是「内核真的退出了」；
         * 但内核也可能既不退出也不回 idle（卡死在某个 C 扩展里、ZMQ 丢了消息）——那时上面两条都不响，
         * 只有这只表能把 cell 从「永远转」里救出来。从送进内核这一刻起武装；之后每来一条事件就重置。
         */
        武装超时()
        this.opts.runtime.write(一.内核会话, 代码)
      } catch (e) {
        清理()
        /**
         * attach / write 当场抛（会话不在了、代码没送出去）：这一轮根本没开始，
         * 不能把 busy 留在那里——那会让笔记本永远显示「运行中」而中断又没东西可中断。
         * 已经是 exited 的（内核死了）不改回去，其余回 idle。
         */
        if (一.状态 === "busy") this.置状态(一, "idle")
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
    const 摘了: 内核语言[] = []
    for (const 一 of [...this.表.values()].filter((k) => k.对话 === 对话)) {
      // 先摘耳朵再停：stop 引出的 exited 是我们自己要的，不该再当「状态变了」推一遍
      一.解监听()
      try {
        // **`stop` 在运行时上，不在 handle 上**（tsc 当场抓住的想当然）
        await this.opts.runtime.stop(一.内核会话)
        收了.push(一.语言)
      } catch (e) {
        没收掉.push({ 语言: 一.语言, 原因: e instanceof Error ? e.message : String(e) })
      }
      this.表.delete(对话内核.键(对话, 一.语言))
      this.反查.delete(一.内核会话)
      摘了.push(一.语言)
    }
    // 列表少了几项，也是「状态变了」——**在表里删完之后叫**，回调里 `状态列表` 才看不到它。
    // 收掉是我们自己要的，不是内核退出，所以每台一次 `exited`、不带原因
    for (const 语言 of 摘了) this.opts.状态变了?.(对话, { language: 语言, state: "exited", 收掉: true })
    return { 收了, 没收掉 }
  }

  /**
   * 现在有没有活着的对话内核（审查 debug H1）。退出时 `needsGracefulShutdown`
   * 要认它——run_code 用过的内核不进 SessionManager.bound,旧的存活判断看不见它,
   * 于是退出走同步 close 分支,zeromq socket 一次没关 → `Napi::Error` + SIGABRT。
   */
  /**
   * 这一层接没接远端（远程内核，2026-09-03）。`native.ts` 决定远端会话挂不挂 `run_code` 前先问它：
   * 装配层漏了 `remoteOf`，远端会话的代码就会在**本机**起内核、对着服务器上的文件跑——
   * 而且不出声（审查 2026-09-04 抓的）。宁可那时不给工具，也不给一个跑错机器的工具。
   */
  能起远端(): boolean {
    return typeof this.opts.remoteOf === "function"
  }

  有活内核(): boolean {
    return this.表.size > 0
  }

  /**
   * 收掉所有对话的内核（审查 debug H1）。退出收摊调它——否则 python/R 进程与
   * 每台 5 个 ZMQ 端口一直留到进程被杀。逐台收,收不掉的吞掉(退出路径不该因一台卡住)。
   */
  async 收全部(): Promise<void> {
    for (const 对话 of new Set([...this.表.values()].map((k) => k.对话))) {
      await this.收(对话).catch(() => {})
    }
  }
}
