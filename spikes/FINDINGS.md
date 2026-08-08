# Phase 0 Spike 结论

> 本文件是 Phase 0 四个 spike 的**事实记录**，Part 1 的实现任务直接依赖它。
> 只写实测到的，不写推测。每节标注实测日期与所用版本。

---

## 汇总与 G0 放行判断

**状态：四项全部通过 → G0 通过，放行进入 Part 1（阶段 ①-A）。** 判定日期 2026-08-08。

| Spike | 问题 | 结论 | 对后续的影响 |
|---|---|---|---|
| **A · pi 可嵌入性** | 能否注入工具并强制 schema | ✅ **通过（强于预期）** | Task 1.10 **直接用 pi 的 `agentLoop`，不自建**；schema 由引擎强制且带自动重试，**不需要自建校验层** |
| **B · PTY+MCP+Hook** | 能否隔离注入并接到完成信号 | ✅ **通过（claude）**<br>⚠️ 部分（codex） | Task 1.7 用 `--mcp-config` + `--strict-mcp-config` + `--settings`，**不用 `CLAUDE_CONFIG_DIR`**；Task 1.9 的回合结束信号取自 Stop hook，不必只靠超时 |
| **C · Electron 终端** | 4 终端并发是否流畅 | ✅ **通过，当前规模无需节流** | Task 1.8 **暂不需要背压**，但以「单帧 100ms」为将来的节流触发线；`scrollback` 是内存主控参数 |
| **D · Jupyter 内核链路** | 能否起内核、拿输出、**中断**；Electron 下 zeromq 能否用 | ✅ **通过，且 Electron 下无需 rebuild** | **整个技术栈选型确认：规格 10.1 的 TypeScript 定案成立，不回退 Python**；②-A 需用薄适配器隔离 rxjs |

### 由 spike 确定或修改的技术决策

| # | 决策 | 依据 | 相对计划的变化 |
|---|---|---|---|
| 1 | Native Runtime 用 pi 的 `agentLoop` | Spike A | 计划预留的「自建 loop」分支作废 |
| 2 | 工具 schema 用 **TypeBox**，配置校验用 **zod**，两者并存 | Spike A | 计划原以 zod 写工具 schema，错误 |
| 3 | provider 用 pi 内置 `deepseekProvider()`；**model id 必须钉 v4 版本** | Spike A | `deepseek-chat` 不在 pi 注册表内，计划中全部引用需改 |
| 4 | 隔离用显式标志，不用 `CLAUDE_CONFIG_DIR` | Spike B | 计划假设作废；**已知代价**：会话历史仍进用户全局 `~/.claude.json` |
| 5 | 桌面壳定 **Electron 43** | Spike C | 与计划一致 |
| 6 | **TypeScript 主体成立** | Spike D | 与规格 10.1 一致，但此前无实测支撑，现已补上 |
| 7 | ②-A 在 `createMainChannel` 外包薄适配器，rxjs 不进 DAWN 代码 | Spike D | 计划未涉及，新增约束 |

### 三条跨 spike 的通则（不属于任何单个 spike，但都得遵守）

**① `require()` 成功 ≠ 模块可用。**
node-pty 在 Spike B 前的加载测试是通过的，真正 `spawn` 时才报 `posix_spawnp failed`——`spawn-helper` 缺执行位。**带辅助可执行文件或子进程的原生依赖，验收判据必须是「真的用一次」，不是「能 import」。**

**② 原生模块必须先自行关闭，运行时才能退出。**
同一类 `Napi::Error` + SIGABRT 在两个互不相干的模块上各出现一次——Spike C 的 node-pty（对已退出的 pty 重复 `kill()`）、Spike D 的 zeromq（socket 未关就 `app.exit()`）。**该异常是异步的，`try/catch` 拦不住。退出路径要和启动路径一样当作正式代码写。**
附带的诊断陷阱：**成功结论打印在前、崩溃在后**，只看日志末尾会误判——判定必须看退出码。

**③ 「等待完成信号」的机制必须能回答：该信号会不会在工作真正发生之前被触发？**
Spike C 第一版四问全绿，而压力测试根本没跑——哨兵字符串被终端回显的命令行提前命中。**这正是规格 7.24 描述的 false-green，且发生在本项目自己的验证代码里。** 唯一挡得住的手段是**完整性闸门**：按预期产出量校验，不达标则判「无效」而非「通过」。这条应写入阶段 ③ 的验收设计。

### 遗留项（不阻断 G0，但需在对应阶段处理）

| 项 | 归属 |
|---|---|
| codex 的 MCP 调用与 `notify` 回路未验证（`codex exec` 超时） | ①-A 或按需 |
| 「完整隔离 + 可用认证」两全方案（播种 `oauthAccount` 或用 `ANTHROPIC_API_KEY`） | Task 1.7 |
| `--settings` 无法排除用户全局 hook（无 `--strict-settings`） | Task 1.7 |
| R 内核（本机 `ir` kernelspec 过期且 `IRkernel` 未装） | ②-A |
| `interrupt_mode: "message"` 分支未被执行过 | ②-A |
| 原生模块的 Electron ABI：本机免 rebuild，换版本/平台需重测 | ①-B |

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

## Spike C — Electron 终端可用性 ✅ 通过

- **日期**：2026-08-08
- **版本**：`electron` 43.3.0 · `node-pty` 1.1.0 · `@xterm/xterm` 6.0.0 · `@xterm/addon-fit` 0.11.0
- **机器**：Apple Silicon (darwin-arm64) · Node v22.23.0
- **脚本**：`spikes/c-electron-term/`（`cd spikes/c-electron-term && npx electron .`）
- **结论**：**桌面壳定 Electron。四个终端并发刷屏无冻结。**

### 判定表

| 问题 | 结果 |
|---|---|
| Q1 四个终端都能交互（输入回显） | ✅ 4/4 |
| Q2 刷屏不冻结（无 >250ms 帧） | ✅ 冻结帧 0，卡顿帧 0 |
| Q3 Ctrl-C 生效 | ✅ 杀前 1.5s 增量 43.8 MB → 杀后 0 字节 |
| Q4 resize 后终端尺寸跟随 | ✅ xterm 与 pty 两侧同步 |

### 实测数字（四路各 200,000 行，共 29.0 MB）

| 指标 | 实测 |
|---|---|
| 数据量校验 | 29.0 MB / 预期 ≈28.2 MB → **有效** |
| 耗时 | 0.7 s |
| 吞吐（pty → 主进程） | 44.3 MB/s |
| CPU 峰值 / 均值 | 25.3% / 12.7%（多进程求和） |
| 内存峰值（RSS 合计） | 526 MB |
| 渲染帧数 | 19（0.7s 内，≈27 fps） |
| 卡顿帧 >100ms | 0 |
| 冻结帧 >250ms | 0 |
| 最长单帧 | 59.2 ms |
| resize | 94×29 → 60×20，xterm 与 pty 一致 |

**给 Task 1.8（ring buffer 与背压）的输入**：

- 单帧最长 59.2 ms，未触及 100ms 卡顿线，**当前规模下不需要输出节流**。
- 但**帧率确实从 60fps 掉到约 27fps**（0.7s / 19 帧）。29 MB 是压力上限的量级；若未来单个终端持续高速输出、或终端数超过 4，节流就会变成必需。建议把 100ms 单帧作为触发节流的阈值。
- 内存能稳在 526 MB，靠的是 **xterm 的 `scrollback: 5000` 自行裁剪**——20 万行里只保留了 5 千行。**scrollback 是内存的主控参数**，不是显示偏好，Task 1.8 定值时须按终端数×行宽估算。

> **测量边界（勿误读）**：44.3 MB/s 是「pty → 主进程」的吞吐，计时终点是哨兵抵达主进程，**不代表 xterm 已完成渲染**——`Terminal.write()` 是异步缓冲的。渲染侧的真实压力由 rAF 卡顿计量反映（即上表的帧数据），两者是互补的两个指标，不能互相替代。

### ⚠️ 本 spike 第一版报了假的「通过」——记录这次失败

第一版四问全打 ✅，但 P2 的数字是 `0.0 MB / 0.0 s / 0 帧 / 0% CPU`——**压力测试根本没跑**。

根因：等待逻辑是「在 pty 输出里搜索哨兵字符串」，而终端会**回显命令行本身**，我写进去的命令里就含着 `__DAWN_DONE_0__` 这几个字，于是哨兵在命令敲进去的瞬间即命中。P1、P3 同样受污染。

两处修正：

1. **哨兵的「命令行形态」必须 ≠「输出形态」**：命令里写 `__DAWN"_"DONE_0__`，shell 打印出来才是 `__DAWN_DONE_0__`。
2. **加完整性闸门**：按 `N × 行数 × 行宽` 算出预期字节数，实测低于 80% 即判定**作废**，报「无效」而不是「通过」。

> **这正是规格 7.24 所说的 false-green**，而且发生在本项目自己的验证代码里：一个「检查是否完成」的机制，因为观测通道被污染而恒真。
> **教训（应写入阶段 ③ 的验收设计）**：任何「等待完成信号」的机制都必须回答一个问题——**这个信号有没有可能在工作真正发生之前就被触发？** 完整性闸门（对照预期产出量校验）不是锦上添花，它是唯一能挡住这类失效的手段。

### 附带发现：两个 node-pty 陷阱

1. **嵌套 `node_modules` 同样中招**：`spikes/c-electron-term/node_modules/node-pty` 的 `spawn-helper` 也停在 `0644`。`scripts/fix-node-pty.mjs` 已改为全仓库扫描（含 `spikes/*/node_modules`）。
2. **对已退出的 pty 再 `kill()` 会让进程 SIGABRT**：native 层抛 `Napi::Error`，该异常是异步的、`try/catch` 拦不住。第一版就是这么崩的（`exited with signal SIGABRT`）。现改为先解绑 `onData` 再逐个 kill，并留 300ms 排空。**Task 1.9 的 `PtyRuntime.stop()` 必须注意同一问题**——它与规格 7.18 的进程组终止是两回事，7.18 管的是孤儿孙进程，这里管的是重复 kill 自身。

### 未验证

- `node-pty` 与 Electron 的 ABI：本机 `require('node-pty')` 在 Electron 43 下**直接可用**，未触发 ABI 不匹配，故 `@electron/rebuild` 这一步**未被执行也未被验证**。换 Electron 大版本或换机器时需重测。
- 超过 4 个终端、或单终端长时间持续高速输出的表现。
- Windows / Linux 平台。

## Spike D — Jupyter 内核链路 ✅ 通过 → **TypeScript 方案确认**

- **日期**：2026-08-08
- **版本**：`spawnteract` 5.0.1 · `enchannel-zmq-backend` 10.0.0 · `@nteract/messaging` 7.0.20 · `zeromq` npm **6.5.0**（libzmq **4.3.5**）· `ipykernel` on Python 3.11.15
- **脚本**：`spikes/d-jupyter-kernel.ts`（`npm run spike:d`）· `spikes/d-electron-zmq/`（`npx electron .`）
- **结论**：**三项全过，规格 10.1 的 TypeScript 定案成立，不回退 Python。**

### 判定表

| 问题 | 结果 |
|---|---|
| Q3 zeromq 原生模块可用 | ✅ libzmq 4.3.5 |
| Q1 起内核并从 iopub 拿到输出 | ✅ `stream: {"name":"stdout","text":"DAWN_MARKER_OK\n"}` |
| **Q2 能中断执行中的 cell** | ✅ **SIGINT → KeyboardInterrupt → `execute_reply status=error`** |
| Step 6 Electron 下 zeromq 可用 | ✅ **无需 `electron-rebuild`** |
| Step 7 R 内核（可选） | ❌ 环境问题，非协议问题，详见下文 |

> Q2 是本 spike 的分量所在——规格 10.4 的硬要求，**wisp-science 的自研 JSON-lines worker 方案正是败在这一条**。现已证实 Jupyter 协议路线能做到。

### 实测的完整调用链

```ts
const kernel   = await launch("dawn-spike")            // spawnteract
const channels = await createMainChannel(kernel.config) // enchannel-zmq-backend → RxJS Subject
channels.next(kernelInfoRequest())                      // 握手（必须）
channels.next(executeRequest('print("...")'))           // @nteract/messaging
```

- `kernel.config`：`{ip: "127.0.0.1", transport: "tcp", shell_port, iopub_port, control_port, stdin_port, hb_port, key, signature_scheme}`。HMAC 签名由 enchannel 内部处理，**我方无需自己实现**——这正是当初判断「TS 需手搓 Jupyter 协议 3–4 周」为误判的依据。
- **握手是必需的，不是可选优化**：内核就绪前发出的 `execute_request` 会被**静默丢弃**。必须先 `kernel_info_request` 等到 `kernel_info_reply` 再发执行请求。
- `interrupt_mode` 实测为 **`signal`**（ipykernel 的 kernelspec 未声明该字段，默认即 signal）→ 中断方式是**向内核进程发 SIGINT**，不是走 control 通道的 `interrupt_request`。两种模式的代码路径都已写进脚本。

### ⚠️ rxjs 版本分裂：6.6.7 vs 7.8.2

`@nteract/messaging` 与 `@nteract/types` **各自嵌套 rxjs 6.6.7**，而 `npm i rxjs` 装的是 7.8.2。两者的 `Observable` / `Subscriber` 类型结构不兼容，把 rxjs 7 的 `take` / `timeout` / `firstValueFrom` 用在 nteract 返回的 Observable 上会直接 typecheck 失败（实测 4 处 TS2345）。

本 spike 的处理：**只使用 nteract 自带的算子**（`childOf` / `ofMessageType`），等待与超时全部手写为 Promise。

> **给阶段 ②-A 的架构建议**：不要让 rxjs 出现在 DAWN 自己的代码里。
> 在 `createMainChannel` 之外立刻包一层**薄适配器**，对内暴露 `send(msg)` / `on(type, cb)` / `request(msg): Promise<reply>` 这类普通接口。
> 理由有二：① 绕开 rxjs 6/7 的版本分裂，且 nteract 已多年未更新，将来若换掉它，改动被限制在适配器内；② 规格第 8 节的统一事件流本就不该以 RxJS 为其数据模型。

### ⚠️ 原生模块的关停顺序（第二次遇到同一类问题）

Electron 版首次运行**打印了成功结论，进程却以 SIGABRT 结束**：

```
✅ Electron 中 zeromq + Jupyter 链路工作正常
libc++abi: terminating due to uncaught exception of type Napi::Error
... exited with signal SIGABRT
```

原因：`app.exit()` 时 zmq socket 仍开着，native 层在拆卸中抛出 `Napi::Error`——**异步异常，`try/catch` 拦不住**。

修法（已落实在 `d-electron-zmq/main.js` 的 `shutdown()`）：**先停内核进程 → 再 `channels.complete()` 关 socket → 留 ~300ms 给 native 层收尾 → 才 `app.exit()`**。修正后干净退出。

> **这与 Spike C 中 node-pty 重复 `kill()` 的 SIGABRT 是同一类失效，出现在两个互不相干的原生模块上，因此应视为通则而非个案**：
> **原生模块必须先自行关闭，才能让运行时退出；退出路径要和启动路径一样被当作正式代码写。**
> 阶段 ①-A 的 Task 1.9（`PtyRuntime.stop()`）与阶段 ②-A 的内核关停都受此约束。
> 另注意一个诊断陷阱：**结论打印在前、崩溃在后**，只看日志末尾几行会以为成功——判定必须看**退出码**。

### Step 6 · Electron 下的 zeromq（无需 rebuild）

```
Electron 43.3.0 · Node 24.18.1 · V8 ABI 148
✓ zeromq 加载成功（libzmq 4.3.5）—— 无需 electron-rebuild
✓ 内核已启动 → 内核就绪：python 3.11.15 → DAWN_ELECTRON_OK
```

计划原本预留了 `npx @electron/rebuild -f -w zeromq` 这一步，**实测不需要**：zeromq 6.x 用 **Node-API（N-API）**，ABI 跨 Node 与 Electron 稳定。与 Spike C 中 node-pty 的情况一致。

> **但不要把它当作永久结论**：这是「当前版本组合下不需要」，不是「原生模块不需要 rebuild」。换 Electron 大版本、换平台、或引入非 N-API 的原生依赖时都需重测。`@electron/rebuild` 这条退路应保留在文档里。

### Step 7 · R 内核（未通过 —— 环境问题，不阻断）

`DAWN_KERNEL=ir` 运行，内核进程起得来（`pid`、`interrupt_mode=signal` 都拿到了），但 **25 秒内未响应 `kernel_info_request`**。

根因：本机 `ir` kernelspec 指向 `/Library/Frameworks/R.framework/Resources/bin/R`（旧安装），而当前 R 是 `/usr/local/bin/R` 4.6.1，且 **`IRkernel` 包根本没装**——是一条过期的注册项。**与协议栈无关**，故不影响 Spike D 判定。

按计划 Step 7 的规定，R 支持后移到阶段 ②-A。届时两条路可选：装 `IRkernel`，或用 Rho 采用的 **Ark**（Posit 出品，Rust 实现）。

> **附带的产品级发现**：内核起不来时，表现是**静默挂起 25 秒**，而不是报错——因为进程确实启动了，只是永远不回话。
> **DAWN 必须为此设计显式的失败态**：内核就绪握手要有超时，超时后应捕获内核进程的 stderr 并呈现给用户，而不是让 UI 转圈。这与规格 7.5「无静默回退」一致。

### 未验证

- R / Ark 内核（见上）。
- `interrupt_mode: "message"`（control 通道的 `interrupt_request`）——代码路径已写但本机 ipykernel 走的是 signal，**该分支未被执行过**。
- 内核崩溃、内核重启、多内核并发。
- Windows / Linux。
