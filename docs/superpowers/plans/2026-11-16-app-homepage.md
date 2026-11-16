# App Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现四步引导 → 首页 → 工作台，以及工作台返回首页。

**Architecture:** 窗口级首页状态独立于工作台视图。隐藏工作台保留挂载。首页读取现有项目和会话操作；打开目录复用 chooseWorkspaceDirectory，打开会话先加载所属项目。

**Tech Stack:** React、Nanostores、TypeScript、Vitest、Playwright/Electron。

### Task 1: 启动和导航
- [x] 在 app-default-client.test.tsx 写首页往返测试，运行并确认现有程序失败。
- [x] 新增 state/app-page.ts，默认首页；setView 唤起工作台。App.tsx 插入首页并保留隐藏工作台，增加返回入口。
- [x] 测试夹具显式进入工作台；首页测试从真实默认首页开始。

### Task 2: 真实首页
- [x] app-home.test.tsx 先验证跨项目最近排序、归档/终端过滤、空态及失败重试。
- [x] app-home.tsx 受限并发读取现有 listSessions，合并临时会话；迟到结果不能覆盖新页面。返回首页刷新。
- [x] 接入现有项目、原生目录选择、新对话及会话打开，沿用设计 token、Button、图标、双语。

### Task 3: 验证和交付
- [x] Electron 验证启动顺序、跨项目、返回草稿、导航栏；检查明暗、窄窗口。
- [x] 运行 build、typecheck、相关 Vitest 与 Electron，复核 diff，记录实际结果。
- [x] 本地提交于 codex/app-homepage，不合并、不推送。
