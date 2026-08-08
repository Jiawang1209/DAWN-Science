/**
 * CLI 入口（**临时版**）。
 *
 * ⚠️ 这不是计划里的 Task 1.11，而是提前插入的一个最小可跑版本，目的是让作者
 * 在 Runtime 真实现（Task 1.9–1.10）落地之前就能上手，尽早发现设计上不合用的地方。
 * 依据主规划 §5 的 G2 决策门——「判据不是功能清单，是行为：你是否真的开始用它」。
 *
 * 现在能做：
 *   dawn agents    读 providers.yaml，列出所有 agent（验证配置层）
 *   dawn sessions  列出落库的会话（验证存储层）
 *   dawn demo      用 FakeRuntime 跑一遍完整生命周期（验证会话层与租约）
 *
 * 还不能做：`dawn run <agent>` —— 需要 PtyRuntime / NativeRuntime，Task 1.9–1.10 补。
 */
import Database from "better-sqlite3"
import { existsSync } from "node:fs"
import { loadRegistry } from "./config/loader.js"
import { migrate } from "./store/schema.js"
import { SessionStore } from "./store/sessions.js"
import { FakeRuntime } from "./runtime/fake.js"
import { SessionManager } from "./session/manager.js"

const CONFIG = process.env.DAWN_CONFIG ?? "providers.yaml"
const DB = process.env.DAWN_DB ?? ".dawn.db"

function openStore(): SessionStore {
  const db = new Database(DB)
  migrate(db)
  return new SessionStore(db)
}

function requireConfig() {
  if (!existsSync(CONFIG)) {
    console.error(`找不到配置文件 ${CONFIG}`)
    console.error(`先执行：cp providers.example.yaml providers.yaml`)
    console.error(`并在 .env 里填好凭证（见 .env.example）`)
    process.exit(1)
  }
  return loadRegistry(CONFIG)
}

function cmdAgents(): void {
  const reg = requireConfig()
  const rows = Object.entries(reg.agents).map(([id, def]) => ({
    agent: id,
    kind: def.kind,
    目标: def.kind === "native" ? `${def.endpoint} / ${def.model}` : [def.command, ...def.args].join(" "),
    capabilities: def.capabilities.join(","),
  }))
  console.log(`配置：${CONFIG}\n`)
  console.table(rows)
  console.log(`endpoints：${Object.keys(reg.endpoints).join(", ") || "（无）"}`)
}

function cmdSessions(): void {
  const store = openStore()
  const fixed = store.reconcileOnStartup()
  if (fixed > 0) console.log(`启动对账：${fixed} 条残留会话已修正为 exited\n`)
  const rows = store.list()
  if (rows.length === 0) {
    console.log(`数据库 ${DB} 中还没有会话。试试 dawn demo。`)
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

async function cmdDemo(): Promise<void> {
  const reg = requireConfig()
  const agentId = process.argv[3] ?? Object.keys(reg.agents)[0]!
  const store = openStore()
  const runtime = new FakeRuntime()
  const mgr = new SessionManager({
    store,
    registry: reg,
    runtimes: { native: runtime, pty: runtime },
    workspaceRoot: process.cwd(),
  })

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
  const cmd = process.argv[2]
  switch (cmd) {
    case "agents":
      return cmdAgents()
    case "sessions":
      return cmdSessions()
    case "demo":
      return cmdDemo()
    default:
      console.log(`DAWN Science —— 临时 CLI（Task 1.11 会补全）

  dawn agents           列出配置里的所有 agent
  dawn sessions         列出落库的会话
  dawn demo [agent]     用 FakeRuntime 跑一遍完整生命周期

环境变量：
  DAWN_CONFIG   配置文件路径，默认 providers.yaml
  DAWN_DB       SQLite 路径，默认 .dawn.db

尚未实现：dawn run <agent>（需要 Task 1.9–1.10 的真实 Runtime）`)
      process.exit(cmd ? 1 : 0)
  }
}

main().catch((e) => {
  console.error(`\n✗ ${(e as Error).message}`)
  process.exit(1)
})
