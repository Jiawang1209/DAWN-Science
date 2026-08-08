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

### 2026-08-08 — 确立开发历史记录规范、凭证方案与仓库路径基线

- **Type**: chore
- **Commit**: 待回填
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
