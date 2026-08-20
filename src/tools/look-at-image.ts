/**
 * `看图`：让**目录里没声明收图的模型**看一眼工作区里的图
 * （2026-08-20，视觉服务的缝二；设计定案见 `specs/2026-08-20-视觉服务-design.md`）。
 *
 * 它自己画出 `figures/fig3.png` 之后可以调这个工具检查——
 * 否则它永远检查不了自己画的图。**收图的模型不注册它**：
 * 那些自己能看，多一个工具只会让它绕路。
 *
 * 图不进上下文：交给视觉端点转述，回来的是文字（与 `run_code` 对图的
 * 态度同一条理由——多数模型在工具结果里也看不到图）。
 */
import { Type } from "typebox"
import { readFileSync, statSync } from "node:fs"
import { extname } from "node:path"
import { resolveInWorkspace, IMAGE_MAX_BYTES, mediaTypeOf } from "../files/access.js"
import { 解析远端路径 } from "../remote/tools.js"
import { 描述图片, type 视觉端点 } from "../runtime/vision.js"
import type { RemoteLike } from "../runtime/types.js"

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
  path: Type.String({ description: "图片在工作区里的相对路径，例如 figures/fig3.png" }),
  question: Type.Optional(
    Type.String({ description: "想知道什么。不给就要一份面向数据图表的详细描述" }),
  ),
})

/** 视觉端点认得的图片类型。**别的格式如实拒绝**，不猜 */
const 认得的 = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

export function createLookAtImageTool(opts: {
  /** 现取现用：设置里改了配置，下一次调用就用新的 */
  端点: () => 视觉端点 | undefined
  workspace: string | undefined
  remote?: { executor: RemoteLike; cwd: { get(): string } } | undefined
}) {
  return {
    name: "look_at_image",
    label: "look_at_image",
    description:
      "看一眼工作区里的一张图（PNG/JPEG/GIF/WebP），回来的是详细的文字描述。" +
      "你在工具结果里看不到图片本身，所以画完图之后用它检查。" +
      "可以带一个具体的问题，例如「这条曲线是否单调上升」。",
    parameters,

    async execute(_toolCallId: string, params: { path?: unknown; question?: unknown }): Promise<ToolResult> {
      const p = typeof params.path === "string" ? params.path.trim() : ""
      if (!p) return text("path 是空的——要看哪张图？", true)
      const 端点 = opts.端点()
      // 会话开着的时候设置里把视觉关了：**说清楚**，不装作工具不存在
      if (!端点) return text("视觉服务此刻没有配置好（设置 → 模型 → 视觉服务）。", true)

      const mediaType = mediaTypeOf(p)
      if (!认得的.has(mediaType)) {
        return text(
          `${p} 按后缀是 ${mediaType}（${extname(p) || "没有后缀"}），不是视觉端点认得的图片格式。`,
          true,
        )
      }

      let 字节: Buffer
      try {
        if (opts.remote) {
          const 全 = 解析远端路径(opts.remote.cwd.get(), p)
          字节 = await opts.remote.executor.readFile(全)
        } else if (opts.workspace) {
          const 全 = resolveInWorkspace(opts.workspace, p)
          const st = statSync(全)
          if (st.size > IMAGE_MAX_BYTES) {
            return text(
              `${p} 有 ${Math.round(st.size / 1024 / 1024)} MB，超过 ${IMAGE_MAX_BYTES / 1024 / 1024} MB 的上界。`,
              true,
            )
          }
          字节 = readFileSync(全)
        } else {
          return text("这段会话没有工作区，没有地方可以读图。", true)
        }
      } catch (e) {
        return text(`读不了 ${p}：${e instanceof Error ? e.message : String(e)}`, true)
      }
      // 远端读回来才知道大小，同一条上界
      if (字节.length > IMAGE_MAX_BYTES) {
        return text(
          `${p} 有 ${Math.round(字节.length / 1024 / 1024)} MB，超过 ${IMAGE_MAX_BYTES / 1024 / 1024} MB 的上界。`,
          true,
        )
      }

      try {
        const q = typeof params.question === "string" && params.question.trim() ? params.question.trim() : undefined
        const 描述 = await 描述图片(端点, [{ data: 字节.toString("base64"), mimeType: mediaType }], q)
        return text(`[${端点.model} 转述 ${p}]\n${描述}`)
      } catch (e) {
        // 视觉端点的失败**原样给模型**：它据此决定重试还是放弃，不替它猜
        return text(e instanceof Error ? e.message : String(e), true)
      }
    },
  }
}
