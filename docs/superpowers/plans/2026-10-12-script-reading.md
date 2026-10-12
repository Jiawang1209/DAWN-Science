# 脚本展开阅读 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 实现已批准的脚本展开阅读、独立代码行距、细边框及换行切换。

**Architecture:** 复用 `FilePreview` 与 `ScriptPreview`，由文件/产物容器控制局部阅读状态；隐藏导航而不卸载树，避免丢失展开和滚动状态。代码区负责独立滚动及中性细边框，原文与既有高亮数据流不变。

**Tech Stack:** React、现有 Button/令牌、Vitest、真实 Electron Playwright。

### Task 1: 组件与行为

Files: `src/ui/files.tsx`, `src/ui/script-preview.tsx`, `src/ui/artifacts.tsx`, `src/ui/styles.css`, `src/ui/i18n/en.ts`, `tests/ui/script-preview.test.tsx`，必要时补文件/产物组件测试。

- [x] 先补默认自动换行、切换不改原文、展开/还原、Markdown、表格、图片等其他预览不出现阅读操作的失败用例，运行 `npx vitest run tests/ui/script-preview.test.tsx` 确认失败。
- [x] 最小实现：共享脚本区 `white-space: pre-wrap`，切换为 `pre`；`line-height: 1.55`；`border: 1px solid var(--dawn-stroke-3)`。固定头与 flex 代码滚动区。容器阅读状态隐藏导航，既有目录 DOM 保持挂载。
- [x] 同一组测试转绿；检查异步高亮、空行/末尾换行、失败降级、截断提示及原操作仍成立。

### Task 2: 真实桌面验证

Files: `e2e/script-preview.spec.ts`，可新增 `e2e/script-reading.spec.ts`。

- [x] 添加长脚本回归，旧构建先验证代码行距及阅读入口失败。脚本末尾使用唯一标记，断言精确 `textContent` 并滚动到末行。
- [x] 检查文件/产物、展开/还原、树及代码滚动恢复、换行与横向滚动、280/480/720px、亮暗主题、英文按钮及代码边框。
- [x] `npm run typecheck`、`npm run build`、相关 UI 单测和 `npx playwright test e2e/script-preview.spec.ts e2e/script-reading.spec.ts e2e/panel-preview-layout.spec.ts e2e/visual.spec.ts`。先看任何视觉差异，再决定是否更新，不放宽容差或 mask。

### Task 3: 交付

Files: `docs/DESIGN.md`, `docs/DEVELOPMENT_HISTORY.md` 与本计划。

- [x] 更新具名契约、验证记录并进行只读审查，处理实际问题。
- [x] 保留分支与实际截图供用户查看；本轮不自动合并、推送或替换安装版。


## 验证记录（2026-10-12）

- 旧构建验证：长 R/Python 脚本的独立行距断言均失败（29.75/13），相关组件与边框契约也先失败，再实现。
- 全部 UI 单测 126 文件、1318 项通过；`npm run typecheck` 和 `npm run build` 通过。
- 真实 Electron 验证文件/产物共享预览、原文精确一致、长行换行及横向滚动、末行可见、固定头、目录 DOM/尺寸/滚动位置保留、实际 280/480/720px、窗口缩小与中英文/亮暗主题。文末展开增高引起自然滚动夹限、跨 560px 的原 key 重挂按设计边界保留。
- 实际截图已逐张检查，保存在 `tmp/script-reading-verification/`；基线、容差和 mask 未修改。
- 品牌审计未发现残留 DAWN D 图标；DeepSeek 服务头像属于提供方标识，保留。
- 最终真实 Electron 批次：`script-preview`、`script-reading`、`panel-preview-layout`、`artifacts`、`visual` 共 26 项全部通过（1.1 分钟），含 14 张既有亮暗视觉基线。规格只读审查通过。质量审查发现长路径裁切问题，真实 Electron 在旧构建复现代码仅 26px 且位于裁切区外；修复路径两行内滚动、头部最多占半高并可滚动，保留键盘入口，复审通过。
- 当前仅隔离分支修改，未提交或合并入 main。


## 实看后精简与菜单裁切修复

- [x] 复现右边缘目录菜单裁切，新增真实桌面边界回归并确认旧构建失败。
- [x] 更新组件测试：默认换行、无独立换行/删除、保留阅读/下载与截断提示；确认旧组件失败。
- [x] 脚本头改为单行；显示 basename，完整路径可访问；代码默认换行，目录删除保留。
- [x] 目录菜单按实测宽高避让窗口四边，body portal 避免容器裁切。
- [x] 验证相关 UI、类型、构建、真实 Electron 和分支预览；同步权威开发历史。129 项 UI、30 项桌面及最终构建菜单/R/Python复验3项全部通过。


## 用户批准的整体收整

- [x] 保留两个彩色外框，去掉代码内框和目录/预览间重复线；统一内容对齐。
- [x] 目录内距 8px、默认高度 160px；隐藏常驻时间/字节数，保留悬停详情与原操作。
- [x] 运行设计契约、相关 UI、真实 Electron 的亮暗主题/窄宽/目录状态检查，刷新隔离预览并检查截图。


## 选中文件名强调

- [x] 用户确认：选中文件名使用主题色与半粗字重，原选中背景及其余样式保持。
- [x] 样式契约先失败后通过，补充桌面选中/未选中与切换文件、暗色主题比较。
- [x] 刷新隔离预览，完成桌面验证并保存证据。93 项契约、UI 构建和 3 项真实 Electron 回归通过。


## 文件元信息恢复

- [x] 按用户纠正恢复文件行的修改时间与大小，保留原格式及同排辅助样式。
- [x] 同步设计契约和桌面文件定位，93 项契约、UI 构建及 3 项真实 Electron 回归通过；分支预览已刷新。


## 用户批准的最终集成（2026-10-12）

- [x] 最终文件行保留修改时间和大小；选择名主题色、共享收起、阅读和细外框效果获用户确认。
- [x] 全量 4282 项单测通过、10 项跳过；类型检查与完整构建通过。46 项独立桌面用例分批验证通过；修正测量容器后文件面板 14 项全部通过，未放宽视觉容差。
- [x] 只读审查无阻塞发现，按用户授权本地提交并快进集成 main；保留隔离预览，不推送、不替换安装版。
