# ACP agent 在服务器上干活（分支 `acp-terminal`）

**问题**：连着服务器时选 codex / claude code 这类 ACP agent，界面会让你选、会话也开得出来，
但它跑在本机目录里。`SessionSpec.remote` 只有 native 运行时认（`src/runtime/native.ts:566`），
`src/runtime/acp/runtime.ts` 一个 `remote` 都没有。这是静默错位——违反「失败必须出声」。

**作者的问题**（2026-08-20）：*「为什么 Agent + API 可以在服务器里面执行？」*
答：native 那条脑子在本机（pi 的 loop 调 API）、手经 `RemoteExecutor` 伸到服务器。
**ACP 的 agent 是脑子和手焊在一个进程里的**，所以要分别想办法把手拆出来。

**作者定的范围**：claude 与 codex 两条都想要；**服务器上不装东西、也不放文件**（sshd 之外不要求任何东西）。
这条约束下 codex 做不到（见 §二），定案是 claude 做全、codex 标「本机运行」。

---

## 一、量出来的事实（2026-08-20，探针在 scratchpad，不进仓库）

探针：握手声明 `fs: {readTextFile, writeTextFile}` 与 `terminal: true`，
`fs/*` 落到**另一个**目录 B，`terminal/*` 在 B 里执行。agent 的 cwd 是 A。
四步任务：读 `note.txt`、追加一行、`ls -la`、搜 `version`。看最后 A、B 谁被动了。

| | claude-code-acp 0.16.2 | codex-acp 1.6.2（核心 `@openai/codex` 0.148） |
|---|---|---|
| 读 | `fs/read_text_file` | 自己的 shell（`sed -n`） |
| 改 | `fs/read_text_file` + `fs/write_text_file`（B 被改，A 没动） | 自己的 apply_patch（A 被改） |
| 跑 | `terminal/create → wait_for_exit → output → release` | 自己的 shell |
| 搜 | **Grep 不经过我们**（本机搜的） | 自己的 |
| 客户端方法总数 | 7 种 | **0**——源码里只有 schema，没有一处调用 |

补测三条，都在真适配器上：

1. `session/new` 的 `_meta.claudeCode.options.disallowedTools: ["Grep","Glob","NotebookEdit"]`
   → 它改用 `grep -rl`，走 `terminal/create`。**七种调用全经我们，A 一个字节没动。**
   原理：`acp-agent.js` 把 `_meta.claudeCode.options` 展开进 SDK 选项，`disallowedTools` 是**合并**的。
2. `session/new` 的 `cwd` 给一个本机不存在的路径 → `-32603 "Query closed before response received"`。
   Claude Code SDK 要在那个目录里 spawn。**这条错误与环境变量那条（规格 2026-08-16 §二）同一句话**，分不开。
3. codex-acp 起核心的方式是 `spawn(process.env.CODEX_PATH ?? "codex", ["app-server"])`，
   JSON-RPC over stdio。`CODEX_PATH` 指向一个包装脚本 → 照用（`wrapper.log` 有 `args=app-server`），
   `session/new` 的 `cwd` 原样传给 app-server 当线程目录。

---

## 二、定案

### claude：把手借给我们

| 层 | 决定 |
|---|---|
| 握手 | `clientCapabilities: { fs: {readTextFile: true, writeTextFile: true}, terminal: true }`。**本机会话也给**——一条路，不按远端/本机分叉 |
| `session/new` | `_meta.claudeCode.options.disallowedTools: ["Grep", "Glob", "NotebookEdit"]`。WebFetch / WebSearch 留着（网络从本机走，无所谓） |
| `fs/read_text_file` `{path, line?, limit?}` | 远端：`RemoteExecutor.readFile`；本机：`node:fs`。`line`/`limit` 按行切 |
| `fs/write_text_file` `{path, content}` | 远端：`RemoteExecutor.writeFile`；本机：`node:fs`。**父目录不存在就建**（Write 工具的语义） |
| `terminal/create` `{command, args?, env?, cwd?, outputByteLimit?}` | 起一条 `exec`，**不等它结束就回 `terminalId`**。输出攒在一个环里，超过 `outputByteLimit` 从头丢、`truncated: true`，并在我们自己的日志里写明丢了多少字节（协议只有布尔，我们补数） |
| `terminal/output` | 回 `{output, truncated, exitStatus?}`；没结束就不带 `exitStatus` |
| `terminal/wait_for_exit` | 等 `exec` 的 Promise；回 `{exitCode?, signal?}` |
| `terminal/kill` | 触发 `ExecOptions.signal`——`RemoteExecutor` 已经会按 PID 杀远端进程组 |
| `terminal/release` | 丢掉那一条记录；没杀先杀 |
| 路径门 | **与 native 的 `gatedTools` 同口径**：读写限于会话工作区（远端是 `remoteCwd`），越界回 `-32602` 并出声。ACP 的路径一律绝对 |
| 本机 cwd | 适配器进程 spawn 在 `<sessionDir>/acp-shadow/`（空目录，总存在）。**`session/new` 的 `cwd` 也给这个影子目录**——因为 SDK 要它在本机存在（事实 2） |
| 路径翻译 | 请求里以影子目录开头的路径 → 换成 `remoteCwd` 前缀；`terminal/create` 的 `command` 字符串里出现影子路径也替换；回给它的路径反向换。**不以影子开头的绝对路径原样放行**——用户说的 `/data/raw/x.csv` 就是服务器上的那个文件 |
| 给它说实话 | `_meta.claudeCode.options.systemPrompt.append`：「你的工作目录在服务器 `<label>` 的 `<remoteCwd>`；本机路径 `<shadow>` 等价于它。」它用哪个写法都对 |

**为什么不用 `.claude/settings.json` 的 `permissions.deny`**：验过也成立，但它要落在一个目录里，
而那个目录的归属（用户的工作区？我们的影子？）就是一个新的作用域问题。`_meta` 是按会话给的，没有落盘。

### codex：这一版不上服务器（作者 2026-08-20 定）

codex 的读写与 shell 都长在 Rust 核心里，适配器不借手。把核心跑到服务器上
在技术上是通的（`CODEX_PATH` 指向中继、stdio 桥到 ssh、`session/new` 的 `cwd` 给服务器路径，
本地已验到 `CODEX_PATH` 这一层），**但要往服务器放一个二进制文件，作者明确不允许**。

没有二进制的替代只有一个半吊子：MCP 给它一套远端读/写/跑，再靠 `session/request_permission`
拒掉它自带的写与命令。**读拦不住**——`ls`/`cat` 这类它当可信命令自动放行，不来问。
结果是读本机、写远端，一半对一半错。这是静默错位，不做。

**定案**：codex 明确标为「在本机运行」。远端建会话时**不列出**（与 `cli` 类同一口径）。
哪天上游适配器也借手了，它自然走 claude 那条路，我们不用改。

### 两条共用的

- **`AcpRuntime` 收下 `spec.remote`**：没有就是本机，有就走上面两张表。运行时仍然不认识名单（只拿执行器和 cwd）。
- **账本**：`fs/write_text_file` 经过我们，claude 的 `filesWritten` 可以从这里记**真的**，
  不必从 git 反推（B1 路线 C）。**这一版不改**——两套一起上会打架（`wiring.ts:542` 的理由）。记在这里，下一轮处理。
- **模拟后端**：`scripts/mock-inference-server.mjs` 里的假 ACP agent**同一次改动里**学会发 `fs/*`、`terminal/*`（准入规则 1）。
- **出声**：远端会话里 `kind: cli` 与 codex 仍跑本机——**建会话的菜单里不列出**（「看不见等于不存在」的反面：能看见的必须是真的）。怎么判定一个 ACP agent「借不借手」：**握手判不出来**——ACP 里 agent 不声明「我会用客户端的 fs/terminal」，所以按 agent 定义里一个显式标记 `remoteCapable`：预置的 claude 条目为真、codex 为假，自定义条目默认为假（缺失不等于支持）。

---

## 三、分期

| 期 | 做什么 | 判据 |
|---|---|---|
| T1 | `AcpRuntime` 实现 `fs/*`、`terminal/*`（本机版），握手改能力，`_meta` 给 disallowedTools，假 agent 跟上 | 单元：七种方法各一条；e2e：mock 模式下 claude 类 agent 的「读/改/跑」经过运行时 |
| T2 | 接 `spec.remote`：影子目录、路径翻译、路径门、远端执行器 | 单元：翻译的双向与「不以影子开头原样放行」；真服务器上跑一遍探针同款任务，服务器目录被改、本机影子目录没动 |
| T3 | 界面：远端建会话时只列「手能到服务器」的 agent（native、claude 类 ACP）；codex / `cli` 不列，并在设置里 ACP 那一格说明原因 | 设计契约扫描；视觉基线看 diff |

T1 不碰远端，任何时候都能合；T2 之后本机会话的行为**不变**（影子目录只在 `spec.remote` 有时启用）。

---

## 四、不做的

- 不给 codex 塞一套「远端文件 / 远端 shell」MCP 工具再靠提示词叫它别用自带的——它会忘，忘了就是静默写到本机。
- 不把整个 claude-code-acp 搬到服务器——要 Node、要登录态，作者明说服务器装不了。
- 不往服务器放任何文件（二进制、凭据都不行）——作者定的。
