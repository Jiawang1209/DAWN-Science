/**
 * 成员的一轮（team-board，2026-08-22）：起一个子进程、递规格、回答它的工具调用、收结果。
 *
 * 与 `subagent/executor.ts` 的 `spawnOne` 是同一副骨架，差两处：
 * - stdin **不关**：子进程会在 stdout 上写 `call` 行，父进程在 stdin 上回 `reply` 行；
 * - 规格带 `member`（会话目录 + 是否续）。
 *
 * 这一层不认识团队状态——它只跑一轮、把 `call` 交给调用方给的 `onCall` 去答。状态机在 scheduler 里。
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { 杀掉后代 } from "../subagent/executor.js"
import type { SubagentDefinition } from "../subagent/definitions.js"
import type { SubagentChildMessage, SubagentChildSpec, SubagentParentReply } from "../subagent/protocol.js"
import type { ChildCommand, SubagentContext } from "../subagent/executor.js"
import { 团队上限, type 成员轮结果 } from "./types.js"

export interface 成员轮规格 {
  definition: SubagentDefinition
  memberName: string
  teamId: string
  /** 这一轮喂给它的话（任务派单或邮箱里的消息） */
  prompt: string
  /** 人设：定义的系统提示 + 团队规则 */
  systemPrompt: string
  /** 成员会话目录的绝对路径 */
  sessionDir: string
  resume: boolean
  /** 每轮一个 agentDir（pi 的设置 / 扩展隔离），关在会话目录里 */
  agentDir: string
  /** 成员自己的模型（有就盖过定义里的与队长的） */
  provider?: string | undefined
  model?: string | undefined
}

export interface 跑一轮选项 {
  childOf: (spec: { definition: SubagentDefinition; agent: string; task: string }) => ChildCommand
  context: Pick<SubagentContext, "provider" | "model" | "cwd" | "modelsPath" | "credentials">
  /** 子进程的工具调用：答一句（字符串）或抛错（错误文本回给子进程） */
  onCall: (name: string, params: unknown) => Promise<string>
  signal?: AbortSignal | undefined
  /** 一轮最多跑多久；0 = 不限 */
  timeoutMs?: number | undefined
}

export function 跑一轮(规格: 成员轮规格, opts: 跑一轮选项): Promise<成员轮结果> {
  const cmd = opts.childOf({ definition: 规格.definition, agent: 规格.definition.name, task: 规格.prompt })
  return new Promise<成员轮结果>((resolve) => {
    if (opts.signal?.aborted) return resolve({ ok: false, output: "", error: "开始前已被中止" })
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(cmd.command, cmd.args, { stdio: ["pipe", "pipe", "pipe"], ...(process.platform !== "win32" ? { detached: true } : {}), ...(cmd.env ? { env: { ...process.env, ...cmd.env } } : {}) })
    } catch (err) {
      return resolve({ ok: false, output: "", error: `子进程起不来：${err instanceof Error ? err.message : String(err)}` })
    }
    let 缓冲 = ""
    let err = ""
    let 结果: 成员轮结果 | undefined
    let settled = false
    const done = (r: 成员轮结果) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.signal?.removeEventListener("abort", onAbort)
      resolve(r)
    }
    function onAbort() {
      杀掉后代(child) // 整组杀:成员起的孙进程(npm test/python)不成孤儿(H6)
      done({ ok: false, output: "", error: "已中止" })
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true })
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          杀掉后代(child)
          done({ ok: false, output: "", error: `这一轮超过 ${Math.round(opts.timeoutMs! / 60000)} 分钟没结束，已杀掉` })
        }, opts.timeoutMs)
      : undefined

    const 回 = (r: SubagentParentReply) => {
      try {
        child.stdin.write(`${JSON.stringify(r)}\n`)
      } catch {
        // 子进程已经走了；没人等这条回应
      }
    }
    const 收一行 = (line: string) => {
      const t = line.trim()
      if (!t) return
      let m: SubagentChildMessage
      try {
        m = JSON.parse(t) as SubagentChildMessage
      } catch {
        return
      }
      if (m.type === "call") {
        void opts.onCall(m.name, m.params).then(
          (result) => 回({ type: "reply", id: m.id, ok: true, result }),
          (e: unknown) => 回({ type: "reply", id: m.id, ok: false, result: e instanceof Error ? e.message : String(e) }),
        )
        return
      }
      if (m.type === "done") {
        if (m.ok) {
          const bytes = Buffer.byteLength(m.output, "utf8")
          结果 = { ok: true, output: bytes > 团队上限.maxOutputBytes ? `${m.output.slice(0, 团队上限.maxOutputBytes)}\n…（输出超过 ${团队上限.maxOutputBytes} 字节，已截断）` : m.output }
        } else 结果 = { ok: false, output: "", error: m.error || "子 agent 报告失败，但没有说原因" }
      }
    }
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (d: string) => {
      缓冲 += d
      let i: number
      while ((i = 缓冲.indexOf("\n")) >= 0) {
        收一行(缓冲.slice(0, i))
        缓冲 = 缓冲.slice(i + 1)
      }
    })
    child.stderr.on("data", (d: string) => (err += d))
    child.on("error", (e) => done({ ok: false, output: "", error: `子进程起不来：${e.message}` }))
    child.on("close", (code) => {
      if (缓冲.trim()) 收一行(缓冲)
      if (结果) return done(结果)
      const detail = err.trim() ? `：${err.trim().slice(-500)}` : ""
      done({ ok: false, output: "", error: code === 0 ? `子进程正常退出，但没有给出结果${detail}` : `子进程以退出码 ${code} 结束${detail}` })
    })
    child.stdin.on("error", () => {})

    const ctx = opts.context
    const spec: SubagentChildSpec = {
      agent: 规格.definition.name,
      task: 规格.prompt,
      systemPrompt: 规格.systemPrompt,
      // 优先级：成员自己的 → 子 agent 定义里的 → 队长当前的
      provider: 规格.provider && 规格.model ? 规格.provider : ctx.provider,
      model: 规格.provider && 规格.model ? 规格.model : 规格.definition.model ?? ctx.model,
      cwd: ctx.cwd,
      agentDir: 规格.agentDir,
      ...(规格.definition.tools ? { tools: 规格.definition.tools } : {}),
      ...(ctx.modelsPath ? { modelsPath: ctx.modelsPath } : {}),
      ...(ctx.credentials ? { credentials: ctx.credentials } : {}),
      member: { team: 规格.teamId, name: 规格.memberName, sessionDir: 规格.sessionDir, resume: 规格.resume },
    }
    // 第一行是规格；**不关 stdin**——后面还要回工具调用
    child.stdin.write(`${JSON.stringify(spec)}\n`)
  })
}
