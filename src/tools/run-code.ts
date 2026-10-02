/**
 * `run_code`：让 agent 在对话自己的内核里跑代码（②，2026-08-14）。
 *
 * ## 它与 `bash` 的差别只有一个字：状态
 *
 * `bash` 每次是新进程——读进来的 DataFrame 跑完就没了。
 * 而做 EDA 是连续的：读、看一眼、改一改、再画张图。
 * **每一步重新加载一遍数据不是分析，是折磨。**
 *
 * 这也是我们与通用 agent 的分野。实测 Codex 执行相关的内置工具只有
 * `shell` 与 `write_stdin`——它靠「长驻进程 + 往 stdin 喂代码」得到状态，
 * 那是**没有内核的人的解法**：图只能拿到 `<Figure ...>` 那行字。
 *
 * ## 给模型的是文字，图不进上下文
 *
 * 一张 PNG 几十上百 KB，塞进 tool result 既烧 token 又没用
 * （多数模型在工具结果里看不到图）。所以这里回的是
 * **「生成了一张 image/png」**，而图本身走转录，人眼看得见。
 * **不说清的话，模型会以为自己没画出图而反复重画。**
 */
import { Type } from "typebox"
import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent"
import { 截给模型 } from "../runtime/tool-output.js"
import type { SessionId } from "../runtime/types.js"
import type { 内核语言, 对话内核 } from "../kernel/挂载.js"

interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: undefined
}

const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: s }],
  ...(isError ? { isError: true } : {}),
  details: undefined,
})

const parameters = Type.Object({
  language: Type.Union([Type.Literal("python"), Type.Literal("R")], {
    description: "在哪门语言的内核里跑。两门可以同时挂着，各有各的变量",
  }),
  code: Type.String({ description: "要执行的代码" }),
})

interface Params {
  language?: unknown
  code?: unknown
}

/** 条目的最小形状。**只认用得上的字段**，其余原样留给转录 */
interface 条目 {
  kind: string
  stream?: string
  text?: string
  ename?: string
  evalue?: string
  traceback?: string[]
  mediaType?: string
  tooLarge?: boolean
  data?: string
  truncated?: { originalBytes: number; keptBytes: number }
  textFallback?: { text: string; truncated?: { originalBytes: number; keptBytes: number } }
}

/**
 * 把一轮输出翻成给模型看的文字。
 *
 * **报错要给 traceback**：只给 `ename: evalue` 的话，模型改不动代码——
 * 它需要知道错在哪一行。
 */
export function 摘要(输出: readonly unknown[]): { 文字: string; 出错了: boolean } {
  const 行: string[] = []
  let 出错了 = false
  for (const one of 输出 as 条目[]) {
    if (one.kind === "stream" && one.text) {
      // stdout 与 stderr 分开标：**混在一起会让人漏看报错**
      行.push(one.stream === "stderr" ? `[stderr] ${one.text}` : one.text)
    } else if (one.kind === "error") {
      出错了 = true
      const tb = (one.traceback ?? []).join("\n")
      行.push(`${one.ename ?? "错误"}: ${one.evalue ?? ""}${tb ? `\n${tb}` : ""}`)
    } else if (one.kind === "result" || one.kind === "display") {
      const 型 = one.mediaType ?? "未知类型"
      if (one.tooLarge) {
        if (!型.startsWith("image/") && one.textFallback) {
          行.push(one.textFallback.text)
          const 截断 = one.textFallback.truncated
          if (截断) 行.push(`（内核输出已截断：原始 ${截断.originalBytes} 字节，保留 ${截断.keptBytes} 字节）`)
        }
        行.push(`（一份 ${型} 输出，太大没有渲染）`)
      } else if (型.startsWith("image/")) {
        行.push(`（生成了一张 ${型}，已经显示在对话里；图本身不放进这里）`)
      } else if (型.startsWith("text/") || 型 === "application/json") {
        const 内容 = one.textFallback?.text ?? one.data
        if (内容) 行.push(内容)
        else 行.push(`（一份 ${型} 输出，已经显示在对话里）`)
        const 截断 = one.textFallback ? one.textFallback.truncated : one.truncated
        if (截断) 行.push(`（内核输出已截断：原始 ${截断.originalBytes} 字节，保留 ${截断.keptBytes} 字节）`)
      } else {
        行.push(`（一份 ${型} 输出，已经显示在对话里）`)
      }
    }
    // `status` 不进摘要：它是边界记号，不是内容
  }
  const 文字 = 行.join("\n").trim()
  /**
   * **给模型的那份有上限**（2026-09-27，spec D6）：与 pi 自带 bash 同一个数（`DEFAULT_MAX_BYTES`，50 KB）。
   * 此前不截：一句 `print(df)` 打出十万行，一步就能把上下文撑爆——而那段落在「最近要保留」的一截里，压缩也救不了。
   */
  const 截 = 截给模型(文字, DEFAULT_MAX_BYTES, "变量还在内核里：只看前几行（Python `df.head()`、R `head(df)`）、切片或看长度，不要整份打印")
  return {
    // **什么都没输出也要说一声**：一片空白会被读成「没跑」
    文字: 截.text || "（这段代码没有产生任何输出）",
    出错了,
  }
}

/**
 * 追加进系统提示的那一句（只在装配给了 `kernels` 时，见 `native.ts` 的 `appendSystemPromptOverride`）。
 *
 * **为什么不写进项目的 `AGENTS.md`**：那段「脚本与 notebook → analysis/scripts/」是作者原话、
 * 初始化时写进每个项目，改它管不到已有的项目；而正是那段把项目会话的 agent 引向了写脚本——
 * 2026-08-27 翻作者 `tmp_20260819` 的转录：五次 bash、一次 write，直到作者自己在笔记本里敲了一格。
 */
export const 内核指引 =
  "探索、看数据、画图、验证一段逻辑：用 run_code（内核活着，变量保留，用户在右侧的笔记本面板里看得见）。" +
  "只有用户明确要一个可复用的文件时才把脚本写到 analysis/scripts/——写完也可以在 run_code 里跑一遍给用户看。"

/**
 * 发了中断之后最多等内核这么久回到空闲（2026-09-25）。**等不到就先把结果交还 pi**：这一轮必须停得下来——
 * 不然「停止」与「调整方向」都会跟着一台卡在不理 SIGINT 的 C 扩展里的内核一起卡住。内核那头如实说「可能还在跑」。
 */
export const 中断后最多等 = 10_000

export function createRunCodeTool(opts: {
  /** 这一轮属于哪个对话。**由调用方绑死**，不让模型自己指定 */
  对话: SessionId
  内核: 对话内核
  /** 测试用：覆盖 `中断后最多等` */
  中断等待毫秒?: number
  /** 只约束已经送达的本轮消息；未指定时保留自动选语言的行为。 */
  允许语言?: () => readonly 内核语言[] | undefined
}) {
  return {
    name: "run_code",
    label: "run_code",
    description:
      "在这段对话自己的内核里跑一段 Python 或 R 代码。**内核是活的**：" +
      "上一次读进来的 DataFrame、拟合好的模型都还在，下一次可以直接用——" +
      "所以做数据分析用这个，不要用 bash 每次重跑一遍。" +
      "两门语言可以同时挂着，各有各的变量。图会显示在对话里。" +
      // 2026-08-27（fix-notebook）：作者的项目会话里 agent 把「在笔记本里显示」理解成了装 jupyter
      "用户说的「笔记本」「notebook」「在笔记本里跑/显示」指的就是这个工具——" +
      "代码和输出会显示在界面右侧的笔记本面板里。不要去装 jupyter / nbformat，也不要生成 .ipynb 文件来代替。" +
      /**
       * 远端会话（远程内核，2026-09-03）。两句都是模型会踩的坑：
       * ①它会以为内核在本机、于是先 `scp` 一份数据过来；
       * ②「请用户选一个解释器」是**一句要转告的话**，不是一次可以换个路径重试的失败——
       * 挑错了的话变量都在另一台内核里，而那正是定案 1 不让 agent 自己挑的理由。
       */
      "远端会话里内核在那台服务器上起，代码与文件在同一台机器；内核的工作目录是它起来时会话所在的目录，之后 cd 不会移动它。" +
      "如果工具回「请用户选一个解释器」，把这句话转告用户并等待，不要自己猜路径重试。",
    parameters,

    async execute(_toolCallId: string, params: Params, signal?: AbortSignal): Promise<ToolResult> {
      const 语言 = params.language
      if (语言 !== "python" && 语言 !== "R") {
        return text(`language 要给 "python" 或 "R"，收到的是 ${JSON.stringify(语言)}。`, true)
      }
      const lang = 语言 as 内核语言
      const allowed = opts.允许语言?.()
      if (allowed && !allowed.includes(lang)) return text(`本次消息指定使用 ${allowed.join("、")}，请用允许的语言调用 run_code。`, true)
      const code = typeof params.code === "string" ? params.code : ""
      if (!code.trim()) return text("code 是空的，没有东西可以跑。", true)

      /**
       * **中止要真停内核**（2026-09-25，调整方向 spec §4.1）。此前这里不收 `signal`：按「停止」时 pi 等着这个工具返回，
       * 而这个工具等着内核跑完——停止键按下去，这一轮停不下来，内核里那段照跑。
       *
       * 三种情形：
       *   - 进来时已经中止 → 不跑；
       *   - 还排在别的段后面（你在笔记本里敲的那格在跑）→ 马上交还，轮到它时 `执行` 也不写进去；
       *   - 已经在内核上跑 → 对**那台**内核发中断（与笔记本「中断」、协议 `interruptKernel` 同一个 `对话内核.中断`），
       *     等它回到空闲，已经吐出来的输出照写；`中断后最多等` 还不回来就先交还。
       */
      if (signal?.aborted) return text("这一轮已经停了，这段代码没有跑。", true)
      const 等多久 = opts.中断等待毫秒 ?? 中断后最多等
      let 已开始 = false
      /** 发过中断就有它：resolve 成发不出去的原因，发出去了是 undefined */
      let 中断: Promise<string | undefined> | undefined
      let 放手!: (why: "没跑" | "超时") => void
      const 放手了 = new Promise<"没跑" | "超时">((r) => (放手 = r))
      const 跑 = opts.内核.执行(opts.对话, lang, code, {
        开始了: () => {
          已开始 = true
        },
        ...(signal ? { signal } : {}),
      })
      // 排着时被中止、先交还了 pi：轮到它时 `执行` 会拒掉，那个拒没人等——接住，别成未处理的 rejection
      跑.catch(() => {})
      const 发中断 = () => {
        if (中断) return
        中断 = opts.内核.中断(opts.对话, lang).then(
          () => undefined,
          (e: unknown) => (e instanceof Error ? e.message : String(e)),
        )
        const 表 = setTimeout(() => 放手("超时"), 等多久)
        void 跑.finally(() => clearTimeout(表)).catch(() => {})
      }
      const 听 = () => (已开始 ? 发中断() : 放手("没跑"))
      signal?.addEventListener("abort", 听, { once: true })

      try {
        const r = await Promise.race([跑, 放手了])
        if (r === "没跑") return text("这一轮已经停了，这段代码排在内核里还没轮到，没有跑。", true)
        if (r === "超时") {
          const 错 = await 中断
          return text(
            `[${lang} 内核]（已中断）\n` +
              (错
                ? `中断没发出去：${错}`
                : `发了中断，内核 ${Math.round(等多久 / 1000)} 秒还没停下——它可能还在跑。`) +
              "笔记本面板里看得到它的状态，也可以在那儿再按一次「中断」。",
            true,
          )
        }
        const { 文字, 出错了 } = 摘要(r.输出)
        if (中断) {
          const 错 = await 中断
          // 被中断的输出里多半有一条 KeyboardInterrupt（R 没有 ename）——照写，模型要知道停在了哪
          return text(`[${lang} 内核]（已中断）${错 ? `\n中断没发出去：${错}` : ""}\n${文字}`)
        }
        /**
         * **代码报错不是工具失败**：模型要看着 traceback 改代码，
         * 把它标成 `isError` 会让有些实现直接中断这一轮。
         * 但**要说清是哪门语言**——两个内核同时挂着时，
         * 「这个错是谁报的」不能靠猜（定案 3）。
         */
        return text(`[${lang} 内核]${出错了 ? "（代码报错）" : ""}\n${文字}`)
      } catch (e) {
        if (signal?.aborted && !已开始) return text("这一轮已经停了，这段代码没有跑。", true)
        /**
         * 起不来、或内核中途死了。**原样说出来**：
         * 「没配 Python 解释器」与「内核崩了」是两回事，
         * 笼统回一句「跑不了」会让模型反复试同一条死路。
         */
        return text(e instanceof Error ? e.message : String(e), true)
      } finally {
        signal?.removeEventListener("abort", 听)
      }
    },
  }
}
