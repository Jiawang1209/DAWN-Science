# 桌面应用怎么写：从 Hermes / Rho / wisp-science 读到的

- **日期**：2026-08-08
- **状态**：待作者审核
- **触发**：作者三次打开 DAWN，三次发现界面不可用（无「新建会话」→ `window.prompt` 抛错致白屏 → 渲染进程无限循环吃满 4 GB）。作者的判断：**「你不要光靠你自己看的结果去推算，应该去读成熟项目的源代码。」**
- **参照**：`hermes-agent`（MIT，Nous Research，`apps/desktop` 为 Electron + React + Vite，**与 DAWN 同栈**，1,211 个 TS/TSX 文件、256,929 行）；`Rho`（MIT）；`wisp-science`（AGPL）
- **纪律**：规格 §3——**只读设计，不复用代码**。本文档记录的是原则与机制，不搬运实现。

---

## 0. 为什么这份文档必须存在

我今天的失败模式高度一致：**逻辑写得对，但看不见自己写的界面**，于是把「测试绿了」当成「能用了」。

三次全部由作者打开时发现，而不是由我发现。**根因不是不够努力，是缺机制。**
Hermes 的 `apps/desktop` 里正好放着我缺的每一样。

---

## 1. 我缺的三样机器

### 1.1 mock 推理服务器：让整条真链路能无密钥、确定性地跑起来

`apps/desktop/scripts/dev-mock.mjs` 的文件头写得很清楚：

> *启动一个本地 OpenAI 兼容服务器，返回一句写死的回复，写出隔离的 config.yaml + .env，
> 然后用它们启动**已构建的 Electron 应用**。*
>
> ***这复用了 E2E fixtures 里的同一个 mock-server**（`e2e/mock-server.ts` + `fixtures.ts`），
> 所以本地开发与 CI 测的是同一条链。*

**这才是解药，而且和我原先想的不一样。**

我上一条说要做「UI 的 mock bridge」——那是**把 UI 从后端摘下来单独看**。
Hermes 的做法相反：**整条真链路照跑，只把最外面那个不确定的东西（模型）换成确定的**。

差别是决定性的：
- 摘掉后端 → 我看到的是 UI 的幻觉，接线错了照样看不出来（**这正是我三次翻车的根因**）
- 换掉模型 → 协议、IPC、事件流、渲染全都是真的，只有回复内容是固定的

> **`npm run dev:mock` 之所以有价值，是因为它跑的是真东西。**

### 1.2 Playwright 打真实的包，驱动真实的点击

`apps/desktop/e2e/` 有 18 个 spec，`test:e2e` 先 `npm run build` 再跑。
其中一个叫 **`launch-packaged-app.spec.ts`**——**连打包产物本身都测**。

spec 的清单本身就是一张「桌面 agent 应用真正会坏的地方」的地图：

```
boot.spec / boot-failure.spec          启动与启动失败
chat.spec                              主路径
onboarding.spec                        首次使用
sidebar-states.spec                    侧栏各状态
correction-session-switch.spec         切会话
large-session-resume.spec              大会话恢复
interim-messages / hidden-history      流式中间态、隐藏历史
queue-turn-boundary                    回合边界
session-compression-and-queue-stop     压缩与停止
right-pane.spec                        右栏
submit-drift.spec                      提交漂移
```

**我这边对应的覆盖是零。** 我的 UI 测试全在 jsdom 里渲染叶子组件。

还有 `test:e2e:visual` + `--update-snapshots`——视觉快照。

### 1.3 两份文档，两种维护规则

`DESIGN.md`（视觉与交互契约）开头就区分了两类内容：

> - **原则**（扁平、意图、反馈、动效、可取消）是**耐久的**，组件来来去去它们不变
> - **具名契约**（token、`Button` 变体、primitive 名字）是设计系统当下的 API，
>   **与代码一同维护**：改了 primitive 就在同一次改动里更新本文件——
>   **本文件里一个过时的名字就是 bug，和一个过时的类型一样。**

`AGENTS.md` 管架构、状态、resolver、传输、测试。

**我这边 UI 没有任何设计契约文档**，于是每次都从「应该像 Claude app」重新猜。

---

## 2. 它把我今天的三次事故都写成了原则

这一节是本文档最扎心的部分：**我踩过的坑，人家早写在纸上了。**

| Hermes 的原句 | 我今天撞的 |
|---|---|
| *"Preserve reference identity on no-ops. 把一个内容相同的新数组交给 React，会让昂贵的树白重渲染一遍。"* | `App({ client = createClient() })` 默认参数每渲染一次造一个新 client → effect 全部重跑 → **无限循环，18 秒吃满 4 GB** |
| *"Reserve the full-screen boot/connecting experience for a genuinely unusable backend."* | 我把「没有项目」做成了准入门槛——**后端完全可用，界面却什么都不让做** |
| *"Chat is the home surface."* | 我第一版把统计面板做成首页 |
| *"Expensive, stateful surfaces (terminals, live tools) stay alive when hidden. **Visibility is not lifecycle.**"* | 我的 `TerminalDock` 收起时直接卸载 xterm——**终端状态随之丢失** |
| *"Switching context is a re-home, not a reboot."* | 我切会话时 `setItems([])` 清空重来 |
| *"The states around loading are distinct experiences — empty, loading, reconnecting, degraded/stale, exhausted-recovery **各自都该有自己诚实的文案和自己的出路**。"* | 我只有「有数据 / 没数据」两态 |

> **第一条尤其值得记**：我把它当成一次 React 使用失误，而 Hermes 把它写成状态管理的一条基本纪律。
> **同一个错误，在有纪律的地方是被预防的，在没纪律的地方是被用户发现的。**

---

## 3. 值得采纳的架构原则

### 3.1 「按权威决定状态归属」

> *任何一处状态的第一个问题是**谁有资格对它是对的**，而不是放哪儿方便。*
>
> - **后端**对「别的界面也能改的东西」有权威 → 渲染进程的副本只是缓存
> - **Electron** 对机器与运行时事实有权威
> - **渲染进程**只拥有纯属本窗口呈现的东西

DAWN 已经有类似分层（协议/主进程/渲染进程），但**从没这样明确表述过**。
它还有一条我们完全没有的：

> *持久化的状态必须在自己的 key 里声明作用域：这是全局的，还是属于某个连接、
> profile、会话、项目、窗口？**搞错作用域就是一个 profile 的设置渗进另一个的方式。***

### 3.2 「服务端真相是缓存，不是所有物」

六条，每条都能直接用：

1. **合并，不要覆盖**——刷新是新信息叠加，不是可以丢掉活跃行的替换
2. **先乐观，再诚实**——直接操作立刻画，写失败要**可见地回滚**，权威刷新有最终解释权
3. **提防过去**——异步结果会乱序，**过期响应绝不能覆盖更新的意图**（世代计数器、请求令牌）
4. **隔离前台**——只有用户正在看的界面可以往共享视图里发布
5. **合并噪音，放行信号**——高频装饰性更新批处理，但**终态转换（回合结束、需要输入、失败）必须立刻到达用户**
6. **无变化时保持引用同一**

> 第 3 条我们只做了一半（App 里用 `watching.current` 核对迟到结果），第 1、5、6 条完全没有。

### 3.3 「切换上下文是换个家，不是重启」

三种切换形状，混淆是经典 bug：软重置（清空 gateway 绑定的 store 后重连）、硬重置（窗口重载）、活动 profile 切换（**列表合并而非清空**）。

> *把软的当硬的做，应用会闪；把硬的当软的做，会留下过期的行。*

### 3.4 关于「项目」——我错的不是有它，是把它变成了门槛

Hermes 的 DESIGN.md 明确写：

> *"**Projects own workspace cwd.** Use Sidebar → Projects for local folders and worktrees;
> do not reintroduce a per-session/right-sidebar folder-picker flow."*

**它也有项目，也让项目持有 cwd，也放在侧栏。**
所以 DAWN 的项目模型没错——**错的是我让它成了「不选就什么都干不了」的前置条件**。

Hermes 的 `onboarding.spec.ts` 说明它有专门的首次使用流程。**门槛的正解是 onboarding，不是禁用一切。**

---

## 4. 具体技术选择（可直接借鉴的判断）

| 它用了什么 | 解决什么 | 我现在怎么做的 |
|---|---|---|
| `use-stick-to-bottom` | 流式输出时的贴底滚动 | 手写 `scrollIntoView`，jsdom 里还得包一层可选调用 |
| `streamdown` + `shiki` + `katex` + `mermaid` | 流式 markdown、代码高亮、公式、图表 | `<pre>` 纯文本 |
| `@xterm/*` **五个 addon**（fit / serialize / unicode11 / web-links / webgl） | 终端：尺寸、**序列化（恢复用）**、CJK 宽度、链接、GPU 渲染 | 只用了 fit |
| `nanostores` + `@tanstack/react-query` | 小 store 归属特性；请求型数据归查询层 | 全部塞在 `App.tsx` 的 `useState` 里 |
| `@assistant-ui/react` | 成套的对话界面 primitives | 自己写 |

> **`@xterm/addon-serialize` 值得单独说**：它能把终端状态序列化出来。
> 这正是「终端隐藏时不该卸载」与「大会话恢复」的实现基础——
> 而我连问题都还没意识到。

---

## 5. 结论：接下来做什么

### 5.1 先补机制，再碰界面

**顺序不能反。** 机制没有，改界面就还是「我猜、你看、你否」的循环。

1. **mock 推理服务器**：本地 OpenAI 兼容服务，返回固定回复；隔离配置；启动**真实构建产物**。
   **与 e2e 共用同一个 mock server**——这是 Hermes 明确写下的理由：本地开发与 CI 测同一条链。
2. **Playwright e2e**：先覆盖四条——`boot`（起得来）、`chat`（说一句看见回复）、
   `sidebar-states`（各状态）、`session-switch`（切会话不丢历史）。
3. **`docs/DESIGN.md`**：DAWN 自己的视觉与交互契约，按 Hermes 的两分法维护
   （原则耐久 / 具名契约与代码同步，**过时的名字算 bug**）。

### 5.2 然后是这些确定要改的

- **删掉「必须先打开项目文件夹」的门槛**，默认工作区 + onboarding
- **终端隐藏时不卸载**（visibility ≠ lifecycle）
- **切会话改为 re-home**，不是清空重来
- **加载态拆成五种**，各有诚实文案与出路
- 流式 markdown / 代码高亮
- 状态从 `App.tsx` 的 `useState` 堆里拆出去，按权威归位

### 5.3 一条给自己的验收纪律

抄 Hermes 的「交付前的品味测试」，改成 DAWN 版，放进 DESIGN.md：

> 交付界面前必须能回答：
> - 每处状态是否住在它的权威方那里？
> - 后台事件会不会抢走前台或焦点？
> - 异步失败之后，界面是否仍然可用、是否有下一步？
> - **我自己打开看过了吗？**（前三次我都没有——这是最便宜也最有效的一条）

---

## 6. 需要作者定的

1. **要不要引入 `@assistant-ui/react` 这类对话 UI 库？** 引入省很多事，但它会决定对话区的形态，且是又一个「坐在哪一层」的决策——按规格 §4 的纪律，得先写明层与放弃项。
2. **Playwright 进 devDependencies 可以吗？** 它会拉一个浏览器二进制（体积可观）。
3. **`docs/DESIGN.md` 的参考视觉基准哪来？** wisp-science 用截图对比，但那要有参考图。DAWN 目前没有设计稿——是先按原则做、以后再补基准，还是你给一个参考对象？
