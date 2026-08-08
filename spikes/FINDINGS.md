# Phase 0 Spike 结论

> 本文件是 Phase 0 四个 spike 的**事实记录**，Part 1 的实现任务直接依赖它。
> 只写实测到的，不写推测。每节标注实测日期与所用版本。

---

## Spike A — pi 可嵌入性 ✅ 通过

- **日期**：2026-08-08
- **版本**：`@earendil-works/pi-agent-core` 0.84.1 · `@earendil-works/pi-ai` 0.84.1 · Node v22.23.0
- **脚本**：`spikes/a-pi-embed.ts`（`npm run spike:a`）
- **结论**：**三个问题全为「是」→ Native Runtime 走 pi，不自建 loop。**

### 判定表

| 问题 | 结果 |
|---|---|
| Q1 能否注入自定义工具，模型能看到并调用 | ✅ 是 |
| Q2 schema 是否被强制 | ✅ 是，**且带自动重试**，详见下文 |
| Q3 能否拿到流式事件 / token 用量 / 工具调用记录 | ✅ 是，三者齐全，另附成本 |

### 实际使用的导入符号

```ts
import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core"
import { calculateCost, createModels, Type, type Api, type Model } from "@earendil-works/pi-ai"
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek"
```

`pi-agent-core` 的 `index.d.ts` 有 `export * from "./types.ts"`，故 `AgentTool` / `AgentEvent` / `AgentContext` 等类型均可从包根导入。
`pi-ai` 的 `package.json` exports 开放了 `./providers/*` 与 `./api/*` 两个子路径，深层导入是**受支持的**，不是抄近路。

### 重要发现：pi 内置 deepseek provider

不需要自建 provider。`deepseekProvider()` 直接可用，且自带模型元数据（成本、上下文窗口、thinking 级别映射）。

**但它只认两个 model id**：

| id | 名称 | 上下文窗口 | 输入 $/M | 输出 $/M |
|---|---|---|---|---|
| `deepseek-v4-flash` | DeepSeek V4 Flash | 1,000,000 | 0.14 | 0.28 |
| `deepseek-v4-pro` | DeepSeek V4 Pro | 1,000,000 | 0.435 | 0.87 |

两者 `api` 均为 `openai-completions`，`baseUrl` 为 `https://api.deepseek.com`，`reasoning: true`。

> **对实施计划的影响**：计划中多处写的 `deepseek-chat` / `deepseek-reasoner` 虽然直接打 HTTP 仍返回 200（2026-08-08 实测），但**不在 pi 的注册表里**，`models.getModel("deepseek", "deepseek-chat")` 会返回 `undefined`。
> 因此 `providers.yaml` 必须使用 v4 系列 id。这同时解决了别名漂移的可追溯性问题。

### 创建会话的完整调用签名

```ts
const models = createModels()                    // → MutableModels
models.setProvider(deepseekProvider())
const model = models.getModel("deepseek", "deepseek-v4-flash")   // → Model<Api> | undefined
const streamFn = models.streamSimple.bind(models)                // 满足 StreamFn 契约

const agent = new Agent({
  streamFn,                                      // 必填
  initialState: { systemPrompt, model, tools },  // 均为可选，Partial<AgentState>
  beforeToolCall: async (ctx) => undefined,      // 可选钩子
})
agent.subscribe((event: AgentEvent) => { /* ... */ })   // 返回退订函数
await agent.prompt("...")
await agent.waitForIdle()                        // agent_end 的监听器全部 settle 后才 resolve
```

**认证**：`DEEPSEEK_API_KEY` 由 provider 内部经 `envApiKeyAuth` 从 `process.env` 读取，**不需要在代码里传 key**。本项目通过 `tsx --env-file-if-exists=.env` 注入。

### 工具注册方式

`AgentTool<TSchema>` 扩展自 `pi-ai` 的 `Tool<TParameters>`，schema 用 **TypeBox**（`Type.*`），**不是 zod**：

```ts
const ReportSchema = Type.Object({
  verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("unknown")]),
  evidence: Type.String({ minLength: 1 }),
})

const reportTool: AgentTool<typeof ReportSchema> = {
  name: "report",
  label: "Report",              // AgentTool 相对 Tool 多出的 UI 字段
  description: "...",
  parameters: ReportSchema,
  execute: async (toolCallId, params, signal?, onUpdate?) => ({
    content: [{ type: "text", text: "已记录" }],
    details: { received: params },   // 任意结构，进日志/UI，不进模型上下文
  }),
}
```

工具通过 `initialState.tools` 或 `agent.state.tools = [...]` 挂载（赋值会复制顶层数组）。

> **分工结论**：zod 与 typebox 并存，各管一段——**zod 管配置校验**（`providers.yaml`，Task 1.1），**typebox 管工具 schema**。不需要二选一，也不需要转换层。

### Q2 schema 强制的观察结果（关键）

诱导 prompt：要求模型把 `verdict` 原样填成 `"maybe"`（schema 只允许 pass/fail/unknown）。

实测序列（两次独立运行结果一致）：

1. 模型照做，发出 `report({verdict: "maybe", ...})`
2. `tool_execution_start` 事件触发，**携带非法值 `"maybe"`**
3. pi 校验失败 → `tool_execution_end` 的 `isError: true`
4. **`beforeToolCall` 钩子未触发；`execute()` 未被调用**
5. 错误作为 tool result 回传模型，模型读懂后自行改填 `"unknown"` 重试，第二次通过
6. 模型给出的 evidence 原文：*「工具 schema 只允许 pass/fail/unknown 三个值，校验失败」*——说明**错误信息足够具体，模型能据此自我修正**

**结论：schema 被引擎强制，且失败会自动重试。Native Runtime 不需要自建校验层。**

> ⚠️ **给 Task 1.6 的告警**：`tool_execution_start` 事件携带的是**校验前**的原始 args；`beforeToolCall` 与 `execute()` 收到的才是**校验后**的。
> **审计日志若从 `tool_execution_start` 取参数，记录的是未经校验的模型原始输出。**
> 这未必是坏事——记录模型「试图做什么」对防幻觉分析有价值——但两者必须区分标注，不能混为一谈。建议事件流同时保留两者，并在 schema 上分别命名（如 `argsRaw` / `argsValidated`）。

### Q3 事件流形状

`AgentEvent` 共 11 种。实测一轮完整对话（含一次工具调用）的折叠序列：

```
agent_start
  → turn_start
    → message_start → message_end                    (thinking 块)
    → message_start → message_update×61 → message_end (流式正文)
    → tool_execution_start → tool_execution_end
    → message_start → message_end                    (tool result 消息)
  → turn_end
  → turn_start
    → message_start → message_update×10 → message_end
  → turn_end
→ agent_end
```

- `message_update` 是逐 token 的流式增量，一轮可达数十至上百条——**UI 层必须做节流**，事件日志也不应逐条落库。
- **token 用量**在 `message_end` 的 `message.usage` 上，形如
  `{input, output, cacheRead, cacheWrite, reasoning, totalTokens, cost:{...}}`。
- **usage 里已自带 `cost` 字段**，`calculateCost(model, usage)` 是额外的独立算法。规格 7.28 要求的成本实测披露有现成数据来源。
- 实测单轮成本量级：约 **$0.000006 – $0.000034**（deepseek-v4-flash，短对话）。

### 遗留 / 未验证

- 未验证 `AgentHarness`（更高层的封装，含 compaction / skills / session 持久化）。阶段①-A 只需 `Agent`，`AgentHarness` 留待 Task 1.10 评估。
- 未验证中断（`agent.abort()`）的实际行为——阶段①-A 的输入租约与会话生命周期会用到，Task 1.6 需补测。
- 未验证多工具并发（`toolExecution: "parallel"`）。

---

## Spike B — PTY + MCP + Hook 三件套 ✅ 通过（claude）／⚠️ 部分验证（codex）

- **日期**：2026-08-08
- **版本**：`claude` 2.1.225 · `codex-cli` 0.146.0 · `node-pty` 1.1.0 · `@modelcontextprotocol/sdk` 1.30.0
- **脚本**：`spikes/b-pty-mcp-hook.ts` · `spikes/mcp-probe-server.ts` · `spikes/hook-probe.sh`（`npm run spike:b`）

### 判定表（claude）

| 问题 | 结果 |
|---|---|
| Q1 claude 在 PTY 中启动并有输出 | ✅ 是，TUI 完整渲染，键盘输入生效 |
| Q2 MCP 工具可见且被调用 | ✅ 是 |
| Q3 Stop hook 触发（回合结束信号） | ✅ 是，TUI 中可见 `running stop hook … 0/4` |
| Q4 全局 `~/.claude/settings.json` 未被修改 | ✅ 是，md5 前后一致 |

**结论：PTY Runtime 可行。回合结束信号有确定来源，不必只靠超时兜底。**

### 隔离机制：改用显式标志，不用 CLAUDE_CONFIG_DIR

计划原本假设用 `CLAUDE_CONFIG_DIR` 做 per-session 隔离。**实测该假设可行但有代价**：

| 方案 | MCP/hook 隔离 | 会话历史隔离 | 认证 |
|---|---|---|---|
| `--mcp-config` + `--strict-mcp-config` + `--settings` | ✅ | ❌ 进用户全局 `~/.claude.json` | ✅ 保留 |
| `CLAUDE_CONFIG_DIR=<dir>` | ✅ | ✅ 彻底 | ❌ **丢失** |

- `CLAUDE_CONFIG_DIR` **确实被尊重**：指向新目录后，`.claude.json` / `projects/` / `sessions/` / `backups/` 全部在该目录内生成，`~/.claude.json` 的 md5 前后完全一致。
- 但该目录下的 claude **报 `Not logged in · Please run /login`**。
- **把 `~/.claude/.credentials.json` 复制进隔离目录不足以恢复认证**（已实测）。认证的门是 `~/.claude.json` 里的 `oauthAccount` 键，而该文件恰好也被 `CLAUDE_CONFIG_DIR` 隔离掉了。

**故 spike 采用显式标志方案**，它保住认证，且 `--strict-mcp-config` 给出「**只**使用我们注入的 MCP，忽略其它一切 MCP 配置」的正向保证——比环境变量的隐式行为更可控。

> **给 Task 1.7 的待决项**：若要同时拿到「完整隔离」与「可用认证」，尚需验证两条路径之一：
> ① 向隔离的 `.claude.json` 播种 `oauthAccount`；② 用 `ANTHROPIC_API_KEY` 环境变量（`--bare` 的帮助文本说明该模式下认证严格取自 `ANTHROPIC_API_KEY` 或 `apiKeyHelper`）。
> 二者均**未验证**。在验证前，`--settings` 方案的已知代价是：**每个 DAWN 会话都会在用户全局 `~/.claude.json` 里累积历史记录**。

### 生效的配置结构（claude）

MCP —— 传给 `--mcp-config <file>`：

```json
{ "mcpServers": { "dawn-probe": {
    "command": "<abs>/node_modules/.bin/tsx",
    "args": ["<abs>/spikes/mcp-probe-server.ts"],
    "env": { "DAWN_PROBE_LOG": "<abs>/probe.jsonl" } } } }
```

Hook —— 传给 `--settings <file>`：

```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "<abs>/spikes/hook-probe.sh" } ] } ] } }
```

- 两者是**不同的标志、不同的文件**，`settings.json` 里放 `mcpServers` 无效。
- `--settings` 的语义是 "load **additional** settings"——**与用户全局设置合并，不是替换**。因此用户全局的 hook 仍会触发。若 DAWN 需要「只跑我的 hook」，`--settings` 给不了这个保证（对比 MCP 有 `--strict-mcp-config`）。
- MCP 工具的权限名形如 `mcp__<server>__<tool>`，本例为 `mcp__dawn-probe__dawn_probe`，经 `--allowedTools` 免去交互授权。
- hook 脚本从 claude 进程继承环境变量（`DAWN_PROBE_LOG` 即由此传入）。

### ⚠️ node-pty 陷阱：spawn-helper 的执行位

**首次运行 `pty.spawn('claude', ...)` 直接失败，报 `Error: posix_spawnp failed.`**，错误信息不含任何线索。

根因：node-pty 的 Unix 实现依赖辅助可执行文件 `node_modules/node-pty/prebuilds/<platform>/spawn-helper`，其执行位由 node-pty 自己的 `post-install` 脚本设置。本机 npm 配置了 allowScripts 策略，**该脚本被拦截**（`npm install` 时有 warning，但 `require('node-pty')` 仍成功，所以此前的加载测试没能暴露问题），spawn-helper 停在 `0644`。

**已加入兜底**：`scripts/fix-node-pty.mjs` + `package.json` 的 `postinstall`。更干净的替代是 `npm install-scripts approve node-pty`，两者不冲突。

> **教训**：`require()` 成功不等于原生模块可用。带辅助可执行文件的原生依赖，验收判据必须是「真的 spawn 一次」。

### Step 6 · codex 复验（部分完成）

| 项 | 结果 |
|---|---|
| `CODEX_HOME` 隔离 | ✅ 状态文件（`state_*.sqlite` 等）全部生成在隔离目录内 |
| 播种 `auth.json` 恢复认证 | ✅ 被接受——与 claude 不同，codex 的凭证就在 `$CODEX_HOME/auth.json` |
| `config.toml` 注入 MCP | ✅ `codex mcp list` 显示 `dawn-probe` 状态 `enabled` |
| 全局 `~/.codex/config.toml` 未被修改 | ✅ |
| **MCP 工具实际被调用 + `notify` 触发** | ❌ **未验证** |

`codex exec` 在隔离配置下运行超过 5 分钟无输出、探针日志为空，被超时终止。原因未查明（可能是审批等待或 MCP 启动阻塞）。

**这不阻塞 Phase 0**：Tier-1 provider（claude）四问全过，PTY Runtime 的可行性已经确立。codex 的完整回路留作后续排查，届时应先用 `codex exec` 加详细日志定位卡在哪一步。

**codex 的配置结构（已验证可被解析）**：

```toml
notify = ["<abs>/spikes/hook-probe.sh"]

[mcp_servers.dawn-probe]
command = "<abs>/node_modules/.bin/tsx"
args = ["<abs>/spikes/mcp-probe-server.ts"]
env = { DAWN_PROBE_LOG = "<abs>/probe.jsonl" }
```

注意：`notify` 是**单值字段**，注入即覆盖用户原有的 notify 程序——本机用户的 `notify` 原本指向 Codex Computer Use。这是必须走 `CODEX_HOME` 隔离而非 `-c` 覆盖的理由。

### 遗留 / 未验证

- codex 的 MCP 调用与 notify 回路（见上）。
- 隔离 + 认证两全的方案（`oauthAccount` 播种 或 `ANTHROPIC_API_KEY`）。
- `--settings` 无法排除用户全局 hook，尚无对应的 `--strict-settings`。
- PTY 进程组终止（规格 7.18）未在本 spike 覆盖，属 Task 1.9 范围。

## Spike C — Electron 终端可用性

> 待跑。需先装 electron。

## Spike D — Jupyter 内核链路

> 待跑。需先建 Python 环境并注册 kernelspec：
> ```bash
> uv venv .venv-kernel && source .venv-kernel/bin/activate
> uv pip install ipykernel
> python -m ipykernel install --user --name dawn-spike --display-name "DAWN Spike"
> ```
> 本机已有 R 4.6.1，可选的 Ark（R 内核）验证有条件执行。
