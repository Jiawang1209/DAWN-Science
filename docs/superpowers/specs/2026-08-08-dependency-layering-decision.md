# 依赖分层决策

- **日期**：2026-08-08
- **状态**：待作者审核
- **触发**：作者发现 native agent `tools: []`、手搓 provider 层、写死 `openAICompletionsApi()`，而这些 pi 全都提供。追因后确认这是**规划缺陷**而非执行疏忽。
- **约束**：作者定的原则——「没有必要的，直接使用已经成熟的工具。即便再怎么手搓，也没有 pi 写得好。」

---

## 0. 这份文档存在的理由

规格 §4 非目标清单里写着：

```
自建 agent loop          | 使用 pi-agent-core
自建 LLM provider 抽象   | 使用 pi-ai
自建终端模拟器           | 使用 xterm.js + node-pty
Jupyter Server/JupyterLab| 只使用 Jupyter 消息协议，不引入其服务端
```

**只有最后一行是合格的决策**——它写明了层与边界。前三行只写了「用」，而 pi 是分层库：
`new Agent({tools: []})` 和 `createAgentSession()` 都满足「使用 pi-agent-core」，
两者差着一整套 harness 和全部工具。

> **纪律（本文档确立）**：任何第三方依赖进规格，必须写清三件事——
> ①**坐在哪一层**（具体到导出符号，不是包名）②**放弃了什么** ③**我们的不变式挂在哪个钩子上**。
> 该决策对 Spike 有约束力：spike 必须验证**所选那一层的接口**，而不是「这个包能跑起来」。

---

## 1. pi 的真实分层

依赖图（读 10 个 package 的 package.json 得出）：

```
pi-telemetry ─┐                     1 文件
pi-protocol ──┼─ 无依赖              8 文件   CBOR 线协议 + framing + schemas
pi-tui ───────┘                    38 文件

pi-ai         → telemetry         172 文件   39 provider + 模型目录 + auth
pi-agent-core → ai                 48 文件   Agent/agentLoop + harness
pi-client     → protocol           10 文件   远程会话客户端（含 SessionLease）
pi-server     → ai, protocol       17 文件   UDS 守护进程（experimental）

pi-coding-agent → 以上全部        196 文件   完整编码 agent
```

**当前 DAWN 坐在第二层的最底下**：只用了 `Agent` 一个类，`harness/` 整个没碰。

---

## 2. 决策：坐第三层 `pi-coding-agent`

### 2.1 第三层不牺牲控制权（这是最初的顾虑，已证伪）

最初担心「`createAgentSession()` 的 harness 会挡住不变式挂载点」。读源码后确认**不挡，且给的挂载点更好**：

| 事实 | 出处 |
|---|---|
| `CreateAgentSessionOptions` 确实不暴露 `beforeToolCall` / `afterToolCall` / `shouldStopAfterTurn` | `core/sdk.ts:38-86` |
| **但** `AgentSessionConfig { agent: Agent, ... }` 接受自建 Agent，钩子照挂 | `core/agent-session.ts:198` |
| **且** `AgentSession.agent` 是 `readonly` 公开字段 | `core/agent-session.ts:306` |
| **而且**扩展系统的 tool 事件**按工具分型**，带 typed input | `core/extensions/types.ts:858-959` |

```ts
BashToolCallEvent | ReadToolCallEvent | EditToolCallEvent | WriteToolCallEvent
| GrepToolCallEvent | FindToolCallEvent | LsToolCallEvent | CustomToolCallEvent

interface ToolCallEventResult { block?: boolean; reason?: string }   // ← 拒绝执行
interface ToolResultEventResult { content?; details?; isError?; usage? }  // ← 改写结果与用量
```

> **`block: true` + `reason` 就是 capability 授权门；`ToolResultEventResult.usage` 就是成本与溯源的记录点。**
> 比第二层笼统的 `beforeToolCall` 更适合——它按工具类型分派，参数是 typed 的。

### 2.2 不变式的挂载位置（逐条）

| 不变式 | 挂在哪 |
|---|---|
| capability 授权门 | 扩展的 `tool_call` 事件 → `{ block, reason }` |
| 7.5 无静默回退 | `tool_result` 事件 → `isError` 不得被吞 |
| 溯源完整性 | `tool_result` 事件 → 记 `usage` 与工具身份 |
| 5 声明层 vs Repo 事实层 | **不挂 pi**：git 事实由我们自己算（pi 不管） |
| 7.1 写权可追责 | **不挂 pi**：见 §4.2 |

---

## 3. 采纳清单：删掉我的，换成 pi 的

**先分清两个问题**（作者 2026-08-08 指出我把它们混成了一句）：

- **谁提供**：下表「来自哪个包」一栏。**agent loop / harness / 压缩 / skills / 四个基础工具是 `pi-agent-core` 的**，不是 `pi-coding-agent` 的。
- **从哪进**：统一从第三层 `createAgentSession()` 进。**坐第三层不是放弃 `pi-agent-core`，是连它一起拿到**——`pi-coding-agent` 依赖 `pi-agent-core`，harness 已在其中装配好。从第二层进则要自己装配那一整套，而实现落成的正是这条，且装配漏了工具。

| # | 能力 | 来自哪个包 | 删掉 | 白拿到什么 |
|---|---|---|---|---|
| 1 | Provider + 模型目录 | **pi-ai**（39 provider） | `config/schema.ts` 的 endpoints/models 两段式、`runtime/native.ts` 手搓 provider | anthropic / google / openai 原生 API（现在走不通）、模型目录、`getEnvApiKey` 认已有环境变量 |
| 2 | Agent loop + harness + 基础工具 | **pi-agent-core**（`agent-loop.ts` · `harness/agent-harness.ts` · `harness/tools/`：bash · read · write · edit） | `runtime/native.ts` 全部 | 四个基础工具 —— 现在是 `tools: []` |
| 2b | grep · find · ls | **pi-coding-agent**（`core/tools/`） | — | 三个额外工具 |
| 3 | 凭证 | **pi-ai** 的 `CredentialStore` 接口（`ModelRuntime.create({ credentials })` 直接接受）<br>~~pi-coding-agent `AuthStorageBackend`~~ | `electron/credentials.ts` 主体（约 130 行） | 与 pi 一致的凭证语义；**只需实现 `read`/`list`/`modify`/`delete` 四个方法** |
| 4 | 输出截断 | **pi-agent-core** `harness/utils/truncate.ts` + **pi-coding-agent** `core/output-guard.ts` | `session/stream.ts` 的截断部分 | — |
| 5 | 用量 | **pi-protocol** 的 `UsageSchema` | 自定义 Cost 的可见分支 | 与 pi 一致的字段 |
| 6 | 上下文压缩 | **pi-agent-core** `harness/compaction/` | —（我们还没做） | branch-summarization |
| 7 | Skills | **pi-agent-core** `harness/skills.ts`；斜杠命令 **pi-coding-agent** `core/slash-commands.ts` | —（还没做） | — |
| 8 | 项目信任 | **pi-coding-agent** `core/project-trust.ts` · `trust-manager.ts` | —（还没做） | — |
| 9 | 会话持久化（JSONL） | **pi-agent-core** `harness/session/jsonl/` | —（我们用 SQLite，见 §5） | 不采纳，规格 7.32 的理由仍成立 |

**第 3 条是关键**：`AuthStorageBackend` 是**接口**（`withLock` / `withLockAsync` 两个方法），
`FileAuthStorageBackend` 只是默认实现，且构造函数接受 `authPath`。
→ **我们实现一个 safeStorage 加密的 backend，白拿 pi 的并发正确性**，而不是两选一。
（`getAgentDir()` 也支持环境变量覆盖，见 `config.ts:515`。）

---

## 4. 部分采纳：借形状，不引传输

### 4.1 会话协议 —— pi-protocol 覆盖了我们的一半，而且更完整

`pi-protocol/schemas.ts`（447 行）与我们的 Workbench Protocol 对照：

| pi-protocol | 我们的 | 谁更完整 |
|---|---|---|
| `ClientHello{version}` / `ServerHello{version, connectionId, snapshot}` | 握手 | 相当 |
| `RequestEnvelope` / `ResponseEnvelope{ok:true\|false}` | 成功/错误信封 | 相当 |
| `EventEnvelope` + `ServerEvent` 联合 | 事件通道 | 相当 |
| `ProtocolError{code}` | 错误码 | 相当 |
| list · create · **attach** · **detach** · prompt · **steer** · **abort** · **set_model** · **set_thinking** | listSessions · createSession · subscribeSession · unsubscribeSession · writeToSession · stopSession | **pi**：我们没有 steer / abort / 模型切换 |
| `TranscriptProgress`（item_started / assistant_delta / item_updated / item_finished） | turn 增量 | **pi**：分了 thinking / toolCall / text |
| `SessionSnapshot{ revision, transcript, queuedSteer }` | seq + 环形缓冲 + dropped | **见下** |

**重连模型的差别值得单独说：**

- **pi**：`attach` 返回完整 `SessionSnapshot`（含 `transcript` 与 `revision`），之后收增量。
  transcript 是持久化的真相，**不存在"缓冲丢了"这回事**。
- **我的**：seq + 按字符计的环形缓冲 + `dropped` 事件 + `truncated` + `earliestSeq`。

> 我那套「丢弃必须出声」的纪律，**是为一个本不该存在的问题设计的**——
> 只要 transcript 是持久的，就不需要在内存缓冲溢出时向用户道歉。
> pi 的 snapshot + revision 更简单也更对。

**决定**：**采用 snapshot + revision 的形状，不引入 pi 的传输层。**

理由：`pi-server` 的 transport 只有 `unix`（UDS 守护进程），而我们是 Electron 主进程/渲染进程同机 IPC。
引入 UDS 意味着多一个进程、多一层序列化，换不到东西。
**借形状是白拿设计，引传输是自找架构负担。**

### 4.2 租约 —— pi 有，但不是同一个东西

pi 有 `SessionLeaseMode: "shared" | "exclusive"`（`client/src/session-handle.ts:13`）
与 `session_locked` 错误码（`server/src/errors.ts`）。

但我们的租约是**人 vs 引擎的写权归属**：用户永远可抢占引擎、反之不行；带夺权预览与审计事件（规格 7.1）。
pi 的是连接级互斥，没有 holder 身份、没有抢占语义。

**决定**：**保留 `session/lease.ts`，错误码对齐 `session_locked`。**

---

## 5. 保留清单：pi 完全没有的部分

实测确认（grep 全仓库）：

| 能力 | 证据 |
|---|---|
| PTY 托管外部 CLI（claude / codex） | pi 全仓库**没有 node-pty 依赖** |
| 项目 / Run / 溯源账本 | `provenance` 只在 CHANGELOG / docs / 一个测试里出现，无实现 |
| git 产出事实（不听声明，只看 repo） | 无 |
| Electron 壳与 UI | 无（pi 的 UI 是 pi-tui 终端界面） |
| SQLite 存储 | pi 用 JSONL（`harness/session/jsonl/`）；规格 7.32「SQLite over JSONL」的理由仍成立 |

**这五项是 DAWN 的命题所在，也是它区别于「pi 的一个壳」的全部内容。**

---

## 6. 返工范围

### 删除或重写

| 文件 | 处置 |
|---|---|
| `src/runtime/native.ts` | **重写**：`createAgentSession()` 替掉手搓装配 |
| `src/config/schema.ts` · `loader.ts` | **大改**：endpoints/models 两段式 → pi 的 model registry |
| `src/electron/credentials.ts` | **重写为 `AuthStorageBackend` 实现**（保留 safeStorage 加密，丢掉自己的并发处理） |
| `src/session/stream.ts` | **删除截断部分**，保留（若还需要）订阅部分 |
| `src/workbench/events.ts` | **重写**：seq + 环形缓冲 + dropped → snapshot + revision |
| `src/protocol/events.ts` | **重写**：对齐 `TranscriptProgress` 的形状 |
| `src/protocol/operations.ts` | **增补**：steer / abort / setModel |

### 不动

`project/` · `store/` · `session/lease.ts` · `runtime/pty.ts` · `runtime/family.ts` ·
`workbench/backend.ts` 的项目/Run 部分 · `electron/main.ts` · `ui/`

### 测试影响

437 条中约 **90–130 条**作废（协议事件 15、中枢 20、凭证 13、loader 若干、native 相关、部分 UI 事件流）。
**协议实体、Run 存储、项目、租约、PTY、UI 视图的测试基本不受影响。**

---

## 7. 分批执行

| 批次 | 内容 | 验收 |
|---|---|---|
| **R1** ✅ | Spike A-2：验证第三层接口 | **已完成 2026-08-08，GR 门十项全过**，见 `spikes/FINDINGS.md` 的 Spike A-2 一节 |
| **R2** ✅ | 重写 `native.ts` + 配置层 | **已完成 2026-08-08**：真实对话里 agent 读出了文件里的暗号、`touch` 出的文件真的存在 |
| **R3** ◐ | 凭证换 `CredentialStore` | **适配器已随 R2 落地**（含缓存）；剩「设置界面改完立即生效」的真机验证 |
| **R4** ✅ | 协议与事件通道改 snapshot + revision | **已完成 2026-08-08**：协议升 2.0，跳号改为自愈式重取快照；abort / steer 已补 |
| **R5** | UI 接上工具调用的显示 | 看得见 agent 在做什么 |

**R1 不通过就不进 R2。** 上一次的错误正是拿一个只验了「能跑起来」的 spike 去指导实现。

---

## 8. 决策门的修正

G1 的三条判据（能敲字 / Ctrl-C 生效 / 退出后终端正常）**全部是 PTY 的**，
一条都没验 native agent——所以 `tools: []` 在 G1 通过时就已存在，而门看不见它。

> **纪律**：每个决策门的判据必须逐条对照规格的能力清单生成，
> 不得由实现者临时拟定。判据要覆盖**每一种 runtime**，不能只覆盖最容易演示的那一种。
