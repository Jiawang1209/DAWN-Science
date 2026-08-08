/**
 * per-session 隔离配置目录（Task 1.7）。
 *
 * 目标：给一个会话注入 MCP server 与回合结束 hook，**绝不触碰用户全局配置**
 * （`~/.claude`、`~/.codex`）。
 *
 * ⚠️ 本文件的结构与实施计划初稿不同，依据是 Spike B 的实测（见 spikes/FINDINGS.md）。
 * 计划原本假设两个家族都用「环境变量指向配置目录」，实测有两处不成立：
 *
 *   1. claude 的 MCP **不读** settings.json 的 mcpServers。
 *      MCP 走 `--mcp-config <file>`，hook 才走 `--settings <file>`——
 *      两个不同的标志、两个不同的文件。
 *   2. `CLAUDE_CONFIG_DIR` 确实能隔离，但**会一并隔离掉认证**（报 Not logged in），
 *      且复制 .credentials.json 不足以恢复——认证的门是 ~/.claude.json 里的
 *      oauthAccount，而那个文件恰好也被隔离了。
 *
 * 因此 claude 改走显式标志：保住认证，且 `--strict-mcp-config` 给出
 * 「只使用我们注入的 MCP」的**正向保证**，比环境变量的隐式行为更可控。
 *
 * **已知代价**（FINDINGS 已记为 Task 1.7 遗留项）：这条路下会话历史仍会累积进
 * 用户全局 ~/.claude.json。要两全需验证「向隔离的 .claude.json 播种 oauthAccount」
 * 或「用 ANTHROPIC_API_KEY」，二者均未验证。
 *
 * codex 则不同：它的凭证就在 $CODEX_HOME/auth.json，播种即可恢复认证，
 * 所以仍用 CODEX_HOME 做完整隔离。
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { McpServerSpec } from "./types.js"

export interface MaterializeOptions {
  mcpServers: McpServerSpec[]
  /** 回合结束 hook 的可执行路径。claude 走 Stop hook，codex 走 notify。 */
  stopHookCommand?: string
}

export interface MaterializeResult {
  /** 启动进程时要叠加的环境变量 */
  env: Record<string, string>
  /** 要追加到命令行的参数（claude 用，codex 为空） */
  args: string[]
  /** 本次写出的文件，全部位于 sessionDir 之下 */
  writtenFiles: string[]
}

function toMcpMap(servers: McpServerSpec[]): Record<string, unknown> {
  return Object.fromEntries(
    servers.map((s) => [s.name, { command: s.command, args: s.args, env: s.env }]),
  )
}

function materializeClaude(dir: string, opts: MaterializeOptions): MaterializeResult {
  const writtenFiles: string[] = []

  // MCP —— 独立文件，由 --mcp-config 指向。
  // 即使一个 server 都没有也照写：配合 --strict-mcp-config，
  // 空表意味着「这个会话没有任何 MCP」，是个确定的保证而非默认行为。
  const mcpFile = join(dir, "mcp.json")
  writeFileSync(mcpFile, JSON.stringify({ mcpServers: toMcpMap(opts.mcpServers) }, null, 2))
  writtenFiles.push(mcpFile)

  const args = ["--mcp-config", mcpFile, "--strict-mcp-config"]

  // hook —— 另一个文件，由 --settings 指向。没有 hook 就不生成，
  // 因为 --settings 的语义是「叠加额外设置」，空文件只会增加噪音。
  if (opts.stopHookCommand) {
    const settingsFile = join(dir, "settings.json")
    writeFileSync(
      settingsFile,
      JSON.stringify(
        { hooks: { Stop: [{ hooks: [{ type: "command", command: opts.stopHookCommand }] }] } },
        null,
        2,
      ),
    )
    writtenFiles.push(settingsFile)
    args.push("--settings", settingsFile)
  }

  // 刻意不设 CLAUDE_CONFIG_DIR —— 见文件头
  return { env: {}, args, writtenFiles }
}

function materializeCodex(dir: string, opts: MaterializeOptions): MaterializeResult {
  const lines: string[] = []

  for (const s of opts.mcpServers) {
    lines.push(`[mcp_servers.${s.name}]`)
    lines.push(`command = ${JSON.stringify(s.command)}`)
    lines.push(`args = ${JSON.stringify(s.args)}`)
    const envEntries = Object.entries(s.env)
    if (envEntries.length > 0) {
      const inner = envEntries.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")
      lines.push(`env = { ${inner} }`)
    }
    lines.push("")
  }

  // notify 是单值字段，注入即覆盖用户原有的 notify 程序——
  // 这正是必须走 CODEX_HOME 隔离、而不能用 -c 覆盖全局配置的理由。
  if (opts.stopHookCommand) {
    lines.push(`notify = ${JSON.stringify([opts.stopHookCommand])}`)
  }

  const file = join(dir, "config.toml")
  writeFileSync(file, lines.join("\n"))
  return { env: { CODEX_HOME: dir }, args: [], writtenFiles: [file] }
}

const FAMILIES: Record<string, (dir: string, o: MaterializeOptions) => MaterializeResult> = {
  claude: materializeClaude,
  codex: materializeCodex,
}

export function materializeSessionDir(
  family: string,
  sessionDir: string,
  opts: MaterializeOptions,
): MaterializeResult {
  const fn = FAMILIES[family]
  // 无静默回退：不认识的 CLI 直接失败，而不是生成一个不起作用的空配置。
  // 后者的失效方式最糟——进程起得来，但注入的工具与 hook 全都没生效，
  // 而调用方以为一切正常。
  if (!fn) {
    throw new Error(`不支持的 CLI 家族 "${family}"。已支持：${Object.keys(FAMILIES).join(", ")}`)
  }
  mkdirSync(sessionDir, { recursive: true })
  return fn(sessionDir, opts)
}
