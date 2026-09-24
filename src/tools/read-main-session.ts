/**
 * `read_main_session`：侧边对话看主对话此刻的进展（2026-09-24，spec `2026-09-24-侧边对话-design.md`）。
 *
 * **只读**：它从不改主对话的任何状态。**每次现读**：主对话往前走一步，下次读到的就是新的。
 * 每段 native 会话都装上但默认停用——挂进坞时才启用（`NativeRuntime.setSideTool`），
 * 平时模型看不见它，就不会乱调。停用与「查不到主对话」是两件事：后者如实报错，不读错一段。
 */
import { Type } from "typebox"
import type { SessionId } from "../runtime/types.js"

export const READ_MAIN_SESSION = "read_main_session"

interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: undefined
}

export function createReadMainSessionTool(opts: {
  对话: SessionId
  /** 给侧边 id，回主对话摘要；此刻不是侧边 / 主对话不在 → undefined */
  读: (sideId: SessionId) => string | undefined
}) {
  return {
    name: READ_MAIN_SESSION,
    label: READ_MAIN_SESSION,
    description:
      "读取主对话（主区里那段）此刻的进展：最近几轮的问与答、正在跑的工具与已跑时长、待发条上排着的话、生成过的文件。" +
      "用户问「主对话做到哪了 / 跑得怎么样」时调用。只读，不能向主对话发话。",
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: unknown): Promise<ToolResult> {
      // 每次调用都现查：配对是后端对照表的事，这里不缓存「我是谁的侧边」
      const s = opts.读(opts.对话)
      if (s === undefined) {
        return {
          content: [{ type: "text", text: "你现在不在坞里（或者主区此刻没有对话），没有主对话可看。" }],
          isError: true,
          details: undefined,
        }
      }
      return { content: [{ type: "text", text: s }], details: undefined }
    },
  }
}
