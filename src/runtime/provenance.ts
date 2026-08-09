/**
 * 逐次工具调用的溯源（①-B″ · R3）。
 *
 * **不变式 5 的物理载体。**
 *
 * `git-facts.ts` 已经能回答「**这个会话**从开始到现在改了哪些文件」。
 * 但那个粒度回答不了真正要紧的问题：**是哪一次工具调用改的。**
 * 没有这一层，「产出从 git 事实算，不听 agent 声明」只是一句口号——
 * 你能证明"有人改了 a.ts"，证明不了"是那次 write 改的"。
 *
 * ## 钩子挂在哪：包装工具定义，不用 pi 的文件扩展
 *
 * Spike A-2 已记录过理由：
 * > *pi 的扩展只能从 `<agentDir>/extensions/*.ts` 加载，靠 jiti 在运行时转译
 * > TypeScript。打包进 asar 后这条路是否还通，无法先验断言。*
 *
 * 包装器的 `execute` 是 before/after 的**精确**位置，而且对并行执行同样成立
 * ——每次调用各有一个包装器实例，互不干扰。
 *
 * ## 拿不到事实时留空，不编
 *
 * 非 git 仓库、git 调用失败——一律返回 `undefined`，让那条 Run 上**没有**这个字段。
 * 返回空数组会被读成「确认没改任何文件」，那是编造（不变式 5 明令禁止）。
 */
import { diffSince, snapshot, type GitBaseline } from "../project/git-facts.js"

/**
 * 会产出文件的工具。**白名单，不是黑名单。**
 *
 * 成本控制在入口：`git status` 在大仓库上不便宜，而 `read`/`grep`/`find`/`ls`
 * 每轮会被调很多次却永远不改文件。学自 wisp 的 `provenance::is_producing`。
 *
 * 不认识的工具名**不观察**——保守优于昂贵。代价是新工具要来这里登记一次，
 * 这个代价是刻意的：它逼人回答「这个工具会不会写文件」。
 */
export const PRODUCING_TOOLS: ReadonlySet<string> = new Set([
  "write",
  "edit",
  "multiedit",
  "bash",
  "apply_patch",
])

export function isProducing(toolName: string): boolean {
  return PRODUCING_TOOLS.has(toolName)
}

/** 一次调用的文件事实 */
export interface ToolFileFacts {
  filesWritten: string[]
  /**
   * 读过的文件。**目前恒为空**——git 看不见读操作。
   * 留这个字段是因为将来的读取来源（内核、MCP）能提供它，
   * 而**现在就把形状定下来**比以后改协议便宜。
   */
  filesRead: string[]
  /**
   * 可能混入了作者自己的改动。
   *
   * 与 agent 共用工作目录时无法区分谁改的（worktree 隔离之后才能置 false）。
   * **如实标注，不假装确定。**
   */
  mayIncludeUserEdits: boolean
}

export interface ProvenanceHandle {
  /**
   * 工具执行完毕，算这一次的差集。
   *
   * @returns 事实；**算不出来时返回 `undefined`**——与 `begin()` 同一个含义，
   *   由调用方翻译成「那条 Run 上没有这个字段」。见下方 `finish` 的实现注释。
   */
  finish(): Promise<ToolFileFacts | undefined>
}

export class ProvenanceProbe {
  constructor(private readonly workspace: string) {}

  /**
   * 工具即将执行。
   *
   * @returns 完成句柄；**不观察这次时返回 `undefined`**——
   *   只读工具、非 git 仓库、快照失败都走这一支。
   */
  async begin(toolName: string): Promise<ProvenanceHandle | undefined> {
    if (!isProducing(toolName)) return undefined
    let before: GitBaseline
    try {
      before = await snapshot(this.workspace)
    } catch {
      // 非 git 仓库或 git 不可用。**不是错误**，是「这里没有可依据的事实」
      return undefined
    }
    const workspace = this.workspace
    return {
      async finish(): Promise<ToolFileFacts | undefined> {
        try {
          const facts = await diffSince(workspace, before)
          return {
            filesWritten: facts.files,
            filesRead: [],
            mayIncludeUserEdits: facts.mayIncludeUserEdits,
          }
        } catch {
          /**
           * 前面拍到了、后面算不出来——**这一次的事实就是"不知道"**。
           *
           * **2026-08-09 修**：此前这里返回 `{ filesWritten: [], … }`。
           * 注释说的是「不知道」，返回的却是空数组，而空数组在变更 pane 上
           * 被渲染成**「没有改动文件」**——恰好是本文件开头第 20-23 行
           * 自己写下的禁令：*「返回空数组会被读成『确认没改任何文件』，那是编造」*。
           *
           * 它只在 diff 失败这条罕见路径上触发（仓库中途消失、git 崩了），
           * 所以带着这个缺陷活了一整个 Task。**「不知道」的唯一诚实表达是不发这个事实。**
           */
          return undefined
        }
      },
    }
  }
}
