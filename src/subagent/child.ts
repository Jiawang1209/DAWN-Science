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
} from "@earendil-works/pi-coding-agent"
import type { Credential, CredentialStore } from "@earendil-works/pi-ai"
import { runChildTask, type ChildPiSession } from "./child-task.js"
import type { SubagentChildMessage, SubagentChildSpec } from "./protocol.js"

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

  const { session } = await createAgentSession({
    cwd: spec.cwd,
    agentDir: spec.agentDir,
    model,
    modelRuntime,
    resourceLoader,
    // 定义里没写 tools 就用 pi 的默认工具集——**缺省不等于「不给工具」**
    ...(spec.tools ? { tools: spec.tools } : {}),
  })

  return {
    prompt: (text) => session.prompt(text),
    subscribe: (cb) => session.subscribe(cb as never),
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (d) => (raw += d))
    process.stdin.on("end", () => resolve(raw))
    process.stdin.on("error", reject)
  })
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
