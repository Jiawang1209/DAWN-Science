<div align="center">

# DAWN Science

**Data Agent Workbench with Notebooks — for science.**

开源的本地 AI 工作台：R 与 Python 数据科学，多智能体协作，面向科研。

[下载安装包](#安装) · [从源码运行](#从源码运行) · [文档](#文档) · [English](#english)

</div>

---

## 这是什么

一个**开源、本地优先的桌面科研工作环境**。你在里面和模型对话，模型在**同一台内核**里跑 Python / R——变量跨对话、跨重启保留；你可以在旁边的笔记本里接着敲，敲的记进对话。项目绑定文件夹，服务器只要一个 sshd 就能成为远端工作区。

**设计理念：**

```
问题  →  规划  →  调用工具  →  执行流程  →  产生可追溯结果
```

最后一环是这个项目区别于其它 AI 工具的地方——**不是更快，是更可信**。

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

去 [Releases](../../releases) 下载对应平台的包。**当前是早期版本（0.0.x），安装包未签名**，第一次打开要多点一步：

| 平台 | 安装 | 第一次打开 |
|---|---|---|
| macOS | 打开 `.dmg`，拖进 Applications | 右键 → 打开；macOS 15 起要去「系统设置 → 隐私与安全性」底部点「仍要打开」 |
| Windows | 运行 `…-setup.exe`；或直接跑 `…-portable.exe` | SmartScreen：「更多信息 → 仍要运行」 |
| Linux | `chmod +x *.AppImage && ./DAWN-Science-*.AppImage`；或 `sudo dpkg -i *.deb` | AppImage 需要 `sudo apt install libfuse2` |

**第一次打开**是一个向导：选服务商（DeepSeek / Kimi / Qwen / Anthropic / OpenAI …）、填 API key，就能聊。同一屏可以「检测本机解释器」，从已有的 Python / R 里选一个接成内核——可选，不配也能聊。

**软件本身不需要 Node.js。** 要用哪个功能才装哪样，缺了界面会明说：

| 要做什么 | 要装 |
|---|---|
| 笔记本 / 跑 Python | Python 3 + `pip install ipykernel` |
| R 内核 | R + `IRkernel` |
| 项目的 git 事实 | git |
| 远端工作区 | 服务器上只要 sshd，**服务器上不放任何文件** |
| 借用 Claude Code / Codex 干活 | 自己装好对应 CLI（锦上添花，不装不影响对话） |

---

## 有什么

| | |
|---|---|
| **对话里的内核** | 模型调 `run_code`，你在坞里的「笔记本」格看它的每个 cell 流过；在同一台内核里自己敲，敲的记进对话 |
| **持久内核** | 变量跨对话、跨重启保留，可中断；关掉对话，Python 里的 `df` 仍在 |
| **远端工作区** | 加一台服务器（SSH），会话、内核、文件、终端都在那边跑；本机零依赖 |
| **右侧坞** | 文件（本地/远端）、传输、笔记本、产物清单、网页预览、agent 浏览器旁观 |
| **`@` 引用** | 输入框里 `@` 工作区文件——喂路径和类型，不喂内容 |
| **多智能体** | 22 份自带子 agent 名册；团队模式：队长 + 可续聊成员 + 带依赖的任务板 |
| **权限三档** | 全放行 / 问一句 / 拦下；硬拒清单 |
| **技能与插件** | 技能三档开关、导入；Office（Word/Excel/PPT/PDF 14 工具）、浏览器（15 工具）、记忆（三轨确认制）插件 |
| **远程助理** | 微信 / 飞书通道，扫码接入，手机上继续问 |
| **定时任务** | 到点开一段全新会话跑任务说明 |
| **产物** | 对话里 `GENERATED · N`，坞里实时清单 |
| **多服务商** | 走 `pi` 的 provider 层，40+ 家；也可切到本机的 Claude Code / Codex（ACP） |
| **外观** | 明暗主题、一键换主题色、中英文界面 |

---

## 四个支柱

### D · Data

Python 与 R 持久内核（变量跨 cell、跨会话、跨重启保留，且**可中断**）· 数据库连接与 schema 浏览 · 产物 schema 标准化（表格附固定结构、图表附数据源与指标含义、模型附超参与评估指标）。

### A · Agent

能规划、调工具、执行、回报的 agent，而不只是聊天。默认走本地 agent loop 驱动任意 API 端点（DeepSeek / Kimi / Qwen 等），也可切换到本机安装的 Claude Code 或 Codex。MCP 工具网关 · Skills 渐进式加载 · **可选的多智能体编排模块**。

### W · Workbench

Project 绑定文件夹，配置、知识与内核都挂在 Project 上 · 本地 / WSL / SSH / GPU 执行环境 · 长任务的 Run 管理（提交前预检、心跳、有界日志、环境快照）。

**关键结构：内核的生命周期长于会话。** 关掉一个对话，Python 里的 `df` 仍在。

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

**早期版本，日常可用，接口仍在变。** 单机与远端主链路都跑通并在真机上验过；打包三平台，签名与自动更新还没有。

| | |
|---|---|
| 源码 | 约 7.7 万行 TypeScript |
| 测试 | 197 个单元/集成测试文件（vitest）+ 107 个 e2e 用例（Playwright，驱动真实构建产物）+ 10 张逐像素视觉基线 |
| 变更记录 | [485 条](docs/DEVELOPMENT_HISTORY.md)，每条写明动机与验证方式 |
| 下一步 | 签名与自动更新 · 产物的来源/版本/批注 |

---

## 从源码运行

需要 Node.js ≥ 22。

```bash
git clone <本仓库>
cd dawn-science
npm ci
cp .env.example .env        # 填你的 API key（也可以不填，首启向导里填）
npm run app                 # 构建并启动
```

开发：

```bash
npm run dev:mock            # 真链路 + 假模型，隔离目录，不碰真实凭证
npm test                    # 单元 + 集成
npm run test:e2e            # 先 build，再 Playwright 跑真实产物
npm run dist                # 打当前平台的安装包，产物在 release/
```

打包细节（交叉打包能不能、Linux 要装什么）见 [打包与发布](docs/打包与发布.md)。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 核心 | TypeScript / Node |
| LLM provider | `@earendil-works/pi-ai`（40+ provider，含 DeepSeek / Kimi / Qwen 原生） |
| Agent loop | `@earendil-works/pi-agent-core` |
| 科学内核 | `enchannel-zmq-backend` + `@nteract/messaging` + `spawnteract`（Jupyter 协议，一套通吃 R 与 Python） |
| 终端 | `node-pty` + `xterm.js` |
| 工具协议 | `@modelcontextprotocol/sdk`（server + client 双向） |
| 持久化 | SQLite（`better-sqlite3`，WAL） |
| 桌面壳 | Electron |
| 前端 | React + Vite · CodeMirror 6 · Plotly.js · TanStack Table |

---

## 文档

| 文档 | 回答什么 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 每个功能的规格在哪、三条准入规则、容易踩的坑——**先看这个** |
| [设计规格](docs/superpowers/specs/) | 建什么、为什么、什么绝不做 |
| [主开发规划](docs/superpowers/plans/2026-08-08-master-roadmap.md) | 按什么顺序、在哪停下判断、风险怎么应对 |
| [视觉与交互契约](docs/DESIGN.md) | 界面怎么长、为什么 |
| [参考地图](docs/REFERENCES.md) | 实现某个部件时，去读哪个项目的哪一段 |
| [打包与发布](docs/打包与发布.md) | 怎么打包、装到新电脑 |
| [开发历史](docs/DEVELOPMENT_HISTORY.md) | 每次变更与其理由 |

---

## 致谢

设计过程中研读了以下项目。**除 `pi` 作为依赖外，其余均为只读参考——学设计，不复制代码。**

| 项目 | 借鉴内容 |
|---|---|
| [pi](https://github.com/earendil-works/pi) | agent loop 与 provider 层（作为依赖使用） |
| [Buzz](https://github.com/block/buzz) | 进程组终止、上下文恢复阶梯、统一事件流、双协议解耦 |
| [Rho](https://github.com/xuzhougeng/Rho) | Ark + Jupyter 协议路线、前端与传输解耦的协议分层 |
| [wisp-science](https://github.com/xuzhougeng/wisp-science) | 执行环境、Run 管理、capability 授权、worktree 隔离 |
| [wispterm](https://github.com/xuzhougeng/wispterm) | 终端输入租约、分屏交互 |
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

**选择 AGPL 的理由**：这是一个面向科研的开源工具，我们希望它的改进版本同样对所有人开放——包括以网络服务形式提供的版本。同类的 [wisp-science](https://github.com/xuzhougeng/wisp-science) 与 [ccb](https://github.com/SeemSeam/claude_codex_bridge) 也采用 AGPL。

依赖的第三方库（`pi` 等）为 MIT / Apache-2.0，与 AGPL 兼容。

---

## English

**DAWN Science** — *Data Agent Workbench with Notebooks* — is an open-source AI workbench that runs on your own machine, where multiple agents do R & Python data science together with you. Built for research: data science, ecology, environmental science, bioinformatics.

- **Persistent Python / R kernels** shared between the agent and you: the model runs `run_code` in the same kernel you type into; variables survive across conversations and restarts.
- **Remote workspaces over SSH** — sessions, kernels, files and terminals run on the server; the server needs nothing but `sshd`.
- **Multi-agent**: 22 bundled sub-agents, team mode with a task board.
- **Traceable results**: what the agent *claims* and what the repo *shows* (git diff, test exit codes) are modeled separately; state only advances when both agree.
- Any LLM provider via `pi` (DeepSeek, Kimi, Qwen, Anthropic, OpenAI, 40+), or hand off to a locally installed Claude Code / Codex.
- Plugins: Office (Word/Excel/PowerPoint/PDF), browser automation, long-term memory; WeChat / Feishu channels; scheduled tasks.

Early release (0.0.x), unsigned installers — see [Releases](../../releases). Run from source with Node ≥ 22: `npm ci && npm run app`. The UI is bilingual (中文 / English). Licensed under AGPL-3.0-or-later.
