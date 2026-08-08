/**
 * Spike A-2 —— 验证 pi 的第三层入口（返工 R1，过 GR 门）
 *
 * **这个 spike 是为一次失败补的。** 原 Spike A 只验了「pi 能不能嵌入进程内跑起来」，
 * 于是 FINDINGS 里没有工具注入的签名可抄，Native Runtime 实现就填了 `tools: []`——
 * agent 一个工具都没有，而这个洞活到了作者手上。
 *
 * 主规划 §5.2 的 GR 门要求本 spike 回答四问：
 *   Q1 `createAgentSession()` 起得来？且能指定模型、能与用户全局配置隔离？
 *   Q2 内置工具真能读文件、跑命令？（**不是"注册了"，是"真的执行了并产生了副作用"**）
 *   Q3 扩展的 `tool_call` 事件真能 `block` 掉一次执行？（capability 授权门的地基）
 *   Q4 凭证能换成我们自己的实现？（Electron safeStorage 的注入点）
 *
 * 跑法：npm run spike:a2   （凭证由 --env-file-if-exists=.env 注入）
 *
 * **隔离纪律**：全程使用临时 agentDir 与临时 cwd，并在前后核对 `~/.pi` 的指纹。
 * Spike B 的教训——per-session 隔离要当场验证，不能假设。
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { createAgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"

const PROVIDER = "deepseek"
const MODEL_ID = "deepseek-v4-flash"

/** 出现在文件里、要求 agent 读出来的暗号。用它判断 read 工具真的读到了内容 */
const READ_SENTINEL = "DAWN-READ-9f3a1c"
/** 要求 agent 用 bash 创建的文件。**用文件是否存在判断命令真的执行了**，不看模型自述 */
const BASH_MARKER = "dawn-bash-ran.txt"
/** 扩展要拦截的命令特征。被拦下时该文件必须不存在 */
const FORBIDDEN_MARKER = "dawn-should-be-blocked.txt"

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("缺少 DEEPSEEK_API_KEY。把它写进项目根目录的 .env（见 .env.example）。")
  process.exit(1)
}

/* ── 全局配置指纹：跑完必须一字未变 ─────────────────────────────── */

function fingerprintPiHome(): string {
  const dir = join(homedir(), ".pi")
  if (!existsSync(dir)) return "absent"
  const walk = (d: string): string[] => {
    const out: string[] = []
    for (const name of readdirSync(d)) {
      const full = join(d, name)
      try {
        const st = statSync(full)
        if (st.isDirectory()) out.push(...walk(full))
        else out.push(`${full}:${st.size}:${st.mtimeMs}`)
      } catch {
        // 权限或竞态导致读不到就跳过——指纹缺一项也好过 spike 崩掉
      }
    }
    return out
  }
  return createHash("sha256").update(walk(dir).sort().join("\n")).digest("hex").slice(0, 16)
}

/* ── Q4：我们自己的凭证实现 ─────────────────────────────────────── */

/**
 * DAWN 侧凭证库的替身。**真实现将由 Electron safeStorage 加密**，
 * 本 spike 只验注入点存不存在、pi 会不会真的来读。
 *
 * 只需实现 pi-ai 的 `CredentialStore` 四个方法——这比原计划的
 * `AuthStorageBackend` 更靠上，也更干净：后者要处理文件锁语义，前者只管存取。
 */
class ProbeCredentialStore implements CredentialStore {
  readonly reads: string[] = []
  constructor(private readonly key: string) {}

  async read(providerId: string): Promise<Credential | undefined> {
    this.reads.push(providerId)
    return providerId === PROVIDER ? { type: "api_key", key: this.key } : undefined
  }
  async list(): Promise<readonly CredentialInfo[]> {
    return [{ providerId: PROVIDER, type: "api_key" }]
  }
  async modify(
    _providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    return fn(undefined)
  }
  async delete(): Promise<void> {}
}

/* ── Q3：拦截 bash 的扩展 ───────────────────────────────────────── */

const EXTENSION_SOURCE = `
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

/** Spike A-2 的授权门探针：命令里出现禁止标记就拦下。 */
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash" && String(event.input?.command ?? "").includes("${FORBIDDEN_MARKER}")) {
      return { block: true, reason: "DAWN-BLOCKED-BY-EXTENSION" }
    }
    return undefined
  })
}
`

/* ── 证据收集 ───────────────────────────────────────────────────── */

interface Evidence {
  toolCalls: { name: string; input: unknown }[]
  toolResults: { name: string; isError: boolean; text: string }[]
  assistantText: string
  eventTypes: Set<string>
  errors: string[]
}

function collect(session: { subscribe: (l: (e: unknown) => void) => () => void }, ev: Evidence) {
  return session.subscribe((raw) => {
    const e = raw as Record<string, unknown>
    const type = String(e.type ?? "")
    ev.eventTypes.add(type)

    if (type === "message_update") {
      const m = e.assistantMessageEvent as Record<string, unknown> | undefined
      if (m?.type === "text_delta") ev.assistantText += String(m.delta ?? "")
    }
    if (type === "tool_execution_start") {
      ev.toolCalls.push({ name: String(e.toolName ?? "?"), input: e.args ?? e.input })
    }
    if (type === "tool_execution_end") {
      const result = e.result as Record<string, unknown> | undefined
      const content = (result?.content ?? []) as { type?: string; text?: string }[]
      ev.toolResults.push({
        name: String(e.toolName ?? "?"),
        isError: Boolean(result?.isError),
        text: content.map((c) => c.text ?? "").join(""),
      })
    }
    if (type === "agent_end" || type === "error") {
      const msg = e.errorMessage ?? e.message
      if (msg) ev.errors.push(String(msg))
    }
  })
}

/* ── 主流程 ─────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const before = fingerprintPiHome()

  const root = mkdtempSync(join(tmpdir(), "dawn-spike-a2-"))
  const agentDir = join(root, "agent")
  const cwd = join(root, "workspace")
  mkdirSync(join(agentDir, "extensions"), { recursive: true })
  mkdirSync(cwd, { recursive: true })

  // Q2 的素材：一个含暗号的文件
  writeFileSync(join(cwd, "secret.txt"), `这是给 agent 读的文件。暗号是 ${READ_SENTINEL}。\n`)
  // Q3 的素材：拦截扩展
  writeFileSync(join(agentDir, "extensions", "dawn-gate.ts"), EXTENSION_SOURCE)

  const credentials = new ProbeCredentialStore(process.env.DEEPSEEK_API_KEY!)

  // authPath/modelsPath 显式给到临时目录：不碰用户的 ~/.pi
  const modelRuntime = await ModelRuntime.create({
    credentials,
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  })

  const model = modelRuntime.getModel(PROVIDER, MODEL_ID)
  if (!model) {
    console.error(`模型 ${PROVIDER}/${MODEL_ID} 不在 pi 的内置目录里。可用的：`)
    console.error(modelRuntime.getModels?.().map((m: { id: string }) => m.id).join(", ") ?? "(取不到清单)")
    process.exit(1)
  }

  const { session } = await createAgentSession({ cwd, agentDir, model, modelRuntime })

  const ev: Evidence = {
    toolCalls: [],
    toolResults: [],
    assistantText: "",
    eventTypes: new Set(),
    errors: [],
  }
  const unsubscribe = collect(session as never, ev)

  // 一次 prompt 里同时触发三件事：读文件、跑一条允许的命令、跑一条该被拦的命令
  await session.prompt(
    [
      `请依次做三件事，每件都必须真的调用工具，不要凭空回答：`,
      `1. 读 secret.txt，把里面的暗号原样复述出来。`,
      `2. 用 bash 执行：touch ${BASH_MARKER}`,
      `3. 用 bash 执行：touch ${FORBIDDEN_MARKER}`,
      `第 3 条如果被拒绝，如实说明被拒绝了，不要重试、不要换别的命令绕过。`,
    ].join("\n"),
  )
  await session.waitForIdle()
  unsubscribe()
  session.dispose()

  const after = fingerprintPiHome()

  /* ── 判定 ─────────────────────────────────────────────────────── */

  const named = (n: string) => ev.toolCalls.some((c) => c.name === n)
  const bashRan = existsSync(join(cwd, BASH_MARKER))
  const blockedFileAbsent = !existsSync(join(cwd, FORBIDDEN_MARKER))
  const blockEvidence = ev.toolResults.some((r) => r.text.includes("DAWN-BLOCKED-BY-EXTENSION"))

  const results: [string, boolean, string][] = [
    ["Q1 会话起得来且用的是指定模型", Boolean(session), `${model.provider}/${model.id}`],
    ["Q1 未污染 ~/.pi", before === after, `前 ${before} / 后 ${after}`],
    ["Q2 read 工具被调用", named("read"), ev.toolCalls.map((c) => c.name).join(", ") || "(无工具调用)"],
    ["Q2 read 真的读到了内容", ev.assistantText.includes(READ_SENTINEL), `回答含暗号 = ${ev.assistantText.includes(READ_SENTINEL)}`],
    ["Q2 bash 工具被调用", named("bash"), ""],
    ["Q2 bash 真的执行了（文件已创建）", bashRan, `${BASH_MARKER} exists = ${bashRan}`],
    ["Q3 扩展拦下了执行（结果里有拦截理由）", blockEvidence, ev.toolResults.filter((r) => r.isError).map((r) => r.text.slice(0, 80)).join(" | ")],
    ["Q3 被拦的命令确实没执行（文件不存在）", blockedFileAbsent, `${FORBIDDEN_MARKER} absent = ${blockedFileAbsent}`],
    ["Q4 pi 来读了我们的凭证库", credentials.reads.includes(PROVIDER), `read() 被调用 ${credentials.reads.length} 次：${credentials.reads.join(", ")}`],
    ["Q4 凭证未落盘到 auth.json", !existsSync(join(agentDir, "auth.json")), ""],
  ]

  console.log("\n══════ Spike A-2 判定 ══════\n")
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `\n     ${detail}` : ""}`)
  }

  console.log("\n── 观察到的事件类型 ──")
  console.log([...ev.eventTypes].sort().join(", "))
  console.log("\n── 工具调用序列 ──")
  for (const c of ev.toolCalls) console.log(`  ${c.name}  ${JSON.stringify(c.input).slice(0, 120)}`)
  console.log("\n── 工具结果 ──")
  for (const r of ev.toolResults) console.log(`  ${r.name} ${r.isError ? "[错误]" : ""} ${r.text.slice(0, 120).replace(/\n/g, " ")}`)
  if (ev.errors.length) {
    console.log("\n── 报错 ──")
    for (const e of ev.errors) console.log(`  ${e}`)
  }
  console.log("\n── agent 最终文本 ──")
  console.log(ev.assistantText.trim().slice(0, 600) || "(空)")

  const passed = results.every(([, ok]) => ok)
  console.log(`\n══════ ${passed ? "GR 门通过" : "GR 门未通过——停在 R1，不进 R2"} ══════`)
  console.log(`临时目录（未删，供查证）：${root}\n`)

  if (!passed) process.exitCode = 1
}

main().catch((err) => {
  console.error("Spike A-2 异常终止：", err)
  process.exit(1)
})
