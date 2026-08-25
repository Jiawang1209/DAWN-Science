/**
 * 把 MCP 服务器的工具做成 pi 的自定义工具（2026-08-15）。
 *
 * 接缝与 `run_code` 是同一条（`native.ts` 的 `toolsFor` → `customTools`），
 * 这条路已经被 ② 走通过一次，所以这里几乎没有新机制——**只有三条纪律**：
 *
 * ① **入参 schema 原样转交，不翻译。** MCP 给的是 JSON Schema，
 *    pi 的自定义工具收的也是 JSON Schema（typebox 的产物就是它）。
 *    中间加一层翻译，就多一个「翻错了但没人发现」的地方。
 *
 * ② **过门。** MCP 工具是从网上装来的第三方进程，`query` 可能是只读查询，
 *    也可能是 `DROP TABLE`——**我们看不见它内部干什么**。所以默认拦，
 *    除非那台被过目过（`trusted`）。判据在 `policy/permissions.ts`，
 *    不在这里：策略只有一个家。
 *
 * ③ **拒绝要回 `isError`，不要抛异常。** 抛异常会中断整轮，模型学不到
 *    「这条被拒了」——这是 Spike A-2 实测确认过的，内置工具那条包装里
 *    写着同一句话。
 */
import type { McpServer } from "../config/schema.js"
import { mcp指纹 } from "../policy/permissions.js"
import type { MCP池, MCP工具 } from "../mcp/客户端.js"

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

export interface MCP工具装配 {
  池: MCP池
  /** 这段会话能用哪几台。**由调用方算好**——名单合并是另一件事 */
  名单: readonly { 名: string; 服务器: McpServer }[]
  /** 已经列出来的工具（`备好` 的产物） */
  工具: readonly MCP工具[]
  /** 这段会话的工作区。**服务器没写 `cwd` 时用它** */
  工作区?: string | undefined
  /**
   * 门。返回一句话即为拒绝。**只收服务器名**——
   * 「这台信不信得过」由门自己去本机的设置库里取，
   * 不从配置里读：项目级名单会跟着仓库被 clone，
   * 让它声明自己可信等于没有门（见 `policy/permissions.ts`）。
   */
  门?: ((服务器名: string, 指纹: string) => import("../policy/permissions.js").门的决定) | undefined
  /** 「问一句」档时问人（2026-08-23）。不给就把 ask 当拒 */
  问?: ((title: string, reason: string) => Promise<"allow" | "deny" | "timeout">) | undefined
}

/**
 * 造出一组 pi 自定义工具。
 *
 * **一台服务器的每个工具各自成一个**，不是一个 `mcp` 大工具带个 `tool` 参数：
 * 后者会让模型看不见有哪些工具、也看不见每个工具要什么参数——
 * 而那正是 MCP 的全部价值所在。
 */
export function createMcpTools(装配: MCP工具装配): unknown[] {
  const 配表 = new Map(装配.名单.map((x) => [x.名, x.服务器]))

  return 装配.工具.map((t) => {
    const 配 = 配表.get(t.服务器名)
    return {
      name: t.全名,
      label: t.全名,
      /**
       * **描述里点明它来自哪台服务器。**
       * 模型看到的是 `pg__query`，而「pg 是什么」只有这里说得清；
       * 不说的话它只能按名字猜这台是干什么的。
       */
      description: `【来自 MCP 服务器「${t.服务器名}」】${t.描述}`,
      parameters: t.入参,

      async execute(_toolCallId: string, params: Record<string, unknown>): Promise<ToolResult> {
        if (!配) {
          // **名单里没有它**：配置改过而工具清单还是旧的。如实说，不猜
          return text(`「${t.服务器名}」已经不在名单里了，这个工具不能用。`, true)
        }
        const 决定 = 装配.门?.(t.服务器名, mcp指纹(配 as { command?: string; args?: readonly string[]; url?: string }))
        if (决定?.kind === "deny") return text(决定.reason, true)
        if (决定?.kind === "ask") {
          const 答 = 装配.问 ? await 装配.问(`${t.服务器名} · ${t.工具名}`, 决定.reason) : "deny"
          if (答 !== "allow") return text(`${决定.reason}${答 === "timeout" ? "（等了 5 分钟没有人回答，按拒绝处理）" : "（人拒绝了这一次）"}`, true)
        }

        const r = await 装配.池.调(t.服务器名, 配, t.工具名, params ?? {}, 装配.工作区)
        /**
         * **工具报错不标 `isError`。**
         *
         * 与 `run_code` 同一条：模型要看着错误改参数再来一次，
         * 而有些实现看到 `isError` 会直接中断这一轮。
         * 但**要说清是哪台服务器报的**——同时挂着几台时，
         * 「这个错是谁报的」不能靠猜。
         */
        return text(`[${t.服务器名}]${r.出错了 ? "（这个工具报错了）" : ""}\n${r.文字}`)
      },
    }
  })
}
