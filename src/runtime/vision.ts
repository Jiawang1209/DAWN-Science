/**
 * 视觉客户端（2026-08-20）。**一份，两处用**：贴图转述（`native.ts` 的
 * `writeWithImages`）与 `看图` 工具（`toolsFor`）。设计定案见
 * `specs/2026-08-20-视觉服务-design.md`。
 *
 * 就是一次 OpenAI Chat Completions 调用（`image_url` + data URI）。
 * **不引新依赖**——`fetch` 够了，这里没有流式、没有工具、没有会话。
 */
import type { ImageAttachment } from "./types.js"

export interface 视觉端点 {
  baseUrl: string
  model: string
  apiKey: string
}

/**
 * 转述用的内置提问词。**不做成配置**（作者认可）：又一个没人改的框。
 * 面向数据图表——这个应用叫 DAWN Science，图多半是坐标轴和曲线。
 */
export const 转述提问 =
  "详细描述这张图。若是图表：读出标题、坐标轴与单位、图例、数值范围与趋势、" +
  "以及任何标注或异常点。若是截图或照片：说清里面有什么、文字原样抄录。"

/** 一次视觉调用的上界。转述一张图不该比一轮对话还久 */
const 超时毫秒 = 60_000

/** 报错里引用端点回话的上界。**截断要说清省了多少**（规格 7.5） */
const 报错引用上界 = 400

export class 视觉失败 extends Error {
  constructor(message: string) {
    super(message)
    this.name = "视觉失败"
  }
}

/**
 * 把几张图交给视觉端点，拿回一段文字。
 *
 * 失败三种各自出声，**不静默回退**：
 * - 超时 → 说超了多少秒；
 * - 非 200 → 带上端点回的原话（截断要说明）;
 * - 回空 → 「回了 200 但内容是空的」——这与网络错误是两回事。
 */
export async function 描述图片(
  端点: 视觉端点,
  images: readonly ImageAttachment[],
  提问: string = 转述提问,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `${端点.baseUrl.replace(/\/+$/, "")}/chat/completions`
  const body = {
    model: 端点.model,
    // **不要流**：这一次调用要的是一段完整文字，SSE 在这儿只是复杂度
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: 提问 },
          ...images.map((i) => ({
            type: "image_url",
            image_url: { url: `data:${i.mimeType};base64,${i.data}` },
          })),
        ],
      },
    ],
  }

  const 控 = new AbortController()
  const 表 = setTimeout(() => 控.abort(), 超时毫秒)
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${端点.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: 控.signal,
    })
  } catch (err) {
    if (控.signal.aborted) {
      throw new 视觉失败(`视觉端点 ${超时毫秒 / 1000}s 没回话：${url}`)
    }
    throw new 视觉失败(`连不上视觉端点 ${url}：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(表)
  }

  if (!res.ok) {
    const 原话 = await res.text().catch(() => "")
    const 引 =
      原话.length > 报错引用上界
        ? `${原话.slice(0, 报错引用上界)}…（原文 ${原话.length} 字，只引了前 ${报错引用上界}）`
        : 原话
    throw new 视觉失败(`视觉端点回了 ${res.status}：${引 || "（响应体是空的）"}`)
  }

  const 载荷 = (await res.json().catch(() => undefined)) as
    | { choices?: { message?: { content?: unknown } }[] }
    | undefined
  const content = 载荷?.choices?.[0]?.message?.content
  const 文字 =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((c) => (typeof c === "object" && c !== null && "text" in c ? String((c as { text: unknown }).text) : ""))
            .join("")
        : ""
  if (!文字.trim()) {
    throw new 视觉失败("视觉端点回了 200，但内容是空的——模型名对吗？")
  }
  return 文字
}
