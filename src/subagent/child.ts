/**
 * 子 agent 的进程入口（①-B″ · S1）。
 *
 * **这个文件是一个可执行入口，不是库。** 它被单独打成
 * `dist/electron/subagent-child.js`，由父侧用
 * `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 起起来（Spike F 已验证三条：
 * Electron 二进制能当 node 用、能加载 ESM bundle、能 import pi）。
 *
 * 职责只有接线：
 *
 * ```
 * stdin(JSON 规格) → 建一个真的 pi 会话 → runChildTask → stdout(NDJSON done)
 * ```
 *
 * 逻辑全在 `child-task.ts`，那边可以用假会话测；这里只有真实依赖。
 *
 * ## 退出码永远是 0
 *
 * 成败由 `done` 行里的 `ok` 表达，**不由退出码表达**。
 * 父侧 `executor.ts` 的解析顺序也是先看 `done`、拿不到才看退出码——
 * 两边是同一个约定：**退出码只回答「进程有没有正常收摊」，
 * 不回答「任务成没成」。** 混在一起就会出现「非 0 退出但其实有结果」
 * 这种要靠猜的情形。
 *
 * ## 三样刻意关掉的东西
 *
 * `noExtensions` / `noSkills` / `noPromptTemplates`：
 *
 * - **扩展必须关**。开着的话子 agent 会加载用户的扩展，其中就包括
 *   可能存在的「再起一个子 agent」——**嵌套委派**。
 *   计划 §6 把它明确留给阶段 ④，而这里是它唯一能被真正堵住的地方：
 *   不是靠约定，是靠子进程根本没加载那套东西。
 * - skills / prompts 关掉是为了**上下文干净**。子 agent 存在的理由就是
 *   一个小而专注的上下文窗口，把父会话的那一堆再灌一遍就没意义了。
 */
import { mkdirSync } from "node:fs"
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { randomUUID } from "node:crypto"
import type { Credential, CredentialStore } from "@earendil-works/pi-ai"
import { runChildTask, type ChildPiSession } from "./child-task.js"
import type { SubagentChildMessage, SubagentChildSpec, SubagentParentReply } from "./protocol.js"

/**
 * 只读的内存凭证库。
 *
 * 父侧把 apiKey 经 stdin 递进来（**不走环境变量**，理由见 `protocol.ts`），
 * 这里包成 pi 要的形状。写入类方法一律拒绝——**子进程不该改凭证**，
 * 静默成功比报错更糟：那会让「登录态刷新」这类操作看起来生效了。
 */
function memoryCredentials(map: Record<string, string>): CredentialStore {
  const of = (id: string): Credential | undefined => {
    const key = map[id]
    return key ? { type: "api_key", key } : undefined
  }
  return {
    read: async (providerId) => of(providerId),
    list: async () =>
      Object.keys(map).map((providerId) => ({ providerId, type: "api_key" }) as never),
    modify: async (providerId) => {
      throw new Error(`子 agent 进程不允许修改凭证（provider "${providerId}"）`)
    },
    delete: async (providerId) => {
      throw new Error(`子 agent 进程不允许删除凭证（provider "${providerId}"）`)
    },
  }
}

/** 真的建一个 pi 会话。**这是本文件存在的全部理由** */
async function realSession(spec: SubagentChildSpec): Promise<ChildPiSession> {
  mkdirSync(spec.agentDir, { recursive: true })

  const modelRuntime = await ModelRuntime.create({
    // 显式给 null 表示不落盘——与 `NativeRuntime` 同一个约定
    modelsPath: spec.modelsPath ?? null,
    ...(spec.credentials ? { credentials: memoryCredentials(spec.credentials) } : {}),
  })

  const model = modelRuntime.getModel(spec.provider, spec.model)
  if (!model) {
    // **不退化到「随便挑一个能用的」。** 子 agent 用了别的模型而不出声，
    // 是最难查的一类：结果看起来是对的，只是贵了十倍或笨了十倍
    const known = modelRuntime
      .getModels()
      .filter((m) => m.provider === spec.provider)
      .map((m) => m.id)
    throw new Error(
      `provider "${spec.provider}" 下没有模型 "${spec.model}"。` +
        `已知的：${known.join(", ") || "(空——模型目录尚未同步)"}`,
    )
  }

  /**
   * **子 agent 的人格是真的 system prompt**，不是拼进用户消息的一段话。
   * `DefaultResourceLoader` 的 `systemPrompt` 是公开选项，用它。
   */
  const resourceLoader = new DefaultResourceLoader({
    cwd: spec.cwd,
    agentDir: spec.agentDir,
    systemPrompt: spec.systemPrompt,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  })
  await resourceLoader.reload()

  /**
   * **团队成员续会话**（team-board，2026-08-22）：记录落在成员自己的目录；`resume` 时续最近那份。
   * 这就是「可续聊」——进程是新的，记忆在会话文件里。
   */
  const sessionManager = spec.member
    ? spec.member.resume
      ? SessionManager.continueRecent(spec.cwd, spec.member.sessionDir)
      : SessionManager.create(spec.cwd, spec.member.sessionDir)
    : undefined

  const { session } = await createAgentSession({
    cwd: spec.cwd,
    agentDir: spec.agentDir,
    model,
    modelRuntime,
    resourceLoader,
    ...(sessionManager ? { sessionManager } : {}),
    // 定义里没写 tools 就用 pi 的默认工具集——**缺省不等于「不给工具」**
    ...(spec.tools ? { tools: spec.tools } : {}),
    ...(spec.member ? { customTools: 成员工具(spec.member.name) as never } : {}),
  })

  return {
    prompt: (text) => session.prompt(text),
    subscribe: (cb) => session.subscribe(cb as never),
  }
}

/**
 * stdin 按行读：**第一行是规格**（JSON 一行），后面的行是父进程对工具调用的回应（只在成员模式）。
 * 老的写法是读到 EOF——成员模式下父进程要一直开着 stdin 回话，读到 EOF 就永远等不到规格。
 * JSON.stringify 不会产生裸换行，所以「一行」对规格是安全的；父进程不写换行就关掉的老情形也兼容。
 */
const 等回应 = new Map<string, (r: SubagentParentReply) => void>()
let 行缓冲 = ""
let 规格就绪: ((s: string) => void) | undefined
let 规格文本: string | undefined

function 收一行(line: string): void {
  const t = line.trim()
  if (!t) return
  if (规格文本 === undefined) {
    规格文本 = t
    规格就绪?.(t)
    return
  }
  try {
    const r = JSON.parse(t) as SubagentParentReply
    if (r && r.type === "reply") 等回应.get(r.id)?.(r)
  } catch {
    // 不是一行合法的回应：忽略，父侧自己会超时报错
  }
}

process.stdin.setEncoding("utf8")
process.stdin.on("data", (d: string) => {
  行缓冲 += d
  let i: number
  while ((i = 行缓冲.indexOf("\n")) >= 0) {
    收一行(行缓冲.slice(0, i))
    行缓冲 = 行缓冲.slice(i + 1)
  }
})
process.stdin.on("end", () => {
  if (行缓冲) 收一行(行缓冲)
  行缓冲 = ""
})

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (规格文本 !== undefined) return resolve(规格文本)
    规格就绪 = resolve
    process.stdin.on("error", reject)
  })
}

/** 成员模式的工具：调用 = 往 stdout 写一行 `call`，等 stdin 上同 id 的 `reply` */
function 调父进程(name: string, params: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      等回应.delete(id)
      reject(new Error(`${name}：父进程 60 秒没有回应`))
    }, 60_000)
    等回应.set(id, (r) => {
      clearTimeout(timer)
      等回应.delete(id)
      if (r.ok) resolve(r.result)
      else reject(new Error(r.result))
    })
    process.stdout.write(`${JSON.stringify({ type: "call", id, name, params } satisfies SubagentChildMessage)}\n`)
  })
}

function 成员工具(自己: string) {
  const text = (s: string, isError = false) => ({ content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}), details: undefined })
  const 包 = (name: string) => async (_id: string, params: unknown) => {
    try {
      return text(await 调父进程(name, params))
    } catch (e) {
      return text(e instanceof Error ? e.message : String(e), true)
    }
  }
  return [
    {
      name: "team_send",
      label: "team_send",
      description: `给队长或队友发一条消息（你是 ${自己}）。to 填 "captain" 或队友的名字；消息会进对方的邮箱并唤醒对方。做完任务的报告也用它发给 captain。`,
      parameters: Type.Object({ to: Type.String({ description: '"captain" 或队友名' }), content: Type.String({ description: "要说的话" }) }),
      execute: 包("team_send"),
    },
    {
      name: "team_status",
      label: "team_status",
      description: "看一眼团队现状：成员、任务与状态、你手上的任务。",
      parameters: Type.Object({}),
      execute: 包("team_status"),
    },
  ]
}

function emit(msg: SubagentChildMessage): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

async function main(): Promise<void> {
  let spec: SubagentChildSpec
  try {
    spec = JSON.parse(await readStdin()) as SubagentChildSpec
  } catch (err) {
    // 连规格都读不进来。**照样发一条 done**——不发的话父侧只能报
    // 「进程正常退出但没有给出结果」，比真正的原因模糊得多
    emit({
      type: "done",
      ok: false,
      error: `子 agent 进程读不懂父侧递来的规格：${err instanceof Error ? err.message : String(err)}`,
    })
    return
  }

  emit(await runChildTask(spec, realSession))
}

void main().then(
  () => {
    // **显式退出。** pi 可能留着定时器或未关闭的句柄，
    // 那会让子进程在结果早已写出之后还挂着，父侧于是一直等 `close`
    process.exit(0)
  },
  (err: unknown) => {
    // 兜底：`main` 本身不该抛，抛了也要留下一句话再走
    emit({
      type: "done",
      ok: false,
      error: `子 agent 进程异常退出：${err instanceof Error ? err.message : String(err)}`,
    })
    process.exit(0)
  },
)
