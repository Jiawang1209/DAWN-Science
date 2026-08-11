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
export function 解析远端路径(cwd: string, p: string, 界?: string | undefined): string {
  const 绝对 = p.startsWith("/") ? p : `${cwd}/${p}`
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
  /**
   * **没给界就没有界。**
   *
   * 作者定的形状是「登上去，说话」——不先声明一个工作目录。
   * 那样一来 agent 的手能伸到这个账号能到的所有地方：
   * **这不比人自己 ssh 上去更危险，但也不会更安全**，区别是命令由模型出。
   * 「圈在某个目录里」是一个可选开关（默认关），开了才传 `界`。
   */
  if (界 === undefined) return 归一
  const 根 = 界.replace(/\/+$/, "")
  if (归一 !== 根 && !归一.startsWith(`${根}/`)) {
    throw new Error(`路径越出了允许的范围：${p}（限定在 ${根} 之内）`)
  }
  return 归一
}

/**
 * 会话此刻在哪个目录（②-B · R4′）。
 *
 * 作者：*「连上就默认用家目录，先聊起来，需要换地方再换。」*
 *
 * ## 为什么它是个可变的东西，而不是一个参数
 *
 * **`cd` 不会自己粘住**：每条命令都开一个干净的 shell（有意的，
 * 否则登录横幅会污染输出）。所以「跳到哪个文件夹」不是把 `cd` 发过去就完了——
 * 当前目录必须由我们自己记着，每条命令带上。
 *
 * 而它必须**看得见**：*你以为在 A 目录、实际在 B 目录，
 * 然后说一句「把这里的文件都删了」*——这种事故只有一个防法，
 * 就是那个路径一直在眼皮底下。
 */
export interface 远端工作目录 {
  get(): string
  set(v: string): void
  /** 可选的界。**默认没有**——见 `解析远端路径` 的注释 */
  界?: string | undefined
}

export interface RemoteToolsOptions {
  executor: RemoteExecutor
  /** 会话此刻在哪个目录。**相对路径以它为准**；它会随 `cd` 变 */
  cwd: 远端工作目录
}

/**
 * 把一组 pi 的工具定义改造成打到远端的版本。
 *
 * @param 原定义 pi 的四个内置工具（顺序无所谓，按 `name` 分派）
 */
export function 改造成远端工具(原定义: ToolDef[], opts: RemoteToolsOptions): ToolDef[] {
  const { executor, cwd } = opts

  const 换execute = (d: ToolDef, execute: ToolDef["execute"]): ToolDef => ({ ...d, execute })

  return 原定义.map((d) => {
    switch (d.name) {
      case "read":
        return 换execute(d, async (_id, params) => 读(executor, cwd, params as never))
      case "write":
        return 换execute(d, async (_id, params) => 写(executor, cwd, params as never))
      case "edit":
        return 换execute(d, async (_id, params) => 改(executor, cwd, params as never))
      case "bash":
        return 换execute(d, async (_id, params, signal) =>
          跑(executor, cwd, params as never, signal as AbortSignal | undefined),
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
  ws: 远端工作目录,
  p: { path: string; offset?: number; limit?: number },
): Promise<ToolResult> {
  let 路径: string
  try {
    路径 = 解析远端路径(ws.get(), p.path, ws.界)
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
  ws: 远端工作目录,
  p: { path: string; content: string },
): Promise<ToolResult> {
  let 路径: string
  try {
    路径 = 解析远端路径(ws.get(), p.path, ws.界)
  } catch (e) {
    return 文本(e instanceof Error ? e.message : String(e), true)
  }
  try {
    // **父目录不存在就先建**：本地的 write 也是这个行为，
    // 少了它，模型写 `results/out.csv` 会莫名其妙失败
    const 父 = 路径.slice(0, 路径.lastIndexOf("/"))
    if (父 && 父 !== ws.get().replace(/\/+$/, "")) await ex.exec(`mkdir -p ${引(父)}`)
    await ex.writeFile(路径, p.content)
    return 文本(`已写入 ${路径}（${Buffer.byteLength(p.content, "utf8")} 字节）`)
  } catch (e) {
    return 文本(`写不了 ${路径}：${e instanceof Error ? e.message : String(e)}`, true)
  }
}

async function 改(
  ex: RemoteExecutor,
  ws: 远端工作目录,
  p: { path: string; edits: { oldText: string; newText: string }[] },
): Promise<ToolResult> {
  let 路径: string
  try {
    路径 = 解析远端路径(ws.get(), p.path, ws.界)
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

/**
 * `cd` 之后的目录**要能粘住**（②-B · R4′）。
 *
 * 每条命令都开一个干净的 shell（有意的，否则登录横幅会污染输出），
 * 所以模型敲的 `cd data` 到下一条就没了——而作者要的正是
 * *「自然语言告诉我跳到哪个文件夹」*。
 *
 * 做法：命令跑完之后**把 `pwd` 打出来**，我们读走并记住，再从输出里抹掉。
 * 一次往返，不多问一次。
 *
 * 三处讲究：
 *   - **退出码要原样保住**：`rc=$?` 存下来，打完标记再 `exit $rc`。
 *     不存的话，每条命令的退出码都会变成 `printf` 的 0——**失败全部变成功**。
 *   - 标记走 **stdout 不走 stderr**：stderr 是给模型看「它抱怨了什么」的，
 *     混进一行内部标记等于污染它。stdout 这一份由我们自己组装，抹得干净。
 *   - **命令被中止时没有标记**，那时保持原目录不动——不猜。
 */
const CWD标记 = "__DAWN_CWD__"

/** 从输出里摘走那行标记。返回抹干净的正文与新目录（没有就是 undefined） */
export function 摘出目录(stdout: string): { 正文: string; 目录?: string } {
  const 行 = stdout.split("\n")
  const i = 行.findLastIndex((x) => x.startsWith(CWD标记))
  if (i < 0) return { 正文: stdout }
  const 目录 = 行[i]!.slice(CWD标记.length).trim()
  行.splice(i, 1)
  // 标记前面那个空行是我们自己加的，一并去掉
  const 正文 = 行.join("\n").replace(/\n+$/, "")
  return 目录 ? { 正文, 目录 } : { 正文 }
}

async function 跑(
  ex: RemoteExecutor,
  ws: 远端工作目录,
  p: { command: string; timeout?: number },
  signal: AbortSignal | undefined,
): Promise<ToolResult> {
  const 带标记 = `{ ${p.command}\n}; rc=$?; printf '\\n${CWD标记}%s\\n' "$(pwd)"; exit $rc`
  try {
    const r = await ex.exec(带标记, {
      cwd: ws.get(),
      ...(signal ? { signal } : {}),
      // **没有默认超时**（作者定的）：远端一条 `bwa index` 跑二十分钟是正常的，
      // 而它和「卡死了」在协议上长得一模一样。模型显式要求时才设上限
      ...(p.timeout === undefined ? {} : { timeoutSec: p.timeout }),
    })
    const { 正文, 目录 } = 摘出目录(r.stdout)
    // **只在真读到时才改**：读不到就保持原样，不拿一个猜的目录去覆盖
    if (目录 && 目录 !== ws.get()) ws.set(目录)

    const 段: string[] = []
    if (正文) 段.push(正文.replace(/\n$/, ""))
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
    // **目录变了要告诉模型**：它下一条命令的相对路径以此为准
    if (目录 && 目录 !== ws.get()) 段.push(`[当前目录 ${目录}]`)
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
  cwd: 远端工作目录,
  remote: RemoteExecutor | undefined,
): ToolDef[] {
  return remote ? 改造成远端工具(原始, { executor: remote, cwd }) : 原始
}
