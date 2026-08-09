# 阶段 ①-C 详细计划：外部 CLI 作为对话式 agent

- **日期**：2026-08-09
- **上游**：`2026-08-08-master-roadmap.md`；前置 `2026-08-09-phase1b-double-prime.md`（四批次已完成）
- **触发**：作者试用后的两句话
  > *「怎么一下子把 cli 都挪入到 app 里面了呢？应该是和 deepseek 这种样式，我从对话框里面输入内容」*
  > *「终端肯定留着啊，终端就类似 codex app 的感觉，里面有一个终端，然后也可以执行任意的 Linux 的命令，也可以开启 codex cli 和 claude cli」*
- **前置 spike**：**Spike G 已通过**（`spikes/FINDINGS.md`），三问全验
- **写法**：沿用主规划的五项——**技术栈 / 成果 / 效果 / 来源 / 对标**

---

## 0. 判据

> **① claude 与 codex 都能在对话框里说话：我打一句，它答一句，多轮记得上文。**
> **② 它们干的活落在账本上——工具调用是 Run，不是一团字节。**
> **③ 终端还在，且是通用的：能跑任意命令，也能手动起 claude / codex 的 TUI。**

判据 ② 是这一阶段真正的收获，理由见 §2。

---

## 1. 这不是「换个界面」

现在 claude / codex 走 PTY 托管，我们拿到的是**终端字节流**。于是：

```
账本里的一个 claude 会话  =  一条 pty_session Run
                            它读了什么、改了什么、花了多少 —— 一概不知道
```

**不是我们没记，是拿不到**：ANSI 字节流里没有「工具调用」这个概念。

Spike G 实测的结果是两个 CLI 都能吐**结构化事件**：

| | claude | codex |
|---|---|---|
| 非交互 + 结构化 | `--print --output-format stream-json` | `exec --json`（JSONL） |
| 事件类型（实测） | `system` `assistant` `rate_limit_event` `result` | `thread.started` `turn.started` `item.completed` `turn.completed` |

于是它们的工具调用、消息、用量**可以落进我们已经有的那一套**——transcript、`tool_call:<工具名>` 的 Run、变更 pane、成本栏、chip 组。

> **不变式 3「没有不可见的行动」与不变式 5「产出从 git 事实算」，第一次能覆盖外部 CLI。**

**所以本阶段的价值排序是：② > ①。** 对话框是作者要的形态，账本是这个形态换来的东西。

---

## 2. 依赖决策：我们坐在哪一层（规格 §4）

**① 具体到导出符号** —— 这里没有可 import 的符号，坐的是**两个 CLI 的命令行契约**：

```
claude  --print --output-format stream-json --input-format stream-json --verbose
codex   exec --json  /  exec resume <thread_id> --json
```

**② 放弃了什么**

- **放弃 PTY 托管作为 claude/codex 的默认形态**。代价：拿不到 TUI 的交互能力
  （斜杠命令、TUI 里的审批面板）。**但 PTY 没有被删**——它作为通用终端保留（判据 ③），
  想要 TUI 就在终端里手动起。
- **放弃「一个抽象吃掉两个 CLI」**。Spike G 实测：claude 是长驻进程 + stdin 流，
  codex 是一轮一进程 + `thread_id` 续接。**先承认它们不一样**，否则会写出一个
  「对一边天然、对另一边别扭」的接口。
- 放弃自己实现 agent 循环（那是 CLI 自己的事，我们只驱动与翻译）。

**③ 不变式挂在哪个钩子上**

- **不变式 3**：CLI 的每个工具调用事件 → 一条 `tool_call:<工具名>` Run，
  `parent_run_id` 指向那一轮。**挂点是事件翻译层**，与 native 走同一个 `AgentEvent`。
- **不变式 5**：CLI 在工作区里改的文件，仍由 `ProvenanceProbe` 从 git 算。
  **不听 CLI 声明改了什么**——它的事件里即使带文件名也只作参考。
- **规格 7.5**：**stderr 非空不等于失败**（Spike G 第 3 条）。codex 每轮都往 stderr
  打 `models cache` 与 `HTTP 502` 的噪声而退出码为 0；把它当失败会让每一轮都误报。

---

## 3. 一处必须先说清的形状差异

```
claude:  一个进程 ──stdin(stream-json)──> 多轮
                └── 进程活着 = 会话活着

codex:   一轮一个进程；thread_id 由第一轮的 thread.started 给出
                └── 进程死了 ≠ 会话结束
```

**后果三条**：

1. `sessions` 表要加一列存 `thread_id`（codex 用）。**它是会话记录，不是内存状态**——
   丢了等于会话断了。
2. **「会话存活」的语义对两者不同**。claude 可以用进程存活判断；codex 不能，
   它平时根本没有进程。会话状态必须由**我们的记录**决定，不是由进程决定。
3. 中止（abort）的实现不同：claude 杀进程或发中断；codex 杀当前那一轮的进程。

**不要用一个 `CliRuntime` 把这两件事糊在一起。** 结构上应当是：
一个 `CliRuntime` + 两个 `driver`，driver 的接口按**能力**定义
（`startTurn` / `abortTurn` / `close`），而不是按进程生命周期定义。

---

## 4. 批次划分与依赖

```
批次 1  协议与配置    C1 新增 kind: cli（三处 enum + AgentDef + 版本 2.3 + mock）
批次 2  驱动          C2 claude driver → C3 codex driver（含 thread_id 落库）
批次 3  账本接线      C4 CLI 事件 → AgentEvent → Run（判据 ②）
批次 4  形态归位      C5 默认配置换血 + shell agent + 界面分支
批次 5  验            C6 e2e（真起 CLI，或用可控的假 CLI —— 见 §6）
```

**三条硬依赖**

- **C1 必须最先**：`kind` 是可辨识联合的判别式，后面每一层都按它分支。
- **C4 依赖 C2**：没有真事件流，账本接线只能对着想象写。
- **C5 排在最后**：换掉默认配置意味着作者下次打开就是新形态，
  **在 C6 验过之前不换**——否则一次失败的升级会让他连旧的都用不了。

---

## 5. 各 Task

### C1 · 协议与配置新增 `kind: cli`

- **技术栈**：zod（配置与协议校验，既有）
- **成果**
  - `config/schema.ts` 加第三个成员 `CliAgentSchema`：
    `{ kind: "cli", command, args?, capabilities }`
  - 协议三处 enum（`entities.ts` / `operations.ts` / `events.ts`）加 `"cli"`，
    **版本 2.2 → 2.3**（纯新增，minor）
  - `scripts/mock-inference-server.mjs` 侧补 mock 分支（准入规则 ①）
- **效果**：后面每一层都有一个明确的判别式可分支
- **对标 —— 不复用 `pty`**：形态像不等于语义同。`pty` 的语义是「字节流终端」，
  `cli` 的语义是「结构化事件的 agent」。**复用它会让「这个会话有没有终端」
  这个判断从此不可靠**——而界面正靠它决定画对话还是画终端。

### C2 · claude driver（长驻进程）

- **技术栈**：`node:child_process` spawn；NDJSON 解析（`subagent/executor.ts` 已有一份可借鉴的解析纪律）
- **成果**：`src/runtime/cli/claude.ts`。进程长驻，每轮往 stdin 写一条
  `{"type":"user","message":{...}}`，读 stdout 的 stream-json
- **效果**：判据 ① 的一半
- **来源**：Spike G 实测的命令行与事件形状
- **对标 —— 形状变了要出声**：CLI 会升级，事件形状会变。
  **认不出的事件类型必须计数并出声**（一条 notice），不能静默丢弃——
  静默丢弃的表现是「有时候少半句回复」，那是最难查的一类。

### C3 · codex driver（一轮一进程 + thread_id）

- **技术栈**：同上；`sessions` 表加 `cli_thread_id` 列（迁移）
- **成果**：`src/runtime/cli/codex.ts`。第一轮 `exec --json` 拿 `thread_id` 落库；
  之后每轮 `exec resume <id> --json`
- **效果**：判据 ① 的另一半
- **对标 —— stderr 不是失败**：Spike G 实测 codex 每轮都往 stderr 打错误而退出码为 0。
  **判定失败只看退出码与事件流**，stderr 只在真失败时作为诊断附带上去

### C4 · 事件翻译 → 账本

- **技术栈**：既有 `AgentEvent` 与 `RunRecorder`，不新增概念
- **成果**：CLI 事件 → `output` / `tool_start` / `tool_end` / `idle`；
  工具调用落 `tool_call:<工具名>` Run
- **效果**：**判据 ②**。变更 pane、成本栏、chip 组对 CLI 会话一并生效
- **不变式挂点**：不变式 3（每个工具调用是账本条目）
- **一处刻意不做**：**不拿 CLI 声明的文件名当产出事实**。产出仍由
  `ProvenanceProbe` 从 git 算（不变式 5）——**它说它改了什么，只作参考**

### C5 · 默认配置换血 + shell agent + 界面分支

- **成果**
  - `DEFAULT_CONFIG_YAML`：`claude` / `codex` 改为 `kind: cli`；
    **新增 `shell`（`kind: pty`，command `bash`）**
  - 界面：`kind === "cli"` 走对话视图（与 native 同一条）；
    `kind === "pty"` 走终端视图（①-B″ 刚做的那个）
- **效果**：判据 ①③ 同时成立
- **对标 —— 终端的定位**（作者原话）：*「终端就类似 codex app 的感觉，
  里面有一个终端，然后也可以执行任意的 Linux 的命令，也可以开启 codex cli 和 claude cli」*
  → 终端是**通用 shell**，不是某个 agent 的正脸
- **已存在的配置不覆盖**（`loadRegistryOrDefault` 的既有纪律）：
  作者机器上那份 `providers.yaml` 里 claude/codex 仍是 `kind: pty`。
  ~~必须给一条可执行的升级提示~~ —— **执行时改了主意，没做**：
  `kind: pty` 就该表现成终端，**那不是坏的，是他配置里写的那样**，
  没有违反「无静默回退」。为一个此刻只有一个人的迁移问题造通知机制是过度设计。
  改法写进了默认配置的注释（把 `kind: pty` 改成 `kind: cli`）

### C6 · e2e

- **成果**：一条真链路 e2e
- **关键取舍 —— 用真 CLI 还是假 CLI**：
  - 用真 claude/codex：验得最实，但把「装没装、登没登录、余额够不够」
    变成测试的前置条件。**红了分不清是我们坏了还是环境坏了**——
    这正是 ①-B″ 的 PTY e2e 选 `bash` 而不选 claude 的理由
  - **建议：写一个假 CLI**（一个吐固定 stream-json 的 node 脚本），
    形状照 Spike G 实测的事件类型。**真 CLI 的形状由 Spike G 负责，
    e2e 负责我们这一侧的接线**
- **另加**：一条 e2e 验判据 ③（终端里跑任意命令）——①-B″ 已有 `pty-session.spec.ts`，
  改成用 `shell` agent 即可

---

## 6. 本阶段明确不做

- ❌ **headless 下的权限/审批**。两个 CLI 在无人值守时怎么放行工具调用，
  Spike G **没有验**。它与阶段 ④ 的授权门是同一件事，**必须单独 spike**，
  不在这里顺手决定
- ❌ 逐 token 增量（`--include-partial-messages`）—— 先做整条消息，
  增量是体验优化不是能力
- ❌ codex 同一 thread 的并发 —— 应当不行，但没验；先按串行做
- ❌ 把 CLI 的斜杠命令搬进界面

---

## 7. 风险与它的防线

| 风险 | 防线 |
|---|---|
| CLI 升级改了事件形状 | 认不出的事件**计数并出声**（C2），不静默丢 |
| codex 的 stderr 噪声被当成失败 | 判定只看退出码与事件流（C3），有实测依据 |
| 两种多轮语义被糊成一个抽象 | driver 接口按**能力**定义，不按进程生命周期（§3） |
| 作者已有配置仍是旧形态 | **收口时改了主意：不做迁移提示**（见 §9 欠账 4）。`kind: pty` 就该表现成终端，那不是坏的 |
| 「会话存活」对 codex 无意义 | 会话状态由我们的记录决定，不由进程决定（§3） |

---

## 8. 每个 Task 的纪律（不变）

先写失败的测试并确认 **FAIL** → 写实现确认 **PASS** → 全量 `npm test` + `npm run typecheck` + `npm run build` → **真机验证一次** → `DEVELOPMENT_HISTORY.md` 顶部追加条目 → `git commit`。**不 push，不加 Co-Authored-By。**

三条准入规则见 `CLAUDE.md`，其中最要紧的一条：**写「测试绿了」不等于「能用了」。**

---

## 9. 收口对账（2026-08-09）

**五个批次全部完成。** 逐条对 §0 的三条判据，**每条指向具体的验证手段**。

### 判据 ① claude 与 codex 都能在对话框里说话，多轮记得上文

| 子句 | 落在哪 | 怎么验的 | 判定 |
|---|---|---|---|
| claude 能说话 | C2 长驻进程 + stream-json | **e2e 跑构建产物**：打一句答一句，**且是对话视图不是终端** | ✅ |
| claude 多轮 | 一个进程连喂多轮 | 单测用假 CLI 起真进程，**进程内计数器证明是同一个进程** | ✅ |
| codex 能说话 | C3 一轮一进程 | **e2e 跑构建产物** | ✅ |
| codex 多轮 | `exec resume <thread_id>` | **e2e**：假 CLI 在回复里标「首轮」/「续接」，第二轮必须是「续接」 | ✅ |
| 重开应用后接得上 | `thread_id` 落库（schema v5） | **e2e 直接查库**断言 `cli_thread_id` | ✅ |

**为什么多轮这条要专门设计断言**：不带 `resume` 的话每轮都是全新对话，
**而它看起来一切正常**——每轮都答得出话，只是不记得上文。
**那种坏法最难被发现**，所以假 CLI 必须让「有没有续接」可断言。

### 判据 ② 它们干的活落在账本上——工具调用是 Run，不是一团字节

| 子句 | 怎么验的 | 判定 |
|---|---|---|
| claude 的工具调用落 Run | **e2e 查库**：`tool_call:Read` 挂在 `agent_turn` 下、状态 `completed` | ✅ |
| codex 的工具调用落 Run | **e2e 查库**：`tool_call:command_execution` | ✅ |
| 对话里看得见 | e2e 断言 `.tool` 含工具名 | ✅ |

**这一条是本阶段真正的收获。** 走 PTY 时，一个 claude 会话在账本上只有一条
`pty_session` Run——**不是我们没记，是 ANSI 字节流里没有「工具调用」这个概念**。

### 判据 ③ 终端还在，且是通用的

| 子句 | 怎么验的 | 判定 |
|---|---|---|
| 终端还在 | C5 默认配置里的 `shell`（`kind: pty`，`bash -i`） | ✅ |
| 能跑任意命令 | **e2e 用发布出去的默认配置**：打 `echo …` 加回车，输出真的回显 | ✅ |
| 能手动起那两个 CLI | 它是一个真 bash，未单独设断言（**如实标注**） | ⚠️ |

**e2e 刻意走默认配置**，不自带 `providers.yaml`——验的因此是
「**新用户装好之后真的能开一个终端**」，而不是「我在测试里编的 shell 能用」。

### 四笔知情的欠账

1. **CLI 会话没有逐次溯源。** 工具在 CLI 自己的进程里跑，`ProvenanceProbe`
   挂不上去，那些 `tool_call` Run 上没有 `files_written`。
   按不变式 5，**缺省读作「不知道」，这正是实情**——与子 agent 那处同源，
   都要等阶段 ③ 的 worktree 隔离。
2. **headless 下的权限/审批没验。** 两个 CLI 在无人值守时怎么放行工具调用，
   Spike G 没碰。它与阶段 ④ 的授权门同源，**必须单独 spike**。
3. **`total_cost_usd` 拿到了但没接进成本栏。** claude 的 `result` 事件里有它，
   codex 没有。接它是下一阶段的事；**现在不接，也不拿 codex 的 token 估一个金额**。
4. **老配置不迁移。** `kind: pty` 就该表现成终端，那不是坏的。
   为一个此刻只有一个人的迁移问题造通知机制是过度设计。

### 一条贯穿本阶段的教训

**同一条规矩在一天里被我自己违反了两次**：C1 立下
「想让用户看见，就得在抛出的一侧显式声明」，C4 的 `CliRuntime.start()`
又抛了普通 `Error`，界面上再次变成 `操作 "createSession" 执行失败`。

> **一条要靠记性遵守的规矩，一天里就会被违反两次。**

修法不是更用力地记住，是把 `UserFacingError` 提到中立的 `src/errors.ts`——
**让它随手可取**。

### 规模（收口时）

**821 个单元与集成测试**（64 文件）+ **67 条 Playwright e2e**（含 8 张视觉基线）。
