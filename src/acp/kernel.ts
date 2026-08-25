/**
 * `dawn_run_in_kernel`——四件工具里最有分量的一件（B1·B′，2026-08-17）。
 *
 * ## 它凭什么值得给
 *
 * 那个 ACP agent 自己有 bash，它当然能 `python -c "..."`。
 * 但那样跑出来的东西，**在 DAWN 这边什么都不剩**：
 *
 * | | 它自己的 bash | 这条路 |
 * |---|---|---|
 * | 变量留得住 | 不——每次一个新进程 | 留得住，同一段内核 |
 * | 输出 | 一坨 stdout | 分得出 stdout / 报错 / 图 |
 * | 环境证据 | 没有 | 有，账本上那条 Run 带着快照 |
 *
 * 第三条才是重点：**不变式 5 说「文件事实不听 agent 的自述」**，
 * 而一段跑在我们内核里的代码，我们本来就有它的一切。
 *
 * ## 为什么单独一个文件
 *
 * 另外三件工具都是「查一下」，这一件要**起一段活着的会话**、
 * 要等它跑完、要在超时的时候说清楚。它认识的东西比另外三件多一档，
 * 所以能力**全部注入**——这个文件不认识 SessionManager，也不认识 registry。
 */

/** 一条能给模型看的内核输出。与 `kernel/outputs.ts` 的 `ConsoleEntry` 同形，但只取我们要的那几支 */
export type 内核条目 =
  | { kind: "stream"; stream: "stdout" | "stderr"; text: string }
  | { kind: "result" | "display"; mediaType: string; data: string; bytes?: number }
  | { kind: "error"; ename: string; evalue: string; traceback: string[] }
  | { kind: "status"; state: "busy" | "idle" | "starting" }
  | { kind: string }

export interface 内核装配 {
  /**
   * 这门语言配了哪个内核 agent。**没配就返回 undefined**——
   * 那时这件工具会如实说「没配」，而不是悄悄换一门语言跑。
   */
  找内核: (language: "python" | "R") => string | undefined
  /** 这段 ACP 会话属于哪个项目、工作目录在哪 */
  归属: (sessionId: string) => { projectId: string; workspace: string } | undefined
  /** 开一段内核会话，返回它的 sessionId */
  开一段: (agentId: string, workspace: string, projectId: string) => Promise<string>
  /** 那段会话还活着吗。**死了要重开**——不然写进去的代码没有任何人收 */
  还活着: (sessionId: string) => boolean
  /** 订阅一段会话的内核输出。返回退订 */
  订: (sessionId: string, 收: (e: 内核条目) => void) => () => void
  /** 把代码发进去 */
  发: (sessionId: string, code: string) => void
  /** 等多久算超时。默认两分钟 */
  超时毫秒?: number
}

/** 单条输出翻成给模型看的文本。**图不塞 base64**——几百 KB 的噪声换不来一点信息 */
function 一条(e: 内核条目): string | undefined {
  if (e.kind === "stream") {
    const s = e as Extract<内核条目, { kind: "stream" }>
    return s.stream === "stderr" ? `[stderr] ${s.text}` : s.text
  }
  if (e.kind === "result" || e.kind === "display") {
    const r = e as Extract<内核条目, { kind: "result" | "display" }>
    if (r.mediaType.startsWith("image/")) {
      /**
       * **图要说一声，但不给内容。**
       *
       * 不说的话模型会以为这一句什么都没产生，于是重跑一遍；
       * 把 base64 给它则是拿几百 KB 换一句「有张图」。
       */
      return `[${r.mediaType}，${r.bytes ?? 0} 字节，已经在 DAWN 里画出来了]`
    }
    return r.data
  }
  if (e.kind === "error") {
    const x = e as Extract<内核条目, { kind: "error" }>
    /** traceback **原样给**——它是给模型改代码用的，删掉等于让它猜 */
    return `${x.ename}: ${x.evalue}\n${x.traceback.join("\n")}`
  }
  return undefined
}

export function 建跑内核(装配: 内核装配) {
  /**
   * 一段 ACP 会话配一段内核会话。**复用是这件工具的意义所在**——
   * 每次新开一段的话，上一句 `import pandas` 就白做了。
   */
  const 用过的 = new Map<string, string>()
  /**
   * 正在开的那一段(审查 debug H4)。**懒起是 TOCTOU**:两次并发同一 `sessionId|language`
   * 都看到没有活内核,各 `await 开一段` 起一台,后者覆盖 `用过的`、前者成了泄漏的孤儿内核。
   * 记住「正在开」的 promise,第二个调用等同一个,而不是再开一台。
   */
  const 开中 = new Map<string, Promise<string>>()
  /**
   * 上一次在这段内核上**等超时了**。
   *
   * 超时之后那一句还在内核里跑，而内核是**顺序执行**的：下一次写进去的代码
   * 要排在它后面。于是下一次订上去看到的第一段 `busy → idle`，
   * 收的很可能是**上一次的尾巴**。
   *
   * 三条路里选了说清楚这一条：重开内核会毁掉用户跑了一半的东西；
   * 一直等下去会把这次调用也挂住；**而不声不响地把上一次的输出
   * 当成这一次的答案，是三者里唯一会让人得出错误结论的**。
   */
  const 上次超时的 = new Set<string>()

  return async (
    sessionId: string,
    language: "python" | "R",
    code: string,
  ): Promise<{ 文本: string; 出错?: boolean }> => {
    const agentId = 装配.找内核(language)
    /**
     * **如实说「没配」**（规格 7.5）。
     *
     * 换一门配了的语言跑，是这件事上最坏的一种「帮忙」：
     * 模型会拿着一段 R 的结果当 Python 的结果往下推。
     */
    if (!agentId) {
      throw new Error(
        `这台 DAWN 没有配 ${language} 的内核 agent，跑不了。（配置里要有一个 kind: kernel、language: ${language} 的 agent）`,
      )
    }
    const 归 = 装配.归属(sessionId)
    if (!归) throw new Error("这段会话不属于任何项目，起不了内核")

    const 键 = `${sessionId}|${language}`
    let 内核 = 用过的.get(键)
    // **死了要重开**：写进一段死会话等于代码掉进地里，而且没有任何人会说话
    if (!内核 || !装配.还活着(内核)) {
      // TOCTOU 收口(H4):已经有人在开同一段就等它,不再开第二段(否则前一台泄漏成孤儿)
      let p = 开中.get(键)
      if (!p) {
        p = 装配.开一段(agentId, 归.workspace, 归.projectId)
        开中.set(键, p)
        p.then((k) => 用过的.set(键, k)).catch(() => {}).finally(() => 开中.delete(键))
      }
      内核 = await p
    }

    const 收到: string[] = []
    const 前情 = 上次超时的.delete(内核)
      ? "[DAWN] 上一次在这段内核上等超时了，那一句可能还在跑——下面这些输出里可能混着它的尾巴。\n"
      : ""
    let 出错 = false
    let 跑起来了 = false

    return await new Promise<{ 文本: string; 出错?: boolean }>((成) => {
      const 停 = setTimeout(() => {
        上次超时的.add(内核 as string)
        收(
          [
            前情,
            ...收到,
            `[DAWN] 等了 ${Math.round((装配.超时毫秒 ?? 120_000) / 1000)} 秒它还没跑完，先把已经出来的给你。` +
              "内核还在跑，变量之后还在。",
          ].join(""),
          true,
        )
      }, 装配.超时毫秒 ?? 120_000)

      const 退订 = 装配.订(内核 as string, (e) => {
        if (e.kind === "status") {
          const st = (e as Extract<内核条目, { kind: "status" }>).state
          if (st === "busy") {
            跑起来了 = true
            return
          }
          /**
           * **要先 busy 再 idle 才算跑完。**
           *
           * 订上去那一刻内核多半就是 idle 的（上一句刚跑完），
           * 见 idle 就收的话，这一次一个字都收不到就返回了。
           */
          if (st === "idle" && 跑起来了) 收(前情 + 收到.join(""), 出错)
          return
        }
        if (e.kind === "error") 出错 = true
        const t = 一条(e)
        if (t !== undefined) 收到.push(t)
      })

      装配.发(内核 as string, code)

      function 收(文本: string, 错: boolean): void {
        clearTimeout(停)
        退订()
        /**
         * **一个字都没有也要说一声**。返回空串的话，模型看到的是
         * 「工具成功了，内容为空」——它分不出这是「没输出」还是「工具坏了」。
         */
        成({ 文本: 文本.trim() || "（跑完了，没有任何输出）", ...(错 ? { 出错: true } : {}) })
      }
    })
  }
}
