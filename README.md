<div align="center">

<img src="packaging/icon.png" alt="DAWN Science — R + Python" width="128" height="128">

# DAWN Science

**Data Agent Workbench with Notebooks — for science.**

An open-source, local-first AI workbench where multiple agents collaborate with you on R and Python data science.

[Download](#install) · [Run from source](#run-from-source) · [Docs](#documentation) · [中文](#中文)

</div>

---

## What it is

An **open-source, local-first desktop environment for research work**. You talk to a model; the model runs Python / R in a **persistent kernel** — variables remain across executions while that conversation’s kernel is running — and you can keep typing into the same kernel from a notebook pane, with your cells recorded in the conversation. A project is a folder; a server becomes a remote workspace over SSH, without installing a DAWN service. Remote Python/R execution uses the interpreters and kernel packages configured on that server.

**The idea:**

```
question  →  plan  →  call tools  →  run  →  traceable result
```

The goal is to make the result **inspectable: what ran, which files it used, and what was actually checked**.

**Domains:** data science · ecology · environmental science · bioinformatics

<!-- TODO: real screenshot at docs/screenshot.png -->

---

## The name

| | |
|---|---|
| **D** | **Data** |
| **A** | **Agent** |
| **W** | **Workbench** |
| **N** | **Notebook** |

*Data* (inside the acronym) + *Science* (the product name) spell **data science**; *Science* also covers ecology, environmental science and bioinformatics.

---

## Install

Download from [Releases](https://github.com/Jiawang1209/DAWN-Science/releases). **This is an early build (0.0.x): macOS uses ad-hoc signing without Developer ID notarization, and Windows installers are not Authenticode-signed**, so the first launch takes one extra click:

| Platform | Install | First launch |
|---|---|---|
| macOS | Open the `.dmg`, drag to Applications | Right-click → Open. On macOS 15+, also go to *System Settings → Privacy & Security* and click *Open Anyway* |
| Windows | Run `…-setup.exe`, or just run `…-portable.exe` | SmartScreen: *More info → Run anyway*. **Windows builds are not yet verified on a real machine** — please report what breaks |
| Linux | `chmod +x *.AppImage && ./DAWN-Science-*.AppImage`, or `sudo dpkg -i *.deb` | AppImage needs `sudo apt install libfuse2` |

**First launch** walks through four compact, centered cards with the workbench blurred behind them: meet DAWN Science, explore its features, connect an AI model, and optionally connect R/Python interpreters. Choose 中文 or English in the guide; that preference also applies in the workbench. DeepSeek is selected initially. Switching providers fills in their default API URL; you can edit the URL and key, or use a custom service; catalog URLs and common endpoint paths help identify the connection. You can specify a model ID and protocol for custom services, test connectivity before saving, and see validation errors on the same page. Interpreter setup can be skipped and completed later in Settings → Kernel.

**The app itself does not need Node.js.** External tools are only needed for the features that use them, and the UI says so when one is missing:

| To do this | You need |
|---|---|
| Notebook / run Python | Python 3 + `pip install ipykernel` |
| R kernel | R + `IRkernel` |
| Git facts about a project | git |
| Remote workspace | SSH access; Python/R execution also needs the corresponding interpreter and `ipykernel` / `IRkernel` on the server. No DAWN service is installed |
| Hand work to Claude Code / Codex | The respective CLI installed locally (nice-to-have; chat works without it) |

---

## Features

| | |
|---|---|
| **Kernel in the conversation** | The model calls `run_code`; you watch every cell stream by in the dock's *Notebook* pane, type into the same kernel yourself, and your cells land in the conversation |
| **Persistent kernels** | Variables remain across cells and view switches while the kernel is running. Stopping the conversation/kernel or quitting DAWN ends local kernel memory |
| **Remote workspaces** | SSH files, terminals, transfers and configured Python/R kernels, without a DAWN service on the server |
| **Project information** | Hover over a sidebar project or choose *Project information* from its menu to see the directory, conversation count and five recent conversations; select one to open it |
| **Right dock** | Files (local / remote), transfers, notebook, generated artifacts, web preview, watching the agent's browser |
| **`@` references** | `@` a workspace file in the input box — path and type are passed, not contents |
| **Multi-agent** | Bundled sub-agents, reusable Bots, resumable team members and dependency-aware tasks; review a proposed arrangement before approving execution |
| **Research workflows** | Versioned recipes for tabular ecology and figure reproduction; check → analyze → independent review, with input versions, executable acceptance checks and explicit blocked/revision states |
| **Professional Bots** | Manage reusable native/API assistants in the Bot dock, chat privately within a workspace, dispatch with `/`, discuss in one shared chat with individual avatars and bubbles, follow up with peers, hand off work and accept user intervention, or let the main conversation form a team and collect verified scripts, notes and figures with inline previews |
| **Three permission levels** | Allow all / ask / block, plus a hard-deny list |
| **Skills & plugins** | Skills with three-level toggles, local import and [public GitHub discovery / pinned installation](docs/skills.md); Office (Word/Excel/PowerPoint/PDF), browser and long-term memory (three-track confirmation) plugins |
| **Remote assistant** | WeChat / Feishu channels — scan a QR code, keep asking from your phone |
| **Scheduled tasks** | At the set time, open a fresh session and run the task description |
| **Artifacts & evidence** | Generated-file previews plus task/tool evidence, input/output fingerprints, acceptance details and retained historical copies where available |
| **File rewind** | Preview and restore tracked workspace file changes from a conversation turn; raw data and approved plans are excluded, and files outside retention limits are reported |
| **Scientific sources** | Optional OpenAlex, Crossref, GEO, SRA and UniProt plugins for literature/data lookup and saving records actually returned by those sources |
| **App updates** | Check for releases in Settings → About; supported packaged installations can download, install and restart. Portable Windows and Linux deb installations use manual updates |
| **Any provider** | Through `pi`'s provider layer; or switch to a locally installed Claude Code / Codex (ACP) |
| **Appearance** | Light / dark, one-click accent color, Chinese / English UI |

---

## Four pillars

### D · Data

Persistent Python and R kernels (variables kept across cells and view switches until the kernel stops; interruptible) · database connections and schema browsing · standardized artifact schemas (tables carry structure, charts carry data source and metric meaning, models carry hyper-parameters and evaluation metrics).

### A · Agent

An agent that plans, calls tools, executes and reports — not just chats. By default a local agent loop drives any API endpoint (DeepSeek / Kimi / Qwen …); it can also hand off to a locally installed Claude Code or Codex. MCP tool gateway · progressive skill loading · **optional multi-agent orchestration**. [MCP results, cancellation and recovery](docs/mcp.md).

### W · Workbench

A project is bound to a folder; configuration, knowledge and kernels hang off the project · local / WSL / SSH / GPU runtimes · run management for long jobs (pre-flight checks, heartbeats, bounded logs, environment snapshots).

**Key structure: the conversation and notebook share a live kernel.** Switching views keeps its variables available. Stopping the conversation/kernel or quitting DAWN closes local kernels; save scripts and outputs to reproduce the analysis after restarting.

### N · Notebook

Conversation, notebook and side-by-side view are **three projections of one append-only entry sequence, not three implementations**. `code_cell` is a first-class citizen: re-runnable, editable, exportable to `.ipynb`, and cells written by a human are structurally identical to cells written by the agent.

---

## Core claim: traceability

Two kinds of information are **modeled separately**:

| Layer | Content | Trust |
|---|---|---|
| **Agent claims** | what the agent says it did | to be verified |
| **Repo facts** | git diff, test exit codes, lint / build results | authoritative |

**State advances only when both agree**; a claim alone is never enough:

```
agent says "implemented", tests fail            → cannot enter DONE
agent says "reviewed", no review artifact       → cannot hand off
agent says "mergeable", diff ≠ plan             → back to REWORKING
```

---

## Status

**Early release (0.0.x), with interfaces still changing.** This README describes the current source checkout; an installed release may not include every change yet. Application updates and task evidence/version checks are implemented. Developer ID signing/notarization and Windows Authenticode signing remain unfinished.

| | |
|---|---|
| Validation | Vitest node/UI/kernel groups; Electron, real-kernel, visual and streaming-performance checks. See the dated [project audit](docs/validation/project-audit-20261112/README.md) and [project information validation](docs/validation/project-info-20261113/README.md) for actual results and limits |
| Platforms | Packaging targets macOS, Windows and Linux. Recent validation is primarily on macOS; packaging success does not establish Windows/Linux real-machine compatibility |
| Research evidence | Frozen task contracts, file fingerprints, host acceptance and independent review support inspection. A passed check is limited to its configured rules and does not certify scientific correctness |
| Real-model evaluation | A [bounded single-/multi-agent comparison](docs/validation/research-budget-300-20261108/README.md) completed both delivery paths on one synthetic task; it does not establish general quality, cost or speed gains |
| History | [Development history](docs/DEVELOPMENT_HISTORY.md) and [review records](docs/reviews/) document individual changes and verification |

---

## Run from source

Node.js 22.22.2+ (22.x), 24.15.0+ (24.x), or 26+.

```bash
git clone https://github.com/Jiawang1209/DAWN-Science.git
cd DAWN-Science
npm ci
cp .env.example .env        # add your API key (or do it in the first-run wizard)
npm run app                 # build and launch
```

Development:

```bash
npm run dev:mock            # real pipeline + fake model, isolated dir, never touches real credentials
npm test                    # unit + integration
npm run test:e2e            # build, then Playwright against the real build
npm run test:e2e:kernel     # kernel group in its own worker (requires an existing build)
npm run dist                # package for the current platform → release/
```

Command-line Agent (source build):

```bash
npm run build:cli
./bin/dawn --help
# Set DAWN_CONFIG and your provider's API key environment variable, then:
./bin/dawn
```

Normal is your existing Shell; `dawn` enters Agent, `/exit` returns. CLI uses its own data directory and environment credentials. See [CLI setup](docs/CLI.md).

Cross-compiling and Linux build deps: [打包与发布](docs/打包与发布.md).

---

## Stack

| Layer | Choice |
|---|---|
| Core | TypeScript / Node |
| LLM providers | `@earendil-works/pi-ai` (including DeepSeek / Kimi / Qwen) |
| Agent loop | `@earendil-works/pi-agent-core` |
| Kernels | `enchannel-zmq-backend` + `@nteract/messaging` + `spawnteract` (Jupyter protocol — one stack for R and Python) |
| Terminal | `node-pty` + `xterm.js` |
| Tool protocol | `@modelcontextprotocol/sdk` (server + client) |
| Persistence | SQLite (`better-sqlite3`, WAL) |
| Shell | Electron |
| Front-end | React + Vite · Streamdown / Shiki / KaTeX · xterm.js |

---

## Documentation

Most docs are in Chinese.

| Doc | Answers |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Where each feature's spec lives, the three admission rules, known pitfalls — **start here** |
| [Design specs](docs/superpowers/specs/) | What to build, why, and what never to build |
| [Master roadmap](docs/superpowers/plans/2026-08-08-master-roadmap.md) | Order of work, decision gates, risks |
| [Design contract](docs/DESIGN.md) | How the UI looks and why |
| [Reference map](docs/REFERENCES.md) | Which project to read for which component |
| [Skills](docs/skills.md) / [MCP](docs/mcp.md) | Configure extensions, tool results, cancellation and recovery |
| [Project audit](docs/validation/project-audit-20261112/README.md) | Dated local validation results and platform limits |
| [Packaging & release](docs/打包与发布.md) | How to package and install on a fresh machine |
| [Development history](docs/DEVELOPMENT_HISTORY.md) | Every change and its reason |

---

## Acknowledgements

These projects were studied during design. **Except `pi`, which is a dependency, all are read-only references — design was learned, code was not copied.**

| Project | What we learned |
|---|---|
| [pi](https://github.com/earendil-works/pi) | agent loop and provider layer (used as a dependency) |
| [Buzz](https://github.com/block/buzz) | process-group termination, context-recovery ladder, unified event stream, dual-protocol decoupling |
| [pi-crew](https://github.com/baphuongna/pi-crew) | GreenLevel grading, verification-environment hygiene, worktree practice |
| [ccb](https://github.com/SeemSeam/claude_codex_bridge) | provider adapter contract, completion contract |
| hive | team panel interaction (visual reference only) |

---

## License

[GNU Affero General Public License v3.0 or later](LICENSE)

```
Copyright (C) 2026  DAWN Science contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

**Why AGPL**: this is an open-source tool for research, and we want improved versions to stay open for everyone — including versions offered as a network service. 

Third-party dependencies (`pi` etc.) are MIT / Apache-2.0, compatible with AGPL.

---

<div align="center">

# 中文

**Data Agent Workbench with Notebooks — for science.**

开源的本地 AI 工作台：R 与 Python 数据科学，多智能体协作，面向科研。

</div>

---

## 这是什么

一个**开源、本地优先的桌面科研工作环境**。你在里面和模型对话，模型在**同一台内核**里跑 Python / R——该对话的内核运行期间，变量在连续执行之间保留；你可以在旁边的笔记本里接着敲，敲的记进对话。项目绑定文件夹，通过 SSH 使用远端工作区，不需要安装 DAWN 服务；远端 Python/R 执行使用服务器上配置的解释器和内核包。

**设计理念：**

```
问题  →  规划  →  调用工具  →  执行流程  →  产生可追溯结果
```

目标是让结果**可以检查：执行了什么、用了哪些文件、实际通过了哪些核验**。

**领域定位：** 数据科学 · 生态学 · 环境科学 · 生物信息

<!-- TODO：放一张真实使用的截图 docs/screenshot.png -->

---

## DAWN 是什么的缩写

| | | |
|---|---|---|
| **D** | **Data** | 数据 |
| **A** | **Agent** | 智能体 |
| **W** | **Workbench** | 工作台 |
| **N** | **Notebook** | 笔记本 |

`Data`（缩写内）+ `Science`（产品名）合起来是**数据科学**；而 `Science` 同时把生态学、环境科学、生物信息一并包住。

---

## 安装

去 [Releases](https://github.com/Jiawang1209/DAWN-Science/releases) 下载对应平台的包。**当前是早期版本（0.0.x）：macOS 使用 ad-hoc 签名，尚无 Developer ID 签名及公证；Windows 安装包尚无 Authenticode 签名**，第一次打开要多点一步：

| 平台 | 安装 | 第一次打开 |
|---|---|---|
| macOS | 打开 `.dmg`，拖进 Applications | 右键 → 打开；macOS 15 起要去「系统设置 → 隐私与安全性」底部点「仍要打开」 |
| Windows | 运行 `…-setup.exe`；或直接跑 `…-portable.exe` | SmartScreen：「更多信息 → 仍要运行」。**Windows 版尚未在真机上验证过**——哪里不对请反馈 |
| Linux | `chmod +x *.AppImage && ./DAWN-Science-*.AppImage`；或 `sudo dpkg -i *.deb` | AppImage 需要 `sudo apt install libfuse2` |

**第一次打开**通过桌面居中、背景虚化的四张卡片依次介绍产品、主要功能、API Key 和可选的 R/Python 计算环境。向导可切换中文或 English，选择会沿用到工作台。默认选择 DeepSeek 并自动填入地址，切换服务商时地址随之更新；仍可手动修改 API URL 和 Key；目录中的地址和常见接口路径帮助识别连接，自定义服务可以指定模型 ID 和协议。保存前可直接测试连通，保存仍会验证并显示原有错误提示。R/Python 路径可检测或手动填写，也可跳过，之后到「设置 → 内核」补充。

**软件本身不需要 Node.js。** 要用哪个功能才装哪样，缺了界面会明说：

| 要做什么 | 要装 |
|---|---|
| 笔记本 / 跑 Python | Python 3 + `pip install ipykernel` |
| R 内核 | R + `IRkernel` |
| 项目的 git 事实 | git |
| 远端工作区 | SSH 访问；运行 Python/R 还需服务器上对应的解释器及 `ipykernel` / `IRkernel`。无需安装 DAWN 服务 |
| 借用 Claude Code / Codex 干活 | 自己装好对应 CLI（锦上添花，不装不影响对话） |

---

## 有什么

| | |
|---|---|
| **对话里的内核** | 模型调 `run_code`，你在坞里的「笔记本」格看它的每个 cell 流过；在同一台内核里自己敲，敲的记进对话 |
| **持久内核** | 内核运行期间，变量在连续 cell 和视图切换之间保留，可中断；停止对话/内核或退出应用会结束本地内核内存状态 |
| **远端工作区** | 通过 SSH 使用文件、终端、传输和已配置的 Python/R 内核，无需在服务器上安装 DAWN 服务 |
| **项目信息** | 悬停侧栏项目，或点击「⋯ → 项目信息」，查看目录、会话数及最近 5 段会话，并直接打开会话 |
| **右侧坞** | 文件（本地/远端）、传输、笔记本、产物清单、网页预览、agent 浏览器旁观 |
| **`@` 引用** | 输入框里 `@` 工作区文件——喂路径和类型，不喂内容 |
| **多智能体** | 自带子 agent、可复用 Bot、可续聊团队成员及依赖任务；先查看安排方案，再批准执行 |
| **科研流程** | 版本化的生态表格分析与图表复现模板；核查 → 分析 → 独立审阅，绑定输入版本、宿主可执行验收及明确的阻塞/修正状态 |
| **专业 Bot** | 坞中管理固定职责助手、按工作区直接交流；主对话自动从已配置 Bot 组队，`/` 随时派单；成员在同一团队对话中追问/交接，用户随时插话；独立头像、名字、专业角色及消息气泡展示交流，汇总已核验脚本、说明及图表，成果可在消息内展开预览并用 × 收起。首版支持 native/API，ACP/CLI 不作为 Bot 成员 |
| **权限三档** | 全放行 / 问一句 / 拦下；硬拒清单 |
| **技能与插件** | 技能三档开关、导入及[公开 GitHub 发现与固定版本安装](docs/skills.md)；Office（Word/Excel/PPT/PDF）、浏览器、记忆（三轨确认制）插件 |
| **远程助理** | 微信 / 飞书通道，扫码接入，手机上继续问 |
| **定时任务** | 到点开一段全新会话跑任务说明 |
| **产物与证据** | 生成文件预览、任务与工具证据、输入/输出指纹、逐项验收详情，以及已有留存的历史副本 |
| **文件回退** | 预览并恢复一轮对话中跟踪到的工作区文件改动；原始数据与已批准方案除外，超出留存限制的文件明确提示 |
| **科研来源** | 可选 OpenAlex、Crossref、GEO、SRA、UniProt 插件，检索文献/数据并保存实际返回的记录 |
| **应用更新** | 在「设置 → 关于」检查新版；支持的打包安装可下载、安装并重启。Windows 便携版与 Linux deb 版需手动更新 |
| **多服务商** | 走 `pi` 的 provider 层；也可切到本机的 Claude Code / Codex（ACP） |
| **外观** | 明暗主题、一键换主题色、中英文界面 |

---

## 四个支柱

### D · Data

Python 与 R 持久内核（内核运行期间变量跨 cell 和视图切换保留，且**可中断**）· 数据库连接与 schema 浏览 · 产物 schema 标准化（表格附固定结构、图表附数据源与指标含义、模型附超参与评估指标）。

### A · Agent

能规划、调工具、执行、回报的 agent，而不只是聊天。默认走本地 agent loop 驱动任意 API 端点（DeepSeek / Kimi / Qwen 等），也可切换到本机安装的 Claude Code 或 Codex。MCP 工具网关 · Skills 渐进式加载 · **可选的多智能体编排模块**。[MCP 返回内容、取消与断线恢复](docs/mcp.md)。

### W · Workbench

Project 绑定文件夹，配置、知识与内核都挂在 Project 上 · 本地 / WSL / SSH / GPU 执行环境 · 长任务的 Run 管理（提交前预检、心跳、有界日志、环境快照）。

**关键结构：对话与笔记本共用运行中的内核。** 切换视图保留变量；停止对话/内核或退出应用会关闭本地内核，重启后应通过保存的脚本和结果重现分析。

### N · Notebook

对话、笔记本、并排——**是同一份 append-only Entry 序列的三种投影，不是三套实现**。`code_cell` 是一等公民：可重跑、可编辑、可导出 `.ipynb`，且人写的 cell 与 agent 写的同构。

---

## 核心主张：可追溯

系统把两类信息**分开建模**：

| 层 | 内容 | 可信度 |
|---|---|---|
| **Agent 声明层** | agent 说自己做了什么 | 待验证 |
| **Repo 事实层** | git diff、测试退出码、lint / build 结果 | 权威 |

**状态推进必须由两者结合决定**，声明单独不足以推进：

```
agent 说「已完成实现」，但测试未通过        → 不得进入 DONE
agent 说「已 review 完成」，但无 review 工件 → 不得完成交接
agent 说「可合并」，但 diff 与计划不一致     → 回到 REWORKING
```

---

## 当前状态

**早期版本（0.0.x），接口仍在调整。** 本文描述当前源码，已安装的发布版可能尚未包含全部变更。应用更新、任务证据和版本核验已经实现；正式 Developer ID 签名、公证及 Windows Authenticode 签名尚未完成。

| | |
|---|---|
| 验证 | Vitest 的 node/UI/kernel 分组，以及 Electron、真实内核、视觉和流式性能检查。实际结果与边界见带日期的[项目审查](docs/validation/project-audit-20261112/README.md)和[项目信息验证](docs/validation/project-info-20261113/README.md) |
| 平台 | 提供 macOS、Windows、Linux 打包目标；近期验证主要在 macOS，打包成功不等于 Windows/Linux 真机兼容性已验收 |
| 科研证据 | 冻结任务契约、文件指纹、宿主验收和独立审阅支持追溯；通过仅表示满足已配置规则，不等于科学结论已获认证 |
| 真实模型评测 | [有界的单/多执行者对照](docs/validation/research-budget-300-20261108/README.md)已在一个自制任务上走通两条交付路径，不能据此宣称普遍的质量、费用或速度收益 |
| 记录 | [开发历史](docs/DEVELOPMENT_HISTORY.md)与[审查记录](docs/reviews/)保存各次改动及验证依据 |

---

## 从源码运行

需要 Node.js 22.22.2 及以上的 22.x、24.15.0 及以上的 24.x，或 26 及以上版本。

```bash
git clone https://github.com/Jiawang1209/DAWN-Science.git
cd DAWN-Science
npm ci
cp .env.example .env        # 填你的 API key（也可以不填，首启向导里填）
npm run app                 # 构建并启动
```

开发：

```bash
npm run dev:mock            # 真链路 + 假模型，隔离目录，不碰真实凭证
npm test                    # 单元 + 集成
npm run test:e2e            # 先 build，再 Playwright 跑真实产物
npm run test:e2e:kernel     # 已构建后单跑独立内核组
npm run dist                # 打当前平台的安装包，产物在 release/
```

命令行 Agent（源码版）：

```bash
npm run build:cli
./bin/dawn --help
# 设置 DAWN_CONFIG 和所用服务的 API key 环境变量后：
./bin/dawn
```

Normal 就是原来的 Shell；输入 `dawn` 进入 Agent，`/exit` 返回。CLI 使用独立数据目录和环境凭证，详见[配置与使用](docs/CLI.md)。

打包细节（交叉打包能不能、Linux 要装什么）见 [打包与发布](docs/打包与发布.md)。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 核心 | TypeScript / Node |
| LLM provider | `@earendil-works/pi-ai`（含 DeepSeek / Kimi / Qwen） |
| Agent loop | `@earendil-works/pi-agent-core` |
| 科学内核 | `enchannel-zmq-backend` + `@nteract/messaging` + `spawnteract`（Jupyter 协议，一套通吃 R 与 Python） |
| 终端 | `node-pty` + `xterm.js` |
| 工具协议 | `@modelcontextprotocol/sdk`（server + client 双向） |
| 持久化 | SQLite（`better-sqlite3`，WAL） |
| 桌面壳 | Electron |
| 前端 | React + Vite · Streamdown / Shiki / KaTeX · xterm.js |

---

## 文档

| 文档 | 回答什么 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 每个功能的规格在哪、三条准入规则、容易踩的坑——**先看这个** |
| [设计规格](docs/superpowers/specs/) | 建什么、为什么、什么绝不做 |
| [主开发规划](docs/superpowers/plans/2026-08-08-master-roadmap.md) | 按什么顺序、在哪停下判断、风险怎么应对 |
| [视觉与交互契约](docs/DESIGN.md) | 界面怎么长、为什么 |
| [参考地图](docs/REFERENCES.md) | 实现某个部件时，去读哪个项目的哪一段 |
| [技能](docs/skills.md) / [MCP](docs/mcp.md) | 扩展配置、工具结果、取消与恢复 |
| [项目审查](docs/validation/project-audit-20261112/README.md) | 带日期的本地验证结果及平台边界 |
| [打包与发布](docs/打包与发布.md) | 怎么打包、装到新电脑 |
| [开发历史](docs/DEVELOPMENT_HISTORY.md) | 每次变更与其理由 |

---

## 致谢

设计过程中研读了以下项目。**除 `pi` 作为依赖外，其余均为只读参考——学设计，不复制代码。**

| 项目 | 借鉴内容 |
|---|---|
| [pi](https://github.com/earendil-works/pi) | agent loop 与 provider 层（作为依赖使用） |
| [Buzz](https://github.com/block/buzz) | 进程组终止、上下文恢复阶梯、统一事件流、双协议解耦 |
| [pi-crew](https://github.com/baphuongna/pi-crew) | GreenLevel 分级、验证环境净化、worktree 实战细节 |
| [ccb](https://github.com/SeemSeam/claude_codex_bridge) | provider 适配契约、completion contract |
| hive | team 面板交互（仅视觉参考） |

---

## 许可

[GNU Affero General Public License v3.0 or later](LICENSE)

```
Copyright (C) 2026  DAWN Science contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

**选择 AGPL 的理由**：这是一个面向科研的开源工具，我们希望它的改进版本同样对所有人开放——包括以网络服务形式提供的版本。

依赖的第三方库（`pi` 等）为 MIT / Apache-2.0，与 AGPL 兼容。
