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
 * ## 两条路：git 有就走 git，没有就走文件系统（2026-08-26）
 *
 * git 工作区走 `git-facts.ts`（能剔除基线时就脏的文件）；**不是 git 仓库**——临时会话
 * `~/DAWN/scratch/<ts>/`、用户自己的非 git 目录——走 `fs-facts.ts`：前后各扫一遍文件系统，
 * 按 inode / mtime / size 对比。作者第一次真用「产物」就撞上临时会话满屏「本轮产出未知」，
 * 根因就是此前非 git 一律不观察。**两条路口径一致：缺省 = 不知道、空 = 确认没有。**
 *
 * ## 拿不到事实时留空，不编
 *
 * git 调用失败、文件系统扫描超上限——一律返回 `undefined`，让那条 Run 上**没有**这个字段。
 * 返回空数组会被读成「确认没改任何文件」，那是编造（不变式 5 明令禁止）。
 */
import { statSync } from "node:fs"
import { resolve } from "node:path"
import { 工作区内相对路径 } from "../files/paths.js"
import { createdSince, diffSince, snapshot, type GitBaseline } from "../project/git-facts.js"
import { fsDiff, fsSnapshot, FS_SNAPSHOT_CAP, type FsSnapshot } from "../project/fs-facts.js"

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

/**
 * 只读内置工具**按设计**不写文件（2026-08-26，审查 A）。
 *
 * 不在白名单的内置工具（`read`）此前从不发 `tool_files`，于是它的 Run 上
 * `files_created` 一直是 NULL——被读成「不知道」，一段只 read 的普通对话
 * 就被标成「本轮产出未知」。这是我们自己写的工具，白名单本身就是「它不写文件」
 * 这条声明；发空数组是「确认没写」，不是猜（不变式 5）。
 * **只给内置白名单外的那几个用**：外部工具（MCP、内核）一律观察 git，不走这条。
 */
export const 只读工具的空事实 = (): ToolFileFacts => ({
  filesWritten: [],
  filesRead: [],
  mayIncludeUserEdits: false,
  filesCreated: [],
})

/**
 * 这几个工具**自己就说得出写到哪儿**（2026-08-18）。
 *
 * `bash` 不在里面：它的参数是一条命令，写到哪儿只有它自己知道。
 */
const 会报路径的: ReadonlySet<string> = new Set(["write", "edit", "multiedit", "apply_patch"])

/**
 * 从工具入参里捞出它声称要写的那些路径。
 *
 * **各家键名不一**（`path` / `file_path` / `filePath`），而 `multiedit`
 * 那类还会给一个数组。认不出就返回空——**认不出不等于可以编**。
 */
export function 声明的路径(toolName: string, params: unknown): string[] {
  if (!会报路径的.has(toolName) || typeof params !== "object" || params === null) return []
  const p = params as Record<string, unknown>
  const 出: string[] = []
  for (const k of ["path", "file_path", "filePath"]) {
    const v = p[k]
    if (typeof v === "string" && v.trim()) 出.push(v.trim())
  }
  const 批 = p["edits"] ?? p["files"]
  if (Array.isArray(批)) {
    for (const one of 批) {
      if (typeof one !== "object" || one === null) continue
      const o = one as Record<string, unknown>
      for (const k of ["path", "file_path", "filePath"]) {
        const v = o[k]
        if (typeof v === "string" && v.trim()) 出.push(v.trim())
      }
    }
  }
  return [...new Set(出)]
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
  /**
   * 这一次**新建**的文件（产物条的事实来源，2026-08-26，spec `2026-08-26-产物`）。
   * git 的 `??`/`A` ∪ 工具声明的「此前不在、现在有」。
   * 与 `filesWritten` 同一口径：整份 facts 缺席 = 不知道；空数组 = 确认没新建。
   */
  filesCreated: string[]
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

/** 超上限已经出过声的工作区：每个只喊一次，不然一轮几十次工具调用就刷几十条 */
const 已警告超限的工作区 = new Set<string>()

export class ProvenanceProbe {
  constructor(
    private readonly workspace: string,
    private readonly 选项: { fsCap?: number } = {},
  ) {}

  /**
   * **外部工具即将执行**（2026-08-18）。「外部」指 MCP 服务器的工具，
   * 以及内核里的 `run_code`——**不是我们写的那些**。
   *
   * ## 为什么它不走白名单
   *
   * `PRODUCING_TOOLS` 的前提是**「这些工具是我们写的，我们知道哪个会写文件」**。
   * 对第三方工具这个前提不成立：名字是它自己起的、参数 schema 是它自己定的，
   * **我们看不见它内部干什么**（`mcp-tool.ts` 那条「过门」的注释里就是这句）。
   * 一台服务器完全可以起一个叫 `grep` 却真的往盘上写东西的工具。
   *
   * 所以**一律观察**。代价是每次调用多一对 `git status`——
   * **这个代价我们早就在付**：`bash` 就在白名单里，而它的调用次数比 MCP
   * 多一个数量级。
   *
   * ## 它比内置那条少一样东西
   *
   * 没有 `声明的路径`：那一条靠的是「我们认得 `write` 的入参里哪个键是路径」，
   * 而第三方 schema 认不出来。**认不出不等于可以猜。**
   * 后果要说清楚：**MCP 写进 `.gitignore` 里的文件，这一层看不见**
   * （`git status` 不列被忽略的）。审阅那一屏靠 `ignoredArtifacts()`
   * 在约定目录里兜一次底，但它只答得出「有这么个文件」，答不出「谁写的」。
   */
  async beginExternal(): Promise<ProvenanceHandle | undefined> {
    return this.观察([])
  }

  /**
   * 工具即将执行。
   *
   * @returns 完成句柄；**不观察这次时返回 `undefined`**——
   *   只读工具、非 git 仓库、快照失败都走这一支。
   */
  async begin(toolName: string, params?: unknown): Promise<ProvenanceHandle | undefined> {
    if (!isProducing(toolName)) return undefined
    /**
     * **工具自己声称要写的那些路径**（2026-08-18）。
     *
     * 为什么必须有这一条：`diffSince` 用的是 `git status`，而它
     * **不列被 `.gitignore` 忽略的文件**。科研仓库里 `figures/`、
     * `results/`、`data/processed/` 常常正好在 ignore 名单上——
     * 于是一次分析生成 40 张图，账本上是「没改任何文件」。
     *
     * 这**不违反不变式 5**（文件事实不听 agent 自述）：
     * 声明只是候选，**跑完要 `stat` 一下确认文件真的在**才算数。
     * 那是观察，不是转述。
     */
    return this.观察(声明的路径(toolName, params))
  }

  /** 拍下 before，交回一个算差集的句柄。**拍不到就不观察**（只剩一种：文件系统超上限） */
  private async 观察(声明入参: string[]): Promise<ProvenanceHandle | undefined> {
    // **声明路径可能是绝对的**（`声明的路径` 从工具入参里原样捞出来，工具自己爱传哪种就传哪种）。
    // 统一换成相对工作区——后面所有比对、去重、落盘都按相对路径来，
    // 混着绝对/相对会让同一个文件被记成两条。工作区外的声明直接丢：那不该被算进这次调用。
    const 声明 = 声明入参.flatMap((p) => {
      const rel = 工作区内相对路径(this.workspace, p)
      return rel ? [rel] : []
    })
    const workspace = this.workspace
    const 在不在 = (rel: string) => {
      try {
        return statSync(resolve(workspace, rel)).isFile()
      } catch {
        return false
      }
    }
    // **执行前**记下声明路径里哪些还不存在——执行后再看就分不清「新建」与「覆盖」
    const 声明前不在 = 声明.filter((rel) => !在不在(rel))

    let before: GitBaseline
    try {
      before = await snapshot(this.workspace)
    } catch {
      // git 不在（spawn ENOENT）、git 坏了、不是仓库——三种情况文件系统探针都答得出，
      // 只有超限才是真的不知道。此前只认 NotAGitRepoError，没装 git 的机器上就白白记成「不知道」。
      return this.走文件系统(声明, 声明前不在, 在不在)
    }
    return {
      async finish(): Promise<ToolFileFacts | undefined> {
        try {
          const facts = await diffSince(workspace, before)
          /**
           * **声明过、而且事后真的在**的那些，并进去。
           *
           * 只并「存在」的：工具可能被拒、可能失败，那时它声称的路径
           * 不该出现在账本上——**说它写了一个不存在的文件，比不说更坏**。
           */
          const 真在 = 声明.filter(在不在)
          const created = await createdSince(workspace, before)
          return {
            filesWritten: [...new Set([...facts.files, ...真在])].sort(),
            filesRead: [],
            mayIncludeUserEdits: facts.mayIncludeUserEdits,
            filesCreated: [...new Set([...created, ...声明前不在.filter(在不在)])].sort(),
          }
        } catch {
          /**
           * 前面拍到了、后面算不出来——**这一次的事实就是"不知道"**。
           *
           * **2026-08-09 修**：此前这里返回 `{ filesWritten: [], … }`。
           * 注释说的是「不知道」，返回的却是空数组，而空数组在变更 pane 上
           * 被渲染成**「没有改动文件」**——恰好是本文件开头自己写下的禁令：
           * *「返回空数组会被读成『确认没改任何文件』，那是编造」*。
           *
           * 它只在 diff 失败这条罕见路径上触发（仓库中途消失、git 崩了），
           * 所以带着这个缺陷活了一整个 Task。**「不知道」的唯一诚实表达是不发这个事实。**
           */
          return undefined
        }
      },
    }
  }

  /**
   * 非 git 工作区那一支（2026-08-26）：前后各扫一遍文件系统。
   *
   * 没有 git 就没有「基线时就脏」的概念，所以剔不掉作者手改的——`mayIncludeUserEdits`
   * 如实为 true。超上限 = 不知道，**每个工作区只出一次声**。
   */
  private 走文件系统(
    声明: string[],
    声明前不在: string[],
    在不在: (rel: string) => boolean,
  ): ProvenanceHandle | undefined {
    const workspace = this.workspace
    const cap = this.选项.fsCap ?? FS_SNAPSHOT_CAP
    const before: FsSnapshot | undefined = fsSnapshot(workspace, cap)
    if (!before) {
      if (!已警告超限的工作区.has(workspace)) {
        已警告超限的工作区.add(workspace)
        console.error(`[溯源] 工作区不是 git 仓库且文件超过 ${cap} 个，这次的文件事实记为不知道：${workspace}`)
      }
      return undefined
    }
    return {
      async finish(): Promise<ToolFileFacts | undefined> {
        const after = fsSnapshot(workspace, cap)
        if (!after) return undefined
        const { created, written } = fsDiff(before, after)
        const 真在 = 声明.filter(在不在)
        return {
          filesWritten: [...new Set([...written, ...真在])].sort(),
          filesRead: [],
          mayIncludeUserEdits: true,
          filesCreated: [...new Set([...created, ...声明前不在.filter(在不在)])].sort(),
        }
      },
    }
  }
}

/**
 * 把一个**外部工具定义**套上溯源（2026-08-18）。
 *
 * 内置工具那条包装在 `native.ts` 的 `gatedTools` 里，它同时管授权门；
 * 这一条**只管溯源**——MCP 工具有自己的门（`mcp-tool.ts` 的 `trusted` 判定，
 * 策略只有一个家），再套一次内置那道门就是拿错了尺子量。
 *
 * 三条纪律：
 *
 * ① **原样转交。** 名字、说明、参数 schema、返回值一个都不动——
 *    包装器改了工具的答复，模型学到的就是假的。
 * ② **`finally` 里算。** 工具自己炸了，它在炸之前写下的东西**照样是事实**。
 * ③ **算不出来就不发。** 发一条空的 `filesWritten` 会让那条 Run 说出
 *    「确认没改任何文件」，而实情是「不知道」——两者不得混为一谈（不变式 5）。
 */
export function 套上溯源<T extends Record<string, unknown>>(
  定义: T,
  probe: ProvenanceProbe,
  报: (toolCallId: string, facts: ToolFileFacts) => void,
): T {
  const original = (定义.execute as (...a: unknown[]) => Promise<unknown>).bind(定义)
  return {
    ...定义,
    async execute(
      toolCallId: string,
      params: unknown,
      signal: unknown,
      onUpdate: unknown,
      ctx: unknown,
    ) {
      // **before 必须在真正执行之前拍完**，所以要 await（与内置那条同理）
      const handle = await probe.beginExternal()
      try {
        return await original(toolCallId, params, signal, onUpdate, ctx)
      } finally {
        if (handle) {
          const facts = await handle.finish()
          if (facts) 报(String(toolCallId), facts)
        }
      }
    },
  } as unknown as T
}

/**
 * 把产物登记（按 inode 身份记的「此前不存在、现在有」）并进探针的 facts（2026-08-26）。
 * 两个来源互补：登记看不见没声明路径的（bash 里 `cp` 出来的），看得见的是 `>` 重定向的目标
 * （`重定向目标` 解析的就是这个）；git 则看不见被 `.gitignore` 忽略的文件。
 * `登记新建的` 是**绝对路径**，这里换算成相对工作区的。
 */
export function 并进登记新建(facts: ToolFileFacts, 登记新建的: readonly string[], cwd: string): ToolFileFacts {
  // 换算之后仍是绝对路径的（不同盘符/根目录）说明不在工作区里，丢掉——与 `观察()`
  // 对声明路径的处理同一口径。
  const rel = 登记新建的.flatMap((p) => {
    const r = 工作区内相对路径(cwd, p)
    return r ? [r] : []
  })
  return {
    ...facts,
    filesWritten: [...new Set([...facts.filesWritten, ...rel])].sort(),
    filesCreated: [...new Set([...facts.filesCreated, ...rel])].sort(),
  }
}
