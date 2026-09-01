/**
 * 填 key 时当场验一次（B9，2026-09-01，首启审计 2026-08-28 记的）。
 *
 * 此前 `setCredential` 只存 key：随便一串字符都算「已填 deepseek ✓」，错要到第一句话才露出来，
 * 露出来的还是 pi 的 401 原话。**pi 的模型目录是本地的，它自己验不了 key**——
 * 唯一诚实的验法是把对话真会发的那条请求发一次（1 个 token），看对方怎么答。
 *
 * ## 三档，而不是对错两档
 *
 * 「对方说 401」与「根本没连上」是两件事：前者是 key 错了，后者什么都说明不了。
 * 把断网说成「key 错了」，人会去改一把好 key；把 401 说成「可能是网络」，人会一直等。
 * 所以：
 *   - `hard`：key 是错的——HTTP 401/403，或话里有鉴权字样；
 *   - `soft`：没能判定——超时、连不上、5xx、**以及一切认不出的**。认不出的**绝不**归 hard。
 *
 * ## 错误的形状从哪来（读的是装着的 pi，不是猜的）
 *
 * `问一句` 抛的是 `new Error(msg.errorMessage)`，而 `errorMessage` 由 provider 的 catch 拼：
 *   - openai-completions（deepseek / openai / 自定义端点都走它）：
 *     `@earendil-works/pi-ai/dist/api/openai-completions.js` 的 catch 调
 *     `formatProviderError(normalizeProviderError(error))`（`dist/utils/error-body.js`）——
 *     状态从 `error.status` 取、body 是 `JSON.stringify(error.error)`，message 不含整段 body 时出
 *     **`"401: {"message":"…","type":"authentication_error",…}"`**；含时原样给 `openai` SDK 的
 *     `APIError.message`，即 **`"401 Incorrect API key provided…"`**（`node_modules/openai/core/error.js` 的
 *     `makeMessage`：`${status} ${msg}`，没 body 时 `"401 status code (no body)"`）。
 *   - anthropic-messages：catch 直接给 `error.message`，`@anthropic-ai/sdk` 同一套 `makeMessage`，
 *     body 里没有顶层 message 时整段 JSON：**`"401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"`**。
 *   - 连不上：两家 SDK 都抛 `APIConnectionError`，message 是 **`"Connection error."`**（`fetch failed`
 *     藏在 `cause` 里，到这儿已经没了）；超时是 `"Request timed out."`。
 * 所以**只认开头的状态码**：`"500: upstream returned 401"` 是网关的事，不算 key 错。
 */

/**
 * 那一句暗号。**`scripts/mock-inference-server.mjs` 里抄了一份字面量**（它是 .mjs 脚本，不 import 这里）——
 * 改这句要两边一起改，假后端认的是整句相等。
 */
export const KEY_CHECK_PROMPT = "DAWN key check"

export type Key验证结果 = { kind: "ok" } | { kind: "hard"; detail: string } | { kind: "soft"; detail: string }

/** 超过这个长度的原话截掉、说清省了多少（规格 7.5：不静默截断） */
const 原话上限 = 240

/**
 * 话里有这些就是鉴权被拒——各家的原话（deepseek / openai / anthropic / 常见网关）。
 *
 * `unauthorized` 只认**独立的一个词**，且前面不是链接里的字符（`#` `/` `?` `=` `-` `_`）：
 * 限流那句话常在尾巴上挂一个 `…/errors#unauthorized` 的链接（2026-09-01 终审抓的），
 * 那不是在说 key。认不出的归 soft，比把一把好 key 说成错了便宜。
 */
const 鉴权字样 = /invalid[ _-]?api[ _-]?key|incorrect api key|authentication[_ ]?(?:error|fail)|invalid x-api-key|(?<![#/?=_&-])\bunauthorized\b|invalid_api_key|api key[^.]{0,40}invalid/i

/** 归类一次失败。**永远不抛**——它是给 catch 用的 */
export function 归类key错误(err: unknown): Exclude<Key验证结果, { kind: "ok" }> {
  const 原话 = err instanceof Error ? err.message : String(err)
  const 状态 = 开头的状态码(原话)
  const hard = 状态 === 401 || 状态 === 403 || (状态 === undefined && 鉴权字样.test(原话))
  return { kind: hard ? "hard" : "soft", detail: 截(人话(原话)) }
}

function 开头的状态码(原话: string): number | undefined {
  const m = /^\s*(\d{3})(?:[:\s]|$)/.exec(原话)
  return m ? Number(m[1]) : undefined
}

/**
 * `401: {"message":"…"}` 这种，把 JSON 里的那句话抠出来；抠不出就原样。
 * 显示给人看的是「Authentication Fails, Your api key … is invalid」，不是一段带引号的 JSON。
 */
function 人话(原话: string): string {
  const 起 = 原话.indexOf("{")
  if (起 < 0) return 原话.trim()
  try {
    const j = JSON.parse(原话.slice(起)) as unknown
    const 取 = (o: unknown): string | undefined => {
      if (typeof o !== "object" || o === null) return undefined
      const r = o as { message?: unknown; error?: unknown }
      if (typeof r.message === "string" && r.message) return r.message
      return 取(r.error)
    }
    return 取(j) ?? 原话.trim()
  } catch {
    return 原话.trim()
  }
}

function 截(s: string): string {
  if (s.length <= 原话上限) return s
  return `${s.slice(0, 原话上限)}…（省略 ${s.length - 原话上限} 字）`
}

type 问一句 = (
  目标: { provider: string; model: string },
  req: { user: string; maxTokens: number; temperature?: number; signal?: AbortSignal },
) => Promise<{ text: string; model: string }>

/**
 * 发那条最小的请求，到点放弃。
 *
 * 超时**两手都用**：拉 `AbortSignal` 让肯听的对方停下，再 `race` 一个计时器——
 * 不听信号的实现（或卡在 DNS 上的 fetch）也不能把「保存」一直吊着。
 * 超时归 `soft`，detail 里带秒数，调用方据此挑 msgid。
 */
export async function 验一次key(
  问: 问一句,
  目标: { provider: string; model: string },
  timeoutMs: number,
): Promise<Key验证结果 | { kind: "timeout"; seconds: number }> {
  const 控 = new AbortController()
  let 计时: ReturnType<typeof setTimeout> | undefined
  const 到点 = new Promise<{ kind: "timeout"; seconds: number }>((r) => {
    计时 = setTimeout(() => {
      控.abort()
      r({ kind: "timeout", seconds: Math.round(timeoutMs / 1000) })
    }, timeoutMs)
  })
  try {
    const 结果 = await Promise.race([
      问(目标, { user: KEY_CHECK_PROMPT, maxTokens: 1, temperature: 0, signal: 控.signal }).then(
        (): Key验证结果 => ({ kind: "ok" }),
        (e: unknown): Key验证结果 => 归类key错误(e),
      ),
      到点,
    ])
    // 信号已拉 = 是我们放弃的：对方因 abort 抛的「已取消」不算它的话，别拿去归类
    return 控.signal.aborted ? { kind: "timeout", seconds: Math.round(timeoutMs / 1000) } : 结果
  } finally {
    if (计时) clearTimeout(计时)
  }
}
