/**
 * 远端工具（②-B · R2）。
 *
 * 作者：*「使用 agent 在远程服务器里面帮我编程，处理数据，写代码，分析数据。」*
 *
 * ## 拿 pi 的定义，只换执行那一句
 *
 * pi 的每个内置工具是一个对象：`{ name, label, description, promptSnippet,
 * promptGuidelines, parameters, execute, renderCall, renderResult }`。
 * 这里**原样保留除 `execute` 之外的一切**——
 * 于是模型看到的工具名、说明、参数 schema 与本地一字不差，
 * **它不知道自己的手伸到了另一台机器上**，也就不需要为远端另学一套。
 *
 * 这正是 Spike A-2 当初选「包装工具定义」而不是「pi 的文件扩展」换来的余地。
 *
 * ## 路径守卫在这里，不在调用方
 *
 * 与本地那条（`files/access.ts` 的 `resolveInWorkspace`）同一条纪律：
 * **越界的路径一律拒绝**。远端更要紧——那台机器上还有别人的东西。
 */
import type { RemoteExecutor } from "./ssh.js"

/** pi 的工具定义。**我们只碰 `execute`**，其余原样透传 */
type ToolDef = Record<string, unknown> & {
  name: string
  execute: (...a: unknown[]) => Promise<unknown>
}

/** pi 认的工具结果 */
interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
  details?: unknown
}

const 文本 = (text: string, isError = false): ToolResult => ({
  content: [{ type: "text", text }],
  ...(isError ? { isError: true } : {}),
})

/**
 * 把工具给的路径解析成远端的绝对路径，**并挡住越界**。
 *
 * 纯字符串处理（POSIX 语义），不问远端——问一次是一个往返，
 * 而这个判断每次工具调用都要做。
 *
 * **`..` 一律先归一再判**：只查前缀而不归一的话，
 * `<工作区>/../../etc/passwd` 会大摇大摆地通过。
 */
export function 解析远端路径(workspace: string, p: string): string {
  const 绝对 = p.startsWith("/") ? p : `${workspace}/${p}`
  const 段: string[] = []
  for (const 一段 of 绝对.split("/")) {
    if (!一段 || 一段 === ".") continue
    if (一段 === "..") {
      段.pop()
      continue
    }
    段.push(一段)
  }
  const 归一 = `/${段.join("/")}`
  const 根 = workspace.replace(/\/+$/, "")
  if (归一 !== 根 && !归一.startsWith(`${根}/`)) {
    throw new Error(`路径越出了工作区：${p}（工作区是 ${根}）`)
  }
  return 归一
}

export interface RemoteToolsOptions {
  executor: RemoteExecutor
  /** 远端工作区的绝对路径。**所有相对路径以它为准，也以它为界** */
  workspace: string
}

/**
 * 把一组 pi 的工具定义改造成打到远端的版本。
 *
 * @param 原定义 pi 的四个内置工具（顺序无所谓，按 `name` 分派）
 */
export function 改造成远端工具(原定义: ToolDef[], opts: RemoteToolsOptions): ToolDef[] {
  const { executor, workspace } = opts

  const 换execute = (d: ToolDef, execute: ToolDef["execute"]): ToolDef => ({ ...d, execute })

  return 原定义.map((d) => {
    switch (d.name) {
      case "read":
        return 换execute(d, async (_id, params) => 读(executor, workspace, params as never))
      case "write":
        return 换execute(d, async (_id, params) => 写(executor, workspace, params as never))
      case "edit":
        return 换execute(d, async (_id, params) => 改(executor, workspace, params as never))
      case "bash":
        return 换execute(d, async (_id, params, signal) =>
          跑(executor, workspace, params as never, signal as AbortSignal | undefined),
        )
      default:
        /**
         * **不认识的工具原样留下。**
         *
         * 它会继续在**本地**执行——那是错的，但**悄悄丢掉它更错**：
         * 模型会以为自己有这个能力，调了却什么都没发生。
         * 真出现这种情况，说明 pi 加了新的内置工具，我们得跟上。
         */
        return d
    }
  })
}

async function 读(
  ex: RemoteExecutor,
  ws: string,
  p: { path: string; offset?: number; limit?: number },
): Promise<ToolResult> {
  let 路径: string
  try {
    路径 = 解析远端路径(ws, p.path)
  } catch (e) {
    return 文本(e instanceof Error ? e.message : String(e), true)
  }
  try {
    const buf = await ex.readFile(路径)
    const 全文 = buf.toString("utf8")
    if (p.offset === undefined && p.limit === undefined) return 文本(全文)
    // 行号从 1 起，与 pi 的 schema 一致（`offset` 说的是 1-indexed）
    const 行 = 全文.split("\n")
    const 起 = Math.max(0, (p.offset ?? 1) - 1)
    const 止 = p.limit === undefined ? 行.length : 起 + p.limit
    return 文本(行.slice(起, 止).join("\n"))
  } catch (e) {
    return 文本(`读不了 ${路径}：${e instanceof Error ? e.message : String(e)}`, true)
  }
}

async function 写(
  ex: RemoteExecutor,
  ws: string,
  p: { path: string; content: string },
): Promise<ToolResult> {
  let 路径: string
  try {
    路径 = 解析远端路径(ws, p.path)
  } catch (e) {
    return 文本(e instanceof Error ? e.message : String(e), true)
  }
  try {
    // **父目录不存在就先建**：本地的 write 也是这个行为，
    // 少了它，模型写 `results/out.csv` 会莫名其妙失败
    const 父 = 路径.slice(0, 路径.lastIndexOf("/"))
    if (父 && 父 !== ws.replace(/\/+$/, "")) await ex.exec(`mkdir -p ${引(父)}`)
    await ex.writeFile(路径, p.content)
    return 文本(`已写入 ${路径}（${Buffer.byteLength(p.content, "utf8")} 字节）`)
  } catch (e) {
    return 文本(`写不了 ${路径}：${e instanceof Error ? e.message : String(e)}`, true)
  }
}

async function 改(
  ex: RemoteExecutor,
  ws: string,
  p: { path: string; edits: { oldText: string; newText: string }[] },
): Promise<ToolResult> {
  let 路径: string
  try {
    路径 = 解析远端路径(ws, p.path)
  } catch (e) {
    return 文本(e instanceof Error ? e.message : String(e), true)
  }
  let 原文: string
  try {
    原文 = (await ex.readFile(路径)).toString("utf8")
  } catch (e) {
    return 文本(`读不了 ${路径}：${e instanceof Error ? e.message : String(e)}`, true)
  }

  /**
   * **每一处都必须唯一命中，否则整次不改。**
   *
   * pi 的 schema 明写 `oldText` 必须在原文里唯一。命中 0 次或多次时
   * **不能"尽力而为"地改一部分**——半改的文件比没改坏得多，
   * 而且模型会以为它全改了。
   */
  for (const e of p.edits) {
    const 次数 = 原文.split(e.oldText).length - 1
    if (次数 === 0) return 文本(`找不到要替换的内容（${摘要(e.oldText)}）`, true)
    if (次数 > 1) return 文本(`要替换的内容出现了 ${次数} 次，不唯一（${摘要(e.oldText)}）`, true)
  }
  let 新文 = 原文
  for (const e of p.edits) 新文 = 新文.replace(e.oldText, () => e.newText)

  try {
    await ex.writeFile(路径, 新文)
    return 文本(`已改 ${路径}（${p.edits.length} 处）`)
  } catch (e) {
    return 文本(`写不回 ${路径}：${e instanceof Error ? e.message : String(e)}`, true)
  }
}

async function 跑(
  ex: RemoteExecutor,
  ws: string,
  p: { command: string; timeout?: number },
  signal: AbortSignal | undefined,
): Promise<ToolResult> {
  try {
    const r = await ex.exec(p.command, {
      cwd: ws,
      ...(signal ? { signal } : {}),
      // **没有默认超时**（作者定的）：远端一条 `bwa index` 跑二十分钟是正常的，
      // 而它和「卡死了」在协议上长得一模一样。模型显式要求时才设上限
      ...(p.timeout === undefined ? {} : { timeoutSec: p.timeout }),
    })
    const 段: string[] = []
    if (r.stdout) 段.push(r.stdout.replace(/\n$/, ""))
    // **stderr 单独标出来**：混进 stdout 的话，模型分不清哪句是结果哪句是抱怨
    if (r.stderr) 段.push(`[stderr]\n${r.stderr.replace(/\n$/, "")}`)
    /**
     * **退出码永远写出来**，哪怕是 0。
     *
     * 「命令跑完了但没有输出」与「命令失败了」在纯文本里长得一样，
     * 而模型只能看到文本。给它一个明确的数字，它才不用猜。
     */
    const 结尾 = r.signal ? `[被信号 ${r.signal} 结束]` : `[退出码 ${r.code ?? "未知"}]`
    段.push(结尾)
    return 文本(段.join("\n"), r.code !== 0)
  } catch (e) {
    return 文本(`命令没跑成：${e instanceof Error ? e.message : String(e)}`, true)
  }
}

const 引 = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const 摘要 = (s: string) => (s.length <= 40 ? s : `${s.slice(0, 40)}…`)

/**
 * 这批工具走本地还是走远端。
 *
 * **抽成一个函数只为一件事：让它可测。**
 * 它本来是 `native.ts` 私有方法里的一行 `remote ? … : …`——
 * 而本项目栽得最多的正是这种一行：每一层单独看都对，**接线断了却没人知道**
 * （三个面板那次、成本那次、模型目录那次）。
 */
export function 挑工具后端(
  原始: ToolDef[],
  cwd: string,
  remote: RemoteExecutor | undefined,
): ToolDef[] {
  return remote ? 改造成远端工具(原始, { executor: remote, workspace: cwd }) : 原始
}
