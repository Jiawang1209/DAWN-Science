/**
 * MCP 服务器名单：全局 + 项目级追加（2026-08-15）。
 *
 * 作者定的作用域是**「全局为主，项目可追加」**：
 * 常用的（数据库、文献）配一次到处能用；某个课题特有的在项目里追加。
 *
 * ## 重名不合并，也不覆盖——出声
 *
 * 两处都叫 `pg` 时，「项目的赢」和「全局的赢」都能自圆其说，
 * **而正因为两种都说得通，人就无法从配置本身看出哪个在生效**。
 * 一台连的是生产库、一台连的是本地副本，猜错的代价不对称。
 *
 * 所以这里**两个都不用，并把冲突如实报出来**（规格 7.5：不静默回退）。
 * 项目要覆盖全局的某台，就换个名字——名字会成为工具名前缀，
 * 换名字这件事本身在界面上是看得见的。
 *
 * ## 键就是工具名前缀
 *
 * 工具最终叫 `<服务器名>__<工具名>`。两台服务器各有一个 `query` 是常事，
 * **不加前缀模型就分不清这一刀该打给谁**。
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import { z } from "zod"
import { McpServerSchema, type McpServer } from "../config/schema.js"

/** 项目里那份追加名单的位置。与技能的 `.dawn/agents/` 同一个家 */
export const 项目名单文件 = join(".dawn", "mcp.yaml")

const 项目名单Schema = z
  .object({ mcp: z.record(z.string(), McpServerSchema).optional() })
  .strict()

export interface 名单项 {
  名: string
  服务器: McpServer
  /** 它是从哪儿来的。**界面要能说清楚**——「这台是项目带的」是有用的信息 */
  来自: "全局" | "项目"
}

export interface 名单结果 {
  服务器: 名单项[]
  /**
   * 出了什么问题。**不是异常，是要显示给人看的事实**：
   * 一台读不出来不该拖垮其余的（技能那一屏是同一条纪律）。
   */
  问题: string[]
}

/**
 * 合并两处名单。
 *
 * @param 全局 `providers.yaml` 里的 `mcp:` 段（已经过 schema 校验）
 * @param 工作区 当前项目的工作区路径。**不给就只有全局**——
 *   临时会话没有项目，那时「项目级」这件事根本不存在。
 */
export function 合名单(
  全局: Readonly<Record<string, McpServer>> | undefined,
  工作区?: string,
): 名单结果 {
  const 问题: string[] = []
  const 服务器: 名单项[] = []
  const 见过 = new Map<string, "全局" | "项目">()

  for (const [名, s] of Object.entries(全局 ?? {})) {
    见过.set(名, "全局")
    服务器.push({ 名, 服务器: s, 来自: "全局" })
  }

  if (!工作区) return { 服务器, 问题 }

  const 路径 = join(工作区, 项目名单文件)
  if (!existsSync(路径)) return { 服务器, 问题 }

  let 项目段: Record<string, McpServer>
  try {
    const 解出 = 项目名单Schema.parse(parse(readFileSync(路径, "utf8")) ?? {})
    项目段 = 解出.mcp ?? {}
  } catch (e) {
    /**
     * **读不出来要说清是哪份文件、错在哪**（规格 7.5）。
     * 一句「项目配置有问题」会让人对着整个目录找。
     */
    问题.push(`${项目名单文件} 读不出来：${e instanceof Error ? e.message : String(e)}`)
    return { 服务器, 问题 }
  }

  for (const [名, s] of Object.entries(项目段)) {
    const 撞了 = 见过.get(名)
    if (撞了) {
      /**
       * **两个都不用。** 「项目赢」与「全局赢」都能自圆其说——
       * 而正因为两种都说得通，人无法从配置本身看出哪个在生效。
       */
      问题.push(
        `「${名}」在全局和 ${项目名单文件} 里各有一份，两份都没有启用——` +
          `改个名字，好让「用的是哪一台」看得出来。`,
      )
      continue
    }
    见过.set(名, "项目")
    服务器.push({ 名, 服务器: s, 来自: "项目" })
  }

  /** 撞名的那台，全局那份也要一并撤下——**不能只撤一半** */
  const 撞的 = new Set(
    问题.map((q) => /^「(.+?)」在全局和/.exec(q)?.[1]).filter((x): x is string => !!x),
  )
  return { 服务器: 服务器.filter((x) => !撞的.has(x.名)), 问题 }
}

/** 工具名 = `<服务器名>__<工具名>`。**分隔符用双下划线**：单个下划线在工具名里太常见 */
export function 工具全名(服务器名: string, 工具名: string): string {
  return `${服务器名}__${工具名}`
}

/** 从工具全名倒推是哪台服务器。拆不开就返回 undefined——**不猜** */
export function 拆工具全名(全名: string): { 服务器名: string; 工具名: string } | undefined {
  const i = 全名.indexOf("__")
  if (i <= 0 || i + 2 >= 全名.length) return undefined
  return { 服务器名: 全名.slice(0, i), 工具名: 全名.slice(i + 2) }
}
