<div align="center">

# DAWN Science

**Data Agent Workbench with Notebooks — for science.**

面向科学研究的数据智能体工作台，带笔记本。

</div>

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

## 这是什么

一个**开源、本地优先的桌面科研工作环境**。它把模型、工具、知识流程与科研任务模板组合在一起，支持本地项目管理、Python / R 持久执行、数据库连接，以及领域 Skill 工作流。

**设计理念：**

```
问题  →  规划  →  调用工具  →  执行流程  →  产生可追溯结果
```

最后一环是这个项目区别于其它 AI 工具的地方——**不是更快，是更可信**。

**领域定位：** 数据科学 · 生态学 · 环境科学 · 生物信息

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

**设计阶段。尚无代码。**

| 产出 | 状态 |
|---|---|
| 设计规格 | ✅ 完成 |
| 主开发规划 | ✅ 完成 |
| 实体清单（91 个部件 × 技术栈 × 构思来源） | ✅ 完成 |
| Phase 0 + 阶段①-A 实施计划 | ✅ 完成 |
| 代码 | ⬜ 未开始 |

下一步是 Phase 0 的四个技术验证 spike。任何一个不通过都会改变方案——详见实施计划。

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
| [设计规格](docs/superpowers/specs/) | 建什么、为什么、什么绝不做 |
| [主开发规划](docs/superpowers/plans/2026-08-07-master-roadmap.md) | 按什么顺序、在哪停下判断、风险怎么应对 |
| [实体清单](docs/superpowers/ENTITY-REGISTRY.md) | 每个部件用什么技术、照着谁的设计做 |
| [实施计划](docs/superpowers/plans/) | 这一步具体敲什么 |
| [Backlog](docs/superpowers/BACKLOG.md) | 想到但暂不做的 |
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

[Apache License 2.0](LICENSE)
