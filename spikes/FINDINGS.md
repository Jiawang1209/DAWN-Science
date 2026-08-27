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

> **⚠️ 2026-08-08 追记：上面这条「遗留」是本项目最贵的一行字。**
>
> 「未验证 `AgentHarness`……留待 Task 1.10 评估」——**Task 1.10 并没有评估**。
> 它按本 spike 的探针写法照抄，于是 Native Runtime 落成了裸 `Agent` + 手搓 provider + **`tools: []`**：
> **agent 一个工具都没有**，而这个洞一路活到作者试用时。
>
> **根因不在这条遗留，在这个 spike 的范围**：它只问了「pi 能不能嵌入」，
> 没问「我们该坐哪一层、那一层怎么调」。FINDINGS 里因此没有工具注入的签名可抄。
> 补救见下方 **Spike A-2**——那才是当初该有的那一节。

---

## Spike A-2 — pi 第三层入口 ✅ 通过（返工 R1 / GR 门）

- **日期**：2026-08-08
- **版本**：`@earendil-works/pi-coding-agent` 0.84.1
- **脚本**：`spikes/a2-pi-third-layer.ts`（`npm run spike:a2`）
- **为什么补这个 spike**：见上方追记。原 Spike A 验的是「pi 能不能跑起来」，
  本 spike 验的是「**我们选定的那一层怎么调**」。主规划 §5.2 的 GR 门据此设立。

### 判定表

| 问题 | 结论 | 证据 |
|---|---|---|
| Q1 `createAgentSession()` 起得来？ | ✅ | 会话建立，模型为显式指定的 `deepseek/deepseek-v4-flash` |
| Q1 与用户全局配置隔离？ | ✅ | 显式 `agentDir` / `authPath` / `modelsPath` 指向临时目录，`~/.pi` 指纹前后一致 |
| Q2 内置工具真能读文件？ | ✅ | `read` 被调用，**且 agent 复述出了文件里的暗号** |
| Q2 内置工具真能跑命令？ | ✅ | `bash` 被调用，**且目标文件真的被创建**（不看模型自述，看副作用） |
| Q3 扩展能拦下一次执行？ | ✅ | `tool_call` 返回 `{block:true, reason}`，**工具结果里出现该 reason，且命令的副作用文件不存在** |
| Q4 凭证能换成我们的实现？ | ✅ | 注入自定义 `CredentialStore`，pi 确实调用了它；`auth.json` 未落盘 |
| Q5 **不用文件扩展**也能做授权门？ | ✅ | 包装 `ToolDefinition.execute` + `noTools:"builtin"` + `customTools`，放行的执行、拦下的没执行 |

### Q5 是本 spike 最有价值的一项：它取消了一个风险，而不是接受它

pi 的扩展**只能从 `<agentDir>/extensions/*.ts` 加载**（`loadExtensionFromFactory`
没有从包入口导出），靠 **jiti 2.7.0** 在运行时转译 TypeScript。
打包进 Electron（asar）后这条路是否还通，无法先验断言——
而**授权门若在生产构建里静默失效，比根本没有还危险**：开发时一切正常，打包后拦不住任何东西。

**解法不是去验证它，是不依赖它。** 工具定义工厂全部从包入口导出：

```ts
import { createBashToolDefinition, createReadToolDefinition } from "@earendil-works/pi-coding-agent"

const gated = { ...createBashToolDefinition(cwd),
  async execute(id, params, signal, onUpdate, ctx) {
    const reason = policy(params)
    if (reason) return { content: [{ type: "text", text: reason }], isError: true, details: undefined }
    return original(id, params, signal, onUpdate, ctx)
  } }

await createAgentSession({ cwd, agentDir, model, modelRuntime,
  noTools: "builtin",        // ← 必须关掉内置的，否则模型会绕过门去用原始 bash
  customTools: [gated, ...] })
```

不碰文件系统、不碰转译器、不受打包影响。**`noTools: "builtin"` 这一行是关键**——
不关内置工具，等于门旁边留着一扇没锁的侧门。

**拒绝要回一条 `isError` 的结果，不要抛异常**：抛异常会中断整轮，模型学不到「这条被拒了」，
实测中模型收到错误文本后会如实汇报并停止绕过。

### ⚠️ 附带观察：朴素的子串策略会过度拦截

场景 1 的探针扩展按「命令含标记字符串」拦截，结果连 `ls -la <被拦文件>` 也被拦下——
模型只是想查看结果，并非重试。**真实的授权门策略不能是子串匹配**，
需要解析命令与目标路径。归入 ③ 的 capability 授权设计。

### 实际使用的导入符号

```ts
import { createAgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"
```

### 完整调用签名（这就是当初缺的那段）

```ts
const modelRuntime = await ModelRuntime.create({
  credentials,                              // ← 我们的 CredentialStore
  authPath:   join(agentDir, "auth.json"),  // 显式给临时目录，隔离用户 ~/.pi
  modelsPath: join(agentDir, "models.json"),
})
const model = modelRuntime.getModel("deepseek", "deepseek-v4-flash")
const { session } = await createAgentSession({ cwd, agentDir, model, modelRuntime })

const unsubscribe = session.subscribe((event) => { /* ... */ })
await session.prompt(text)
await session.waitForIdle()
session.dispose()
```

**内置工具默认开启**（`read` · `bash` · `edit` · `write`），无需注册。
`tools` / `excludeTools` / `noTools` 三个选项分别是白名单、黑名单、全关。
`pi-coding-agent` 另有 `grep` / `find` / `ls`，可经 `createCodingTools()` 取。

> **对照**：`tools: []` 是**显式把工具关掉**。默认什么都不传反而全都有。
> 这个错误代价最大的地方在于——它看起来像「还没填」，实际是「明确关闭」。

### 凭证注入点：`CredentialStore`，不是 `AuthStorageBackend`

分层决策原本写的是实现 `AuthStorageBackend`。**实测发现更靠上的接口更合适**：
`ModelRuntime.create({ credentials })` 直接接受 pi-ai 的 `CredentialStore`，
只需四个方法 `read` / `list` / `modify` / `delete`，不必处理文件锁语义。

**决策文档 §3 第 3 行据此修正。**

### ⚠️ 关键发现：`read()` 会被调用 202 次

pi 会遍历**全部 39 个内置 provider** 探测可用性，且探测不止一轮。单次会话实测 202 次调用。

> **推论（R3 必须落实）**：DAWN 的 `CredentialStore` 实现**必须带缓存**。
> 一个 naive 的 Electron `safeStorage` 实现会触发 202 次 keychain 解密——
> 那不只是慢，macOS 还可能弹权限提示。**缓存不是优化，是可用性前提。**

### 事件流形状（第三层）

```
agent_start → turn_start → message_start → message_update(text_delta)
            → tool_execution_start → tool_execution_update → tool_execution_end
            → message_end → turn_end → agent_end → agent_settled
```

与第二层同构，多了 `agent_settled`（重试 / 压缩 / 跟进都结束）。
**`tool_execution_start` / `_end` 带 `toolName` 与结果**——这是 ①-B 「显示 agent 在做什么」缺的那部分数据。

### 遗留 / 未验证

- **未验证 `AgentSessionConfig { agent: Agent }` 这条逃生口**：分层决策称第二层的
  `beforeToolCall` 等钩子在第三层照样挂得上，本 spike 未实测。**扩展的 `tool_call`
  已足够做授权门，故不阻断 R2**；若将来需要 `transformContext` 级别的介入再补验。
- 未验证中断（`session.abort()`）。R4 补 `abort` 操作时一并验。
- 未验证压缩（compaction）触发行为。
- ~~扩展从 `<agentDir>/extensions/*.ts` 自动发现——未验证打包进 Electron 后是否仍可用~~
  **已由 Q5 取消**：授权门改走包装 `ToolDefinition` 的路，不依赖文件扩展。
  文件扩展在 asar 下能否工作仍未知，但**它不再位于关键路径上**——
  将来若要支持用户自写扩展，再单独验。

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
| Step 7 R 内核（可选） | ✅ **2026-08-10 通过**（IRkernel 1.3.2 / R 4.6.1），详见下文 |

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

根因：**`IRkernel` 包没装**。**与协议栈无关**，故不影响 Spike D 判定。

### ✅ 2026-08-10：R 已通过，且暴露出一个**判据缺陷**

作者装上 `IRkernel 1.3.2` 之后重跑 `DAWN_KERNEL=ir npm run spike:d`：

| | Python（`dawn-spike`） | R（`ir`） |
|---|---|---|
| 起内核 + iopub | ✅ | ✅ R 4.6.1 |
| `interrupt_mode` | signal | signal（kernelspec 未声明，取默认） |
| 中断后的 `execute_reply` | `status=error` · `ename=KeyboardInterrupt` | **`status=abort` · 无 ename** |
| 中断后内核仍可用 | ✅ | ✅ |

**两种回复都是 Jupyter 协议里合法的。** 而这份脚本原来的判据写的是
`status === "error" && ename ~ KeyboardInterrupt`——**那是 Python 的形状**，
于是它把一个**工作正常**的 R 内核判成了失败，FINDINGS 也据此记了一条「R 未通过」。

> **判据不能长成某一种实现的形状。** 已改成与语言无关的那条：
> **中断之后再算一道题，能算对就通过**——内核是串行执行的，
> 后一条能跑完，本身就同时证明了「死循环真的停了」与「内核没被打死」。
> reply 的 status 保留为诊断信息，不再作为判据。

**这条直接决定 ②-A 的 K3 判据**：不许写成「reply 是某个 status」。

> **2026-08-10 更正**：上一版这里写着「kernelspec 指向旧安装，而当前 R 是 `/usr/local/bin/R`」。
> **那是错的**——`/usr/local/bin/R` 是一条**软链接**，指向的正是
> `/Library/Frameworks/R.framework/Resources/bin/R`（R 4.6.1），两者是同一个二进制。
> kernelspec 一直是对的，唯一的原因就是包没装。
>
> 这条更正改变了 S9 该防的失败形状：**不是「过期的注册项」，而是「注册项没问题、语言侧的包缺失」**。
> 两者要给出完全不同的提示——前者该让人重装 kernelspec，后者该让人装包。
> 把它们混成一句「内核起不来」，人就会去修一个没坏的东西。

按计划 Step 7 的规定，R 支持后移到阶段 ②-A。届时两条路可选：装 `IRkernel`，或用 Rho 采用的 **Ark**（Posit 出品，Rust 实现）。

> **附带的产品级发现**：内核起不来时，表现是**静默挂起 25 秒**，而不是报错——因为进程确实启动了，只是永远不回话。
> **DAWN 必须为此设计显式的失败态**：内核就绪握手要有超时，超时后应捕获内核进程的 stderr 并呈现给用户，而不是让 UI 转圈。这与规格 7.5「无静默回退」一致。

### 未验证

- R / Ark 内核（见上）。
- `interrupt_mode: "message"`（control 通道的 `interrupt_request`）——代码路径已写但本机 ipykernel 走的是 signal，**该分支未被执行过**。
- 内核崩溃、内核重启、多内核并发。
- Windows / Linux。

---

## Spike E —— pi 能不能会话中途换模型？（2026-08-09，①-B″ · U2 前置）

跑法：`npx tsx spikes/e-model-switch.ts`（用假后端，不烧真 key）

### 结论：**能，而且是干净的就地切换**

| 问题 | 实测 |
|---|---|
| Q1 换了之后请求真的换吗 | ✅ `deepseek-v4-flash → deepseek-v4-deep`，**从假后端的请求体证明**，不是"调用没抛异常" |
| Q2 写到哪儿 | 会话 `.jsonl` **+ agentDir 级的 `settings.json`**（`{defaultProvider, defaultModel}`） |
| Q3 没配凭证 | 抛 `No API key for <provider>/<model>`，**先验证后切换** |
| Q4 流式中途切 | **不拒绝**；且 `isStreaming` 在 prompt 真正开始前是 `false` |

### 三条直接影响实现的事实

**1. `settings.json` 的泄漏风险在我们这里不存在。**
`setModel` 会把选择写成 agentDir 级默认值——两个会话共用 agentDir 时，
A 里换模型就会改掉 B 的默认。但 `src/runtime/native.ts` 是
`const agentDir = join(spec.sessionDir, "pi")`——**每会话一个 agentDir**。
Spike B 留下的隔离纪律在这里白捡了一份保护。**这条要写进注释，
否则将来有人为了省 inode 把 agentDir 提到项目级，这个洞会悄悄回来。**

**2. `session.isStreaming` 不能用来判断"正在说话"。**
发起 `prompt()` 后立刻读到的是 `false`——pi 在 prompt 真正开始之前
就认为自己不忙。**这与本项目早先在 `waitForIdle` 上栽的是同一件事**
（当时的表现是 `echo ... | dawn run` 在模型答完前就收摊）。
「正在说话时不许换模型」必须用我们自己的 busy 判定
（transcript 里最后一个 agent turn 未 `final`），不能问 pi。

**3. pi 把换模型记成会话记录里的一等条目。**
```jsonl
{"type":"model_change","provider":"deepseek","modelId":"deepseek-v4-flash",...}
{"type":"message","message":{"role":"assistant",...}}
{"type":"model_change","provider":"deepseek","modelId":"deepseek-v4-deep",...}
```
`parentId` 串成链，因此**"哪条消息是哪个模型产出的"在 pi 那边是可查的**。
**我们的账本没有记这个**——Run 上记了文件事实（不变式 5），却没记模型。
"用哪个模型产出的"显然属于溯源。列为待办。

### 两次「探针坏了，不是被测对象坏了」

1. 传了 `authPath` 指向空文件，pi 就不用 `models.json` 里内联的 key 了
   （生产代码 `native.ts` 本来就不传）。表现为**一次请求都没发出去，且一片安静**。
2. 假后端存的 `body` 已经是解析过的对象，我又 `JSON.parse` 了一遍 →
   每条都抛、全被 `filter` 掉 → 结论"零请求"。**而请求一直在正常发送。**

两次都是先怀疑被测对象。**下次先验证探针本身。**

---

## Spike F —— 子 agent 的进程怎么起？（2026-08-09，①-B″ · S1 前置）

**问题**：S1 的进程隔离要 spawn 一个能跑 pi 会话的子进程。**打包成 Electron 之后
`node` 不一定在**——用户机器上可能根本没装 Node。子进程从哪来？

### 结论：**`process.execPath` + `ELECTRON_RUN_AS_NODE=1`，三条全通**

| 要回答的 | 结果 |
|---|---|
| Electron 二进制能不能当普通 node 用 | ✅ 能，报 `node v24.18.1` |
| 那个子进程能不能加载 **ESM** bundle | ✅ 能（`build-electron.mjs` 产出的就是 ESM） |
| 能不能在里面 `import` pi | ✅ 能，`createAgentSession` 拿到的是 `function` |

实测输出：

```
electron 二进制: node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
退出码: 0
stdout: {"type":"done","ok":true,"output":"agent=scout node=v24.18.1
         isElectronNode=1 createAgentSession=function"}
```

### 对实现的三条约束

1. **子进程的命令是 `process.execPath`，不是 `"node"`。** 写死 `node`
   在开发机上能过、在用户机器上未必——这正是那种「本地是好的」的失效方式。
2. **必须带 `ELECTRON_RUN_AS_NODE=1`**。不带的话起来的是一个 Electron 应用实例
   （会开窗口、走 app 生命周期），不是脚本解释器。
3. **子侧入口要单独打一个 bundle**（`dist/electron/subagent-child.js`），
   external 清单与 banner 与 main 一致——pi 全家必须 external，
   否则会撞上 R4 记过的那个 `createRequire` 重名（打进 bundle 后主进程根本起不来）。

### 未验证

- **打包后的 .app 里**是否同样成立。本次探针用的是开发树里的 Electron 二进制；
  打包后 `process.execPath` 指向 app 自己的可执行文件，机制相同但**没有实测**。
  阶段 ③ 做分发时要复验这一条。
- 子进程里跑**完整的 pi 会话**（本次只验了模块能加载，没有真发请求）。

---

## Spike G —— 外部 CLI 能不能当「对话式 agent」驱动？（2026-08-09，①-C 前置）

**触发**：作者试用后指出 —— *「怎么一下子把 cli 都挪入到 app 里面了呢？应该是和
deepseek 这种样式，我从对话框里面输入内容」*。此前 claude / codex 走 PTY 托管，
界面上是一个终端；作者要的是**对话形态**。

**同时明确了终端的定位**（作者原话）：*「终端肯定留着啊，终端就类似 codex app
的感觉，里面有一个终端，然后也可以执行任意的 Linux 的命令，也可以开启
codex cli 和 claude cli」* —— 终端是**通用 shell**，不是 claude/codex 的正脸。
两件事互不冲突。

### 结论：**两个 CLI 都能，但多轮语义不同**

| 问题 | claude | codex |
|---|---|---|
| 非交互 + 结构化输出 | `--print --output-format stream-json` ✅ | `exec --json`（JSONL）✅ |
| 逐 token 增量 | `--include-partial-messages` ✅ | 未验 |
| **多轮** | **一个进程连喂多轮** ✅<br>`--input-format stream-json` | **一轮一个进程**，靠 `exec resume <thread_id>` ✅ |
| 事件类型（实测） | `system` `assistant` `rate_limit_event` `result` | `thread.started` `turn.started` `item.completed` `turn.completed` |

**实测证据**（两边用同一个问法：先让它记 `4127`，再问）：

```
claude  一个进程连喂两轮 → 助手回复 ["OK","4127"]        记得 ✅
codex   exec 一轮 → thread_id；resume <id> 再问 → ["4127"]  记得 ✅
```

### 对实现的四条约束

1. **两种多轮语义必须在运行时里显式分开。** claude 是长驻进程 + stdin 流；
   codex 是每轮起一个进程 + `thread_id` 续接。**把它们塞进同一个抽象之前，
   先承认它们不一样**——否则会写出一个「对一边天然、对另一边别扭」的接口。
2. **`thread_id` 必须持久化**。codex 的多轮全靠它，丢了就等于会话断了。
   它属于会话记录，不是内存状态。
3. **stderr 有大量与我们无关的噪声**：codex 每次都往 stderr 打
   `failed to load models cache` 与 `rmcp::transport::worker … HTTP 502`，
   **而退出码是 0**。**不要把 stderr 非空当成失败**——那会让每一轮都被误报成出错。
4. **这一层的真正收获不是界面**：外部 CLI 吐的是结构化事件，于是它的工具调用、
   消息、用量**第一次能落进我们已有的账本**。走 PTY 时 claude 会话对账本是个黑盒，
   只有一条 `pty_session` Run。**不变式 3 与 5 第一次能覆盖外部 CLI。**

### 追加实测（2026-08-09，C2 前）：**带工具调用的一轮长什么样**

Spike G 主体只验了纯文本回复。做 C2 前补验了一轮**会调工具**的：

```
事件序列： system ×9 → assistant(tool_use) → rate_limit_event
           → user(tool_result) → assistant(text) → result
```

| 位置 | 形状 |
|---|---|
| `assistant.message.content[]` | `{type:"tool_use", id, name, input, caller}` 或 `{type:"text", text}` |
| `user.message.content[]` | `{type:"tool_result", content, is_error, tool_use_id}` |
| `result` | `usage`（`input_tokens` / `output_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens`）、`total_cost_usd`、`stop_reason`、`session_id`、`is_error` |

**三条直接影响实现的**：

1. **这套形状能一一映到已有的 `AgentEvent`**：`tool_use` → `tool_start`，
   `tool_result` → `tool_end`（靠 `tool_use_id` 配对），`text` → `output`，
   `result` → `idle`。**不需要为 CLI 新造一套事件概念。**
2. **`total_cost_usd` 是现成的** —— 成本栏对 CLI 会话也能有真数，
   不必像 native 那样只能报 token。
3. **开头有 9 条 `system`**（init/config）。它们**认得但不关心**——
   必须与「不认得」区分开，否则「认不出就出声」这条规则会在每轮开头
   刷出 9 条通知。**认得但不关心 ≠ 不认得。**

### 追加实测（2026-08-09，C3 前）：**codex 带工具调用的一轮**

```
thread.started(thread_id) → turn.started
  → item.started(command_execution)   {id, type, command, aggregated_output:"", exit_code:null, status:"in_progress"}
  → item.completed(command_execution) {…, aggregated_output, exit_code, status:"completed"|"failed"}
  → （可重复若干次）
  → item.completed(agent_message)     {id, type, text}
→ turn.completed                       {usage:{input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens}}
```

**与 claude 的三处差异，都影响实现**：

| | claude | codex |
|---|---|---|
| 工具名 | 真名（`Read` / `Bash`） | **只有 item 类型**（`command_execution`） |
| 配对 | `tool_use_id` | `item.id`（started 与 completed 同一个 id） |
| 成本 | `total_cost_usd` **有** | **没有**，只有 token 分项 |

1. **工具名用 item 类型原样记，不归一成 `bash`。** 归一等于声称两者等价，
   而那件事没有验过——账本上写 `tool_call:command_execution` 是**如实**的。
2. **`agent_message` 只在 `item.completed` 出现**（这一轮没有对应的 `item.started`）。
   所以文本不能只在 `item.started` 那一支处理。
3. **codex 给不出金额**。成本栏对 codex 会话只能报 token——
   **缺就是缺，不拿一个估算值冒充**（不变式 5 的同一条纪律）。

### 未验证

- claude 的 `--include-partial-messages` 实际增量粒度
- 两个 CLI 在**权限/审批**上的行为（headless 下工具调用怎么放行）——
  这条与阶段 ④ 的授权门直接相关，做之前必须单独验
- codex `exec` 的并发：同一个 thread 能不能同时跑两轮（应当不行，但没验）

---

## Spike H —— 外部 CLI 能不能会话中途换模型？（2026-08-09，①-C 后续）

**触发**：作者试用后说*「我的一个对话里面，不能切换不同的模型。点击新的模型之后，
就默认的跳入新的对话里面了」*。

**先厘清一件事**：native（deepseek）那条**是好的**——pi 报了两个模型，
model pill 会渲染，就地切换由 U2 做过、`model-switch.spec.ts` 守着。
作者撞到的是 **cli 会话里根本没有 model pill**，那里只有 agent pill，
而它的菜单是「新建会话，用：」——点了必然新建。

### 结论：**两个都能，但机制不同**

| | claude | codex |
|---|---|---|
| 换模型的入口 | `--model <name>`（**启动时**定） | `-m/--model`（**每次 exec** 都给） |
| 会话延续 | `--resume <session_id>` | `exec resume <thread_id>` |
| 换模型 = | **杀进程 → 带 `--resume` + 新 `--model` 重开** | 下一轮的参数换一下，**进程本来就是新的** |

**实测证据**：

```
① claude 第一轮：记住 8461 → 拿到 session_id
② claude --resume <sid> --model haiku → 回复 "8461"（记得），
   result.modelUsage 确认实际用的是 claude-haiku-4-5-20251001
```

**所以 claude 换模型是「重开 + 接回」**，不是「就地切换」——上下文不丢，
但**进程会重来一次**。这个代价必须写在实现的注释里，别让后来的人以为它是无痛的。

### 一个没有答案的问题：**模型清单从哪来**

pi 有模型目录（`availableModels(provider)`），**两个 CLI 都没有对应的东西**：
claude 认别名（`opus` / `sonnet` / `haiku`）也认全名，codex 认模型名，
但**都没有「列出可选项」的接口**。

**所以只能由配置声明**（`providers.yaml` 的 cli agent 上写 `models: [...]`）。
没声明就不显示 model pill——**与 native 那边「取不到就不假装有得选」是同一条纪律**。

### 未验证

- claude `--resume` 在**进程被 SIGKILL** 之后是否同样接得上（本次是正常退出后 resume）
- 换模型的那一刻若有一轮正在跑，会怎样（实现里要挡住）

---

## Spike I —— 「回复为什么这么慢」，是 harness 的原因吗？（2026-08-09）

**触发**：作者问*「deepseek 以及其他模型，询问完问题之后，回复的那么慢，
是不是 harness 的原因呢」*。

**方法**：用假推理服务器（本地、零网络）把**我们这一层**单独量出来，
再量真实 CLI。两者一比，责任就清楚了。

### 结论一：**不是 harness。我们这一层是几十毫秒量级**

| 层 | 第一轮 | 第二轮 |
|---|---|---|
| 运行时（pi + 我们的翻译，不经 Electron） | 建会话 30ms · 首字 36ms · 整轮 37ms | 首字 **4ms** |
| **端到端**（真实构建产物，点发送 → 屏幕上看见字） | **77ms** | **29ms** |

**整条链路（运行时 + IPC + React + markdown）加起来不到 100ms。**
所以作者感到的等待，几乎全部是**模型与网络**的时间。

### 结论二：**外部 CLI 那边有一个 7 倍的差距，而且是我们能选的**

```
claude 常规        首字节 1647ms | 整轮  6319ms
claude --bare      首字节  319ms | 整轮   899ms   ← 7 倍
codex exec         首字节 2300ms | 整轮 18985ms
claude 一进程两轮   8705ms（第二轮约 2.4s —— 长驻进程省掉了那 1.6s 启动）
```

`--bare` 的说明（`claude --help`）：*跳过 hooks、LSP、插件同步、attribution、
auto-memory、后台预取、keychain 读取，以及 **CLAUDE.md 自动发现***。

**所以它不是白捡的**：对一个在项目里干活的编码 agent，
**丢掉 CLAUDE.md 是实质的行为变化**。因此：

- **默认配置不加 `--bare`** —— 静默丢掉 CLAUDE.md 比慢更坏
- **但它已经可用**：`providers.yaml` 里给 claude 写 `args: ["--bare"]` 即可，
  我们本来就把 `args` 原样传下去。默认配置的注释里写明这个取舍

**codex 的 19 秒主要不是启动**（首字节 2.3s），是模型自己在想
（`gpt-5.6-sol` 带 reasoning）。换个轻的模型会快很多——现在选择器里能选了。

### 未验证

- **deepseek 的真实往返**：作者的 key 存在 Electron 的 safeStorage 里，
  进程外读不到，**所以没有实测数**。但由结论一可知，
  我们这一层在其中占不到 100ms——**慢的是别处**。

---

## Spike F · 远端内核（②-B · S15）—— 实测 2026-08-11

**机器**：`example.org`（共享教学集群，Ubuntu / Python 3.10.12 / ipykernel 6.26.0），密码认证。

### 结论：**路线 A 通过 —— `kernel/channel.ts` 原样复用，协议不变**

| 问题 | 结论 |
|---|---|
| Q1 ssh2 连得上 | ✅ 密码认证（也支持私钥 / ssh-agent） |
| Q2 远端有 ipykernel | ✅ 3.10.12 / 6.26.0 |
| Q3 起得来内核、拿得到 connection.json | ✅ 五个端口 + HMAC key |
| **Q4 五个端口隧道回本地并跑通 execute** | ✅ **远端算出 `DAWN_REMOTE_OK 42`** |
| Q5 收摊干净 | ✅（外加 `DAWN_SPIKE_CLEANUP=1` 的清理模式） |

**对 S15 的直接含义**：远端执行**不需要第二套协议实现**。zeromq 在 SSH 隧道上跑的是原样的 TCP，
`enchannel-zmq-backend` 那条链路不知道中间隔着一条 SSH。所以 S15 = **ExecutionContext + 隧道管理**，
而不是「在 channel.ts 旁边再开一份 Jupyter Server 客户端」（备选路线 B 因此不必启用）。

### 四条踩出来的纪律 —— 它们都要进 S15 的实现

1. **远端执行必须走登录 shell（`bash -lc`）。**
   ssh2 的 `exec` 起的是非登录非交互 shell，**不读 `~/.bashrc` / `~/.bash_profile`**。
   后果不是「跑不了」，而是**看到的是另一台机器**：作者在交互式 ssh 里装好了 ipykernel，
   spike 这边却报 `No module named ipykernel`——因为它看到的是 `/usr/bin/python3`（那个连 pip 都没有）。
   **环境快照记的必须是「人自己 ssh 上去看到的那套环境」**，否则快照描述的是一台不存在的机器。

2. **远端 stdout 不只有你要的东西，而且顺序没有保证。**
   这台机器的 MOTD 是一段欢迎横幅（星号 + 课程链接）。第一版按「取前两行」解析，
   取到的是横幅，**而退出码是 0——于是它看起来像通过了**：
   `远端 Python ******** · ipykernel 基因课服务器使用指南…`。
   改成「夹在标记之间」仍然不够：实测出现过 **MOTD 落在两个标记中间**（两条流交错）。
   **最终解法：单值一律 `键=值` 正则，多行 JSON 取最外层花括号。**
   *一个假「通过」比一个失败危险：失败会让人去查，假通过会让人往下走。*

3. **`pgrep` 会匹配到执行它的那条命令行本身。** 这个坑咬了两次：
   一次让 Q5 在内核压根没起来时报「还剩 1 个进程」；
   一次让清理命令 `pgrep … | xargs kill -9` **把自己那个 shell 杀了**。
   解法是老办法：模式写成 `[i]pykernel_launcher`。

4. **杀进程要等它真的没了，而且僵尸不算活着。**
   `kill` 之后立刻 `kill -0` 会报「还活着」：SIGTERM 后 ipykernel 要收尾；
   而它的父 shell 已退出，于是它先变**僵尸**——`kill -0` 对僵尸照样返回 0。

### 仍然未知（S15 要各自回答）

- **断线**：隧道断了怎么办（重连？会话作废？）。本 spike 只验通路，没验韧性。
- **延迟**：这台机器在国内，往返很快。跨地域时 iopub 的流式输出体感如何，没测。
- **`ssh2` 的分层决策**：它现在还在 `devDependencies`。要提升为运行时依赖，
  按规格 §4 需写明：坐哪一层、放弃了什么、我们的不变式挂在哪个钩子上。
