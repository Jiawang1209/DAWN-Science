# 开发历史

本文件是本项目**唯一**的开发历史记录，最新的在最上面。

---

## 记录规范

**每完成一次开发变更（feat / fix / refactor / docs / data / perf / chore），都要在下方变更日志的最顶部追加一条。**

### 条目格式

```markdown
### YYYY-MM-DD — <一句话标题>

- **Type**: feat | fix | refactor | docs | data | perf | chore
- **Commit**: `<短 hash>`（尚未提交时写 `待回填`）
- **Motivation**: 为什么做（问题 / 需求）。
- **What**: 改了哪些模块 / 数据产品，关键决策是什么。
- **Impact**: 对数据产品 / 下游 / 可复现性的影响；破坏性变更必须标注。
- **Verification**: 怎么确认它是对的（测试、计数、抽查）。
```

### commit 号怎么填

存在一个先后矛盾：条目要和代码同一个 commit 提交，但 commit 号在提交完成前不存在。本项目的解法是**下次提交时回填**，以保持「一次逻辑变更 = 一个 commit」的节奏：

1. 写条目时 `**Commit**: 待回填`，连同代码一起 `git commit`；
2. **下一次**提交前，先 `git log --oneline -3` 查出上一条的短 hash，填进上一条条目；
3. 该回填与本次的新条目一起提交。

因此顶部条目通常是 `待回填`，其余条目都有确切 hash。这不影响可追溯性——因为还有第二条硬规则：

> **commit 的标题行必须等于条目标题（可带 `type:` 前缀）。**

例如条目 `### 2026-08-08 — 建立 dawn-science 仓库，项目定名 DAWN Science` 对应 commit `chore: 建立 dawn-science 仓库，项目定名 DAWN Science`。即使 hash 还没回填，`git log --oneline | grep '<标题>'` 也能唯一定位。

### 粒度

一条逻辑变更一条记录（可以跨多个 commit——此时 **Commit** 字段列出该逻辑变更的全部 hash）。不要为「改个错别字」单开一条，也不要把两件不相干的事塞进一条。

---

## 变更日志

### 2026-08-08 — G1 决策门通过：补测「四个会话能并存」，阶段①-A 正式验收

- **Type**: test
- **Commit**: 待回填
- **Motivation**: 作者本人实测确认了 G1 的第二问（CLI 能真接管）。但核对主规划 §5 后发现——**G1 有三问，而实施计划 Task 1.11 的验收清单只覆盖了其中两问**，「四个会话能并存」在主规划里却没进详细计划，一直没被验证过。不补上就宣布 G1 通过，等于让一条判据凭空消失。
- **What**:
  - 新增 `tests/integration/concurrent-sessions.test.ts`，5 个跨真实进程的用例：四会话同时存活且 pid 互不相同、并存 pty 会话输出互不串台、每会话租约独立（一个会话上 engine 抢不动 user 不影响另一会话）、停掉其一不影响其余且存活者仍可写入、每会话 sessionDir 独立。
  - 主规划 §11 记录 G1 三问的判定结果与依据。
- **Impact**: **G1 通过，阶段①-A 正式验收完成**，可进入①-B。全仓库 125 passed。
- **教训（已写入主规划）**: 实施计划的验收清单**漏掉了主规划决策门里的一条判据**。这不是执行问题而是编写问题——两份文档各写各的，没有交叉核对。**推论：后续阶段的详细计划在编写时必须逐条对照主规划对应决策门的判据。** 这与本项目「交叉核对」的核心机制是同一回事，只不过这次对象是文档而非 agent 声明。
- **Verification**: 5 个新增用例全部通过，均跨真实进程边界（bash / sh），无 mock。G1 第二问由作者本人在键盘前实测：方向键与退格正常、Ctrl-C 中断 claude 而非杀掉 CLI、退出后终端模式正确恢复。第三问由 md5 全程比对确认。

### 2026-08-08 — 阶段①-A 完成：CLI 补全与验收，五项判据四项自动通过（Task 1.11）

- **Type**: feat
- **Commit**: `5636ba9`
- **Motivation**: 阶段①-A 的收尾。把配置、存储、租约、生命周期、三种 Runtime 接成一个能用的命令行工作台，并对照验收判据逐项核验。
- **What**:
  - `src/cli.ts` 补全：`agents` / `run <agent>` / `sessions` / `demo`。`run` 起会话并接管当前终端——**user 持有租约**（规格 7.1，engine 不得抢占），pty 会话进原始模式使按键原样透传（含 Ctrl-C），native 会话保持常规模式让 Ctrl-C 仍能终止 CLI 自身；转发 SIGWINCH 给 pty，退出时恢复终端模式。
  - **修正计划 CLI 的一处实质缺陷**：计划把 pty runtime 写死成 `{command:'claude'}`，而 pty agent 的命令是 registry 逐个定义的——配置里的 `codex` 会被**错误地起成 claude**，且进程照样起得来，失效方式很隐蔽。为此给 `SessionManager` 新增 `ptyRuntimeFor(agentId, def)` 钩子（未提供时回退到 `runtimes.pty`，既有测试不受影响），CLI 据此按 agent 定义构造 runtime，并从命令名推断 CLI 家族——**认不出就不写任何配置**，因为猜错家族会生成一份该 CLI 读不懂的配置而进程照常启动。
  - 新增 `SessionManager.runtimeOf()` 与 `resize()`，避免 CLI 用类型断言掏私有字段。
  - **补一个真实缺口**：管道输入到 EOF 时会话不会结束。新增 stdin `end` 处理，native 会话**等当前回合跑完再收摊**，否则 `echo ... | dawn run` 会在模型还没答完时被切断。
  - 计划 Step 4 的「预期 48 passed」已作废，改为记录实测 120 并保留差额说明。
- **Impact**: **阶段①-A 完成。** 模块清单：配置层（schema/loader）、存储层（schema/sessions）、租约、会话生命周期、隔离配置生成、终端流、三种 Runtime（fake/pty/native）、CLI。**已知缺口**：无 UI（①-B）、无编排（③）、无科学计算内核（②）。
- **Verification**: 全仓库 **120 passed**，typecheck 零错误。阶段验收五项判据：**① `agents` 列出 native 与 pty 两类 ✅；② `run ds-chat` 真实问答 ✅**（DeepSeek 正确回答了 PCA 的定义）；**④ `sessions` 落库且启动对账生效 ✅**（手工插入一条残留 `alive` 记录，重启后被显式修正为 `exited`）；**⑤ 全局 `~/.claude/settings.json` md5 前后一致 ✅**。**③「`run claude-code` 起真终端且键盘可用」只完成了一半**——已自动验证 claude 在 PTY 中启动（TUI 输出 5267 字节）、per-session `mcp.json` 落地、全局配置未被污染，但「真的敲字、真的 Ctrl-C」属手感判断，**必须由作者本人在键盘前确认**，G1 决策门就此保持未决。

### 2026-08-08 — 阶段①-A Native Runtime：pi agent loop 适配器，真实对话打通（Task 1.10）

- **Type**: feat
- **Commit**: `0ce7a5e`
- **Motivation**: 阶段①-A 的最后一块运行时。它决定 `dawn run ds-chat` 能否真的跟模型对话，也是 Spike A 结论的兑现点。
- **What**:
  - 新增 `src/runtime/native.ts`：`NativeRuntime`，用 `pi-agent-core` 的 `Agent` + `pi-ai` 的 provider 层。
  - **走通用 `createProvider` 路径而非 pi 内置的 `deepseekProvider()`**。理由：内置 provider 从环境变量读 key 且 baseUrl 写死，而本项目的 `SessionSpec.endpoint` 携带显式 baseUrl / apiKey / model（来自 `providers.yaml`，已由 loader 展开 `${ENV}`）。显式 key 通过自定义 `auth.apiKey.resolve()` 注入——**`ProviderAuth` 是 `{apiKey?, oauth?}` 的包装层**，直接把 `{name, resolve}` 放在 `auth` 下会 typecheck 失败。
  - **计划 Step 3 的「zod 校验 + 重试」补丁不需要写**：Spike A 已实测 schema 由引擎强制且失败自动重试，非法参数根本到不了 handler。这是 spike 直接省掉一整层实现的实例。
  - 事件转换只取 `text_delta`（逐 token 的正文增量），`turn_end` 补一个换行。`write` 接口是同步的而 `agent.prompt` 是异步的，故 fire-and-forget，但**失败必须出声**——转成 output 事件送到终端，不静默吞掉。
  - 新增 `scripts/smoke-native.ts` + `npm run smoke:native`：把计划 Step 4 的「手工冒烟」做成可重复执行的脚本。
  - **合成 pid 的语义差异已写进注释**：native 会话不对应真实进程，pid 是序号，**不可用于 `process.kill`**，与 PtyRuntime 的 pid 语义不同。
- **Impact**: 三种 Runtime（fake / pty / native）全部就位，Task 1.11 可以把 `dawn run` 接起来。**一处已知限制**：通用端点的 `cost` / `contextWindow` / `maxTokens` 无法预知，当前用保守占位值（cost 全 0、128k 窗口）。后果是 `calculateCost` 会算出 0、上下文压缩触发点偏保守；阶段 ②-A 引入压缩时需让 `providers.yaml` 能声明这些值，或对已知 provider 走 pi 内置模型表。
- **Verification**: 9 个契约测试（不打网络，建 provider 与 Agent 均不产生请求）。**真实链路由冒烟脚本验证**：向 DeepSeek 发一轮对话，事件种类 `started, output, exited` 齐全，收到 45 字正文。计划 Step 4 的示例用 `deepseek-chat`，已按 Spike A 结论改为 `deepseek-v4-flash`。全仓库 117 passed，typecheck 零错误。

### 2026-08-08 — 阶段①-A PTY Runtime：进程树终止证伪了规格 7.18 的核心假设（Task 1.9）

- **Type**: feat
- **Commit**: `ee5dc7c`
- **Motivation**: 第一个真起进程的 Runtime。核心风险是**孤儿进程**——数据科学 agent 会起 `python train.py`、`npm test` 这类长任务，杀不干净会持续占用 CPU 与 GPU，而显存不释放会卡死后续全部工作。
- **What**:
  - 新增 `src/runtime/pty.ts`：`PtyRuntime`，node-pty 起真实进程，接入 Task 1.7 的隔离配置。
  - **把 `materializeSessionDir` 的 `args` 也拼进命令行**。计划初稿只用了 `env`——Task 1.7 之后 claude 的 MCP 与 hook 全靠命令行标志，只传 `env` 会让它完全收不到注入的配置，**而进程照样起得来**，失效方式极其隐蔽。已为此单独写测试：用 `/bin/echo` 当命令，它把收到的参数原样打印，直接验证 args 确实传下去了。
  - **证伪并修正了规格 7.18 的核心假设**（详见下）。
  - `resize` 包 try/catch（进程退出中调用会从 native 层抛错），`stop` 幂等，`emit`/`attach` 沿用前几个 Task 的集合安全修法。
- **Impact / 关键发现**: 规格 7.18 原文写「**SIGTERM → 200ms → SIGKILL，发给整个进程组**」，隐含假设是「pty 的 pid 即 pgid，覆盖它派生的全部后代」。**孙子进程回归测试直接把它证伪**：`sleep 600 &` 在整组 SIGTERM + SIGKILL 之后**依然存活**。
  根因是 **job control**——shell 在 PTY 里拿到终端后会启用它，`cmd &` 起的后台任务被放进**它自己的新进程组**，`kill(-ptyPid)` 够不着。
  改为**先快照整棵进程树**（`ps -A -o pid=,ppid=,pgid=` 自根 BFS），再逐进程组 + 逐 pid 地扫。**快照必须在杀之前做**——进程一死，其子进程立即被 reparent 到 `init(1)`，那时再遍历已找不到亲子关系。规格 7.18 已补写实测修正段，并指出 **Buzz 的 `KillGroup` 模型不能直接照搬**：它管的是自己 `spawn` 且显式设过 `process_group(0)` 的子进程，而我们要管的是一个**会自行创建进程组的交互式 shell 的全部后代**。
- **Verification**: 严格 TDD。9 个集成测试（计划预估 3 个），全部跨真实进程边界、无 mock。孙子进程回归**先失败后通过**——这正是它存在的意义，修正后耗时从 6.5s 降到 1.7s（孙子进程秒死而非等超时）。增补用例：started 事件 pid 与 handle 一致、stop 对已退出会话幂等（对应 Spike C 的 `Napi::Error` SIGABRT）、未启动会话 write 抛错、退订生效、**family 设定时 args 拼进命令行且配置文件落地**、未设 family 时不写任何配置。全仓库 108 passed，typecheck 零错误。

### 2026-08-08 — 阶段①-A 终端流：scrollback ring buffer 与节流合并投递（Task 1.8）

- **Type**: feat
- **Commit**: `37d39e6`
- **Motivation**: 终端输出可能瞬间涌入几十 MB（Spike C 实测四路 29 MB / 0.7s），需要一个既能保住历史、又不把 UI 打死的中间层。本任务的参数取值直接由 Spike C 的实测数字决定。
- **What**:
  - 新增 `src/session/stream.ts`：`TerminalStream`，scrollback ring buffer + 可选的节流合并投递。
  - **默认不节流**（`flushIntervalMs: 0`）。依据 Spike C：四终端并发灌 29 MB，**冻结帧 0、卡顿帧 0、最长单帧 59.2 ms**，未触及 100ms 卡顿线。但帧率确实从 60fps 掉到约 27fps，故保留节流能力并以「单帧 100ms」为将来的触发线。
  - **`maxBytes` 更名为 `maxChars`**。计划初稿的字段叫 `maxBytes` 但实现是字符切片，两者在 CJK 下差 3 倍。选择改名而非改成按字节切，理由是 **JS 字符串是 UTF-16，内存占用与字符数成正比而非 UTF-8 字节数**——字符计数本就是更准的内存代理量，且按字节切还有把多字节字符截半的风险。
  - **修掉计划初稿的一处真实缺陷**：节流开启时，若新观察者在 pending 未投递的窗口内订阅，会**收到重复数据**——`subscribe` 先给它整个 buffer（scrollback 是即时更新的，已含 pending），定时器到期又把 pending 投递一遍。改为**订阅前先冲掉 pending**。
  - `deliver` 遍历前复制集合（沿用 Task 1.4/1.5 的同一修法），`dispose` 一并清空 pending。
  - **scrollback 与投递节奏解耦**：`push` 无论是否节流都立即更新 buffer——UI 卡顿不该导致历史丢失。
- **Impact**: Task 1.9 的 PtyRuntime 可直接把 pty 输出灌进 `TerminalStream`。Spike C 的另一条结论也落进了注释：**scrollback 是内存主控参数，不是显示偏好**——xterm 的 5000 行上限正是 20 万行输入下内存仍稳在 526 MB 的原因。
- **Verification**: 严格 TDD，13 个测试（计划预估 6 个）。增补的用例包括：单块超限只留尾部、多字节字符不被截半、空 scrollback 不投递空块、观察者在回调里退订不打乱本次投递、**pending 窗口内订阅不收重复数据**、订阅提前冲刷不让既有观察者丢数据、`dispose` 后定时器被清理。全仓库 99 passed，typecheck 零错误。

### 2026-08-08 — 阶段①-A per-session 隔离配置：按 Spike B 实测重写 claude 分支（Task 1.7）

- **Type**: feat
- **Commit**: `445e65e`
- **Motivation**: 给一个会话注入 MCP server 与回合结束 hook，且**绝不触碰用户全局配置**。计划在本任务开头就写明「以 FINDINGS 为准，若不同则同步修改测试」——而 Spike B 的实测与计划初稿有两处实质冲突，必须按实测改。
- **What**:
  - 新增 `src/runtime/session-dir.ts`：`materializeSessionDir(family, dir, opts)`，支持 claude / codex 两个家族。
  - **按实测推翻计划初稿的两处假设**：① 计划把 MCP 写进 `settings.json` 的 `mcpServers`——**claude 根本不从那里读**，MCP 走 `--mcp-config <file>`、hook 才走 `--settings <file>`，是两个不同的标志与文件；② 计划用 `CLAUDE_CONFIG_DIR` 做隔离——实测隔离确实成立但**会一并隔离掉认证**（`Not logged in`），且复制 `.credentials.json` 不足以恢复。
  - **因此返回值新增 `args` 字段**（要追加到命令行的参数），claude 分支返回 `--mcp-config … --strict-mcp-config [--settings …]` 且 `env` 为空；codex 分支保持 `CODEX_HOME` 完整隔离（其凭证就在 `$CODEX_HOME/auth.json`，播种即可恢复）。
  - **即使没有 MCP server 也照写 `mcp.json`**：配合 `--strict-mcp-config`，空表意味着「这个会话没有任何 MCP」，是个确定的保证而非默认行为。反之没有 hook 就不生成 `settings.json`——`--settings` 的语义是「叠加额外设置」，空文件只增噪音。
  - 未知 CLI 家族响亮报错。理由写进注释：静默生成空配置的失效方式最糟——**进程起得来，但注入的工具与 hook 全都没生效，而调用方以为一切正常**。
- **Impact**: Task 1.9 的 PtyRuntime 可直接用 `{env, args}` 组装启动参数。**已知代价**（FINDINGS 已记为 Task 1.7 遗留项）：claude 这条路下，会话历史仍会累积进用户全局 `~/.claude.json`；要两全需验证「向隔离的 `.claude.json` 播种 `oauthAccount`」或「用 `ANTHROPIC_API_KEY`」，二者均未验证。
- **Verification**: 严格 TDD，13 个测试（计划预估 5 个）。**但单元测试不足以验收本任务**——Spike B 验证的是手写配置，不是本函数的产出，故补做了一次端到端验证：用 `materializeSessionDir` 生成的 `args` 真的驱动了一次 `claude -p`，探针日志同时出现 `{"kind":"tool"}` 与 `{"kind":"hook"}`，且全局 `settings.json` 的 md5 前后一致。全仓库 86 passed，typecheck 零错误。

### 2026-08-08 — 提前插入临时 CLI，使已完成的四层可上手运行（计划外）

- **Type**: feat
- **Commit**: `badd686`
- **Motivation**: **这是计划外的插入，理由是主规划 §5 的 G2 决策门**——「判据不是功能清单，是行为：你是否真的开始用它」。按原计划要到 Task 1.11 才有入口，意味着作者要等 6 个任务才能上手；而配置层、存储层、Runtime 契约、会话层四块此时已经贯通，让它们可运行的边际成本很低。越早上手，越早发现设计上不合用的地方。
- **What**:
  - 新增 `src/cli.ts`（**临时版，文件头已显式标注**，Task 1.11 会补全）：`dawn agents` / `dawn sessions` / `dawn demo`。`dawn run <agent>` 尚不能做——需要 Task 1.9–1.10 的真实 Runtime。
  - 新增 `providers.example.yaml`：四个 agent（两个 native + 两个 pty），model id 全部钉 v4 版本并在注释里写明理由。
  - `dawn demo` 用 FakeRuntime 串起完整生命周期：创建会话 → engine 取租约 → 写入 → **预览抢占** → user 抢占 → **engine 被拒** → user 写入 → 停止 → **打印租约审计链**。这是把四层的行为一次性可视化。
  - `providers.yaml`（本地配置）加入 `.gitignore`。
- **Impact**: 已完成的四层现在可以直接运行验证，而不只是靠测试。**顺带端到端验证了此前只有单元测试覆盖的一条链路**：`.env` → `--env-file-if-exists` → loader 的 `${ENV}` 展开 → schema 校验，`dawn agents` 能正确显示说明整条链是活的。会话跨进程持久化也得到验证（第二次运行仍能读到上次的记录）。
- **Verification**: `dawn agents` 正确列出 4 个 agent 与 endpoint；`dawn demo` 完整走通并打印出三条审计记录（acquire → takeover → release），engine 抢占被拒的报错信息符合预期；`dawn sessions` 在独立进程中读到上次 demo 落库的会话（state=exited, pid=1000, exit=0）。`npm run typecheck` 零错误，73 个既有测试不受影响。

### 2026-08-08 — 阶段①-A 会话生命周期：先落库再改内存、租约守卫写入（Task 1.6）

- **Type**: feat
- **Commit**: `fd9efe2`
- **Motivation**: 把配置层、存储层、Runtime 契约、租约四块接起来。这一层的核心风险是**状态裂缝**——内存说会话活着而库里没有，进程崩溃后这种不一致无法分辨，UI 会拿着一个不存在的会话去连一个不存在的进程。
- **What**:
  - 新增 `src/session/manager.ts`：`create` / `attach` / `write` / `stop` / `list` / `reconcileOnStartup`，租约作为公开成员暴露。
  - **状态先落库再改内存**，且失败路径同样落库：未知 agent 在**插入之前**失败（不留半截记录），运行时启动失败则显式转 `exited` 并记 `exitCode: -1`，**绝不留在 `starting`**。
  - **进程自行退出时回写 `exitCode`**：`create` 内注册的观察者监听 `exited` 事件并落库，否则库里会永远停在 `alive`。已单独写测试——绕过 manager 直接让 runtime 退出，验证库中状态与退出码都被更新。
  - **`write` 以租约为唯一入口**：无租约或持有者不符即拒绝，这是规格 7.1 写权可追责的守卫点。`stop` 连带释放租约。
  - 责任边界写进文件头：本类知道 registry / store / lease，但**不知道任何 provider 细节**——「怎么跟进程说话」全部委托给 `AgentRuntime`。
- **Impact**: 阶段①-A 的核心链路贯通。Task 1.7 起可在此基础上加隔离配置目录与真实 Runtime。
- **Verification**: 严格 TDD，先确认 FAIL 再实现。16 个测试，高于计划预估的 8 个——增补了 pty agent 可创建、**native agent 的 spec 确实带上 endpoint 的连接信息**（验证 apiKey/model 的装配链路）、pty agent 的 spec 不带 endpoint、进程自行退出时 exitCode 回写、`list` 返回落库记录、抢占后 user 自己可写、`stop` 释放租约、对未活动会话附加观察者报错。测试桩沿用计划自检时发现的写法——**用完整桩对象而非 `{ ...实例 }`**，因为展开只复制自有属性，类方法在原型上会全部丢失。全仓库 73 passed，typecheck 零错误。

### 2026-08-08 — 阶段①-A 输入租约：写权归属、抢占规则与审计链（Task 1.5）

- **Type**: feat
- **Commit**: `04e931b`
- **Motivation**: 规格 7.1 的落地，也是阶段①-A 最复杂的一块。人与引擎会同时想往一个会话里写，需要一个明确的仲裁机制；更重要的是**写权的每一次转移都要可追责**——这是不变式 3「没有不可见的行动」在会话层的体现。
- **What**:
  - 新增 `src/session/lease.ts`：`LeaseManager`，含 `acquire` / `release` / `current` / `previewTakeover` / `observe` / `observers` / `audit`。
  - **不对称抢占：user 可抢占 engine，engine 不可抢占 user。** 理由写进了代码注释——二者代价不对称：engine 被打断只是重跑一次，人被打断可能丢掉正在输入的内容，且人无法像引擎那样重试。
  - **补上计划的一处审计断链**：`LeaseAuditEvent` 声明了 `'expire'` 动作，但计划的实现从不发它——租约过期在审计里是空白。这会让「engine 为什么突然拿到了写权」在日志里无法解释。新增 `reapExpired()`，在 `acquire` / `release` 时补记 `expire` 事件，**事件时间取租约的 `expiresAt` 而非发现它的时刻**（前者才是它真正失效的时间）。
  - **`previewTakeover` 保持纯查询**：不改状态、不写审计、**不推进时间戳**。已为最后一点单独写测试——预览用一个很晚的时间点，之后用较早时间 `acquire` 仍须合法。
  - **拒绝路径不改动任何状态**：失败的抢占既不留痕也不破坏现有租约，有对应测试。
  - `observe` 的退订闭包沿用 Task 1.4 的修法（固定引用而非 `set!`）。
  - 单调时间断言：写权审计链若允许时间回退就失去证据价值——「谁先谁后」是判定责任的唯一依据。
- **Impact**: Task 1.6（会话生命周期）可直接使用租约做写权仲裁。审计链现在覆盖四种转移（acquire / takeover / release / expire），无断点。
- **Verification**: 严格 TDD，先确认 FAIL 再实现。20 个测试，高于计划预估的 9 个——增补了抢占被拒后原租约不受影响、同一持有者续期不算 takeover、过期后 `current` 为 undefined、预览三种分支、预览不推进时间戳、过期补记审计且记的是失去写权的一方、指纹不同、释放不存在的租约不留痕、观察者退订与跨会话隔离。全仓库 57 passed，typecheck 零错误。

### 2026-08-08 — 阶段①-A Runtime 契约：AgentRuntime 接口与 FakeRuntime（Task 1.4）

- **Type**: feat
- **Commit**: `b2fc5a3`
- **Motivation**: 确立 `runtime/*` 与 `session/*` 的责任边界，并让后续的业务逻辑（租约、生命周期、背压）能在**不依赖真实进程**的前提下做 TDD。Task 1.5–1.8 全部基于 FakeRuntime 写测试，真实现留到 1.9–1.10。
- **What**:
  - 新增 `src/runtime/types.ts`：`AgentRuntime` 接口（`start` / `attach` / `write` / `resize?` / `stop`）、`SessionSpec`、`SessionHandle`、三种 `AgentEvent`。**责任边界写进文件头**——runtime 只管「怎么跟一个 agent 进程说话」，不知道生命周期、租约与持久化。
  - 新增 `src/runtime/fake.ts`：`FakeRuntime`，`write` 原样 echo，`stop` 幂等。
  - **修正计划示例代码里的两处真实缺陷**：① `emit` 遍历 sink 集合时未复制——若某个 sink 在回调里退订，会在遍历中修改集合；② `attach` 返回的退订闭包捕获的是 `set!`，若集合被重建则会误删新集合的成员。两处均已改为先固定引用/先复制。
- **Impact**: Task 1.5 起可用 FakeRuntime 驱动全部业务逻辑测试，无需起进程。三种 Runtime 实现（native / pty / fake）从此有统一契约。
- **Verification**: 严格 TDD，先确认 FAIL 再实现。10 个测试，高于计划预估的 5 个——增补了退订函数生效且不影响其它观察者、stop 后 write 抛错、stop 幂等不重复发事件、不同会话事件互不串台、并存会话 pid 不同。全仓库 37 passed，typecheck 零错误。

### 2026-08-08 — 阶段①-A 存储层：SQLite 会话表、迁移与启动对账（Task 1.3）

- **Type**: feat
- **Commit**: `06991a1`
- **Motivation**: 会话生命周期管理器（Task 1.6）的契约是「先落库再改内存」，所以存储层必须先于它存在，且写入必须同步可靠。另有一个必须在这一层解决的问题：进程重启后，上次留下的「存活中」记录已经不可能是真的。
- **What**:
  - 新增 `src/store/schema.ts`：`sessions` 表 + `schema_meta` 版本表，WAL 模式，`state` 上加 **CHECK 约束**。
  - 新增 `src/store/sessions.ts`：`SessionStore` 的 `insert` / `get` / `list` / `updateState` / `reconcileOnStartup`。
  - **`reconcileOnStartup()` 是这一层的关键**：启动时把残留的 `starting`/`alive` 显式转为 `exited`，并返回修正条数。依据规格 7.5「无静默回退」——宁可显式标记「它已经死了」，也不要让 UI 拿着一个假的存活状态去连一个不存在的进程。
  - **`updateState` 用 COALESCE 而非覆盖式写入**：状态推进往往分多次发生（先拿到 pid，后拿到 exitCode），覆盖式写入会把上一次记下的 pid 抹成 null。已为此单独写了回归测试。
  - **`toRecord` 对未设置的字段整个省略，而不是留 `null`/`undefined`**，使 `"pid" in rec` 能真实反映「有没有这个信息」。
  - **CHECK 约束是有意的第二道防线**：应用层的 TypeScript 联合类型只在编译期有效，挡不住迁移脚本或将来其它写入方直接写库。
- **Impact**: Task 1.4 起可依赖 `SessionRecord` 与 `SessionState`。存储选型的优势在此兑现——规格 7.32 记录过 pi-crew 为 JSONL 付出的六项工程代价（跨进程锁、手写轮转、流式读、增量读器、序列号缓存、用 worker 线程绕开疑似 event-loop 竞态），本项目用 SQLite WAL 后这六项全部不存在。
- **Verification**: 严格 TDD，先确认 FAIL 再实现。12 个测试，高于计划预估的 5 个——增补了 schema 版本记录、`migrate` 幂等性、CHECK 约束确实拒绝非法 state、可选字段不出现在记录里、COALESCE 不覆盖既有字段、对账区分三种 state 且不抹掉已有退出码、无残留时返回 0。全仓库 27 passed，typecheck 零错误。

### 2026-08-08 — 阶段①-A 配置层：Provider 注册表 schema 与加载器（Task 1.1–1.2）

- **Type**: feat
- **Commit**: `1a2234b` · `1401e51`
- **Motivation**: 阶段①-A 的第一块。会话管理、Runtime、CLI 都要先知道「有哪些 agent、连哪个服务、用什么模型」。这一层若不把错误挡在加载期，就会变成运行期起 agent 时才崩。
- **What**:
  - 新增 `src/config/schema.ts`：**两段式结构**——`endpoints`（连接信息）与 `agents`（agent 定义）分离，多个 agent 可共用一份凭证，换 key 只改一处。`native`（进程内跑 pi）与 `pty`（起外部 CLI）用 zod 的 `discriminatedUnion` 区分，前者引用 endpoint，后者自带 command。
  - 新增 `src/config/loader.ts`：读 YAML → 展开 `${ENV}` → schema 校验 → **跨段引用完整性校验**。四步顺序不可调换（展开须在校验前，否则校验的是占位符字面量；引用校验须在 schema 校验后，否则拿不到可信结构）。
  - **`${ENV}` 缺失或为空串一律响亮报错**，且报错带配置路径（如 `providers.endpoints.deepseek.apiKey`）。依据规格 7.5「无静默回退」——留着占位符会让请求带着字面量 `"${DEEPSEEK_API_KEY}"` 发出去，错误延后到 401 才暴露且信息量为零。
  - **引用完整性校验补 zod 管不到的一层**：zod 只校验单个节点的形状，管不了「这个 endpoint 名字是否存在」「这个 model 是否在该 endpoint 声明过」。两者都在加载期拦下，且报错列出该 endpoint 实际声明了哪些 model。
  - **落实 Spike A 的结论**：schema 注释与全部测试夹具改用 `deepseek-v4-flash` / `deepseek-v4-pro`，不再出现计划原稿里的 `deepseek-chat`。
- **Impact**: 配置层完成，Task 1.3（SQLite 存储层）起可依赖 `ProviderRegistry` 类型。**测试数 15 个，高于计划预估的 7 个**——增补了 `args` 缺省值、未知 kind、未知 capability、非法 baseUrl、空 models、空串环境变量、报错路径、pty 不参与引用校验共 8 项。阶段①-A 的测试总数预计将高于计划的 48。
- **Verification**: 严格 TDD——两个 Task 均先写测试确认 FAIL（`Cannot find module`），再写实现确认 PASS。15 passed，`npm run typecheck` 零错误。

### 2026-08-08 — Phase 0 收官：G0 四项全过，放行进入阶段 ①-A

- **Type**: chore
- **Commit**: `f4888ed`
- **Motivation**: 四个 spike 各自留下了结论，但**决策门要的是一个合并判断**——放行还是停下。同时 Phase 0 期间有多条既有决策被实测推翻，散落在各 spike 章节里，需要收敛成一张表，否则写 Part 1 时会照着旧假设敲。
- **What**:
  - `spikes/FINDINGS.md` 顶部新增**汇总与 G0 放行判断**：四项判定表、「由 spike 确定或修改的技术决策」7 条、遗留项归属表。
  - **G0 判定：四项全部通过 → 放行进入 Part 1。**
  - **明确列出 Phase 0 推翻的既有假设**（这是本条记录的主要价值）：① 工具 schema 用 TypeBox 而非 zod；② DeepSeek 的 model id 必须钉 v4 版本，`deepseek-chat` 不在 pi 注册表内；③ 隔离用 claude 的显式标志而非 `CLAUDE_CONFIG_DIR`；④ 计划预留的「自建 agent loop」分支作废；⑤ 计划预留的 `electron-rebuild` 步骤当前不需要；⑥ ②-A 新增约束：用薄适配器隔离 rxjs。
  - **提炼三条跨 spike 通则**，它们不属于任何单个 spike 却都得遵守：**①「`require()` 成功 ≠ 模块可用」**（node-pty 能 import 却不能 spawn）；**②「原生模块必须先自行关闭，运行时才能退出」**（同一类 `Napi::Error` + SIGABRT 在 node-pty 与 zeromq 上各出现一次，异步异常 `try/catch` 拦不住）；**③「等待完成信号的机制必须能回答：该信号会不会在工作真正发生之前被触发」**（Spike C 的 false-green），并指明完整性闸门是唯一解法，应写入阶段 ③ 的验收设计。
  - 主规划 §11 状态更新：Phase 0 标记完成，下一步改为 Task 1.1。
- **Impact**: 项目从「设计与验证」正式进入**实现**。技术栈选型不再有悬念——四个 spike 分别锁定了 agent 运行时、进程隔离、桌面壳与科学计算内核。Part 1 的 Task 1.1–1.11 现在可以逐字执行，且照着的是**实测修正后**的假设而非计划初稿。三条通则中的第 ③ 条超出 Phase 0 范围，是对阶段 ③ 防幻觉设计的直接输入。
- **Verification**: 四份 spike 结论逐条核对，汇总表的每一格都能追溯到对应章节的实测记录；7 条技术决策变更均标注了「相对计划的变化」，无一条来自推测。遗留项 6 项全部标明归属阶段，未出现「待定」。

### 2026-08-08 — Spike D 通过：Jupyter 内核链路打通且中断生效，TypeScript 方案确认

- **Type**: feat
- **Commit**: `e6499e8`
- **Motivation**: Phase 0 决策门 G0 的第四项，也是**唯一能推翻整个技术栈的一项**。规格 10.1 把主体定为 TypeScript，依据是「nteract 栈已提供 jupyter_client 的等价能力」——该判断此前只经过 npm 元数据与 `.d.ts` 核对，从未真跑过。不通过则回退 Python，Part 1 整体重写。
- **What**:
  - 建 Python 内核环境（`uv venv .venv-kernel` + `ipykernel`，注册 kernelspec `dawn-spike`），装 nteract 栈，新增 `spikes/d-jupyter-kernel.ts`、`spikes/types/spawnteract.d.ts`、`spikes/d-electron-zmq/`。
  - **三项全过**：zeromq 可用（libzmq 4.3.5）；起内核并从 iopub 取回 `DAWN_MARKER_OK`；**中断生效——SIGINT → KeyboardInterrupt → `execute_reply status=error`**。第三项是分量所在，规格 10.4 的硬要求，**wisp-science 的自研 JSON-lines worker 方案正是败在这条**。
  - **Step 6：Electron 下 zeromq 无需 `electron-rebuild`**（Electron 43.3.0 / Node 24.18.1 / V8 ABI 148）——zeromq 6.x 走 Node-API，ABI 跨运行时稳定。计划预留的 rebuild 步骤实测不需要，但已注明这是「当前版本组合下」的结论，非永久结论。
  - **发现 rxjs 版本分裂**：`@nteract/messaging` 与 `@nteract/types` 各自嵌套 rxjs 6.6.7，而顶层是 7.8.2，两者 Observable 类型不兼容（实测 4 处 TS2345）。spike 改为只用 nteract 自带算子、等待逻辑手写为 Promise。**据此给出 ②-A 的架构建议：在 `createMainChannel` 外立刻包薄适配器，不让 rxjs 进入 DAWN 自己的代码。**
  - **确认握手是必需的**：内核就绪前发出的 `execute_request` 会被静默丢弃，必须先 `kernel_info_request` 等到 reply。
  - **原生模块关停顺序**：Electron 版首次运行「打印成功结论、进程却 SIGABRT」——`app.exit()` 时 zmq socket 未关，native 层抛 `Napi::Error`。改为「先停内核 → 再 `channels.complete()` → 留 300ms → 才退出」后干净退出。
  - **Step 7（R 内核）未通过，但属环境问题**：本机 `ir` kernelspec 指向旧 R 安装且 `IRkernel` 包未安装，内核进程起得来却不回话。与协议栈无关，按计划不阻断，R 支持后移至 ②-A。
- **Impact**: **G0 四项全过，Phase 0 的技术风险全部出清，规格 10.1 的 TypeScript 定案成立。** 阶段 ②-A 拿到三条硬约束：① 用薄适配器隔离 rxjs；② 内核就绪必须走握手且带超时；③ 关停顺序是正式代码。另有一条产品级要求：内核起不来时的表现是**静默挂起**而非报错，DAWN 必须为此设计显式失败态并呈现内核 stderr，这与规格 7.5「无静默回退」一致。
- **Verification**: Python 内核链路与 Electron 链路各自独立跑通并打印判定。中断的判据取 `execute_reply` 的 `status === "error"` 且 `ename` 匹配 KeyboardInterrupt，而非「有没有收到 reply」——后者会把「内核根本没在跑死循环」误判为「中断成功」，此类失误在 Spike C 已栽过一次。SIGABRT 修正后重跑确认干净退出。**记录一个诊断陷阱**：成功结论打印在前、崩溃在后，只看日志末尾会误判，判定必须看退出码。R 内核的失败根因经 `cat kernel.json` 与 `Rscript -e requireNamespace("IRkernel")` 两步确证，未凭猜测归因。

### 2026-08-08 — Spike C 通过：Electron 四终端并发刷屏无冻结；验证代码自身的 false-green 已修

- **Type**: feat
- **Commit**: `1b46c28`
- **Motivation**: Phase 0 决策门 G0 的第三项，决定桌面壳是否用 Electron。计划要求人工观察「是否卡死 / 能否交互 / resize 是否跟随」——但肉眼判断不可复核也无法回归，故改为程序自测量。
- **What**:
  - 新增 `spikes/c-electron-term/`（`main.js` / `preload.js` / `index.html`），四个阶段全自动：回显 → 压力灌注 → Ctrl-C 中断 → resize，跑完自行打印判定并退出，无需人工干预。
  - **四问全过**：四路各 20 万行共 **29.0 MB** 在 **0.7s** 内灌完（44.3 MB/s），**冻结帧 0、卡顿帧 0，最长单帧 59.2 ms**；CPU 峰值 25.3%、内存峰值 526 MB；Ctrl-C 前 1.5s 增量 43.8 MB → 之后 0 字节；resize 后 xterm 与 pty 两侧尺寸同步（94×29 → 60×20）。**桌面壳定 Electron。**
  - **第一版报了假的「通过」，已修并记录**：四问全打 ✅ 而 P2 的数字是 `0.0 MB / 0.0s / 0 帧`——压力测试根本没跑。根因是等待逻辑在 pty 输出里搜哨兵字符串，而**终端会回显命令行本身**，命令里就含着哨兵，于是它在命令敲进去的瞬间即命中。两处修正：哨兵的命令行形态与输出形态必须不同（`__DAWN"_"DONE_0__`）；新增**完整性闸门**——实测字节数低于预期 80% 即判「无效」而非「通过」。
  - **记录两个 node-pty 陷阱**：① 嵌套 `node_modules` 的 `spawn-helper` 同样停在 `0644`，`fix-node-pty.mjs` 已改为全仓库扫描；② **对已退出的 pty 再 `kill()` 会让进程 SIGABRT**（native 层抛 `Napi::Error`，异步异常 `try/catch` 拦不住），第一版即因此崩溃，现改为先解绑 `onData` 再逐个 kill。
- **Impact**: G0 三项已过，只剩 Spike D。Task 1.8 拿到了确切的调参依据——当前规模下**不需要**输出节流，但帧率确实从 60fps 掉到约 27fps，建议以 100ms 单帧为节流触发线；且 **`scrollback` 是内存主控参数**（20 万行只留 5 千行，内存才稳在 526 MB），不是显示偏好。Task 1.9 的 `PtyRuntime.stop()` 须避开重复 kill 的 SIGABRT——这与规格 7.18 的进程组终止是两个不同问题。
  **另有一条超出 Phase 0 的收获**：这次 false-green 发生在本项目自己的验证代码里，正是规格 7.24 描述的失效模式。由此得出一条应写入阶段 ③ 验收设计的原则——任何「等待完成信号」的机制都必须回答「**该信号能否在工作真正发生之前被触发**」，而对照预期产出量的完整性闸门是唯一能挡住这类失效的手段。
- **Verification**: 修正后重跑，完整性闸门实测 29.0 MB / 预期 28.2 MB 判定有效；P3 的判据由「绝对字节数」改为「等长观察窗口的增量对比」（43,795,848 → 0），避免被前序阶段的累计值污染。修正前后两次运行的输出均已留存对比。**未验证项已显式记录**：本机 `require('node-pty')` 在 Electron 43 下直接可用，故 `@electron/rebuild` 这一步未执行也未验证，换 Electron 大版本或换机器需重测。

### 2026-08-08 — Spike B 通过：PTY + MCP 注入 + Hook 完成信号打通，并修掉 node-pty 的隐性失效

- **Type**: feat
- **Commit**: `fc0cc6f`
- **Motivation**: Phase 0 决策门 G0 的第二项。PTY Runtime 的可行性取决于四件事：claude 能否在 PTY 里跑、能否注入 MCP、能否拿到回合结束信号、以及**这一切能否在不污染用户全局配置的前提下做到**。最后一条尤其关键——DAWN 要托管用户自己的 agent CLI，弄脏他的配置是不可接受的。
- **What**:
  - 新增 `spikes/b-pty-mcp-hook.ts`、`spikes/mcp-probe-server.ts`、`spikes/hook-probe.sh`，`FINDINGS.md` 补齐 Spike B 一节。
  - **claude 四问全过**：TUI 在 PTY 中完整渲染、键盘输入生效、MCP 工具被调用、Stop hook 触发（TUI 中可见 `running stop hook … 0/4`）、全局 `settings.json` md5 前后一致。**回合结束信号有确定来源，不必只靠超时兜底。**
  - **隔离机制改用显式标志，不用计划假设的 `CLAUDE_CONFIG_DIR`**。实测发现一个此前未预见的取舍：`CLAUDE_CONFIG_DIR` 隔离得**更彻底**（`.claude.json`/`projects`/`sessions` 全在隔离目录内，全局文件 md5 纹丝不动），**但会一并隔离掉认证**，报 `Not logged in`；且**复制 `.credentials.json` 进去不足以恢复**——认证的门是 `~/.claude.json` 里的 `oauthAccount`，而那个文件恰好也被隔离了。故改用 `--mcp-config` + `--strict-mcp-config` + `--settings`，保住认证，且 `--strict-mcp-config` 给出「只用我注入的 MCP」的正向保证。**已知代价**：会话历史仍会累积进用户全局 `~/.claude.json`。
  - **修掉一个隐性失效**：首次 `pty.spawn` 报 `posix_spawnp failed`，错误信息毫无线索。根因是 node-pty 的 `spawn-helper` 停在 `0644`——本机 npm 的 allowScripts 策略拦掉了 node-pty 的 post-install，而那个脚本负责加执行位。新增 `scripts/fix-node-pty.mjs` 与 `postinstall` 兜底。
  - **Step 6 codex 部分完成**：`CODEX_HOME` 隔离成立、播种 `auth.json` 可恢复认证（与 claude 不同，codex 凭证就在 `$CODEX_HOME/auth.json`）、`codex mcp list` 确认注入的 MCP 状态为 `enabled`；但 `codex exec` 超过 5 分钟无输出，MCP 调用与 `notify` 回路**未验证**，原因未查明。
- **Impact**: PTY Runtime 与阶段①-A 的 Task 1.7（per-session 隔离配置目录）现在有了确切的实现依据——包括一条必须写进设计的取舍：**完整隔离与可用认证目前不可兼得**，Task 1.7 需在两条未验证路径（播种 `oauthAccount` / 用 `ANTHROPIC_API_KEY`）中择一验证。`postinstall` 使新克隆的仓库 `npm install` 后 PTY 直接可用，不会重蹈这次的排查成本。codex 未完成部分不阻塞 G0——Tier-1 provider 已验证。
- **Verification**: claude 四问由脚本自动判定并打印 md5 对比（`4edd24e1…` 前后一致）。`CLAUDE_CONFIG_DIR` 的两个结论各由一次独立运行确证：隔离成立（全局 md5 不变 + 隔离目录被填充）、认证丢失（`Not logged in`，播种 credentials 后仍然如此）。`fix-node-pty.mjs` 经「故意 `chmod 644` 后重跑」验证能恢复执行位。**测试期间产生的两份凭证副本（`.credentials.json` / `auth.json`）已在验证结束后立即删除，并复查无残留。**

### 2026-08-08 — Spike A 通过：pi 可嵌入，schema 被引擎强制且带自动重试

- **Type**: feat
- **Commit**: `a664109`
- **Motivation**: Phase 0 决策门 G0 的第一项。Native Runtime 是走 pi 还是自建 agent loop，取决于三个事实：能否注入自定义工具、schema 是否被强制、能否拿到事件流与用量。计划要求「按实际导出符号写，不凭印象」。
- **What**:
  - 新增 `spikes/a-pi-embed.ts`：注册一个带严格 TypeBox schema 的 `report` 工具（`verdict` 限 pass/fail/unknown），跑两轮——合法路径一轮，诱导模型填非法值 `"maybe"` 一轮。
  - 新增 `spikes/FINDINGS.md`，写入 Spike A 全部结论。
  - **三个问题全为「是」→ 决策门通过，Native Runtime 走 pi，不自建 loop。**
  - **Q2 的结果强于预期**：模型确实填了 `"maybe"` → pi 校验失败（`isError: true`）→ **`beforeToolCall` 未触发、`execute()` 未被调用** → 错误回传模型后，模型自行改填 `"unknown"` 重试成功。即 schema 不仅被强制，还带自动纠错闭环，Native Runtime **不需要**自建校验层。
  - **发现 pi 内置 `deepseekProvider()`**，自带成本与上下文窗口元数据，省掉自建 provider。但它只认 `deepseek-v4-flash` / `deepseek-v4-pro` 两个 id——计划中沿用的 `deepseek-chat` / `deepseek-reasoner` 打 HTTP 虽仍返回 200，却**不在 pi 注册表内**，`getModel()` 会返回 `undefined`。至此模型 id 从「建议钉版本」升级为「**必须钉版本**」。
  - **确认 zod 与 typebox 的分工**：pi 的工具 schema 用 TypeBox（`Type.*`），故 **zod 管配置校验、typebox 管工具 schema**，两者并存，不需要转换层。
  - **记录一条给 Task 1.6 的告警**：`tool_execution_start` 携带的是**校验前**的原始 args，`beforeToolCall` 与 `execute()` 收到的才是校验后的。审计日志若从前者取值，记的是未校验数据；两者需分别命名标注。
- **Impact**: G0 的四个 spike 过了第一个，且过的是「不用自建 loop」这个省工最多的分支。`FINDINGS.md` 中的调用签名与工具注册方式将被 Task 1.6 直接引用。实施计划中所有 `deepseek-chat` 引用需在 Task 1.11 前改为 v4 id。
- **Verification**: 两次独立运行结果一致——非法值均在第 1 次被拒、第 2 次被模型自行修正，`handlerCalls` 两轮都只含合法值。判定逻辑本身修过一次真实缺陷：初版读 `tool_execution_start` 的 args 判断「非法值是否透传」，因该事件在校验前触发而误报为「schema 未强制」；已改为以「什么抵达 handler」为判据。`npm run typecheck` 零错误。实测成本 $0.000006–0.000034 / 轮。

### 2026-08-08 — 确立开发历史记录规范、凭证方案与仓库路径基线

- **Type**: chore
- **Commit**: `dfdd72a`
- **Motivation**: 开工前需定死三件事：① 每次变更如何留痕（含 commit 号，此前两条记录都没有）；② API 密钥放哪——这决定它会不会被 agent 子进程读到、会不会误入版本库；③ 实施计划的路径前缀与实际仓库结构对不上，不解决则每个 Task 的第一步都要人肉换算。
- **What**:
  - **本文件新增「记录规范」章节**：条目模板加入 `**Commit**` 字段；确立 commit 号的**下次提交时回填**机制（先写 `待回填` → 下次提交前 `git log` 查出上一条 hash 一并补上），以保持「一次逻辑变更 = 一个 commit」不被拆成两个；并补一条硬规则——**commit 标题行必须等于条目标题**，使得即便 hash 未回填也能靠 `git log --oneline | grep` 唯一定位。已回填前两条记录的 hash（`594ac96` / `fe0cf4a`）。
  - **凭证方案定为项目级 `.env`，而非 `~/.zshrc`**。理由是本项目会以 `env: { ...process.env, ... }` 派生第三方 agent CLI 作为子进程（实施计划 Task 1.9），写进 shell rc 意味着机器上**每个**进程、包括每个被托管的 agent，都能读到 DeepSeek 密钥；`.env` 至少把暴露面收敛到本项目的运行时。新增 `.env.example` 作为模板（只含占位符）。
  - **加载机制不引入依赖**：`package.json` 的四个入口脚本改用 `tsx --env-file-if-exists=.env`。选 `--env-file-if-exists` 而非 `--env-file`，是因为后者在文件缺失时直接抛错——新克隆的仓库还没有 `.env`，不该连 `npm run` 都跑不起来。
  - **实施计划去掉 `dawn/` 路径前缀**：该前缀是文档还在 `ccb_hive_code_learn` 里时的假设，而现在仓库根目录本身就是 `dawn-science`，且已提交的 `package.json` 写的就是 `src/cli.ts` / `spikes/a-pi-embed.ts`——事实上的决定已经做了。共改 145 行（含删除 5 处独占一行的 `cd dawn`）。**`.dawn/` 与 `~/.dawn/` 未受影响**——那是运行时的 per-session 配置目录，不是源码路径，靠负向后顾 `(?<![.\w~-])dawn/` 守住。
  - 执行 `npm install`（Task 0.1 Step 6）。
  - **记录 DeepSeek 模型 id 的实测结果**（写入实施计划 Task 1.11 Step 1）：`/models` 只返回 `deepseek-v4-flash` 与 `deepseek-v4-pro`；计划中沿用的 `deepseek-chat` / `deepseek-reasoner` 仍可用但**不在列表中，是未公开的别名**，指向哪个 v4 模型由官方决定。已标注为待决事项——配置里钉死一个会漂移的别名，与本项目「可追溯」的核心主张冲突。
- **Impact**: 后续所有开发都按此规范留痕。实施计划现在可以逐字执行，不需要人工换算路径。`providers.yaml` 里的 `${DEEPSEEK_API_KEY}` 现在无需手动 `export` 即可由 `npm run` 系列命令解析。**遗留待办**：密钥仍经 `process.env` 全量继承给 PTY 子进程，彻底的解法是 OS keychain + 只向需要的 endpoint 注入，已记入 Backlog。
- **Verification**: `--env-file-if-exists` 的两项行为均实测——`tsx` 确实透传该 node flag 并读到值、文件缺失时打印提示后继续而不报错（Node v22.23.0）。`git status` 确认 `.env.probe` 被忽略而 `.env.example` 未被忽略（`.gitignore` 的 `.env.*` + `!.env.example` 组合有效）。两个原生模块经 `require()` 实测可加载——`better-sqlite3` 与 `node-pty` 的 install script 均被 npm 的 allowScripts 策略拦截，但二者都自带 prebuild，无实际影响。`npm run typecheck` 目前报 TS18003（`src` / `tests` / `spikes` 尚不存在），属预期，首个源文件落地后自动消失。真实 key 配好后端到端验证：`GET /models` 返回 200，`chat/completions` 对 4 个 model id 均返回 200。路径改写后 grep 复核——源码型 `dawn/` 前缀残留 0 处、`cd dawn` 残留 0 处、6 处 `.dawn/` 运行时路径全部完好。

### 2026-08-08 — 许可改为 AGPL-3.0，建立项目骨架与参考地图

- **Type**: chore
- **Commit**: `fe0cf4a`
- **Motivation**: 仓库建立后需要三样才能开工：正式许可、可安装的依赖配置、以及「实现某个实体时去哪读参考」的索引。
- **What**:
  - **许可由 Apache-2.0 改为 AGPL-3.0-or-later**。这是主动选择而非被动继承——独立实现让本项目本可选任何许可，选 AGPL 是希望改进版本同样对所有人开放，包括以网络服务形式提供的版本。规格 3.3 相应重写，并记录两条推论：① 作为唯一版权人仍保留 dual-license 与更换许可的权利；② 一旦接受无 CLA 的外部贡献，该权利即受限。LICENSE 采用 FSF 规范全文（661 行）。
  - **建立项目骨架**（实施计划 Task 0.1）：`package.json` · `tsconfig.json` · `vitest.config.ts`。**依赖版本全部实测**，并修正了计划中的两处过时假设——TypeScript 实际已至 7.0.2（计划写 `^5.6.0`）、vitest 至 4.1.10（计划写 `^2.1.0`）；pi 三个包为 0.84.1。
  - **新增 `docs/REFERENCES.md`**：把实体清单的「构思来源」补上本地路径与具体行号区间，覆盖阶段 ①-A 至 ⑤ 的全部可参考实体，并单列 10 个自研实体（无参考，照规格实现）。文档同时确立纪律：**参考代码不进本仓库**——理由是许可证边界（本项目 AGPL，参考项目含 Apache/MIT/BUSL 混合）与体积（约 398 MB）。
  - 修正参考地图的一处路径错误：作者自有的三个仓库（AgentDeck 等）在 `../`，不在 `../ccb_hive_code_learn/`。据此拆出 `«OWN»` 与 `«REF»` 两个前缀。
- **Impact**: 仓库具备开工条件——`npm install` 后即可进入 Phase 0 Spike A。参考地图使「实现实体 #N」从「先找资料」变为「按图索骥」。
- **Verification**: 16 条被引用路径逐条 `test -f` 验证存在；LICENSE 确认无来源仓库残留字样；`package.json` 的 9 个运行时依赖与 5 个开发依赖版本均由 `npm view` 实测取得。


### 2026-08-08 — 建立 dawn-science 仓库，项目定名 DAWN Science

- **Type**: chore
- **Commit**: `594ac96`
- **Motivation**: 设计阶段的全部产出此前存放在 `ccb_hive_code_learn`——那是一个研读参考项目的研究仓库（含七个第三方仓库、约 398 MB），不适合承载产品代码。项目需要自己的仓库与正式名称。
- **What**:
  - 新建 `~/Desktop/Github_repos/dawn-science/`，采用小写连字符命名（npm 禁止大写；大小写敏感的 Linux 与不敏感的 macOS/Windows 混用会导致"本地能跑、CI 挂掉"）。展示名 `DAWN Science` 与标识符 `dawn-science` 分置。
  - **定名 DAWN Science** = **D**ata · **A**gent · **W**orkbench · **N**otebook，for science。`Data`（缩写内）与 `Science`（产品名）合起来表达数据科学，同时 `Science` 覆盖生态学、环境科学与生物信息。
  - 选名过程排除了多个候选，均因产品撞车：DAWN 单用（存在同名数据科学 BI 平台）、Empirica（Oracle Life Sciences / 实验室管理 / 开源科研平台三处）、Crucible（Atlassian）、Kepler（科学工作流系统）、Organon（制药上市公司 + 数据科学平台）、Strata（O'Reilly 会议仍在办）、Lichen（LichenAI 研究助手）、TRACE（`/usr/bin/trace` 系统命令占用 + traceAI + Claude Science 主打 "traced back" 话术）。
  - 采用 Apache-2.0，版权署为 `DAWN Science contributors`（避免代填法定姓名）。
  - 撰写 README：DAWN 展开、四支柱与架构对应、可追溯的核心主张、技术栈、文档地图、致谢（列明八个参考项目及各自借鉴内容，并声明除 pi 作依赖外均为只读参考）。
  - 迁移全部设计文档（6 个文件 / 5,215 行）。
  - **修正领域定位**：由「数据科学为主，生物信息学作为后续扩展」改为「**数据科学 · 生态学 · 环境科学 · 生物信息**」，并说明四者共享核心能力（持久 Python/R 会话、远程与 GPU 执行环境、可追溯分析记录），领域差异只体现在可插拔的 Skills 与 MCP 工具层。这是作者今日澄清的实际研究领域，此前规格记录有误。
  - 将实施计划中的临时代号 `mads` / `MADS` 全部替换为 `dawn` / `DAWN`（148 处），涉及目录名、包名、环境变量前缀、探针工具名、测试标记与临时目录前缀。
- **Impact**: 项目从研究仓库中独立出来，具备正式身份。领域定位的修正会影响阶段 ⑤ 的 Skills 与 MCP 内容规划——原计划只准备 ML/DL 方向，现需覆盖生态与环境科学。
- **Verification**: 全仓库 grep 确认无 `mads`/`MADS` 残留；LICENSE 中来自参考仓库的 `Copyright 2026 Block, Inc.` 已替换；文档迁移后行数核对一致（5,215 行）。


### 2026-08-07 — 确立主体核心抽象（对话—笔记本统一模型），技术栈定案 TypeScript

- **Type**: feat
- **Motivation**: 此前 1,300 行规格主要在设计编排层，**主体只有功能清单而无模型**。同时语言选择长期悬而未决。
- **What**:
  - **新增第 8 节「主体核心抽象：对话—笔记本统一模型」**（原 8–13 节顺移为 9–14，5 处交叉引用同步修正）。核心结论：对话（A）/ 笔记本（C）/ 并排（B）**不是三个产品，而是同一份 append-only Entry 序列的三种投影**——这是不变式 3（统一事件流）的直接产物。含：Entry 类型系统、`code_cell` 作为一等公民（可重跑 / 可编辑 / 可导出，人与 agent 写的同构）、**内核状态版本 `kernelRevision`**（解决乱序执行导致的状态不一致，并要求投喂 agent 的变量快照必须带 revision）、`rerunOf` / `supersedes` 表达重跑与编辑的 append-only 语义、UI 骨架、以及**内核生命周期长于会话**这一与纯聊天应用的根本区别。
  - **技术栈定案 TypeScript / Node**。决定性依据：调研发现 nteract 栈（`enchannel-zmq-backend` + `@nteract/messaging` + `spawnteract`）已实现 Jupyter 内核的 HMAC-SHA256 签名、消息分帧与四通道通信——**此前认为「TS 需手搓 Jupyter 协议 3–4 周」是错的**，而那是 Python 的唯一实质优势。修正后的取舍：单人项目单语言杠杆、同类桌面 app 载荷全为 JS/TS、`tsc` 类型检查对 AI 协同开发的纠错价值、pi 可直接 import。
  - 形态定案：**桌面应用，不做 Web 版**；桌面壳 Electron（后期可换 Bun 编译薄壳）。
  - 10.1 技术栈表补充 UI 层：CodeMirror 6（cell 编辑）、Plotly.js（图表）、TanStack Table、`nbformat`、KaTeX、`pdf.js`。
  - 新增 10.2b（默认 Agent 与切换：DeepSeek + Native loop 为默认，可切 claude/codex/kimi/qwen；两级切换学 Hermes）与 10.2c（Skills 与任务模板：marketplace→plugin→`SKILL.md` 学 Claude Code；**任务模板 = 带 `workflow` 字段的 Skill，不引入新概念**；**用户自建 Skill 三级优先级：项目 > 用户 > 市场**）。
  - 新增 10.6 文献阅读模块：应用只负责渲染、抽取、按引用投喂；**解读逻辑交给 Skill**，因为不同学科读法差异极大，用户须能写自己的读法。
  - 实体清单新增 21b–21h、29b–29e、64b–64c 共 13 项，总数 77 → 91。
  - 主规划新增 §1.6「已定案的基础决策（不再重开）」六条；G0 决策门与计划分解同步更新。
- **Impact**: 主体从「功能清单」升级为「有核心抽象的设计」。三视图统一模型使 A/B/C 不再是取舍题。语言之争终结，且结论建立在一次事实核查（nteract 栈存在）而非偏好之上。
- **Verification**: nteract 栈经 npm 实测确认存在且维护中（`enchannel-zmq-backend` 10.0.0 / 2026-04）；其 `index.d.ts` 已阅读，确认提供 `JupyterConnectionInfo`、`formConnectionString`、`createSocket` 及内置 jmp 模块。Claude Code 的 skill 组织方式经本机 `~/.claude/plugins/` 实测确认。文档自检：无占位符，章节 15 节，5 处跨节引用已随重编号修正。

### 2026-08-07 — 补写 Phase 0 Spike D：Jupyter 内核链路验证

- **Type**: docs
- **Motivation**: TypeScript 定案的唯一风险点是 nteract 栈能否实际跑通（关键包周下载量偏低——`enchannel-zmq-backend` 559、`@nteract/fs-kernels` 24；且 `zeromq` 是原生模块，在 Electron 下需按其 ABI 重编译）。该风险必须在数天内证伪，而非等到第 21 周的阶段 ②-A 才暴露。
- **What**:
  - 实施计划新增 **Task 0.5 · Spike D**（9 个步骤），原「结论汇总」顺移为 Task 0.6。计划步骤总数 92 → 101。
  - 内容：安装 ipykernel → 装 nteract 栈（`zeromq` 编译失败即判负）→ 补 `spawnteract` 的 `.d.ts`（该包为 CommonJS 且无类型）→ 起内核、执行 `print` 并从 `iopub` 取回输出 → **执行死循环并中断**（依 kernelspec 的 `interrupt_mode` 决定发 SIGINT 还是 `interrupt_request`）→ **在 Electron 中用 `electron-rebuild -f -w zeromq` 重编译后重复验证** → 可选验证 Ark（R 内核）以证实「一套协议通吃」。
  - 脚本代码依据实际 API 签名编写：`launch()` 返回 `{spawn, connectionFile, config, kernelSpec}`；`createMainChannel(config)` 返回 RxJS `Subject<JupyterMessage>`；用 `childOf()` / `ofMessageType()` 过滤回复。
  - 四档决策门：全过 → TS 方案确认；仅中断失败 → 记为已知限制（对应风险 R5）并继续；Electron 编不过 → 试预编译版本或把内核通信移入独立 Node 子进程；**Step 5 就跑不通 → 回退 Python，Part 1 整体重写**。
  - 主规划：Phase 0 估算 1–2 周 → 1.5–2.5 周；G0 决策门与下一步动作同步更新。
- **Impact**: 把语言决策的风险从「第 21 周才暴露」压缩到「数天内可证伪」，且给出了四种结果各自的应对，不会出现「跑不通但不知道该怎么办」。
- **Verification**: 三个包的 API 签名均从实际下载的 `.d.ts` 与 `index.js` 中读出（`enchannel-zmq-backend` 的 `createMainChannel` / `createSockets`、`@nteract/messaging` 的 `createMessage` / `childOf` / `ofMessageType`、`spawnteract` 的 `launch` 返回结构），未凭印象编写。计划自检：无占位符，Task 编号 0.1–0.6 连续。


### 2026-08-07 — 深读 pi-crew 的 worktree 与 event-log，吸收实战细节并确认存储选型优势

- **Type**: docs
- **Motivation**: worktree 隔离与统一事件流是本项目实体 #50 与 #38，pi-crew 在这两处各有 1,268 行与 1,503 行的成熟实现，值得逐行对照。
- **What**:
  - **新增 7.31（worktree 六个实战细节）**，全部采纳：① 主仓洁净断言用 `--untracked-files=no`（契约是"无已跟踪改动"，未跟踪文件安全——pi-crew 曾被自己生成的 `.gitignore` 卡死）；② **脏 worktree 保命快照**（`git diff HEAD --binary` + 未跟踪文件逐个存档，每文件 256KB 上限，用 `TextDecoder(fatal)` 探测编码、二进制转 base64）；③ **seedPaths** 把 `.env` 等未跟踪但必需的文件带进 worktree，拒绝符号链接与越界路径且两处校验；④ 依赖用**符号链接而非复制**；⑤ **分支新鲜度检查**，并列出缺失 commit 的标题；⑥ **连只读 git 命令也要净化环境**——仓库内的 git hook / alias / credential-helper 会在普通 git 操作时被触发并读到环境变量。
  - 其中 ② 修补了原设计的一个实质缺陷：原文档只写"清理 worktree"，agent 干了好活但任务判定失败时会被直接丢弃。
  - 其中 ⑤ 指出一类此前未考虑的失效：worker 在过时分支上工作，可能重复修一个已修好的 bug。
  - **新增 7.32（事件日志）**，采纳其元数据模型、拒绝其存储选择：采纳 `provenance`（区分 live_worker / test / replay 等来源）、`causationId` / `correlationId`、`attemptId`、**事件级 `confidence`**、`fingerprint`，以及写入前 `redactSecrets`；拒绝 JSONL 文件存储。
  - 记录 pi-crew 为 JSONL 付出的六项工程代价（跨进程锁、手写轮转、流式读、增量读器、序列号缓存、**worker 线程绕开疑似 V8/libuv event-loop yield 竞态**），并说明本项目用 SQLite WAL 后这六项全部不存在。同时公平记录其选 JSONL 的合理原因：pi 扩展环境不便携带需编译的原生依赖。
  - 第 10 节 `Event` 接口相应升级，新增 `seq` 与 `EventMeta`。
  - 实体清单新增 50b–50f 五项，总数 72 → 77；#38 与 #50 的技术栈栏补充依据。
- **Impact**: 确认一处本项目相对 pi-crew 的明确技术优势——事件存储选 SQLite 可绕开一整类并发写入与轮转工程，且该优势来自约束不同（自有 Electron 运行时 vs 扩展宿主），非设计更优。同时补上两处实质缺陷（成果丢弃、过时分支）与一个隐蔽攻击面（git hook 窃取环境变量）。
- **Verification**: `worktree-manager.ts`、`branch-freshness.ts`、`event-log.ts`、`event-log-rotation.ts`、`worker-atomic-writer.ts` 均已阅读源码；引用的注释与代码行为均直接取自源文件，未凭印象转述。

### 2026-08-07 — 调研 pi 生态六个编排扩展，吸收 pi-crew 的验证机制

- **Type**: docs
- **Motivation**: 发现 pi 生态已存在至少六个多智能体编排扩展，其中数个已实现本项目自认为独有的机制。按主规划 §8.2 的例外条款（"会导致后续阶段大规模返工，立即处理"）破例调研。
- **What**:
  - **实测六个扩展**：pi-subagents（周下载 66,440 / 64,161 行 / MIT）、pi-maestro-flow（2,032 / 91,288 行 / **许可未声明**）、pi-crew（1,848 / 114,268 行 / MIT）、pi-maestro-teammate（1,715 / ISC）、agent-fleet（678）、pi-squad（127 / MIT）。全部在两日内更新过。
  - **确认两项此前自认独有的机制已被实现**：① pi-crew `goal-achievement.ts`（148 行，代码强制）检测 false-green——"代码变更型工作流完成后工作树却干净"；② `council` skill 的 anti-anchoring——"每个角色只收到问题，不收对话历史"，即验证隔离。
  - **同时确认三项差距仍然成立**：council 是 skill（提示词约定）而非引擎强制；false-green 只检测"树是否干净"，不比对声称文件清单与实际 diff、不比对命令记录、不做验收标准缺口检测；六者皆无数据科学层。
  - **新增 7.24–7.30 共七项吸收**：GreenLevel 五级分级（升级原 pass/fail 二元 verdict）、**验证命令环境净化**（原设计漏掉的安全洞——worker 可诱导验证输出泄露 API 密钥）、manifest 快照及其三项残余风险（其结论"必须靠 git worktree 内容寻址执行才能关闭"强化了实体 #50 的必要性）、顺序相位门、**编排成本实测披露**、`needs_attention` 终态、以及零配置产品形态启示。
  - 第 10 节接口相应升级：`report_result` 增 `observedGreenLevel`，`VerdictSummary` 增 `greenSatisfied`，新增 `TaskState` 含 `needs_attention` / `untrusted`。
  - 实体清单新增 49b–49e 四项，总数 68 → 72。
  - 参考项目表新增 pi-crew 与 pi-subagents，并标注 pi-crew 的重要警示：其 README 自陈"几乎全由 AI 编写，作者未逐行审阅"，作者本人建议 fork 后自行审读——故列为"代码可用但慎用"。
- **Impact**: 差异化定位收窄但更清晰——不再是"多智能体编排"（已饱和，六个竞品），而是三条：引擎强制的验证隔离、逐项比对的交叉核对、数据科学层。新增的编排成本实测将与阶段 ④ 的命题验证合并报告：**"多 agent 是否更准"必须与"多 agent 贵多少"一起呈现**。另记录 pi-crew 的一条教训：其硬阻断策略经用户反馈后改为 advisory-only，故建议区分事实性判定（硬阻断）与启发式判定（仅建议）。
- **Verification**: 六个包均从 npm 下载解包实测行数与许可；`goal-achievement.ts`、`green-contract.ts`、`verification-integrity.ts`、`verification-gates.ts`、`topology-analyzer.ts` 均已阅读源码确认。首轮 grep 因 zsh 展开 `--include=*.ts` 失败而全部返回 0，该批结果已作废并用引号修正后重测。

### 2026-08-07 — 建立实体清单：68 个部件 × 技术栈 × 构思来源

- **Type**: docs
- **Motivation**: 主规划停留在阶段粒度，未落到"每个具体部件用什么技术、照着谁的设计做"。这一层缺失会导致写详细计划时临场发明，也让代码审查失去对照基准。
- **What**:
  - 新增 `docs/superpowers/ENTITY-REGISTRY.md`：全项目 68 个实体（编号 1–68，按阶段分组），每个标注**职责 / 技术栈 / 构思来源**。来源用四种标记区分许可边界：🔧 可直接用代码（pi 依赖、Buzz Apache-2.0）、📐 只读设计、🎨 只看交互、✍️ 自研。
  - 各阶段实体数：①-A 14 · ①-B 7 · ②-A 9 · ②-B 7 · ③-A 6 · ③-B 16 · ④ 4 · ⑤ 5。
  - 主规划新增 §3.1 指向实体清单，并规定**写详细计划前必须先查它**；文档地图由三份扩为四份，明确各自回答的问题。
- **Impact**: 实体编号成为跨文档的稳定引用。两点由统计浮现的观察：① 自研的 9 个实体（可见范围过滤器、交叉核对、度量框架等）恰是本项目的差异化所在——它们没有现成原型，正因如此才是价值所在；② `multi-agent-orchestrator` 仅被 1 个实体引用，但那是不变式 5，是整个防幻觉体系的第一性原理——被引数量不代表分量。
- **Verification**: 脚本校验实体编号 1–68 连续且无重复，各阶段小计之和等于 68。来源统计表初稿为手工计数，与脚本实测不符（如 wisp-science 手写 14 实测 18），已全部替换为实测值，并说明"多数实体引用不止一个来源，故各行之和大于 68"。

### 2026-08-07 — 建立主开发规划与 Backlog

- **Type**: docs
- **Motivation**: 已有设计规格与第一份详细计划，但缺少管全局的规划：阶段间依赖、决策门、风险应对、以及最关键的**变更控制**。本项目设计期内参考项目从 2 个增至 8 个、发生三次实质变更（阶段重排、不变式 1 重写、构建策略改为独立实现）——设计期这样是健康的，实现期若保持同样频率则永远无法完成。
- **What**:
  - 新增 `docs/superpowers/plans/2026-08-07-master-roadmap.md`：规划原则（详细计划即时编写、每阶段独立可停、决策门优先于时间表、不变式是宪法、范围默认关闭）、交付物地图、八份计划的分解与编写时机、阶段依赖图、**契约冻结点**、七个决策门、时间估算与可信度分级、不变式合规检查点、变更控制、风险登记册、回归防护、文档地图。
  - 新增 `docs/superpowers/BACKLOG.md` 及其准入格式，收录五条待评估项。
  - **识别出跨阶段最大返工风险**并设专门检查：阶段 ③ 需将阶段 ② 的产出作为 Repo 事实层证据（不变式 5），故在 ②-B 验收时设六项契约冻结检查（Run 稳定 ID、结构化退出码、实际命令记录、文件变更事实、环境快照绑定、单调时间戳），任一项缺失不得验收。同时设反向约束：② 不得提前引入 ③ 的成员/角色/编排概念。
  - **阶段 ③ 拆为两份计划**（③-A 事件流与成员模型、③-B 编排逻辑），避免 schema 在编排逻辑写到一半时被迫返工。
  - 为 R7（核心命题被证伪）预先写定应对：①② 的价值不依赖该命题；先排查实现问题；确属命题问题则将 ③ 重新定位为并行分工机制；并公开负结果。
- **Impact**: 项目从"有设计有第一份计划"进入"有完整治理框架"。决策门 G2（①-B 结束时作者是否真的日常使用）被标为最易忽略也最重要——其判据是行为而非功能清单。参考项目就此冻结，实现期不再引入新参考。
- **Verification**: 规划与规格的阶段划分、不变式编号、参考项目清单逐项比对一致；八份计划的前置关系无环；七个决策门均有明确的不通过应对分支；风险登记册十条均有触发信号与归属阶段。

### 2026-08-07 — 不变式 1 从「全局禁止对话」重写为「验证隔离」

- **Type**: refactor
- **Motivation**: 原不变式 1 全面禁止 agent 间自然语言交流。复审 Buzz 的「agent 是成员，享有与人同等自由」理念后确认：**该判断把三件独立的事捆成了一条**——身份与行动范围、可审计性、信息流拓扑。前两者与本项目毫无冲突且有益，只有第三者存在张力，而第三者也只在验证环节才需要限制。
- **What**:
  - **不变式 1 重写为「验证隔离（生产可协作，验证必独立）」**：协作模式（`leader` / `coder` / `researcher`）共享可审计工作空间，可自由交流，但每条都是带 `kind` 的事件进统一日志、无私下通道；验证模式（`reviewer` / `tester` / `critic`）只见产物 + 验收标准 + Repo 事实，看不到生产过程叙述与其他验证者结论。理据取自人类制度——代码评审看 diff 不看作者辩解，双盲评审彼此不知结论。
  - **不变式 2 与不变式 1 合流**：`mode: 'collaborative' | 'verifying'` 成为唯一维度，同时派生 `lifecycle` 与可见范围，且**不允许自由组合**（「长驻的 reviewer」正是要防的失效模式）。角色表新增 `researcher`。
  - 7.22 由「不采纳 agent 同等自由」改写为「**采纳 agent 作为一等成员**」，含三项：agent 独立身份与对等行动范围、统一事件日志、**人与 agent 同构**（同一事件流，只差 `author` 字段——因此人接管 worker 不产生特殊事件类型）。新增 7.23 记录唯一的实质分歧：无差别自由通信。
  - 4.1 否决理由相应重写：Swarm 的问题不是通信本身，而是无审计 + 无验证隔离 + 无边界三者同时缺失；AutoGen 的问题是不区分协作与验证。
  - 第 9.3 功能表新增协作空间、可见范围过滤器、统一事件日志；第 10 节接口草案新增 `Event` / `visibleTo()` / `DERIVED`；架构图 Orchestrator 子图相应更新。
  - 第 6 节 AgentDeck 定位由「可自由借鉴含代码」放宽为「以借鉴设计为主，不强求复用代码」。
  - 未决问题 5（是否合并为单一事件流）因协作空间的引入，由「待定」改为「倾向合并」。
- **Impact**: 设计从「用禁止通信换取可信度」转为「用验证独立性换取可信度」——既保住防幻觉的核心机制，又解禁了此前被错误禁止的协作场景（多 researcher 互补盲区、coder 追问需求、方案讨论）。生命周期与通信权限由同一维度决定，模型更简洁。
- **Verification**: 全文 6 处不变式 1 引用逐一核对并更新；7.17–7.23 编号连续；修正一处真实占位符（`见 7.x`）；无 TBD/TODO 残留。文档增至 1,093 行。

### 2026-08-06 — 吸收 Buzz 的进程与上下文治理，修正实施计划中的孤儿进程缺陷

- **Type**: fix
- **Motivation**: 研读 Buzz（Block, Inc.，Apache-2.0，266,010 行 Rust）后发现其 `buzz-agent` + `buzz-dev-mcp` 正是本项目 Native Runtime 的完整参考实现，且其中数项工程细节暴露了本项目文档的缺陷。
- **What**:
  - **修正真实缺陷**：实施计划 Task 1.9 的 `PtyRuntime.stop()` 原本只调 `proc.kill()`，仅终止 pty 进程本身。agent 派生的 `python train.py` / `npm test` 会成为孤儿继续占用 CPU 与 GPU——对数据科学场景尤其致命（GPU 显存不释放会卡死后续全部工作）。改为进程组终止：`process.kill(-pid, SIGTERM)` → 200ms 宽限 → `SIGKILL`，并新增一条回归测试（在 shell 内后台起孙子进程，验证 stop 后其确实消失）。测试总数 47 → 48。
  - spec 新增 7.18–7.22：进程组终止序列（含 Drop 兜底与 disarm）、边界常量与**截断内容存为 artifact**、**上下文恢复阶梯**（`Recovered` / `Cancelled` / `Exhausted`——补上原设计"默认压缩总能成功"的空白）、ACP+MCP 双协议解耦架构、以及明确不采纳的部分（Nostr 与密码学身份、多租户、"agent 享有与人同等自由"——最后一项与不变式 1 直接冲突）。
  - 第 6 节参考项目表新增 Buzz（Apache-2.0，代码可直接使用）。
  - 第 13 节新增未决问题 5：是否将 Evidence 层、任务账本、审计日志合并为单一带 `kind` 标签的 append-only 事件流（Buzz 模型）。
- **Impact**: 消除一个会导致训练任务变孤儿的实现缺陷。上下文管理从"假设总能压缩"变为有明确失败态，与 7.5「无静默回退」一致。Native Runtime 现有可直接对照的开源实现，降低 Task 1.10 的不确定性。
- **Verification**: 进程组终止序列、边界常量（`MAX_TIMEOUT_MS` 600s / `MAX_BYTES` 50KB / `MAX_LINES` 2000）、`ContextRecovery` 枚举均经阅读 Buzz 源码确认（`crates/buzz-dev-mcp/src/shell.rs` 的 `KillGroup`、`crates/buzz-agent/src/handoff.rs`）。文档自检通过：7.17–7.22 编号顺序正确、5 处交叉引用有效、无占位符。

### 2026-08-06 — 重排开发阶段并产出 Phase 0 + 阶段①-A 实施计划

- **Type**: docs
- **Motivation**: 原蓝图把编排放在第二位、数据科学层放在第四第五位。改为「① 单 agent 工作台 → ② 数据科学工作台 → ③ 长驻团队协同」，理由是先交付确定有价值的、再验证假设：①+② 合起来即是一个可日常使用的工作台，③ 才是实验性命题。随后需要一份可执行的实施计划。
- **What**:
  - 重写 spec 第 11 节开发蓝图为五阶段（Phase 0 + ①②③④⑤），每阶段列出开发内容、技术栈、灵感来源对照表与验收判据；阶段 ② 拆为 ②-A 科学计算内核与 ②-B 执行环境两个可独立交付的里程碑。
  - 同步修正第 1 节目标排序、以及全文 22 处旧 Phase 编号引用。
  - 新增设计约束：阶段 ② 产出的 Run 记录、测试退出码、kernel 执行结果**必须能作为阶段 ③ 的 Repo 事实层证据**（不变式 5），避免 ③ 返工。
  - 产出 `docs/superpowers/plans/2026-08-06-phase0-and-session-core.md`（2,498 行，16 个任务，92 个步骤）：Phase 0 三个 spike（pi 可嵌入性 / PTY+MCP+Hook / Electron 终端）各带决策门，阶段①-A 的 11 个 TDD 任务（Provider 注册表、SQLite 存储、AgentRuntime 三实现、输入租约、会话生命周期、隔离配置、终端流、CLI 冒烟）。
- **Impact**: 项目从"设计完成"进入"可执行"状态。阶段 ① 结束即有可用产品，风险排序从高到低倒置为从低到高。①-B（Electron 外壳与终端墙 UI）及 ②③④⑤ 将各出独立计划。
- **Verification**: 计划已完成三项自检——规格覆盖（对照 spec 9.2 逐条列出对应任务，未覆盖项显式标注归属阶段）、占位符扫描（无 TBD/TODO/「同上」）、类型一致性（8 个跨任务共享类型逐个比对签名）。自检中发现并修正一处真实缺陷：测试用 `{...classInstance}` 改写方法会丢失原型上的全部方法，已改为完整桩对象。spec 自检亦通过：无残留旧 Phase 编号、无占位符。

### 2026-08-06 — 明确 ACP 与 A2A 的定位：只用于边界，不用于内部通信

- **Type**: docs
- **Motivation**: 原文档中 ACP 仅作为 Phase 6 的一行出现，A2A 完全未提。需要明确这两个协议在架构中的确切位置，并补上一个被遗漏的实质用法。
- **What**:
  - **补上遗漏**：新增 **ACP 作为第三种 Agent Runtime**。原设计只有 Native 与 External PTY，而 Gemini CLI / opencode / crush 等 Tier-2 provider 缺乏可靠的回合结束信号、只能靠超时兜底；ACP 的 `session/update` 事件流直接提供确定的回合状态与逐工具进度，并将权限请求转交我方裁决，补上双保险在这些 provider 上的缺口。标注为 Phase 2 后期，优先级低于 Native + PTY。
  - 第 8 节 Runtime 对照表由两种扩为三种，新增「完成信号」与「进度粒度」两个对比维度。
  - Phase 6 新增「协议 surface：入与出」小节，区分三条边界：ACP client（我们驱动别人）、ACP agent（编辑器驱动我方 leader）、**A2A agent（外部系统把任务委派给整个团队）**。
  - 4.1 否决清单新增第五条：**否决用 A2A 做内部 leader↔worker 通信**。依据 A2A 官方定位 "external agent collaboration rather than single-application orchestration"；且 Claude Code / Codex 本就不是 A2A server，仍需包装层，工作量不减反增。
  - 附录术语补充 A2A 词条（Linux Foundation 项目、v1.0.1、Agent Card / Task / Message / Artifact、HTTPS + JSON-RPC + SSE），并补全 ACP 词条的双向用法。
- **Impact**: 确立一条清晰原则——**协议只用于系统边界，内部 leader→worker 通信始终是不变式 1 规定的 `dispatch` / `report_result`**。同时补上了 Tier-2 provider 完成信号不可靠这一已知缺口的解法。
- **Verification**: A2A 的现状与定位经官方站点与 Linux Foundation 公告核实（v1.0.1 2026-05、150+ 组织、Agent Card 位于 `/.well-known/agent-card`、Task 生命周期）。文档自检通过：无占位符，Runtime 数量表述前后一致（三种），章节 14 节完整。

### 2026-08-06 — 吸收另外三份既有方案，并新增四条主动否决

- **Type**: docs
- **Motivation**: 扫描作者另外两个多智能体仓库（`multi-agent-orchestrator` 设计文档、`hermes-multi-agent-demo` 原型）及一份跨任务协作综述，确认其中可吸收的设计，同时甄别会破坏核心命题的通行做法。
- **What**:
  - **新增不变式 5：Agent 声明层与 Repo 事实层分离建模**。"Session 不是唯一真相，仓库状态才是"——状态推进必须由声明与仓库事实共同决定。原有的"交叉核对"由此从一个检查步骤上升为架构不变式的必然产物。
  - 第 7 节扩展为「从既有方案吸收的设计」，新增 7.8–7.17：四层架构（Evidence / Context / Orchestration / Repo Runtime）、可见性优先于自动化、协作拓扑一等概念（`cross_validate` / `arbitrate` 两种此前缺失的防幻觉模式）、决策日志与失败案例库、工具统一网关与结果缓存、产物按引用传递、多模态成果标准化、子任务 SLA、环形依赖检测、复盘指标扩展。
  - **新增 4.1 节「主动否决的常见做法」**，四条：多 Agent 投票表决（幻觉放大器，冲突应由 Repo 事实层裁决）、P2P / Swarm 自组织（违反不变式 1）、能力向量自动路由（让模型决定权限，违反 capability 授权原则）、引入 CrewAI / AutoGen / LangGraph（AutoGen 的群组协商违反不变式 1，且与技术栈不符）。
  - 相应扩充第 9.3 节功能表（新增 7 项）与 Phase 3 度量指标。
  - 修正一处措辞：子任务契约不采纳"agent 签收后必须按约交付"的信任语义，契约是引擎的判定标准而非对 agent 的信任。
- **Impact**: 防幻觉设计从"多个检查点"收敛为"一条架构不变式 + 其推论"，逻辑更紧。否决清单让后续引入外部方案时有明确的拒绝依据，避免范围与原则被通行做法侵蚀。文档增至 775 行。
- **Verification**: 三份来源均已阅读（`doc/plan.md` 744 行、`src/orchestrator.py` 拓扑定义、`decision_log.py` / `failure_log.py`）。文档自检通过：无占位符，7.2–7.17 共 11 处交叉引用全部指向存在的小节，章节编号连续无重复。

### 2026-08-06 — 设计策略改为独立实现，并吸收 AgentDeck 的编排设计

- **Type**: docs
- **Motivation**: ① 决定不 fork wisp-science / wispterm，改为参考设计、独立实现，以获得完整代码归属与许可自由。② 发现作者已有的 AgentDeck（`multi-agent-explore`）实现了成熟的多智能体编排，其中数项设计优于本文档初稿。
- **What**:
  - 实现策略改为**独立实现**：参考项目只读设计不复用代码；明确区分"依赖（import MIT 库）"与"复用（fork 项目）"。
  - 技术栈相应改为 TypeScript / Node + Electron：`pi-ai` + `pi-agent-core`（MIT，import）、`node-pty`、`xterm.js`、`@modelcontextprotocol/sdk`、`better-sqlite3`、`zeromq`。
  - 新增第 3 节记录自建代价清单（执行环境、桌面 UI、Run 管理等）与预估工期增量（+4–8 个月）。
  - 新增第 7 节"从 AgentDeck 吸收的设计"，采纳七项：完整租约模型（ControllerLease / ObserverRegistration / TakeoverPreview / 审计事件 / 转移指纹）、`review-verdict/v1` 契约与 `verdict_summary` 缺口检测、planner/orchestrator 二段拆分、exact-expiring-consume-once 预览确认、无静默回退、取证记录的有界与诚实、只读端点白名单。
  - 相应升级第 10 节接口草案（租约与回报契约）与第 9.3 节功能表。
  - Phase 0 spike 改为三项独立验证：pi 可嵌入性、PTY+MCP+Hook 三件套、Electron 终端可用性。
- **Impact**: 项目不再受 AGPL 约束，许可可自由选择、商业化路径保持敞开。编排层设计质量因吸收 AgentDeck 而显著提升，尤其在写权可追责与验收缺口检测两处。工期预估调整为 10–14 个月。
- **Verification**: AgentDeck 的各项设计均通过阅读其源码确认（`daemon/lease.py` 的租约类型、`review_verdict.py`、`providers/plan_schema.py`、`ui.py` 的只读端点注释、README 的 G2/G5 说明）。文档章节编号重排后已核对无重复、无断链。

### 2026-08-06 — 多智能体数据科学工作台：初版设计文档

- **Type**: docs
- **Motivation**: 目标是构建面向数据科学的多智能体协同工作台（leader 拆任务 → coder / reviewer / tester / critic 分工 → 降低 AI 幻觉），并最终形成类似 Claude app / Codex app 的桌面应用。需要先确认可行性、锁定架构、明确范围边界，再进入实现。
- **What**:
  - 调研六个参考仓库并确认各自定位与许可边界：wisp-science(AGPL)、Rho(MIT)、wispterm(MIT)、pi(MIT)、ccb(AGPL)、hive(BUSL-1.1)。
  - 澄清 ACP 同名歧义：Zed 的 Agent Client Protocol 是编辑器↔agent 的 UI 协议，schema 中不含 agent 间委派语义；不能用作编排协议。
  - 确认 wisp-science 已实现完整的 fork-join 型多智能体编排（23,207 行），但其模型是**临时子 agent**，与本项目期望的**长驻团队**模型不同构。
  - 确立四条核心不变式：agent 间禁止自由对话（切断幻觉传播）、角色决定生命周期（干活角色长驻 / 验证角色 fresh）、没有不可见的行动、长驻 agent 记忆是投影而非堆积。
  - 确定策略为"在 wisp-science 旁边新增 Team Layer 并复用其基础设施"，而非改造其既有 delegation 引擎。
  - 确定科学计算内核走 Rho 的 Ark + Jupyter 协议路线（一套协议通吃 R + Python，且支持中断），替代自研 JSON-lines worker。
  - 产出 `docs/superpowers/specs/2026-08-06-multi-agent-ds-workbench-design.md`：目标、非目标、不变式、架构、功能×技术栈、开发蓝图（Phase 0–5）、Phase 0 决定性 spike、风险与未决问题。
- **Impact**: 建立了项目的架构基线与范围边界。Phase 0 spike 为硬性前置门，其结果决定基座选 wisp-science 还是 Rho。尚无代码产出。
- **Verification**: 所有关于参考仓库的事实性判断均通过阅读源码或官方文档核实（许可证文本、`delegate_tasks` schema、provider 配置格式、Jupyter 协议使用、生物学耦合点排查）。设计文档已完成占位符、内部一致性、范围与歧义四项自检。
