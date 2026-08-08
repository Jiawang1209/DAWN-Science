/**
 * Spike B —— PTY + MCP 注入 + Hook 完成信号 + 配置隔离
 *
 * 验证问题（实施计划 Task 0.3 Step 4）：
 *   Q1 claude 能否在 PTY 里跑起来，且配置来自我们指定的隔离文件？
 *   Q2 探针日志出现 {"kind":"tool"} —— MCP 工具可见且可调用？
 *   Q3 探针日志出现 {"kind":"hook"} —— 回合结束信号拿得到？
 *   Q4 用户全局配置未被修改？
 *
 * 与原计划的偏差（已实测，见 FINDINGS.md）：
 *   计划假设用 CLAUDE_CONFIG_DIR 做隔离。实测该变量确实生效且隔离彻底，
 *   但**会一并隔离掉认证**（oauthAccount 存在被隔离的 .claude.json 里），
 *   导致 "Not logged in"。故这里改用显式标志：
 *     --mcp-config <file> --strict-mcp-config --settings <file>
 *   它保住认证，且 --strict-mcp-config 给出「只用我们注入的 MCP」的正向保证。
 *
 * 跑法：npm run spike:b
 */
import { spawn } from "node-pty"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"

const REPO = resolve(import.meta.dirname, "..")
const PROMPT_DELAY_MS = 8_000
const OVERALL_TIMEOUT_MS = 150_000
const POLL_MS = 500

const GLOBAL_SETTINGS = join(homedir(), ".claude", "settings.json")

function md5(path: string): string {
  if (!existsSync(path)) return "(不存在)"
  return execFileSync("md5", ["-q", path]).toString().trim()
}

const sessionDir = mkdtempSync(join(tmpdir(), "dawn-spike-b-"))
const probeLog = join(sessionDir, "probe.jsonl")
writeFileSync(probeLog, "")

// 隔离配置：MCP server 与 Stop hook 分两个文件，对应两个不同的 claude 标志
writeFileSync(
  join(sessionDir, "mcp.json"),
  JSON.stringify({
    mcpServers: {
      "dawn-probe": {
        command: join(REPO, "node_modules/.bin/tsx"),
        args: [join(REPO, "spikes/mcp-probe-server.ts")],
        env: { DAWN_PROBE_LOG: probeLog },
      },
    },
  }, null, 2),
)
writeFileSync(
  join(sessionDir, "settings.json"),
  JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: "command", command: join(REPO, "spikes/hook-probe.sh") }] }] },
  }, null, 2),
)

function readProbe(): { kind: string }[] {
  if (!existsSync(probeLog)) return []
  return readFileSync(probeLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { kind: string })
}

async function main() {
  const before = md5(GLOBAL_SETTINGS)
  console.log("隔离配置目录:", sessionDir)
  console.log("全局 settings.json md5（前）:", before)
  console.log("─".repeat(70))

  const p = spawn("claude", [
    "--mcp-config", join(sessionDir, "mcp.json"),
    "--strict-mcp-config",
    "--settings", join(sessionDir, "settings.json"),
    "--allowedTools", "mcp__dawn-probe__dawn_probe",
  ], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: REPO,
    env: { ...process.env, DAWN_PROBE_LOG: probeLog } as Record<string, string>,
  })

  let sawOutput = false
  p.onData((d) => {
    sawOutput = true
    process.stdout.write(d)
  })

  let exitCode: number | undefined
  p.onExit(({ exitCode: c }) => { exitCode = c })

  // 等 TUI 与 MCP server 起来，再打字
  await new Promise((r) => setTimeout(r, PROMPT_DELAY_MS))
  console.log("\n─── 写入 prompt ───")
  p.write('请调用 dawn_probe 工具，message 参数填 "hello from pty"。调用完直接结束，不要做别的。\r')

  // 轮询探针日志，两条都到齐就收工
  const deadline = Date.now() + OVERALL_TIMEOUT_MS
  let entries: { kind: string }[] = []
  while (Date.now() < deadline) {
    entries = readProbe()
    if (entries.some((e) => e.kind === "tool") && entries.some((e) => e.kind === "hook")) break
    if (exitCode !== undefined) break
    await new Promise((r) => setTimeout(r, POLL_MS))
  }

  if (exitCode === undefined) {
    p.kill()
    await new Promise((r) => setTimeout(r, 500))
  }

  const after = md5(GLOBAL_SETTINGS)
  entries = readProbe()

  const q1 = sawOutput
  const q2 = entries.some((e) => e.kind === "tool")
  const q3 = entries.some((e) => e.kind === "hook")
  const q4 = before === after

  console.log(`\n${"═".repeat(70)}\n探针日志\n${"═".repeat(70)}`)
  console.log(readFileSync(probeLog, "utf8") || "（空）")
  console.log(`${"═".repeat(70)}\n判定\n${"═".repeat(70)}`)
  console.log(`Q1 claude 在 PTY 中启动并有输出   : ${q1 ? "是" : "否"}`)
  console.log(`Q2 MCP 工具可见且被调用           : ${q2 ? "是" : "否"}`)
  console.log(`Q3 Stop hook 触发（回合结束信号） : ${q3 ? "是" : "否"}`)
  console.log(`Q4 全局 settings.json 未被修改    : ${q4 ? `是（${after}）` : `否！前=${before} 后=${after}`}`)
  console.log(`\n四问全「是」→ Spike B 通过：${q1 && q2 && q3 && q4 ? "✅" : "❌"}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
