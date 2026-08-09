/**
 * 子 agent 执行器（①-B″ · S1）。
 *
 * 三种模式：`single` / `parallel` / `chain`。每个任务**一个独立进程**。
 *
 * ## 进程隔离是不变式 1 的实现，不是实现细节
 *
 * 计划 §6：*"验证者拿不到生产者的上下文，不是因为我们过滤了，
 * 而是因为**它在另一个进程里**。**过滤会漏，进程边界不会。**"*
 *
 * 所以本模块**不提供「同进程跑一个子会话」的选项**。没有那个选项，
 * 就没有人会在赶时间的时候选它。
 *
 * ## 上界从第一天钉死
 *
 * *"没有上界的 fan-out 是一张空白支票。"*（计划 §6）
 *
 * 超过上界时**出声拒绝整批**，而不是截成前 8 个跑。后者是最坏的一种：
 * 用户以为 9 件事都做了。**要么按你说的做，要么说做不了，不做一半。**
 *
 * ## 父子之间说什么：stdout 上的 NDJSON
 *
 * 子进程从 stdin 收一个 JSON 规格，往 stdout 写 NDJSON，最后一行是 `done`：
 *
 * ```
 * {"type":"done","ok":true,"output":"..."}
 * {"type":"done","ok":false,"error":"上下文超了"}
 * ```
 *
 * **退出码 0 但没给出 `done` 也是失败**，不是空结果——那种情况下我们
 * 根本不知道它做了什么，报成「成功且无输出」就是编造。
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { SubagentDefinition } from "./definitions.js"

export interface SubagentTask {
  agent: string
  task: string
}

export type SubagentRequest =
  | { mode: "single"; agent: string; task: string }
  | { mode: "parallel"; tasks: SubagentTask[] }
  | { mode: "chain"; chain: SubagentTask[] }

export interface SubagentResult {
  agent: string
  /** 实际交给子 agent 的任务文本（chain 模式下 `{previous}` 已经替换过） */
  task: string
  ok: boolean
  output: string
  /** `ok` 为 false 时**必须**有。不带原因的失败等于没报 */
  error?: string
  /** 截断了就要说，且要说清省了多少（规格 7.5） */
  outputTruncated: boolean
  /** 子进程给出的**原始**字节数。界面说「还有 N」要用真数，不是猜 */
  outputBytes: number
}

export interface SubagentRunSummary {
  results: SubagentResult[]
  /** 整批被拒绝的原因（超上界）。**拒绝时 `results` 为空** */
  rejected?: string
  /** chain 模式下停在第几步（1 起）。跑完全程时缺省 */
  stoppedAtStep?: number
}

export type SubagentProgress =
  | { type: "started"; index: number; agent: string; task: string }
  | { type: "settled"; index: number; ok: boolean }

/**
 * 上界。**照计划 §6 的数**：8 个任务 / 4 并发。
 *
 * `maxOutputBytes` 计划没给数。取 64 KiB：pi 把模型可见输出压在 50 KB，
 * 同一个量级。**它管的是「回给父模型多少」**，子进程自己的完整输出
 * 不在这里丢——那属于下一片（落盘 + 路径，照 R2 的做法）。
 */
export const SUBAGENT_LIMITS = {
  maxTasks: 8,
  maxConcurrent: 4,
  maxOutputBytes: 64 * 1024,
} as const

export type SubagentLimits = typeof SUBAGENT_LIMITS

/** 起一个子 agent 进程要用的命令。**由调用方决定**，本模块不假设是哪个可执行文件 */
export interface ChildCommand {
  command: string
  args: string[]
  env?: Record<string, string>
}

export type ChildFactory = (spec: {
  definition: SubagentDefinition
  agent: string
  task: string
}) => ChildCommand

export interface SubagentExecutorOptions {
  childOf: ChildFactory
  limits?: Partial<SubagentLimits>
  /** 每个任务开始 / 结束时回调。界面的 chip 组靠它显示 ⏳ 与 ✓ */
  onProgress?: (p: SubagentProgress) => void
}

/** chain 模式里的占位符 */
const PREVIOUS = "{previous}"

export class SubagentExecutor {
  private readonly childOf: ChildFactory
  private readonly limits: SubagentLimits
  private readonly onProgress: (p: SubagentProgress) => void

  constructor(opts: SubagentExecutorOptions) {
    this.childOf = opts.childOf
    this.limits = { ...SUBAGENT_LIMITS, ...opts.limits }
    this.onProgress = opts.onProgress ?? (() => {})
  }

  async run(
    req: SubagentRequest,
    definitions: readonly SubagentDefinition[],
    signal?: AbortSignal,
  ): Promise<SubagentRunSummary> {
    const tasks = toTasks(req)

    if (tasks.length > this.limits.maxTasks) {
      // **拒绝整批。** 截成前 N 个跑会让用户以为 N+1 件事都做了
      return {
        results: [],
        rejected:
          `一次最多 ${this.limits.maxTasks} 个子 agent 任务，这次给了 ${tasks.length} 个。` +
          `请拆成几批——**没有截断执行，一个都没跑。**`,
      }
    }

    return req.mode === "chain"
      ? this.runChain(tasks, definitions, signal)
      : this.runParallel(tasks, definitions, signal)
  }

  /** parallel 与 single 走同一条路——single 就是只有一个任务的 parallel */
  private async runParallel(
    tasks: SubagentTask[],
    definitions: readonly SubagentDefinition[],
    signal?: AbortSignal,
  ): Promise<SubagentRunSummary> {
    // **结果按输入顺序放回**，不按完成顺序。
    // 「第二个任务的结果」必须永远是 results[1]，否则调用方无从对应
    const results = new Array<SubagentResult>(tasks.length)
    let next = 0

    const worker = async (): Promise<void> => {
      for (;;) {
        const i = next++
        if (i >= tasks.length) return
        results[i] = await this.one(i, tasks[i]!, definitions, signal)
      }
    }

    const lanes = Math.min(this.limits.maxConcurrent, tasks.length)
    await Promise.all(Array.from({ length: lanes }, worker))
    return { results }
  }

  private async runChain(
    steps: SubagentTask[],
    definitions: readonly SubagentDefinition[],
    signal?: AbortSignal,
  ): Promise<SubagentRunSummary> {
    const results: SubagentResult[] = []
    let previous = ""

    for (const [i, step] of steps.entries()) {
      // **第一步也要替换**，替成空串——留着 `{previous}` 字面量传给模型更糟
      const task = step.task.split(PREVIOUS).join(previous)
      const r = await this.one(i, { agent: step.agent, task }, definitions, signal)
      results.push(r)
      if (!r.ok) {
        // **停下。** 拿失败的结果当 `{previous}` 往下传就是编造——
        // 下一步会基于一段并不存在的踏勘结论去做计划
        return { results, stoppedAtStep: i + 1 }
      }
      previous = r.output
    }
    return { results }
  }

  private async one(
    index: number,
    task: SubagentTask,
    definitions: readonly SubagentDefinition[],
    signal?: AbortSignal,
  ): Promise<SubagentResult> {
    const definition = definitions.find((d) => d.name === task.agent)
    if (!definition) {
      // **不静默降级到某个默认 agent。** 也要说清有哪些可选，
      // 否则用户只能自己去翻目录
      const names = definitions.map((d) => d.name).join(" / ") || "（一个都没有）"
      const result = fail(task, `没有名为 "${task.agent}" 的子 agent。已定义的是：${names}`)
      this.onProgress({ type: "started", index, agent: task.agent, task: task.task })
      this.onProgress({ type: "settled", index, ok: false })
      return result
    }

    this.onProgress({ type: "started", index, agent: task.agent, task: task.task })
    const result = await this.spawnOne(definition, task, signal)
    this.onProgress({ type: "settled", index, ok: result.ok })
    return result
  }

  private spawnOne(
    definition: SubagentDefinition,
    task: SubagentTask,
    signal?: AbortSignal,
  ): Promise<SubagentResult> {
    const cmd = this.childOf({ definition, agent: task.agent, task: task.task })

    return new Promise<SubagentResult>((resolve) => {
      if (signal?.aborted) return resolve(fail(task, "开始前已被中止"))

      // 显式类型：`onAbort` 在赋值之前就闭包捕获了它，推断不出来
      let child: ChildProcessWithoutNullStreams | undefined
      try {
        child = spawn(cmd.command, cmd.args, {
          stdio: ["pipe", "pipe", "pipe"],
          ...(cmd.env ? { env: { ...process.env, ...cmd.env } } : {}),
        })
      } catch (err) {
        // 同步抛出的情形（参数非法等）。**不让它冒泡**——
        // 一个任务起不来不该炸掉整批
        return resolve(fail(task, `子进程起不来：${message(err)}`))
      }

      let out = ""
      let err = ""
      let settled = false
      const done = (r: SubagentResult) => {
        if (settled) return
        settled = true
        signal?.removeEventListener("abort", onAbort)
        resolve(r)
      }

      function onAbort() {
        // **真的杀掉它。** 父侧不看了而已的话，子进程会继续烧钱
        child?.kill("SIGKILL")
        done(fail(task, "已中止"))
      }
      signal?.addEventListener("abort", onAbort, { once: true })

      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (d: string) => (out += d))
      child.stderr.on("data", (d: string) => (err += d))

      child.on("error", (e) => done(fail(task, `子进程起不来：${e.message}`)))

      child.on("close", (code) => {
        const report = parseDone(out)

        if (!report) {
          // 两种都在这里落地，措辞不同：非 0 退出有码可报；
          // 0 退出却没结果是**更糟**的一种——我们根本不知道它做了什么
          const detail = err.trim() ? `：${err.trim()}` : ""
          return done(
            fail(
              task,
              code === 0
                ? `子进程正常退出，但没有给出结果${detail}`
                : `子进程以退出码 ${code} 结束${detail}`,
            ),
          )
        }

        if (!report.ok) {
          return done(fail(task, report.error ?? "子 agent 报告失败，但没有说原因"))
        }

        const full = report.output ?? ""
        const bytes = Buffer.byteLength(full, "utf8")
        const truncated = bytes > this.limits.maxOutputBytes
        done({
          agent: task.agent,
          task: task.task,
          ok: true,
          // 截断按字节算，但切在字符边界上——按字节切会把 UTF-8 切成半个汉字
          output: truncated ? clip(full, this.limits.maxOutputBytes) : full,
          outputTruncated: truncated,
          outputBytes: bytes,
        })
      })

      /**
       * **stdin 的写入错误要吞掉。**
       *
       * 子进程可能在我们写完之前就退出（起不来、参数不对、立刻 exit），
       * 那时这次写会得到 EPIPE。默认行为是抛一个未处理的 `error` 事件，
       * **整个进程崩掉**——而这条路径上真正的失败已经由 `close` 分支
       * 以更准确的措辞报出来了（退出码 + stderr）。
       *
       * 这不是静默回退：被吞掉的只是「管道对面没人了」这个次生信号，
       * 首要原因照常出声。
       */
      child.stdin.on("error", () => {})

      // 规格从 stdin 递进去，**不走命令行参数**：任务文本可以很长，
      // 而且里面什么字符都可能有
      child.stdin.end(
        JSON.stringify({
          agent: task.agent,
          task: task.task,
          systemPrompt: definition.systemPrompt,
          ...(definition.tools ? { tools: definition.tools } : {}),
          ...(definition.model ? { model: definition.model } : {}),
        }),
      )
    })
  }
}

function toTasks(req: SubagentRequest): SubagentTask[] {
  if (req.mode === "single") return [{ agent: req.agent, task: req.task }]
  return req.mode === "parallel" ? [...req.tasks] : [...req.chain]
}

interface DoneLine {
  type: "done"
  ok: boolean
  output?: string
  error?: string
}

/**
 * 取 stdout 里最后一条 `done`。
 *
 * 逐行解析而不是整体 `JSON.parse`：子进程可以先写若干条进度行。
 * **解析不了的行直接跳过**——那是子进程的噪声（比如某个库往 stdout 打日志），
 * 不该让整个任务失败。
 */
function parseDone(stdout: string): DoneLine | undefined {
  let found: DoneLine | undefined
  for (const line of stdout.split("\n")) {
    const s = line.trim()
    if (!s.startsWith("{")) continue
    try {
      const v = JSON.parse(s) as { type?: string }
      if (v.type === "done") found = v as DoneLine
    } catch {
      continue
    }
  }
  return found
}

/** 按字节上限裁剪，但切在字符边界 —— 按字节硬切会切出半个汉字 */
function clip(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8")
  if (buf.byteLength <= maxBytes) return text
  // `toString` 会把结尾不完整的多字节序列变成替换字符，逐个退到干净为止
  let end = maxBytes
  let out = buf.subarray(0, end).toString("utf8")
  while (end > 0 && out.endsWith("�")) {
    end--
    out = buf.subarray(0, end).toString("utf8")
  }
  return out
}

function fail(task: SubagentTask, error: string): SubagentResult {
  return {
    agent: task.agent,
    task: task.task,
    ok: false,
    output: "",
    error,
    outputTruncated: false,
    outputBytes: 0,
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
