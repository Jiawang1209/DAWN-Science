/**
 * CLI 入口（Task 1.11）。
 *
 *   dawn agents           列出配置里的所有 agent
 *   dawn run <agent>      起一个会话并接管当前终端
 *   dawn sessions         列出落库的会话
 *   dawn demo [agent]     用 FakeRuntime 跑一遍生命周期，不起真实进程
 *
 * 环境变量：DAWN_CONFIG（默认 providers.yaml）、DAWN_DB（默认 .dawn.db）
 */
import Database from "better-sqlite3"
import { basename } from "node:path"
import { existsSync } from "node:fs"
import { loadRegistry } from "./config/loader.js"
import { migrate } from "./store/schema.js"
import { SessionStore } from "./store/sessions.js"
import { SessionManager, type PtyAgentDef } from "./session/manager.js"
import { FakeRuntime } from "./runtime/fake.js"
import { NativeRuntime } from "./runtime/native.js"
import { PtyRuntime } from "./runtime/pty.js"
import type { ProviderRegistry } from "./config/schema.js"

const CONFIG = process.env.DAWN_CONFIG ?? "providers.yaml"
const DB = process.env.DAWN_DB ?? ".dawn.db"

/**
 * 从命令名推断 CLI 家族，决定隔离配置怎么写。
 * 认不出就返回 undefined —— 那时 PtyRuntime 不写任何配置，
 * 直接裸起进程。**这比猜一个家族安全**：猜错会生成一份该 CLI 读不懂的配置，
 * 而进程照样起得来，用户以为注入生效了。
 */
function familyOf(command: string): string | undefined {
  const base = basename(command).replace(/\.(exe|cmd|bat)$/i, "")
  return base === "claude" || base === "codex" ? base : undefined
}

function requireConfig(): ProviderRegistry {
  if (!existsSync(CONFIG)) {
    console.error(`找不到配置文件 ${CONFIG}`)
    console.error(`先执行：cp providers.example.yaml providers.yaml`)
    console.error(`并在 .env 里填好凭证（见 .env.example）`)
    process.exit(1)
  }
  return loadRegistry(CONFIG)
}

function openStore(): SessionStore {
  const db = new Database(DB)
  migrate(db)
  return new SessionStore(db)
}

function makeManager(registry: ProviderRegistry, store: SessionStore, fake = false): SessionManager {
  const fakeRt = new FakeRuntime()
  const mgr = new SessionManager({
    store,
    registry,
    runtimes: fake
      ? { native: fakeRt, pty: fakeRt }
      : { native: new NativeRuntime(), pty: new PtyRuntime({ command: "sh" }) },
    // pty agent 的命令逐个由 registry 定义，不能共用一个写死的 runtime
    ...(fake
      ? {}
      : {
          ptyRuntimeFor: (_id: string, def: PtyAgentDef) => {
            const family = familyOf(def.command)
            return new PtyRuntime({
              command: def.command,
              args: def.args,
              ...(family ? { family } : {}),
            })
          },
        }),
    workspaceRoot: process.cwd(),
  })
  const fixed = mgr.reconcileOnStartup()
  if (fixed > 0) console.error(`[启动对账] 修正了 ${fixed} 条残留会话记录`)
  return mgr
}

function cmdAgents(): void {
  const reg = requireConfig()
  console.log(`配置：${CONFIG}\n`)
  console.table(
    Object.entries(reg.agents).map(([id, def]) => ({
      agent: id,
      kind: def.kind,
      目标: def.kind === "native" ? `${def.endpoint} / ${def.model}` : [def.command, ...def.args].join(" "),
      家族: def.kind === "pty" ? (familyOf(def.command) ?? "（无隔离配置）") : "—",
      capabilities: def.capabilities.join(","),
    })),
  )
  console.log(`endpoints：${Object.keys(reg.endpoints).join(", ") || "（无）"}`)
}

function cmdSessions(): void {
  const store = openStore()
  const fixed = store.reconcileOnStartup()
  if (fixed > 0) console.log(`启动对账：${fixed} 条残留会话已修正为 exited\n`)
  const rows = store.list()
  if (rows.length === 0) {
    console.log(`数据库 ${DB} 中还没有会话。试试 dawn demo 或 dawn run <agent>。`)
    return
  }
  console.table(
    rows.map((s) => ({
      id: s.id.slice(0, 8),
      agent: s.agentId,
      state: s.state,
      pid: s.pid ?? "",
      exit: s.exitCode ?? "",
      created: s.createdAt,
    })),
  )
}

/** 起一个会话并把当前终端交给它。 */
async function cmdRun(agentId: string | undefined): Promise<void> {
  if (!agentId) {
    console.error("用法: dawn run <agentId>")
    process.exit(2)
  }
  const reg = requireConfig()
  const def = reg.agents[agentId]
  if (!def) {
    console.error(`未知的 agent "${agentId}"。已配置：${Object.keys(reg.agents).join(", ")}`)
    process.exit(1)
  }

  const store = openStore()
  const mgr = makeManager(reg, store)
  const session = await mgr.create(agentId, process.cwd())
  console.error(`[会话 ${session.id.slice(0, 8)}] agent=${agentId} kind=${def.kind} pid=${session.pid}`)
  if (def.kind === "native") console.error(`[提示] 输入内容后回车发送，Ctrl-C 退出`)

  // 人接管：user 持有租约，engine 不得抢占（规格 7.1）
  mgr.leases.acquire(session.id, "user")

  let restored = false
  const restore = (): void => {
    if (restored) return
    restored = true
    if (process.stdin.isTTY) process.stdin.setRawMode?.(false)
    process.stdin.pause()
  }

  mgr.attach(session.id, (e) => {
    if (e.kind === "output") process.stdout.write(e.data)
    if (e.kind === "exited") {
      console.error(`\n[退出 ${e.exitCode}]`)
      restore()
      process.exit(e.exitCode)
    }
  })

  // pty 会话要原始模式，键盘按键才能原样送进 TUI（含 Ctrl-C）；
  // native 会话按行输入，保持常规模式，让 Ctrl-C 仍能终止 CLI 自身。
  const raw = def.kind === "pty"
  if (raw && process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on("data", (buf: Buffer) => {
    // 常规模式下 Ctrl-C 由 SIGINT 处理；原始模式下 0x03 原样透传给子进程
    mgr.write(session.id, buf.toString(), "user")
  })

  // 管道输入到 EOF：native 会话要等当前回合跑完再收摊，
  // 否则脚本化调用（echo ... | dawn run）会在模型还没答完时就被切断。
  process.stdin.on("end", () => {
    void (async () => {
      const rt = mgr.runtimeOf(session.id)
      if (rt instanceof NativeRuntime) await rt.waitForIdle(session.id)
      await mgr.stop(session.id)
      restore()
      process.exit(0)
    })()
  })

  // 终端尺寸变化要转发给 pty，否则 TUI 会按旧尺寸渲染
  if (raw) {
    process.stdout.on("resize", () => {
      mgr.resize(session.id, process.stdout.columns, process.stdout.rows)
    })
  }

  const shutdown = async (): Promise<void> => {
    restore()
    await mgr.stop(session.id)
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())
}

async function cmdDemo(agentIdArg?: string): Promise<void> {
  const reg = requireConfig()
  const agentId = agentIdArg ?? Object.keys(reg.agents)[0]!
  const store = openStore()
  const mgr = makeManager(reg, store, true)

  console.log(`用 FakeRuntime 跑一遍生命周期（不起真实进程）\n`)
  const s = await mgr.create(agentId, process.cwd())
  console.log(`1. 创建会话  id=${s.id.slice(0, 8)}  agent=${s.agentId}  state=${store.get(s.id)!.state}`)

  mgr.attach(s.id, (e) => {
    if (e.kind === "output") console.log(`   ← runtime 输出：${e.data}`)
  })

  const lease = mgr.leases.acquire(s.id, "engine")
  console.log(`2. engine 取得租约  指纹=${lease.fingerprint}  到期=${lease.expiresAt}`)
  mgr.write(s.id, "hello", "engine")

  console.log(`3. user 抢占前预览：`, mgr.leases.previewTakeover(s.id, "user"))
  mgr.leases.acquire(s.id, "user")

  try {
    mgr.write(s.id, "engine 还想写", "engine")
    console.log(`   ✗ 不该走到这里`)
  } catch (e) {
    console.log(`4. engine 被拒：${(e as Error).message}`)
  }
  mgr.write(s.id, "现在是 user 在写", "user")

  await mgr.stop(s.id)
  console.log(`5. 停止会话  state=${store.get(s.id)!.state}`)
  console.log(`\n租约审计链：`)
  console.table(mgr.leases.audit(s.id).map((e) => ({ action: e.action, holder: e.holder, at: e.at })))
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv
  switch (cmd) {
    case "agents":
      return cmdAgents()
    case "sessions":
      return cmdSessions()
    case "run":
      return cmdRun(rest[0])
    case "demo":
      return cmdDemo(rest[0])
    default:
      console.log(`DAWN Science

  dawn agents           列出配置里的所有 agent
  dawn run <agent>      起一个会话并接管当前终端
  dawn sessions         列出落库的会话
  dawn demo [agent]     用 FakeRuntime 跑一遍完整生命周期

环境变量：
  DAWN_CONFIG   配置文件路径，默认 providers.yaml
  DAWN_DB       SQLite 路径，默认 .dawn.db`)
      process.exit(cmd ? 1 : 0)
  }
}

main().catch((e) => {
  console.error(`\n✗ ${(e as Error).message}`)
  process.exit(1)
})
