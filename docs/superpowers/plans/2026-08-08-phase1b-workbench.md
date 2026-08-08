# 阶段 ①-B 实施计划 · 桌面工作台

- **日期**：2026-08-08
- **前置**：阶段 ①-A 完成，G1 通过（125 测试）
- **产出**：一个能日常替代裸终端的桌面 App
- **状态**：Part 0–3 与 Part 5（MVP 闭环）已完成并提交；Part 4 验收待作者本人
- **估算**：3–4 周
- **决策门**：G2

---

## 0. 与主规划 G2 判据的对照

> **这一节是 G1 留下的教训的落实。** ①-A 的详细计划漏掉了主规划 G1 的第一问「四个会话能并存」，验收时才补测。
> **纪律**：详细计划开篇必须逐条列出对应决策门的判据，并指明由哪个 Task 交付。

主规划 §5 的 G2：

| G2 判据 | 由谁交付 | 如何验证 |
|---|---|---|
| **桌面壳日常可用？** | Task 2.7–2.13 | 功能验收，见 Task 2.14 |
| **你是否真的开始用它替代裸终端？** | **不由任何 Task 交付** | **只能靠行为观察：连续两周是否主动打开。见 §7** |

> 主规划原文：「**G2 是最容易被忽略、也最重要的门。** 一个连作者自己都不愿日常使用的工具，后面九个月的投入都建在沙上。这个门的判据不是功能清单，是**行为**。」
>
> **推论写进本计划**：第二条判据无法用「做完某个 Task」来满足。因此本计划**刻意不追求功能完备**，而是把功能砍到「刚好能替代裸终端」，尽早进入两周观察期。凡是不服务于「让作者愿意打开它」的功能，一律推迟。

---

## 1. 范围

**本计划包含**：Workbench Protocol、Run 序列存储、Project 管理、项目面板（状态/产出/成本/历史）、Electron 壳、IPC 桥、终端组件（下钻视图）、会话侧栏。

**本计划不含**：

| 不做 | 理由 |
|---|---|
| 终端墙 / 分屏布局（实体 #19） | 见规格阶段 ① 修正框——`claude --bg`/`--tmux`/tmux 已解决，做了就是更差的 tmux |
| 三视图中的**笔记本视图与 cell 编辑器**（#21d/#21e 的一半） | 依赖阶段 ②-A 的内核。①-B 只做**对话视图**，但 Entry/Run 模型按三视图设计，不留返工 |
| Skills 市场与编辑器（#21g/#21h） | 不服务于「替代裸终端」，推迟 |
| 模型/Agent 切换器（#21f） | ①-B 用配置文件切换即可；UI 切换器推迟 |

---

## 2. 关键设计决定（先定，避免写到一半返工）

### 2.1 Run 是统一抽象

规格 7.33 已定。一次 agent 回合是一个 Run，一次内核执行也是 Run。

```
Run { runId, projectId, sessionId, parentRunId?, origin, requestType,
      status, startedAt, finishedAt?, hasError, ... }
```

- `origin: "user" | "agent" | "system"` —— 人与 agent 同构，只差这个字段（规格 7.22）
- `requestType: "agent_turn" | "execute_r" | "execute_py" | ...` —— ①-B 只产生 `agent_turn`，②-A 加内核类型
- `parentRunId` —— 重跑与续跑链（规格 8.6 的 `rerunOf`）

**为什么现在就定**：若 ①-B 只为 agent 会话造一套模型，②-A 会被迫造第二套，然后合并——那是确定的返工。

### 2.2 溯源完整性是一等公民

```
ProvenanceLink { resourceId, producingRunId?, environmentSnapshotId?,
                 sourcePath?, provenanceComplete, incompleteReason? }
```

**可见性分级**（规格 7.33 的表）：

| Runtime | 可见范围 | `provenanceComplete` |
|---|---|---|
| native（pi） | 完整：工具调用、参数、token、成本 | `true` |
| PTY（claude/codex） | 回合边界 + 我方注入的 MCP 工具 | **`false`**，`incompleteReason: "PTY agent 的内置工具不经过注入的 MCP"` |

**UI 必须显示这个标志**，不得留白让人以为「没记录 = 没发生」。

### 2.3 「产出」怎么算：git 事实，不听声明

**不变式 5**：agent 声明层与 Repo 事实层分离。

①-B 没有 worktree 隔离（实体 #50 在阶段 ③），所以只能做**相对基线的 diff**：

- 会话开始时记一个 `HEAD` + `git status --porcelain` 快照
- 回合结束（Stop hook / native `turn_end`）时再取一次，算差集
- **诚实标注**：该差集**可能混入作者本人的手动修改**，UI 上写明

> **不提前引入 worktree 隔离**的理由：它会改变作者的日常操作习惯（agent 的改动不在当前目录），而 G2 的判据恰恰是「愿不愿意用」。改习惯的东西不该在这个阶段引入。已记入 BACKLOG。

### 2.4 成本：native 有，PTY 没有

native runtime 的 `message_end` 自带 `usage.cost`（Spike A 实测）。PTY agent 用的是用户自己的订阅额度，我们拿不到。

**处理方式与 2.2 一致**：成本栏对 PTY 会话显示「不可见（该 agent 使用自有额度）」，不显示 0——**0 是错的，会让人以为免费**。

---

## 3. 文件结构

```
src/
├── protocol/                     ← Part 0，UI 与核心之间的唯一契约
│   ├── version.ts                协议版本常量与兼容策略
│   ├── entities.ts               Project / Run / Provenance / Session 的 zod schema
│   ├── operations.ts             操作名、请求/响应类型、错误码
│   └── index.ts                  对外唯一出口
├── store/
│   ├── schema.ts                 （已有）+ 新增 projects / runs / provenance 表
│   ├── sessions.ts               （已有）
│   ├── runs.ts                   Run 的读写与查询
│   └── projects.ts               Project 的读写
├── project/
│   ├── manager.ts                打开/切换项目，绑定 workspace
│   └── git-facts.ts              从 git 算产出，不听 agent 声明
├── workbench/
│   └── server.ts                 协议的服务端实现：把 store + session 层包装成 operations
├── electron/
│   ├── main.ts                   主进程
│   └── preload.ts                contextBridge 白名单
└── ui/
    ├── main.tsx
    ├── ProjectPanel.tsx          状态 · 产出 · 成本 · 历史
    ├── ConversationView.tsx      对话视图（三视图的第一个）
    ├── TerminalDrilldown.tsx     终端下钻，xterm.js
    └── SessionSidebar.tsx

tests/
├── protocol/entities.test.ts
├── store/runs.test.ts
├── store/projects.test.ts
├── project/git-facts.test.ts
├── workbench/server.test.ts
└── integration/workbench-e2e.test.ts
```

**责任边界**：`ui/*` **只 import `protocol/`**，绝不 import `runtime/` / `session/` / `store/`。这条由 Task 2.13 的一个 lint 测试强制。

---

# Part 0 · Workbench Protocol（协议优先）

## Task 2.1: 协议版本与实体 schema

**Files:** `src/protocol/version.ts` · `src/protocol/entities.ts` · `tests/protocol/entities.test.ts`

- [ ] **Step 1: 写失败的测试**

覆盖：Run 的 `origin` 只接受三值、`requestType` 可扩展、`parentRunId` 可选、`ProvenanceLink.provenanceComplete` 为 false 时**必须**带 `incompleteReason`（这是 2.2 的硬约束，用 `superRefine` 表达）、Project 计数字段非负、协议版本形如 `major.minor`。

- [ ] **Step 2: 确认 FAIL**
- [ ] **Step 3: 实现**

```ts
// src/protocol/version.ts
export const WORKBENCH_PROTOCOL_VERSION = "1.0"
// 兼容策略：minor 递增 = 向后兼容的字段新增；major 递增 = 破坏性变更，UI 必须同步升级
```

实体按规格 7.33 的表落成 zod schema。**`provenanceComplete: false` 必须带 `incompleteReason`** ——用 `superRefine` 强制，不靠约定。

- [ ] **Step 4: 确认 PASS**
- [ ] **Step 5: 提交** `feat(protocol): Workbench Protocol 实体 schema 与版本约定`

## Task 2.2: 操作契约与错误码

**Files:** `src/protocol/operations.ts` · `src/protocol/index.ts`

- [ ] **Step 1–2: 测试先行**

- [ ] **Step 3: 实现**

只读操作（①-B 够用）：`getCapabilities` · `listProjects` · `getProject` · `listSessions` · `listRuns` · `getRun` · `getProvenance`
可写操作：`openProject` · `createSession` · `writeToSession` · `stopSession` · `acquireLease` · `previewTakeover`

每个操作声明 `{ name, request: ZodSchema, response: ZodSchema }`。错误码采自 Rho：`not_found` / `invalid_request` / `conflict` / `internal` / `unsupported_version`。

**`getCapabilities` 返回 `WorkbenchCapabilities`**（含 `workbenchProtocolVersion` / `operations` / `readOnly`），UI 启动时先握手——版本不匹配时**响亮报错**，不静默降级。

- [ ] **Step 4–5: 确认 PASS 并提交**

## Task 2.3: 协议服务端实现

**Files:** `src/workbench/server.ts` · `tests/workbench/server.test.ts`

把 ①-A 的 `SessionManager` / `SessionStore` / `LeaseManager` 包装成 operations。**服务端不认识 Electron**——它只是一个 `handle(operation, request): Promise<response>` 的纯函数式外壳，因此可以在 Node 里直接测。

- [ ] **Step 1–2**: 测试先行，覆盖：未知操作返回 `invalid_request`、请求不合 schema 被拒、响应也过一遍 schema 校验（**双向校验**，防止服务端返回结构错误的数据）
- [ ] **Step 3–5**: 实现、确认、提交

---

# Part 1 · Run 存储与项目

## Task 2.4: projects / runs / provenance 表

**Files:** `src/store/schema.ts`（改）· `src/store/runs.ts` · `src/store/projects.ts` · 对应测试

- [ ] **Step 1–2**: 测试先行
- [ ] **Step 3**: 迁移到 `SCHEMA_VERSION = 2`。**沿用 ①-A 的两条纪律**：CHECK 约束作为第二道防线；未设字段省略而非留 null。
- [ ] **Step 4–5**: 确认、提交

## Task 2.5: 从 git 算产出

**Files:** `src/project/git-facts.ts` · `tests/project/git-facts.test.ts`

- [ ] **Step 1–2**: 测试先行，用临时 git 仓库跑真命令，不 mock
- [ ] **Step 3**: `snapshot(workspace)` → `{ head, dirtyFiles }`；`diffSince(workspace, baseline)` → 变更文件列表。用 `simple-git`（已是依赖）。
  **必须标注 `mayIncludeUserEdits: true`** ——见 2.3。
- [ ] **Step 4–5**: 确认、提交

## Task 2.6: Project 管理器

**Files:** `src/project/manager.ts` · 测试

打开文件夹 → 建/取 project 记录 → 绑定 workspace → 列出该项目的会话与 Run。

---

# Part 2 · Electron 壳与 IPC

## Task 2.7: Electron 主进程

Spike C 的结论直接适用：Electron 43，node-pty 与 zeromq 均无需 rebuild（但**换大版本需重测**）。

## Task 2.8: IPC 桥（白名单）

`contextBridge` 只暴露**一个** `invoke(operation, request)`，参数经协议 schema 校验后转给 `workbench/server`。

> 依据 AgentDeck `ui.py`：GUI 只经固定的少数端点取数，**不靠开洞**。单一入口使「UI 能做什么」完全由协议决定，而不是由暴露了多少个 IPC 通道决定。

## Task 2.9: 打包与启动

macOS 优先。**必须包含 `scripts/fix-node-pty.mjs` 的等价处理**——打包后 `spawn-helper` 的执行位同样会丢（Spike B 的教训）。

---

# Part 3 · UI

## Task 2.10: 项目面板（四栏）

状态 · 产出 · 成本 · 历史。**三条硬要求**：

1. 产出栏必须显示「可能包含你自己的修改」
2. 成本栏对 PTY 会话显示「不可见」而非 0
3. 任何 `provenanceComplete: false` 的条目必须显示原因

## Task 2.11: 对话视图

三视图的第一个。Entry 序列渲染，`origin` 决定人/agent 的视觉区分。

## Task 2.12: 终端下钻 + 会话侧栏

xterm.js 作为**下钻视图**。接管控件复用 ①-A 的租约预览（`previewTakeover`）。

## Task 2.13: 依赖边界的强制检查

**Files:** `tests/protocol/ui-boundary.test.ts`

扫描 `src/ui/**` 的 import，**出现 `runtime/` / `session/` / `store/` 即失败**。

> 这条不是洁癖。Rho 的原则是 UI 只依赖版本化协议——但原则不写成测试就会被绕过，尤其是在赶工时。

---

# Part 5 · MVP 闭环（2026-08-08 追加）

## 5.0 为什么要有这个 Part

Part 3 交付后作者问「现在还有什么问题」，实查发现**同一类缺陷共四处**，
根因是一个：**所有 UI 测试都只渲染叶子组件并手喂 props，没有任何测试渲染过 `App`。**
缺陷全长在接线上，而接线没有测试。

| 处 | 症状 | 根因 |
|---|---|---|
| 1 | agent 的回复看不见 | 协议 17 个操作里**没有一个读会话的**；`session/stream.ts` 早就写好却从未暴露 |
| 2 | 终端永远空白 | `App.tsx` 里 `output=""` 写死 |
| 3 | 产出栏永远「无法确定」 | `App.tsx` 里 `facts={undefined}` 写死；后端明明会返回 `fileChanges` |
| 4 | 打开文件夹靠 `window.prompt` | 命令行思路残留 |

> 第 3 处最能说明问题：三条硬要求里的「可能包含你自己的修改」我写了测试、组件也确实会渲染，
> **但真实界面里 `facts` 永远是 undefined，所以那句话永远不显示。测试是绿的，功能是死的。**
>
> 上一轮的 `createSession` 从未被调用是同一个洞的第 3 次发作。**Task 2.23 是为此立的墙。**

## 5.1 MVP 的定义（唯一判据）

**一条闭合的路，全程不碰终端、不改配置文件：**

```
打开 App → 打开项目文件夹 → 新建会话 → 说一句话
        → 看见回复 → 看见它改了哪些文件 → 看见花了多少钱
```

这条路上任何一步断了，MVP 就不算成立。**不在这条路上的一律不做。**

**明确不做**：多会话并发的 UI 编排、worktree、Jupyter、动画与像素打磨、
会话历史的跨进程持久化（重启后对话可以是空的，但项目与 Run 必须还在）。

## 5.2 事件通道设计（作者已选 B，先定死，避免半夜自由发挥）

**方向单一**：主进程 → 渲染进程。请求/响应仍走既有的 `dawn:workbench:invoke`，
**不合并、不复用**——两者的错误语义完全不同。

- **通道名**：`dawn:workbench:event`
- **信封**：`{ protocolVersion, sessionId, seq, kind, payload }`
  - `kind`: `"turn"`（native 的成型发言）\| `"bytes"`（PTY 原始字节）\| `"state"`（会话状态变更）\| `"dropped"`
- **`seq` 每会话单调递增**。渲染进程发现跳号 ⇒ **必须出声**（规格 7.5），
  不得假装连续。这是本设计里最容易被偷懒省掉的一条。
- **订阅**是普通操作（协议 1.3 新增）：`subscribeSession(sessionId, fromSeq?)`
  返回缓冲区内的历史，之后走事件推；`unsubscribeSession` 退订。
  **历史与增量必须由同一个 seq 序列串起来**，否则重连必然重复或丢字。
- **背压**：每会话环形缓冲，复用 ①-A `session/stream.ts` 的 `maxChars`。
  丢弃时**发一个 `dropped` 事件说明丢了多少**，绝不静默截断。
- **重连**：`fromSeq` 超出缓冲窗口 ⇒ 响应带 `truncated: true` 与最早可用 seq，
  UI 必须显示「更早的输出已丢失」。**不许悄悄从头给一段。**
- **版本**：事件自带 `protocolVersion`，不匹配即丢弃并出声。

协议 **1.2 → 1.3**（minor：只新增操作，向后兼容）。

## Task 2.16: 协议 1.3 — 事件信封与订阅操作

**Files:** `src/protocol/version.ts`、`src/protocol/events.ts`(新)、`src/protocol/operations.ts`

- [x] 事件信封 schema；`kind` 判别联合，`dropped` 必须携带丢弃量
- [x] `subscribeSession` / `unsubscribeSession` 两个操作与错误码
- [x] `truncated: true` 时**必须**同时给出最早可用 seq（superRefine 强制）
- [x] 版本升 1.3，`isCompatible` 既有测试不变

## Task 2.17: 主进程侧 — SessionManager 输出接入事件通道

**Files:** `src/workbench/events.ts`(新)、`src/workbench/backend.ts`、`src/electron/wiring.ts`

- [x] 每会话一个带 seq 的环形缓冲；native 出 `turn`，PTY 出 `bytes`
- [x] 溢出发 `dropped`，**测试必须覆盖溢出路径**（这是最容易只写不测的分支）
- [x] 会话退出发 `state` 事件，订阅自动清理，不泄漏 listener

## Task 2.18: 渲染侧 — preload 事件 API 与 client 事件流

**Files:** `src/electron/preload.ts`、`src/electron/ipc.ts`、`src/ui/client.ts`

- [x] `window.dawn.onEvent(cb)` 单一入口，返回退订函数
- [x] client 侧校验信封与 seq 连续性；跳号 ⇒ 抛出可见的警告，不吞
- [x] 无桥接时与既有 `no_bridge` 错误行为一致

## Task 2.19: 对话回读

**Files:** `src/ui/App.tsx`、`src/ui/views.tsx`

- [x] agent 的 `turn` 事件进 `turns`，与用户发言区分渲染
- [x] 切换会话时用 `subscribeSession` 重放，**不再无脑 `setTurns([])`**
- [x] 缓冲截断时在对话顶部显示「更早的输出已丢失」

## Task 2.20: 终端接真实字节流

**Files:** `src/ui/terminal.tsx`(新)、`src/ui/App.tsx`

- [x] 用 `@xterm/xterm`（已在 devDependencies），**不用 `<pre>`**——
      裸 `pre` 渲染 claude/codex 的 TUI 就是一团 ANSI 乱码，等于没做
- [x] `bytes` 事件写入 xterm；键盘输入回 `writeToSession`
- [x] 尺寸变化调 `resize`（①-A 已有）

## Task 2.21: 产出栏接真实数据

**Files:** `src/ui/App.tsx`

- [x] 选中 Run 时取 `getRun`，把 `fileChanges` 喂给 `ChangesPanel`
- [x] 后端不返回 `fileChanges` 时仍走「无法确定」分支——**三态必须都能在真实界面上出现**
- [x] `getProvenance` 接入 ProvenanceBadge

## Task 2.22: 原生目录选择器

**Files:** `src/electron/main.ts`、`src/electron/ipc.ts`、`src/ui/App.tsx`

- [x] `dialog.showOpenDialog({ properties: ["openDirectory"] })` 替掉 `window.prompt`
- [x] 用户取消 ⇒ 什么都不做，**不报错**
- [x] 因为要用 `dialog`，这个入口不能放进 `WorkbenchServer`（它必须可在 node 下测）——
      走 IPC 上一个独立的窄通道，并在 Task 2.13 的边界扫描里显式放行

## Task 2.23: MVP 主路径的 App 级测试 ★

**Files:** `tests/ui/app-mvp.test.tsx`(新)

**这是本 Part 最重要的一条，也是四处缺陷复发的唯一防线。**

- [x] 假 client + 假事件源，从「打开项目」一路点到「看见回复」「看见产出」「看见成本」
- [x] 断言 agent 的回复出现在界面上——**上一版四处缺陷，这一条测试全都会拦下**
- [x] 断言 `ChangesPanel` 收到的是 client 返回的数据，不是字面量
- [x] 事件跳号时断言界面出声

> 教训写在这里：**叶子组件测试证明「给它数据它显示得对」，
> 证明不了「有没有人给它数据」。** 后者才是用户打开 app 时唯一在意的事。

---

# Part 4 · 验收

## Task 2.14: 功能验收（G2 第一问）

- [ ] 打开一个文件夹成为项目，侧栏出现
- [ ] 在项目里起一个 native 会话，对话正常
- [ ] 起一个 claude 会话，终端下钻里能真接管键盘
- [ ] 项目面板四栏都有内容，且三条硬要求都满足
- [ ] 关掉 App 重开，项目与历史还在
- [ ] 全局 `~/.claude/settings.json` md5 未变

## Task 2.15: 行为观察（G2 第二问）

**这一项不是开发任务，是观察期。**

- [ ] 连续两周，记录每天是否**主动**打开 DAWN 而非裸终端
- [ ] 每次没打开时，记下当时选择裸终端的原因

> **这才是 G2 的真正判据。** 若两周后答案是否，按主规划要求**停下来查为什么**，不要带着一个自己都不用的工具往下做。
> 「为什么没打开」的记录比「打开了几次」更有价值——它直接指出下一步该修什么。

---

## 4. 风险

| 风险 | 应对 |
|---|---|
| Electron + React 的工作量被低估 | ①-B 的 UI 刻意砍到最小；砍掉的都记在 §1 的不做清单里 |
| 协议设计过度，迟迟进不了 UI | Part 0 三个 Task 封顶；操作清单已冻结在 Task 2.2，新增操作一律推迟到 ①-B 之后 |
| 两周观察期结论为否 | 主规划已规定：停下来查原因。§7 的「为什么没打开」记录即是查因材料 |
| PTY agent 可见性不足导致面板价值不够 | 已知且已建模（`provenanceComplete`）。若观察期证明这是主要不满，则值得再探一次 claude 的 hook 体系（Spike B 只验了 Stop） |

---

## 5. 自检记录

- [ ] 规格覆盖：对照规格阶段 ① 修正框与 7.33 逐条列出对应 Task
- [ ] **决策门对照**：§0 已逐条列出 G2 判据与交付方（落实 G1 教训）
- [ ] 占位符扫描：无 TBD / TODO / 「同上」
- [ ] 类型一致性：协议实体与 ①-A 既有类型（`SessionRecord` / `ControllerLease`）的字段比对
