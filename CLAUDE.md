# DAWN Science — 项目约定

面向在本仓库工作的 AI 助手。全局约定见 `~/.claude/CLAUDE.md`；这里只写本项目特有的。

---

## 文档入口

| 要找什么 | 去哪 |
|---|---|
| 目标、五条不变式 | `docs/superpowers/specs/2026-08-06-multi-agent-ds-workbench-design.md` |
| 阶段、决策门、风险 | `docs/superpowers/plans/2026-08-08-master-roadmap.md` |
| 当前阶段的执行计划 | `docs/superpowers/plans/2026-08-11-phase2b-remote-workspace.md` —— ②-A′ 已完成，当前是 **②-B 远端工作区** |
| 各阶段的详细计划 | `docs/superpowers/plans/` —— 文件名里的阶段号即为准 |
| **右侧坞**：文件（本地/远端）、传输、删除、审阅 | `specs/2026-08-17-远端文件与右侧坞-design.md` |
| **坞里第三格「网页」**：消息里的链接点开就渲染 | `specs/2026-08-18-网页预览-design.md` + `plans/2026-08-18-网页预览.md`（勾全打完） |
| **`@` 引用工作区文件**：路径 + 类型，不喂内容；一份识别语法（学自 dsh-at-file） | `specs/2026-08-23-at引用-design.md` · 解读在 `ccb_hive_code_learn/dsh-at-file-解读.md` |
| **给 agent 配一个浏览器**（走 MCP，不是我们写的） | `docs/怎么给-agent-配一个浏览器.md` · `specs/2026-08-18-agent的浏览器-design.md` |
| **接一个 ACP 适配器**（设置里那一格，2026-08-19 补的入口） | `specs/2026-08-16-acp-runtime-design.md` 最后一节 |
| **子 agent 名册**：22 份自带、三层、一份两用（学自 dsh-agency-agents） | `specs/2026-08-22-子agent名册-design.md` |
| **定时任务**：到点开一段全新会话跑任务说明（学自 dsh-automation） | `specs/2026-08-22-定时任务-design.md` |
| **会话归档**：藏不是删；删会话真删会话目录（学自 dsh-archive-manager） | `specs/2026-08-22-会话归档-design.md` |
| **技能管理**：三档开关写进 SKILL.md、导入、删除（学自 dsh-skills-manager） | `specs/2026-08-21-技能管理-design.md` |
| **权限三档**：全放行 / 问一句 / 拦下；硬拒清单；本会话产物（学自 dsh-auto-mode） | `specs/2026-08-23-权限三档-design.md` · 解读在 `ccb_hive_code_learn/dsh-auto-mode-解读.md` |
| **团队**：队长 + 可续聊成员 + 带依赖与 attempt 令牌的任务板（学自 dsh-agent-teams） | `specs/2026-08-22-团队-design.md` · 解读在 `ccb_hive_code_learn/dsh-agent-teams-解读.md` |
| **ACP agent 在服务器上干活**（claude 借手、codex 不借；分支 `acp-terminal`） | `specs/2026-08-20-acp-terminal-design.md` + `plans/2026-08-20-acp-terminal-T1.md`、`2026-08-21-acp-terminal-T2.md`、`-T3.md`（勾全打完） |
| **主题色**：外观里一键换色；活着跟主题色、对错固定红绿 | `specs/2026-08-23-主题色-design.md` |
| **外部文件附件**：粘贴/拖拽→发送才落盘→`@` 引用（学自 dsh-paste-input） | `specs/2026-08-25-外部文件附件-design.md` · 解读在 `ccb_hive_code_learn/dsh-paste-input-解读.md` |
| **Office 插件**：插件承载体 v1，四族 14 工具（学自 dsh-office） | `specs/2026-08-25-office插件-design.md` · 解读在 `ccb_hive_code_learn/dsh-office-解读.md` |
| **浏览器插件**：agent 的手伸进真浏览器，四族 15 工具（学自 dsh-reef） | `specs/2026-08-25-浏览器插件-design.md` · 解读在 `ccb_hive_code_learn/dsh-reef-浏览器-解读.md` |
| **agent 浏览器旁观**：坞「网页」格一格两子页签，旁观 agent 的 headless 浏览器 | `specs/2026-08-25-agent浏览器旁观-design.md` |
| **记忆**：三轨确认制长期记忆 + 技能沉淀，插件第三卡（学自 dsh-memory-evolve） | `specs/2026-08-25-记忆-design.md` · 解读在 `ccb_hive_code_learn/dsh-memory-evolve-解读.md` |
| **飞书通道**：远程助理第二格，设备流扫码建应用 + WS 长连接（学自 dsh-feishu/dsh-im） | `specs/2026-08-25-飞书通道-design.md` · 解读在 `ccb_hive_code_learn/dsh-feishu-im-解读.md` |
| 视觉与交互契约 | `docs/DESIGN.md` |
| 参考项目在哪、各自教什么 | `docs/REFERENCES.md` |
| 变更历史（最新在顶） | `docs/DEVELOPMENT_HISTORY.md` |

---

## 三条硬性准入规则

### 1. 新增协议操作，必须在同一次改动里补 mock 分支

`scripts/mock-inference-server.mjs` 与 e2e 夹具共用同一份假后端。新增一个操作
却不补它，界面在 mock 模式下就会悄悄偏离真实契约。

学自 Rho（`AGENTS.md`）：

> *"Every new Tauri command and visible state requires a deterministic mock handler
> … **in the same implementation package**. Otherwise UI review in browser mode
> quickly drifts away from the real contract."*

同理，**`npm run dev:mock` 与 `npm run test:e2e` 必须共用同一个 mock**——
两套 mock 会各自漂移，那时「本地是好的」就不再意味着什么。

### 2. 能判定的设计规则，配一个扫描测试

`tests/ui/design-contract.test.ts` 是它的家。新增一条可判定的规则时，
**在同一次改动里**加扫描。

Rho 与 Hermes 各自独立写下过同一条理由：*"Prefer automated enforcement over
remembered convention."*

**本项目已经证明过一次**：「不要用 `window.prompt`」是我自己写下的规则，
然后我自己违反了它，直到作者打开发现白屏。现在它有测试了。

### 3. 改了主路径，必须自己验证一次

单元测试证明不了「真的能用」。**419 个测试全绿的那一版，打开之后点什么都没反应。**

三种手段，按代价从低到高：

```
npm run test:e2e     Playwright 驱动真实构建产物（最有力）
npm run dev:mock     真链路 + 假模型，人肉看
一次性 Electron 探针  临时验证用，用完删掉
```

**写「测试绿了」不等于「能用了」。**

### 视觉基线的一条纪律

`e2e/__screenshots__/` 里那十张图归 `test:e2e:visual` 管。**红了先看 diff 图，再决定是不是重存。**

```
test-results/<用例>/<名字>-diff.png    ← 差异用红色标出来，先看这个
```

条件反射地 `--update-snapshots` 是这类测试唯一的死法：更新一次不痛不痒，
更新成习惯之后它就什么都不证明了。**它红了通常是对的**——
逐像素阈值是 0，颜色差一点点都会说话（这个值是试出来的，理由写在 `e2e/visual.spec.ts` 里）。

**`--update-snapshots` 缺省只重写比对失败的那几张**（2026-08-22 踩的）：容差以内的漂移永远存不进去。
`test:e2e:visual:update` 已改成 `=all`，别手敲不带 `=all` 的那句。

**重存之后必须再验一遍。** 某一张重存完仍稳定红（单跑也红）时，别再 update——把验证那一轮
`test-results/<用例>/<名字>-actual.png`（那是**稳定化之后**的帧）拷成基线，再验两遍（2026-08-22 命令面板那张就是这样救回来的）。（2026-08-10 踩的）`--update-snapshots` 写的是
**未经稳定化的那一帧**，而验证时 Playwright 会等两帧一致——批量重存有概率
写进一张坏基线，症状是「刚更新完就稳定失败」。

**外面世界的东西不进逐像素基线**：时钟、pi 的模型目录条数这类会自己变的，
一律 `mask` 掉。不遮的话它每过一分钟红一次，而那正是把人训练成
条件反射按 update 的最快方式。

---

## 常用命令

```bash
npm test              # 单元 + 集成（vitest）
npm run typecheck
npm run build
npm run test:e2e      # 先 build，再 Playwright（跑真实产物）
npm run test:e2e:only # 跳过 build
npm run test:e2e:visual         # 只跑视觉基线（10 张：五个屏 × 明暗）
npm run test:e2e:visual:update  # 改了样式之后重存基线
npm run dev:mock      # 真链路 + 假模型，隔离目录，不碰真实凭证与数据库
npm run app           # 构建并启动
```

---

## 几条容易踩的

- **依赖决策必须写明坐在哪一层**（规格 §4）：①具体到导出符号 ②放弃了什么
  ③我们的不变式挂在哪个钩子上。只写「使用 X」不算决策。
- **pi 是运行依赖，不是参考项目**。Hermes / Rho / wisp-science 是「读设计、不复用代码」；
  pi 是直接坐在上面。混淆这两者，下一步就会变成「学会了，自己写一个」。
- **看不见的能力等于不存在。** 2026-08-10 一天之内犯了两次：「新建项目」是个
  没有标签的 `＋`，删除键是 `opacity: 0` 的裸 `×`——两次作者的反馈都是「没有这个功能」，
  而两次代码都是好的。**悬停才出现的东西必须另有一个入口**（当前行常驻、命令面板、
  或者干脆带上文字）。注意 `toBeVisible()` 对 `opacity: 0` **仍然算可见**，
  要断言「看得见」得直接量 `getComputedStyle(el).opacity`。
- **失败必须出声**（规格 7.5）：不静默回退、不静默截断。截断要说清省了多少。
- **两处长得一样的东西，等于没有判据。** 2026-08-12 一天之内咬了三次：
  ①「空态」与「对话」的输入框占位符相同 → 用例把字打进了空态那张卡，
  界面一切换那句话就没了（**十几条 e2e 同时红，症状全是「发了没反应」**）；
  ②「取消」按钮与确认框同名 → `getByRole(name)` 指向两个元素；
  ③ 夹具替用例说了一句话 → 屏幕上两条一模一样的回复。
  **按名字/占位符找东西是子串匹配**——读屏、Playwright、人脑都一样。
  等待条件要挑**只有目标状态才有**的东西（`.conv-title` 而不是输入框）。
  设计契约里那条「没有一个按钮文案是另一个的子串」就是它的自动化形式。
- **缺失不等于相同，缺失也不等于支持**。默认值的选择才是要害。
- 界面状态按权威归位：`src/ui/state/` 的文件头有分家表。
  **持久化状态必须在 key 里声明作用域**——搞错作用域就是一个会话的东西渗进另一个。
