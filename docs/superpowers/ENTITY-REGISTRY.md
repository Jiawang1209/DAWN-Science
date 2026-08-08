# 实体清单（Entity Registry）

- **日期**：2026-08-07
- **用途**：项目要造的**每一个部件**，逐个标注职责、技术栈、构思来源。
- **上游**：规格 `specs/2026-08-06-multi-agent-ds-workbench-design.md`、主规划 `plans/2026-08-07-master-roadmap.md`

## 怎么用这份文档

| 场景 | 用法 |
|---|---|
| 写详细计划前 | 查该阶段的实体行，确认技术栈与参考实现，避免临场发明 |
| 实现某个部件时 | 按「构思来源」去读对应项目的那一处，**读设计不抄代码**（除 pi / Buzz，见下） |
| 代码审查时 | 对照「职责」一栏检查有没有越界——一个实体做了两件事就该拆 |
| 有人问"这为什么这么设计" | 来源栏就是答案 |

**来源标记的含义**（依据规格第 6 节的许可边界）：

| 标记 | 含义 |
|---|---|
| 🔧 | **可直接用代码**（pi 作依赖；Buzz 为 Apache-2.0） |
| 📐 | **只读设计**，按自己的理解重写 |
| 🎨 | **只看交互与视觉** |
| ✍️ | **自研**，无外部原型 |

---

## 阶段 ①-A · 会话核心（14 个实体）

| # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|
| 1 | `config/schema.ts` | Provider 注册表类型：`endpoints`（地址+凭证）与 `agents`（loop 宿主+端点）两段式 | `zod` | 📐 **Hermes** —— 其 `providers:` map 把「模型端点」与「完整 agent」混在一个扁平列表里；本项目拆成两段，让一个端点可被多个宿主复用 |
| 2 | `config/loader.ts` | 读 YAML、展开 `${ENV}`、校验跨段引用完整性 | `yaml` · `zod` | 📐 **Hermes**（`${ENV}` 语法）+ 📐 **AgentDeck**（无静默回退：变量缺失即响亮失败） |
| 3 | `store/schema.ts` | SQLite DDL 与迁移；WAL 模式 | `better-sqlite3` | ✍️ 自研 |
| 4 | `store/sessions.ts` | 会话表读写 | `better-sqlite3` | 📐 **hive** —— 其 `AGENTS.md` 硬规则「持久化必须先写 SQLite，成功后才更内存」 |
| 5 | 启动对账 `reconcileOnStartup()` | 把上次遗留的 `starting`/`alive` 显式转 `exited` | SQLite | 📐 **wisp-science** —— 启动时把 queued/running 子任务显式转为 failed，**不静默重放** |
| 6 | `runtime/types.ts` | `AgentRuntime` 接口：三种实现共用 | TS interface | 📐 **wisp-science** —— 其 Native / ACP 双 executor 抽象；本项目改为 Native / PTY / ACP 三种 |
| 7 | `runtime/fake.ts` | 测试替身，业务逻辑 TDD 用 | `vitest` | ✍️ 自研（TDD 需要） |
| 8 | `runtime/native.ts` | 用 agent loop 驱动任意 API 端点（DeepSeek 等） | 🔧 **`pi-coding-agent` 的 `createAgentSession()`（第三层）**——不是只用第二层的 `Agent` 类 | 🔧 **pi**（直接 import）+ 🔧 **Buzz** `buzz-agent`（会话与上下文管理的完整参考实现） |

> **#8 的技术栈栏 2026-08-08 改写。** 原文写的是「`pi-agent-core` · `pi-ai`」——
> **那不构成决策**，`new Agent({tools: []})` 也满足它，而实现正是落成了这个，agent 一个工具都没有。
> 本表的「技术栈」栏今后必须具体到**导出符号**，不能只写包名。见规格 §4 的分层纪律。
| 9 | `runtime/pty.ts` | 托管真实 CLI agent，可接管 | `node-pty` | 📐 **hive**（node-pty 选型与终端托管）+ 🔧 **Buzz**（终止序列，见 #10） |
| 10 | 进程组终止 | `SIGTERM` → 200ms → `SIGKILL`，**发给整组**，防孤儿 | `process.kill(-pid)` | 🔧 **Buzz** `buzz-dev-mcp/src/shell.rs` 的 `KillGroup`（`process_group(0)` / `killpg` / Drop 兜底 / `disarm`） |
| 11 | `runtime/session-dir.ts` | per-session 隔离配置目录，绝不碰用户全局配置 | Node `fs` | 📐 **ccb** —— `claude-session-isolation-contract.md` / `codex-session-isolation-contract.md` |
| 12 | `session/lease.ts` | 写权租约：`ControllerLease` · 观察者注册 · 夺权预览 · 审计事件 · 转移指纹 | ✍️ 自建 | 📐 **AgentDeck** `daemon/lease.py`（完整类型与审计模型）+ 📐 **wispterm** `agent/terminal_lease.zig` |
| 13 | `session/manager.ts` | 会话生命周期；租约守卫写入 | TS | 📐 **hive**（先落库再改内存）+ ✍️ 租约守卫为自研 |
| 14 | `session/stream.ts` | 终端流 ring buffer + 节流合并投递 | ✍️ 自建 | 📐 **hive** `terminal-flow-control.ts` / `pty-output-bus.ts`；边界常量取自 🔧 **Buzz**（50KB / 2000 行） |

---

## 阶段 ①-B · 桌面壳（15 个实体）

> **2026-08-08 定位修正（见规格 7.33 与阶段 ① 节的修正框）**：①-B 的主体**不是**多会话终端墙，而是**项目面板 + 单会话三视图**。
> 实现顺序相应改为 **#17 协议优先**——UI 依赖版本化协议，先画 UI 会让协议被 UI 的偶然形状绑架。
> 下表已按修正后的顺序重排，原编号保留以便跨文档引用。

| 顺序 | # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|---|
| **1** | 17 | **Workbench Protocol** | 版本化契约：UI 只依赖它，不依赖 Electron / node-pty / pi 内部。实体模型见规格 7.33 | TS types + `zod` | 📐 **Rho** `crates/rho-protocol/src/workbench.rs`（493 行，已实读）——*"The UI must depend on a versioned Rho Workbench Protocol, not directly on Tauri commands, Ark, Jupyter messages, or aisdk internals"* |
| **2** | 21c | **Entry / Run 序列存储** | append-only 有序；**Run 是统一抽象**（内核执行与 agent 回合共用），`origin` 区分人/agent，`parent_run_id` 表达重跑 | SQLite | ✍️ 自研（规格 8.2/8.6）；事件流模型源自 🔧 **Buzz**；`origin` / `parent_run_id` / `provenance_complete` 采自 📐 **Rho** |
| **3** | 21b | **Project 管理** | 打开文件夹为新项目、绑定 workspace、项目切换、项目级配置。**项目是用户切换的单位** | React + 原生目录对话框 | 📐 **Rho** `ProjectSummary` / `WorkspaceStatus`（实质模型）+ 🎨 Claude app / Codex app（信息架构外壳）。**wisp-science 无此概念，已实测确认，不作参考** |
| **4** | — | **项目面板** | 状态 · 产出 · 成本 · 历史四栏；产出从 git 事实算，不听 agent 声明（不变式 5）；溯源链带 `provenance_complete` | React | 📐 **Rho** `ProvenanceLink` / `EnvironmentEvidence`；**成本与跨工具为自研**（Rho 不跑模型、只有 R） |
| **5** | 15 | Electron 主进程 | 承载会话核心；窗口与系统集成 | `Electron` | 🎨 **Claude app / VS Code** 形态 |
| **6** | 16 | IPC 桥 | 渲染进程 ↔ 主进程；`contextBridge` 白名单 | Electron IPC | 📐 **AgentDeck** `ui.py` —— GUI 只经固定的少数只读端点取数，可写操作走显式注册的控件表，**不靠开洞** |
| **7** | 18 | 终端组件 | 渲染 PTY 输出，处理输入与 resize。**定位为下钻视图，非主界面** | `xterm.js` | 📐 **wispterm**（终端交互）+ 📐 **Rho**（**xterm.js 只用于真 shell，绝不用于 REPL**） |
| **8** | 20 | 会话侧栏 | 列表、创建、切换、状态指示 | React | 🎨 **Claude app** · 🎨 **hive** |
| ~~—~~ | ~~19~~ | ~~终端墙布局~~ | **推迟到阶段 ③ 重新评估。** 理由：`claude --bg` + `claude agents` + `--tmux` 已解决窗口管理，tmux/zellij 亦然；做成主界面即「更差的 tmux」，G2 判据（是否真的替代裸终端）会不通过。③ 届时需要的多半是**编排进度视图**而非四个终端 | — | 🎨 hive / wispterm（保留待评估） |
| 21 | 接管控件 | 显示当前写权持有者；**夺权前先展示预览** | React | 📐 **AgentDeck** `TakeoverPreview` |
| 21b | **Project 管理** | 打开文件夹为新项目、绑定 workspace、项目切换、项目级配置 | React + 原生目录对话框 | 🎨 **Claude app / Codex app / Hermes** 的信息架构 |
| 21c | **Entry 序列存储** | append-only 有序 Entry；`rerunOf` / `supersedes` 表达重跑与编辑 | SQLite | ✍️ **自研**（规格 8.2/8.6）；事件流模型源自 🔧 **Buzz** |
| 21d | **三视图渲染器** | 对话 / 笔记本 / 并排——同一 Entry 序列的三种投影 | React | ✍️ **自研**（规格 8.3）。A 面参考 🎨 Claude app，B 面参考 📐 wisp-science |
| 21e | **cell 编辑器** | 笔记本视图里可编辑、可重跑；人写的 cell 与 agent 写的同构 | **CodeMirror 6** | ✍️ 自研（规格 8.4） |
| 21f | **模型 / Agent 切换器** | 全局默认 + 会话级覆盖；按 `kind` 分「Agent / Model」两栏 | React | 📐 **Hermes**（两级切换 + `/model`） |
| 21g | **Skills 市场与加载器** | marketplace（git 仓库）→ plugin（版本化）→ `SKILL.md`；三级优先级：项目 > 用户 > 市场 | Node fs + git | 📐 **Claude Code** 的 `known_marketplaces.json` / `installed_plugins.json` / `plugins/cache/`；渐进式加载学 📐 **wisp-science** |
| 21h | **Skill 编辑器** | 应用内新建/编辑自己的 Skill，生成 frontmatter 骨架 | CodeMirror | ✍️ 自研 —— 面向科研用户固化自己的方法论 |

---

## 阶段 ②-A · 科学计算内核（13 个实体）

| # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|
| 22 | Jupyter wire protocol 客户端 | **一次实现，通吃多语言**；消息签名、序列化 | `zeromq` | 📐 **Rho** —— 用 `jupyter-protocol` + `jupyter-zmq-client`；并参考其 vendored `wurli/jet` 的内核生命周期设计 |
| 23 | 五通道规范化 | shell / iopub / stdin / control / heartbeat → 内部事件 | TS | 📐 **Rho** —— 其通道职责映射表 |
| 24 | Ark 集成（R） | 下载/校验/启动 R 内核 | `posit-dev/ark`（固定版本 + sha256） | 📐 **Rho** `runtime/ark.json` 的固定版本 + 校验和做法 |
| 25 | ipykernel 集成（Python） | 启动 Python 内核 | `ipykernel` | 📐 **Rho** —— 「一套协议通吃」是选它的全部理由 |
| 26 | 中断机制 | 打断正在执行的 cell | 进程组信号 | 📐 **Rho**（*"Interrupt is a kernel-manager responsibility rather than ordinary R code"*，且被其列为前置门）+ 🔧 **Buzz**（终止序列实现） |
| 27 | 富输出渲染 | 图 / HTML / 表；`display_data` + comm 通道 | React | 📐 Jupyter 协议原生 + 📐 **Rho** |
| 28 | 变量检查面板 | 命名空间对象列表，带数量上限 | React | 📐 **wisp-science** `kernel_worker.py`（`MAX_OBJECTS = 200`） |
| 29 | 结构化 Console | 消费协议事件渲染，**不是终端模拟器** | React | 📐 **Rho** —— 明确禁止用 xterm.js 做 R Console |
| 29b | **内核状态版本追踪** | 每次执行 `kernelRevision` +1；output 记录产生时的版本；陈旧 output 标记 | TS | ✍️ **自研**（规格 8.5）；`revision` 标签思路源自 📐 **Rho** |
| 29c | **变量面板** | Project 级、跨 chat 的命名空间视图 | React | 📐 **Rho** Environment 面板 + 📐 **wisp-science** |
| 29d | **图表 / 表格渲染** | `display_data` → Plotly / `<img>` / 虚拟滚动表格 | Plotly.js · TanStack Table | 📐 Jupyter 协议原生 |
| 29e | **`.ipynb` 导入导出** | 笔记本视图与标准格式互转 | `nbformat` schema | 📐 Jupyter 生态 |
| 30 | 输出上限与截断保全 | 超限截断，**标志出声 + 完整内容存 artifact** | TS | 🔧 **Buzz**（50KB / 2000 行 + `stdout_truncated` 标志 + artifact 保全）+ 📐 **wisp-science**（1MB 上限的先例） |

---

## 阶段 ②-B · 执行环境与 Run 管理（7 个实体）

| # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|
| 31 | 环境探测器 | 一次连接完成硬件与运行时探测（本地 / WSL / SSH / GPU） | `ssh2` | 📐 **wisp-science** —— 「一次连接即完成硬件与运行时探测」 |
| 32 | 环境注册表 | 每环境独立解释器路径；**连接失败开闸门而非静默重试** | SQLite | 📐 **wisp-science** |
| 33 | Run 管理器 | 提交前预检、每秒心跳、有界日志、**随环境快照持久化** | SQLite | 📐 **wisp-science** —— 结构化 Run 管理长任务 |
| 34 | 凭证存储 | 密钥**只进系统密钥环，绝不落 SQLite** | `keytar` / Electron `safeStorage` | 📐 **wisp-science** |
| 35 | Skills 加载器 | `SKILL.md` 渐进式加载，**不塞满提示词** | Node `fs` | 📐 **wisp-science** `wisp-skills` |
| 36 | 产物存储 | 内容寻址；**按引用传递而非按值**；短期上下文 vs 长期记忆分离 | SQLite + 文件 | 📐 跨任务协作综述（共享上下文缓冲区） |
| 37 | 产物 schema 校验 | 表格 CSV/JSON、图表附元数据、代码附出入参、模型产物附超参与指标 | `zod` | 📐 跨任务协作综述（多模态成果标准化） |

> **契约冻结检查**（主规划 §4.2）作用于 #33 与 #36：它们必须能回答阶段 ③ 的六个问题。

---

## 阶段 ③-A · 事件流与成员模型（6 个实体）

| # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|
| 38 | **统一事件流** | 消息 / 派单 / 回报 / Repo 事实 / 租约转移全部同流，`kind` 区分；append-only；元数据含 `provenance` / `causationId` / `confidence`；写入前 `redactSecrets` | **SQLite（WAL）** —— 见 7.32：相对 pi-crew 的 JSONL 方案省掉文件锁、手写轮转、增量读器、worker 线程四类工程 | 🔧 **Buzz** —— *"every message, reaction, workflow step, review approval, and git event is a signed event in one log"*。**采纳 `kind` 模型，去掉 Nostr 与密码学签名** |
| 39 | 成员注册表 | 角色 · `mode` · runtime · worktree 策略；**`mode` 派生生命周期与可见范围，不可单独覆写** | SQLite + TS | 🔧 **Buzz**（agent 是一等成员）+ ✍️ 自研（`mode` 单一维度是不变式 1+2 合流的产物） |
| 40 | 协作空间 | 协作模式成员共享的可审计工作区 | 事件流之上 | 🔧 **Buzz**（channels，人与 agent 同室） |
| 41 | **可见范围过滤器** `visibleTo()` | 按 `mode` 裁剪投喂上下文；验证角色只见产物 + 验收标准 | TS | ✍️ **自研** —— 不变式 1「验证隔离」的核心执行点。类比来源是人类的双盲评审制度 |
| 42 | 记忆投影器 | 重建长驻 agent 的上下文，非 append 原始历史 | TS + `pi-ai`（压缩） | 📐 **Rho** —— *"stores only references and bounded summaries tagged with kernel instance, state revision, and project revision"* |
| 43 | 上下文恢复阶梯 | `Recovered` / `Cancelled` / **`Exhausted`**；压不动时如实报错，不假装能救 | TS | 🔧 **Buzz** `buzz-agent/src/handoff.rs`（含预算常量与交接摘要的内容契约） |

---

## 阶段 ③-B · 编排（25 个实体）

| # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|
| 44 | 任务账本 | 任务图；版本化；环形依赖运行时检测 | SQLite | 📐 **AgentDeck** `step_dag.py` + 📐 **wisp-science** `delegate_tasks` 的任务契约 |
| 45 | `dispatch` 通道 | 渲染任务并写入目标会话（经租约） | TS | ✍️ 自研 |
| 46 | **Report MCP server** | 向 worker 暴露 `report_result(schema)` | `@modelcontextprotocol/sdk` | ✍️ **自研** —— 相对 📐 **hive** 注入 `team` shell 命令的改进：MCP tool call 是模型原生能力且参数受 schema 校验，比拼 shell 字符串可靠一个数量级 |
| 47 | Hook 完成信号适配 | Claude Stop hook / Codex `agent-turn-complete` | per-session 配置生成 | 📐 各 CLI 官方机制 + 📐 **ccb** `*-completion-contract.md` |
| 48 | **交叉核对器** | `report_result` 对照 `git diff` 与 hook 记录 → 不符标 `untrusted` | `simple-git` | 📐 **multi-agent-orchestrator** —— 「Agent 声明层」与「Repo 事实层」分离建模（不变式 5 的来源） |
| 49 | `verdict_summary` 派生 | `unverified` / `extra` 缺口检测 + **GreenLevel 满足判定** + auto-merge 闸门 | TS | 📐 **AgentDeck** `review_verdict.py` + 📐 **pi-crew** `green-contract.ts`（5 级 GreenLevel） |
| 49b | **验证环境净化** | 验证命令的 env 走白名单，默认剥离密钥；需要时显式 opt-in 并审计 | TS | 📐 **pi-crew** `verification-gates.ts` —— 防 worker 诱导验证输出泄露 API key |
| 49c | **manifest 快照** | 验证前后哈希 `package.json`/lockfile/`pyproject.toml` 等，检测依赖篡改 | `node:crypto` | 📐 **pi-crew** `verification-integrity.ts`（含其诚实记录的三项残余风险） |
| 49d | **顺序相位门** | 类型检查 → lint → 单测 → 集成；Phase N 不过不进 N+1 | TS | 📐 **pi-crew** `verification-gates.ts` 的 RED/GREEN 模型 |
| 49e | **编排成本实测披露** | 分类工作流形状并打印实测开销（如"串行 3 步比 3 次直调慢 5.7×"）；**只告知不阻拦** | TS | 📐 **pi-crew** `topology-analyzer.ts` |
| 50 | worktree 隔离器 | 每 coder 一分支工作区 + 冲突检查合并；主仓洁净断言（`--untracked-files=no`） | `simple-git` | 📐 **wisp-science** `delegation_isolation.rs` + 📐 **AgentDeck** `branch_custody.py` + 📐 **pi-crew** `worktree-manager.ts` |
| 50b | **脏 worktree 保命快照** | 销毁前把 `git diff HEAD --binary` + 未跟踪文件存成 artifact；每文件 256KB 上限；非 UTF-8 转 base64 | `node:crypto` · fs | 📐 **pi-crew** `snapshotDirtyWorktree` —— 原设计会直接丢弃 agent 的成果 |
| 50c | **seedPaths 注入** | 把 `.env`、本地配置等未跟踪但必需的文件带进 worktree；**拒绝符号链接与越界路径**（纵深防御，两处校验） | fs | 📐 **pi-crew** `normalizeSeedPaths` / `overlaySeedPaths` |
| 50d | **依赖链接而非复制** | `node_modules` / venv / R library 用符号链接接入 worktree | fs | 📐 **pi-crew** `linkNodeModulesIfPresent` |
| 50e | **分支新鲜度检查** | `fresh\|stale\|diverged\|unknown` + 策略 `warn\|block\|auto_rebase\|auto_merge_forward`；**列出缺失 commit 的标题** | `simple-git` | 📐 **pi-crew** `branch-freshness.ts` —— 防 worker 在过时分支上重复修已修好的 bug |
| 50f | **git 环境净化** | 连只读 git 命令也走环境白名单 | TS | 📐 **pi-crew** —— 防仓库内的 git hook / alias / credential-helper 窃取 API key |
| 51 | capability 授权解析器 | host policy 把能力声明解析为具体工具集与预算；**模型不能给子 agent 授权原始工具** | TS | 📐 **wisp-science** `delegation_policy.rs` |
| 52 | 审批门 + 快照失效 | 写 / 执行 / 网络需显式批准；资源集变化则授权作废 | TS | 📐 **wisp-science** |
| 53 | 预览确认 | **exact / expiring / consume-once** | TS | 📐 **AgentDeck** `gate_preview.py` |
| 54 | Planner / Orchestrator 拆分 | 规划用强模型出简报+验收标准，展开可用便宜模型；简报冻结为快照 | `pi-ai` 双 provider | 📐 **AgentDeck** `orchestration/split_planning.py` |
| 55 | 协作拓扑模板 | `fan_out` / `pipeline` / **`cross_validate`** / **`arbitrate`** | TS | 📐 **hermes-multi-agent-demo** `orchestrator.py` |
| 56 | 工具网关 + 结果缓存 | 权限统一；相同入参复用；调用日志入事件流 | TS + SQLite | 📐 跨任务协作综述 |
| 57 | 环形依赖检测 | 运行时校验，发现环即报错，**不猜执行顺序** | TS | 📐 跨任务协作综述 |
| 58 | Team 终端墙（编排视图） | 成员终端并排、实时、点击接管；显示当前任务 | React + `xterm.js` | 🎨 **hive** team 面板（**只看交互，BUSL 不碰代码**） |
| 59 | ACP Runtime | 驱动原生 ACP agent；补无可靠 hook 的 provider 的完成信号 | `@zed-industries/agent-client-protocol` | 🔧 **Buzz** `buzz-acp` / `buzz-agent`（ACP 合规实现）+ 📐 **wisp-science** `wisp-acp` |

---

## 阶段 ④ · 命题验证（4 个实体）

| # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|
| 60 | 任务图可视化 | DAG canvas：拓扑分列、节点检查器、缩放、minimap | React（图布局库待定） | 🎨 **wisp-science** Workflow Studio |
| 61 | **度量框架** | 单 agent 基线 vs 多 agent：缺陷检出率、误报率 | TS + SQLite | ✍️ **自研** —— 这是整个项目的实验装置，无现成原型 |
| 62 | 附和检测 | reviewer 通过率是否异常偏高；`unverified` 缺口分布 | TS | ✍️ 自研 |
| 63 | 决策日志 / 失败案例库 | 决策及其事后结果；失败按类型归档，可查询可统计 | SQLite | 📐 **hermes-multi-agent-demo** `decision_log.py` / `failure_log.py` |

---

## 阶段 ⑤ · 领域内容与对外 surface（7 个实体）

| # | 实体 | 职责 | 技术栈 | 构思来源 |
|---|---|---|---|---|
| 64 | ML / DL Skills 库 | 特征工程、模型训练与评估、实验追踪、超参搜索、数据清洗 | `SKILL.md` | 📐 **wisp-science** `skills/` 的组织形式（内容全部替换） |
| 64b | **PDF 渲染与抽取** | 应用内阅读、选中、框选；文本/图表/表格/参考文献结构化抽取 | **`pdf.js`** | ✍️ 自研 —— 解读逻辑不硬编码，交给 Skill |
| 64c | **文献解读 Skills** | 「文献精读」「方法学复核」「相关工作梳理」各为一个 Skill，**用户可写自己的读法** | `SKILL.md` | ✍️ 自研（规格 10.6） |
| 65 | 数据科学 MCP servers | 数据集检索、实验追踪、模型仓库、文档查询 | Python MCP SDK | 📐 **wisp-science** `mcp-servers/` 的组织形式 |
| 66 | ACP agent surface（出） | 把 leader 暴露为 ACP server，供 Zed / Neovim / JetBrains 驱动 | ACP | 🔧 **Buzz** `buzz-agent`（ACP 合规的完整实现） |
| 67 | A2A agent surface（出） | 暴露 Agent Card + task 端点，让外部系统委派给整个团队 | A2A（HTTPS + JSON-RPC + SSE） | 📐 A2A 规范（Linux Foundation） |
| 68 | 跨平台打包与发布 | macOS / Linux / Windows | Electron Builder | 📐 **Rho** / **wisp-science** 的发布流程（其栈为 Tauri，此处仅借流程） |

---

## 来源统计

下表统计**引用了该来源的实体行数**。多数实体引用不止一个来源，故各行之和大于 68。

| 来源 | 被引实体数 | 主要贡献领域 |
|---|---|---|
| **wisp-science** 📐 | 18 | 执行环境、Run 管理、capability 授权、worktree 隔离、Skills、审批门 |
| **Buzz** 🔧 | 12 | 进程治理、上下文恢复、统一事件流、ACP 实现、边界常量与截断保全 |
| **Rho** 📐 | 11 | Jupyter 内核路线、协议分层、记忆投影、结构化 Console |
| **AgentDeck** 📐 | 9 | 租约、verdict 契约、预览确认、planner 拆分、任务图、只读端点白名单 |
| **自研** ✍️ | 9 | 可见范围过滤、度量框架、双保险回报、租约守卫、附和检测 |
| **hive** 📐🎨 | 8 | 终端流控、先落库规则、node-pty 选型、team 面板交互 |
| **跨任务协作综述** 📐 | 4 | 产物引用传递、成果标准化、工具网关、环形依赖检测 |
| **wispterm** 📐🎨 | 3 | 终端租约、分屏与标签交互 |
| **hermes-multi-agent-demo** 📐 | 2 | 协作拓扑（`cross_validate` / `arbitrate`）、决策与失败日志 |
| **ccb** 📐 | 2 | 会话隔离契约、completion contract |
| **Hermes** 📐 | 2 | provider 两段式配置 |
| **pi** 🔧 | 2 | agent loop + provider 层（直接 import） |
| **multi-agent-orchestrator** 📐 | 1 | **声明层 / 事实层分离（不变式 5）** |

**合计 91 个实体**（1–68 连续，另有 21b–21h、29b–29e、49b–49e、50b–50f、64b–64c 共 23 个后补项）。

### 两点观察

**① 自研的 9 个恰好是项目的差异化所在。** 可见范围过滤器（验证隔离的执行点）、交叉核对的双保险机制、度量框架——这些正是"多 agent 降幻觉"这个命题独有的部件，没有现成原型可抄，也正因如此它们是项目真正的价值。

**② `multi-agent-orchestrator` 只贡献 1 个实体，但那是不变式 5。** 数量不代表分量——那一条「Session 不是唯一真相，仓库状态才是」是整个防幻觉体系的第一性原理，实体 #48 交叉核对器只是它的一个实现出口。
