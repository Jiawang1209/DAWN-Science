/**
 * Jupyter 的 iopub 消息 → 结构化 Console 条目（②-A · K4 · S11/S12）。
 *
 * ## 为什么不是终端模拟器
 *
 * Rho **明确禁止用 xterm.js 做 R Console**，理由不是审美：
 * ANSI 字节流里的输出**不可查询、不可溯源、不可审计**。
 * 本项目已经有一条对称的边界——**xterm 只用于真 shell（托管外部 CLI），
 * REPL 一律走结构化 Console**。混用会让 REPL 的输出永久失去可查询性。
 *
 * ## 每条输出从诞生就带溯源
 *
 * S12 的原话是*「输出从诞生那一刻起就绑定溯源状态，不是事后补」*。
 * 所以这里翻译的输入是 `TaggedMessage`（已经带着三件套），
 * **翻译不产生新的溯源，只把它传下去**——中间任何一处「稍后补上」
 * 都会在某次重启或重跑后对不上。
 *
 * ## 截断要说清省了多少
 *
 * 规格 7.5：不静默截断。**「已截断」三个字帮不上任何人**——
 * 要给真数：原始多少字节、留下了多少。
 */
import type { Provenance, TaggedMessage } from "./types.js"

/**
 * 一条文本输出的字节上界。
 *
 * 100 KB 是**够用且看得完**的量级：一次 `print` 出几万行的场景确实存在
 * （循环里忘了删调试语句），那时人需要的是「知道它刷了多少」，
 * 而不是把几十兆塞进界面里。**超出的部分不是丢掉，是明说省了多少。**
 */
export const TEXT_MAX_BYTES = 100 * 1024

/**
 * 一份富输出（图/HTML）的字节上界。
 *
 * 5 MB 放得下一张相当大的 PNG（matplotlib 默认 dpi 的图通常在 100 KB 上下）。
 * **超了就不渲染，并说清它有多大**——渲染一张 50 MB 的图会让界面卡死，
 * 而「界面卡死」比「这张图太大没显示」难查得多。
 */
export const RICH_MAX_BYTES = 5 * 1024 * 1024

/**
 * 富输出的挑选顺序。**从富到朴**，第一个命中的就是要渲染的那个。
 *
 * `text/plain` 永远垫底且**永远存在**——Jupyter 规定每份 display_data
 * 都要带它作为回退。所以「挑不出东西」这件事不会发生。
 */
export const MIME_PREFERENCE = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "text/html",
  "text/markdown",
  "application/json",
  "text/plain",
] as const

export interface Truncation {
  /** 原始字节数。**真数，不是估算** */
  originalBytes: number
  /** 实际留下的字节数 */
  keptBytes: number
}

/** 富输出的共同形状。`result` 与 `display` **语义不同但载荷一样** */
export interface RichPayload {
  /** 实际选中的 mime。**界面据它决定怎么画** */
  mediaType: string
  /** 选中那一份的内容。图片是 base64（Jupyter 原样给的） */
  data: string
  /** 这份 payload 有多大。**超上界时 `data` 为空**，靠它说清为什么 */
  bytes: number
  /** 超了上界，没有渲染 */
  tooLarge?: boolean
  truncated?: Truncation
  /** 这份输出还带了哪些别的 mime。**摆出来**，人才知道有别的形态可选 */
  alsoAvailable: string[]
  provenance: Provenance
}

export type ConsoleEntry =
  | {
      kind: "stream"
      /** `stdout` / `stderr`。**两者要分开**——把报错混进正常输出会让人漏看 */
      stream: "stdout" | "stderr"
      text: string
      truncated?: Truncation
      provenance: Provenance
    }
  /**
   * **表达式的值**（`execute_result`）。与 `display` 分成两个变体而不是
   * 一个 `kind: "result" | "display"`——两者语义不同（一个是「这一句算出了什么」，
   * 一个是「代码主动要求显示什么」），而**合成一个变体会让
   * `Extract<ConsoleEntry, {kind:"display"}>` 变成 `never`**，
   * 调用方就没法按类型收窄。
   */
  | ({ kind: "result" } & RichPayload)
  /** 代码主动 `display(...)` 出来的 */
  | ({ kind: "display" } & RichPayload)
  | {
      kind: "error"
      ename: string
      evalue: string
      /** 原始 traceback 行，**带 ANSI 转义**。渲染时再处理，不在这里丢信息 */
      traceback: string[]
      provenance: Provenance
    }
  | {
      kind: "status"
      state: "busy" | "idle" | "starting"
      provenance: Provenance
    }

/**
 * 翻译一条 iopub 消息。
 *
 * **认不出的类型返回空数组**，不造一条「未知输出」——Console 是给人读的，
 * 塞进去一堆协议噪声会淹掉真正的内容。**认不出不等于要显示**，
 * 与「失败必须出声」不冲突：真正的失败走 `error` 分支。
 */
export function translateOutput(tagged: TaggedMessage): ConsoleEntry[] {
  const { message, provenance } = tagged
  const t = message.header.msg_type
  const c = message.content as Record<string, unknown>

  if (t === "stream") {
    const raw = typeof c.text === "string" ? c.text : ""
    const { text, truncated } = clampText(raw)
    return [
      {
        kind: "stream",
        // **只有 `stderr` 算 stderr**，别的一律 stdout：认不出时当正常输出，
        // 把普通输出误标成错误会让人以为出了问题
        stream: c.name === "stderr" ? "stderr" : "stdout",
        text,
        ...(truncated ? { truncated } : {}),
        provenance,
      },
    ]
  }

  if (t === "execute_result" || t === "display_data" || t === "update_display_data") {
    const bundle = (c.data ?? {}) as Record<string, unknown>
    const picked = pickMime(bundle)
    if (!picked) return []
    return [
      {
        kind: t === "execute_result" ? "result" : "display",
        ...picked,
        alsoAvailable: Object.keys(bundle).filter((m) => m !== picked.mediaType),
        provenance,
      },
    ]
  }

  if (t === "error") {
    return [
      {
        kind: "error",
        ename: str(c.ename) || "（内核没有给出错误类型）",
        evalue: str(c.evalue),
        traceback: Array.isArray(c.traceback) ? c.traceback.map(String) : [],
        provenance,
      },
    ]
  }

  if (t === "status") {
    const state = c.execution_state
    if (state === "busy" || state === "idle" || state === "starting") {
      return [{ kind: "status", state, provenance }]
    }
    return []
  }

  return []
}

/** 从 mime 包里挑一份，并把字节上界应用上 */
function pickMime(
  bundle: Record<string, unknown>,
): { mediaType: string; data: string; bytes: number; tooLarge?: true; truncated?: Truncation } | undefined {
  for (const mime of MIME_PREFERENCE) {
    const v = bundle[mime]
    if (v === undefined) continue
    // `text/plain` 与 `text/html` 有时是字符串数组（协议允许），拼起来
    const s = Array.isArray(v) ? v.map(String).join("") : typeof v === "string" ? v : JSON.stringify(v)
    const bytes = Buffer.byteLength(s, "utf8")

    // **图片超了就不渲染**：渲染一张巨图会让界面卡死，而那比「没显示」难查得多
    if (bytes > RICH_MAX_BYTES) {
      return { mediaType: mime, data: "", bytes, tooLarge: true }
    }
    // 文本类的超了就截断，**并说清省了多少**
    if (mime.startsWith("text/") || mime === "application/json") {
      const { text, truncated } = clampText(s)
      return { mediaType: mime, data: text, bytes, ...(truncated ? { truncated } : {}) }
    }
    return { mediaType: mime, data: s, bytes }
  }
  // 一个认得的 mime 都没有。**不挑一个凑合**——挑错了画出来的是乱码
  return undefined
}

/** 按字节截断。**返回真数**，不是「已截断」三个字 */
function clampText(s: string): { text: string; truncated?: Truncation } {
  const originalBytes = Buffer.byteLength(s, "utf8")
  if (originalBytes <= TEXT_MAX_BYTES) return { text: s }
  /**
   * 按**字节**切，然后修掉可能被切坏的那个多字节字符。
   *
   * 直接 `slice(0, N)` 是按 UTF-16 码元切的，对中文会切出乱码；
   * 而 `Buffer.subarray` 按字节切会把最后一个字切成半个。
   * `TextDecoder` 不带 `fatal` 时会把残缺字节变成 `�`，去掉它即可。
   */
  const cut = Buffer.from(s, "utf8").subarray(0, TEXT_MAX_BYTES)
  const text = new TextDecoder("utf-8").decode(cut).replace(/�+$/, "")
  return { text, truncated: { originalBytes, keptBytes: Buffer.byteLength(text, "utf8") } }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "")
