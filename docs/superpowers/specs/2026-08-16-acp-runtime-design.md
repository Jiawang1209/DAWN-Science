# ACP 运行时（claude / codex 作为一等 agent 接进来）

> 2026-08-16 起 · 分支 `acp` · 状态：**A1–A5、路线 C、路线 B 本体与 B′ 全部完成**

## 做到哪儿了（2026-08-17 收尾）

| 期 | 内容 | 状态 |
|---|---|---|
| **A1** | 起适配器、握手、开会话、流式转录 | ✅ `0bc6dd6` |
| **A2** | 权限卡（选项**由 agent 给**，我们原样渲染） | ✅ `a7c46dd` `95655e1` |
| **A3** | 取消 / 会话开关 / 会话恢复 | ✅ `08d6cdd` `faea7f4` `0b20ff0` |
| **A4** | token 进「用量」，且分得出是谁 | ✅ `ab10fd5` |
| **A5** | 运行时标签（`API` / `CLI` / `ACP`） | ✅ 在 A1 顺手做掉 |
| **B1·C** | 外部 agent 干的活也产出文件事实（从 git 反推） | ✅ `422b72a` |
| **B1·B** | 把我们自己的工具作为 MCP 递给它（网关 + MCP 服务器 + 记账） | ✅ `7acbc78` |
| **B1·B′** | `dawn_run_in_kernel`（第四件工具） | ✅ `18b868f` |
| **真机** | 拿真 codex / claude 适配器接一次，按结果修 | ✅ 待回填（见下） |

协议从 7.0 走到 **7.4**（会话种类 `acp` → 权限询问 → 会话开关 → `silentTurns`）。

### 路线 B 本体：已经通了（`7acbc78`）

```
ACP agent ──stdio/MCP──▶ scripts/dawn-mcp-server.mjs ──socket+令牌──▶ 网关 ──▶ DAWN ──▶ 账本
```

四件工具给了三件（技能 ×2、溯源、记一笔）。**一个文件工具、一个 bash 工具都没给**
——它自己就有，再给一份只是多一个重复实现。

**每一次调用落一条 Run，父账挂在那一轮 ACP 回合上**——这就是与 wisp
那套能力网关的实质区别：我们不是在裁剪能力（裁不动，它有自己的 bash），
**是在延伸账本**。

### B′：第四件工具也给了

`dawn_run_in_kernel` 让外部 agent 跑进**我们起的解释器**。它凭什么值得给：

| | 它自己的 bash | 这条路 |
|---|---|---|
| 变量留得住 | 不——每次一个新进程 | 留得住，一段 ACP 会话配一段内核 |
| 输出 | 一坨 stdout | 分得出 stdout / stderr / 报错 / 图 |
| 环境证据 | 没有 | 有，账本上那条 Run 带着准入时的环境快照 |

三条实现上的定案：

1. **走 backend 的建会话路径，不直接 `sessions.create`。** 那条路上挂着环境快照、
   事件接线、记账员、git 基线——自己 create 一下每样都要重接，而**漏掉哪一样都不出声**。
   于是这段内核会话与用户手建的完全一样，界面里也看得见。
2. **账本上记的是 `execute_python` / `execute_r`，不是 `agent_turn`。**
   这条路绕开了 `writeToSession` 那个入口，回合是我们自己开的——
   不开的话，环境快照与文件事实都没有地方可挂，而那正是这件工具存在的理由。
3. **只认声明了 `language` 的内核 agent，且没配就不摆这件工具。**
   一个只写了 kernelspec 名字的 agent，我们并不知道它是哪门语言，从名字上猜
   正是「跑在了另一个环境里而不自知」的来源；而摆一个「点了说没配」的工具，
   比不摆更坏——模型会围着它规划，然后在最后一步撞墙。

等法上有一条钉了判据：**要先 `busy` 再 `idle` 才算跑完**。订上去那一刻内核多半就是
idle 的（上一句刚跑完），见 idle 就收的话这一次一个字都收不到——而那看起来像
「这段代码没有输出」。超时同样出声：把已经出来的交出去，并说清等了多久。

---

## 拿真适配器接了一次（2026-08-17）

在此之前**整条链路从没跑过一个真适配器**——所有验证对面都是那台假 agent，
协议形状全靠读 SDK 类型定义。作者：*「拿真适配器来测试，接一下 codex 再接一下 claude。」*

两台都接上了，各真跑了一句。**下面这些数是量出来的，不是读来的。**

### codex（`@agentclientprotocol/codex-acp` 1.4.0，`agentInfo` 报 1.1.9）

| 我们的假设 | 结果 |
|---|---|
| `initialize` 那份参数 | ✅ 收下，`agentCapabilities.loadSession: true` |
| `configOptions` 的形状 | ✅ 5 个 select，扁平 options（没有分组） |
| setter 的参数名是 `configId` | ✅ **正好**——`optionId` / `id` 都回 `-32602` |
| 回复里带整份新开关 | ✅ 真的带 |
| `mcpServers` 那份 stdio 形状 | ✅ 收下（`env` 是 `[{name,value}]`） |
| usage 字段叫 `inputTokens` / `outputTokens` | ✅ 一字不差 |

回执：`usage: {totalTokens:22233, inputTokens:11214, cachedReadTokens:11008, outputTokens:11}`。
另有一条我们没消费的 `usage_update` 通知（我们读的是回执里那份，够用）。

它的 `configOptions` 里 `category` 依次是
`mode` / `collaboration_mode` / `model` / `thought_level` / `model_config`。

### claude（`@zed-industries/claude-code-acp` 0.16.2）

**三处与我们的假设不符，都是纸上验不出来的。**

#### 一、它没有 `configOptions`

`session/new` 只回 `sessionId` / `models` / `modes`，而
`session/set_config_option` 是 **`-32601` Method not found**。
它认的是 `session/set_model {modelId}` 与 `session/set_mode {modeId}`，
**两者都回空的 `{}`**（不带整份新开关）。

于是我们只读 `configOptions` 的做法，会让真 claude 接进来
**模型与模式菜单是空的**——而空菜单看起来像「这个 agent 不让换模型」。

**已修（路线甲，作者定的）**：缺哪一支就合成哪一支，setter 按来源分流。
一处**会咬人的不对称**：模型的键是 `modelId`，模式的键是 `id`。

#### 二、继承的环境变量能把它掐死

第一次跑，`session/new` 回的是：

```
-32603 Internal error | "Query closed before response received"
```

不是 fs 能力的问题（试过）。是宿主那层 Claude Code 的
`CLAUDECODE` / `CLAUDE_CODE_*` 一串变量——去掉就通。
会中招的场合很具体：**从一个 Claude Code 终端里 `npm run app`**。

**已修**：起适配器时滤掉宿主的会话身份（`滤环境`）。
`ANTHROPIC_*` 一个都不动——那些是凭据，剔了的表现是「登不上」，
与「没配 key」在屏幕上一模一样。

这一条是**在真适配器上验的**：把滤掉那一步拆掉，真 claude 当场又死。

#### 三、它不报 usage

`session/prompt` 的回执只有 `{"stopReason":"end_turn"}`。
我们「缺席不补 0」那条做对了，但代价是那些回合在「用量」那一屏上
**完全不出现**——而一屏「一切正常」的统计，比一个标着「不知道」的格子更容易骗人。

**已修**：`getUsage` 多一格 `silentTurns`（协议 7.4）。
措辞只能是**「没记到」**，不能是「这个适配器不报」——
本版之前的历史回合也落在这里，我们分不出这两者。

### 假 agent 也跟着长了一副新皮

`FAKE_ACP_LIKE_CLAUDE=1` 装成 claude 那种（没有 `configOptions`，
setter 回 `-32601`，`set_model`/`set_mode` 回空 `{}`）；
普通模式则照 codex 的样子**三样都给**。
一台假 agent 只演一种适配器的话，我们验的就只是那一种——
这一条是变异测试逼出来的：假 agent 不给 `models` 时，
「已有就不再合成」那道闸删掉也没人红。

---

## 为什么现在做这件事

作者：*「有没有什么正规的办法，可以让 cli 当成 API 嵌入到 dawn-science 去使用呢？
我看 wisp-science 里面是可以这样做的。」*

有，叫 **ACP**（Agent Client Protocol，agentclientprotocol.com，Zed 牵头，v1），
本地 stdio 上的 JSON-RPC。wisp-science 用的就是它（`docs/acp-agents.md` + `crates/wisp-acp`）。

**它不直接跑 `claude` / `codex`。** wisp 的文档专门写了一句：
*「不要在 ACP 表单里填 `codex`、`claude` 或 `claude -p`——那些 CLI 不是 ACP agent。」*
跑的是官方适配器（2026-08-16 查 npm，四个包都在）：

```
@agentclientprotocol/sdk               1.3.0    ← 客户端 SDK，我们用它
@agentclientprotocol/codex-acp         1.3.0
@agentclientprotocol/claude-agent-acp  0.68.0
@zed-industries/claude-code-acp        0.16.2
```

## 我们现在这条 `cli` 路少了什么

| | 现在的 `cli`（headless） | ACP |
|---|---|---|
| 会话 | 一次性进程，靠 `--resume` 接 | 一等公民，`initialize` / 新建 / `load` 恢复 |
| 权限 | **我们没有话语权**——它自己决定读写什么 | agent 报出它要什么、有哪几个选项，**界面原样渲染它给的选项** |
| 工具证据 | 只有它打印出来的文本 | 结构化 `rawInput` / `rawOutput` |
| 换模型 | 启动时定死 | 会话内广播可选项，界面出菜单 |
| 中止 | 杀进程 | `session/cancel` |
| token | claude 有（还带金额）、codex 有 | 有，但**实验性**（见下） |

## 三条已定（作者 2026-08-16）

### 一、`cli` 留着，但**运行时要标在模型旁边**

作者：*「cli 的路线我们可以保留，但是要在调用的时候，要在模型的旁边标记好是 cli。
那么 acp 的话，我们也要在模型的旁边标记好是 acp。」*

**同意，而且这不只是装饰。** 三条路的能力**真的不一样**：

- `native`：我们自己的工具，权限门管得住，token 与账本最全
- `cli`：外部进程，权限门**管不到**，token 有、模型名此前没记
- `acp`：外部进程，权限门管不到**但它会主动问**，token 实验性

**一个人看着同一个输入框，却在三种不同的规则下干活**——不标出来，
「为什么这次它没问我就删了文件」永远说不清。

补一条作者没提的：**标签不能是这件事唯一的说明处**。
「工具权限」那一屏已经写了「这道门管不到子 agent 与 MCP」，
ACP 进来之后那句话要再加一种情况——**能力的边界写在旁边，不写在文档里**。

### 二、token 合并统计（见下面第四条的注意事项）

作者：*「我觉得还是要放在一起，统一计算 token，毕竟它只是一个参考而已。」*

**同意**，但有一条**必须做对，否则它连参考都算不上**：

ACP 的 `Usage` 是**整个会话累计**的（SDK 类型注释原文：
`Sum of all token types across session` / `Total input tokens across all turns`），
**不是这一轮的增量**。照我们现在「每轮相加」的记法直接加，
一段十轮的会话会被算成十几倍。

所以：**存差值**（这一次的累计 − 上一次的累计），差值为负时（agent 重开了会话）从头算。
这条会有单元判据钉住。

另外 `Usage` 在 SDK 里标着 **UNSTABLE / experimental**（「不在规范里，随时可能改」）。
合并进总数没问题，但**运行时读不到这个字段时要如实缺席**，不能补 0——
那会让「这一轮没花 token」和「这个适配器不报」变成同一句话。

### 三、开分支 `acp`

符合本项目的规矩（带设计的改动开分支）。已开。

---

## 第四条：我们自己的工具怎么给 ACP 用——**我不建议照抄 wisp**

作者：*「能不能做出与 wisp 的另外一条路线和方式呢？实在迫不得已，我们再照抄。」*

### 协议这一侧是现成的

`newSession` 请求里有一个字段（SDK 类型定义，2026-08-16 读的）：

```ts
mcpServers: Array<McpServer>   // "List of MCP servers the agent should connect to"
```

**我们把自己做成一台 MCP 服务器递进去**，claude/codex 就能反过来调我们的东西。
我们已经有 MCP **客户端**了，缺的是反过来那一半。

### wisp 的做法（路线 A）

一个**能力网关**：`wisp_search_tools` / `wisp_use_tool` 这样的通用门面，
外加 `list_skills` / `run_in_context` / `get_research_graph` 等十来个。
理由写得很清楚：*「这是一个能力网关，不是把每一个内部对象都导出去。」*

### 我原本的担心是错的

我上一轮说过*「给 claude 的工具越多，它绕过我们那道权限门的路子也越多」*——
**这句话不成立**，而想清楚它为什么不成立，正是另一条路的出发点：

> **ACP 进程有它自己的 bash 和文件工具。** 它以我们的用户身份跑在我们的项目目录里，
> OS 权限就是全部权限。wisp 自己的文档也承认这一点。
>
> 也就是说：**它绕过权限门这件事，在我们递出任何一个工具之前就已经完成了。**
> 少给几个工具，一分钱安全都买不到。

反过来才是真的：**我们递出去的 MCP 通道，是唯一一条我们看得见、拦得住、记得下的路。**
它在那条路上做的每一件事，都会经过我们的手。

### 路线 B（推荐）：**只给「只有我们有」的东西，而且每一次调用都记账**

不做通用门面，**给具名工具、带真 schema**，一共四类：

| 工具 | 为什么值得给 | claude 自己能不能做 |
|---|---|---|
| `dawn_run_in_kernel` | 跑在**我们起的解释器**里，带环境快照 | 不能——它只有 bash，跑完没有环境证据 |
| `dawn_list_skills` / `dawn_use_skill` | 项目里的 Agent Skills | 不能——它读不到我们的技能目录约定 |
| `dawn_record_note` | 往账本写一条它自己的结论 | 不能 |
| `dawn_provenance` | 这个产物是哪一次 Run 出的 | 不能 |

**一个文件工具、一个 bash 工具都不给**——它自己有，给了只是多一份重复实现。

与 wisp 的**实质区别**（不是包装上的不同）：

1. **它不是能力裁剪，是账本延伸。** 每一次 `dawn_*` 调用都落一条 Run，
   `parent_run_id` 挂在那一轮 ACP 回合上，文件事实照旧从 git 算。
   于是**一个外部 agent 在我们项目里干的活，仍然产出完整的账本**——
   这正是 DAWN 的立身之本（不变式 5），而 wisp 的网关是围绕「能力范围」设计的。
2. **不做 `search_tools` / `use_tool` 这种门面。** 它省的是 schema 体积，
   代价是**账本上留下的是一句 `use_tool`，而不是「它到底调了什么」**。
   我们宁可多几个具名工具。
3. **权限门在这条路上真的管用**：`dawn_run_in_kernel` 走的是我们自己的执行路径，
   那道门拦得住。这是整件事里唯一拦得住的地方，不该浪费。

### 路线 C（如果想先跑起来）

**v1 不递任何 MCP**：ACP 会话就是「客人」，它干的活我们从外面记
（git 事实 + 转录）。最省事，也诚实，代价是它用不上内核与技能。

**建议**：先 C 后 B——ACP 本身（进程、会话、流、权限卡、取消）就够两三天，
把 B 压在同一批里会让第一次跑通的时间拖长，而**跑不通之前所有设计都是纸上的**。

---

## 分期

| 期 | 内容 | 完成的判据 |
|---|---|---|
| **A1** | `kind: acp` 运行时：起适配器、`initialize`、`newSession`、流式转录 | e2e：配一台 ACP agent，发一句，屏幕上出现回复 |
| **A2** | 权限卡：`requestPermission` → 界面渲染**它给的选项** | e2e：假 agent 报一次权限，点了哪个就回哪个 |
| **A3** | 取消 / 恢复 / 换模型（会话配置项） | e2e：跑起来按停止，`session/cancel` 真的发出去 |
| **A4** | token：**存差值**合并进「用量」 | 单元：累计值来三次，账本上是三个差值而不是三个累计 |
| **A5** | 运行时标签（`native` / `cli` / `acp`）标在模型旁边 | e2e：三种会话各看一眼，标签不同 |
| **B1** | 我们那台 MCP 服务器（路线 B 的四类工具） | e2e：ACP 会话里调一次 `dawn_run_in_kernel`，账本上多一条挂着父账的 Run |

**A1 之前先做一件事**：一台**假 ACP agent**（几十行的 stdio JSON-RPC 应答器），
放进 e2e 夹具。理由与那台假模型服务器一模一样——
真适配器要联网、要登录、要几十兆的 `npx`，
**而它假的只该是「另一端是谁」，不该是协议本身**。
